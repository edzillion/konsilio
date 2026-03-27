import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";
import { SCHEMA } from "./schema.js";
import type { CouncilResult } from "../personas/types.js";

let db: Database.Database | null = null;

export function getDatabase(): Database.Database | null {
  if (db) return db;

  const dbPath = config.databasePath;
  if (!dbPath) return null; // Persistence disabled

  try {
    mkdirSync(dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA);
    return db;
  } catch (err) {
    console.error("⚠️ SQLite init failed, running without persistence:", err);
    return null;
  }
}

// ─── Write Operations ───

export function saveCouncilResult(
  result: CouncilResult,
  draftPlan: string,
  techStack?: string,
  constraints?: string,
): void {
  const database = getDatabase();
  if (!database) return;

  try {
    const tx = database.transaction(() => {
      // Session
      database.prepare(`
        INSERT INTO sessions (id, draft_plan_summary, tech_stack, constraints, debate_mode)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        result.sessionId,
        draftPlan.slice(0, 500),
        techStack ?? null,
        constraints ?? null,
        result.debateReports ? 1 : 0,
      );

      // User input
      database.prepare(`
        INSERT INTO messages (session_id, role, content)
        VALUES (?, 'user', ?)
      `).run(result.sessionId, draftPlan);

      // Expert reports
      for (const r of result.expertReports) {
        database.prepare(`
          INSERT INTO expert_reports (session_id, persona_id, persona_name, persona_emoji, content, duration_ms, model_used, is_debate)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        `).run(result.sessionId, r.personaId, r.personaName, r.personaEmoji, r.content, r.durationMs, r.modelUsed);
      }

      // Debate reports
      if (result.debateReports) {
        for (const r of result.debateReports) {
          database.prepare(`
            INSERT INTO expert_reports (session_id, persona_id, persona_name, persona_emoji, content, duration_ms, model_used, is_debate)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
          `).run(result.sessionId, r.personaId, r.personaName, r.personaEmoji, r.content, r.durationMs, r.modelUsed);
        }
      }

      // Final blueprint
      database.prepare(`
        INSERT INTO messages (session_id, role, persona_id, content)
        VALUES (?, 'assistant', 'lead', ?)
      `).run(result.sessionId, result.finalBlueprint);
    });

    tx();
    pruneOldSessions();
  } catch (err) {
    console.error("⚠️ Failed to save session:", err);
  }
}

// ─── Read Operations ───

export interface SessionSummary {
  id: string;
  created_at: string;
  draft_plan_summary: string | null;
  tech_stack: string | null;
  debate_mode: number;
}

export function getRecentSessions(limit: number = 10): SessionSummary[] {
  const database = getDatabase();
  if (!database) return [];

  return database.prepare(`
    SELECT id, created_at, draft_plan_summary, tech_stack, debate_mode
    FROM sessions ORDER BY created_at DESC LIMIT ?
  `).all(limit) as SessionSummary[];
}

export function getSessionBlueprint(sessionId: string): string | null {
  const database = getDatabase();
  if (!database) return null;

  const row = database.prepare(`
    SELECT content FROM messages
    WHERE session_id = ? AND role = 'assistant' AND persona_id = 'lead'
    ORDER BY created_at DESC LIMIT 1
  `).get(sessionId) as { content: string } | undefined;

  return row?.content ?? null;
}

function pruneOldSessions(): void {
  const database = getDatabase();
  if (!database) return;

  database.prepare(`
    DELETE FROM sessions WHERE id NOT IN (
      SELECT id FROM sessions ORDER BY created_at DESC LIMIT ?
    )
  `).run(config.maxHistorySessions);
}