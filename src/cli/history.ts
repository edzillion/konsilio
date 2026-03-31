#!/usr/bin/env node

import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const DB_PATH = resolve(process.cwd(), "data/konsilio.db");

interface Session {
  id: string;
  created_at: string;
  draft_plan_summary: string | null;
  tech_stack: string | null;
  constraints: string | null;
}

interface ExpertFinding {
  id: string;
  session_id: string;
  persona_id: string;
  persona_name: string;
  persona_emoji: string | null;
  severity: string;
  component: string;
  issue: string;
  mitigation: string;
  accepted: number;
  rejection_reason: string | null;
  duration_ms: number | null;
  model_used: string | null;
}

interface Message {
  id: number;
  session_id: string;
  role: string;
  persona_id: string | null;
  content: string;
  created_at: string;
}

function getDatabase(): Database.Database | null {
  if (!existsSync(DB_PATH)) return null;
  return new Database(DB_PATH, { readonly: true });
}

function listSessions(db: Database.Database, limit: number = 10): void {
  const sessions = db.prepare(`
    SELECT id, created_at, draft_plan_summary, tech_stack
    FROM sessions
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as Session[];

  if (sessions.length === 0) {
    console.log("No sessions found.");
    return;
  }

  console.log("\n╭──────────────────────────────────────────────────────────────╮");
  console.log("│ 📋 Council Sessions                                           │");
  console.log("├──────────────────────────────────────────────────────────────┤");

  for (const s of sessions) {
    const id = s.id.slice(0, 8);
    const date = new Date(s.created_at).toLocaleString();
    const summary = s.draft_plan_summary?.slice(0, 50) ?? "No summary";
    
    // Get expert count and total time
    const stats = db.prepare(`
      SELECT COUNT(*) as count, SUM(duration_ms) as total_ms
      FROM expert_findings
      WHERE session_id = ?
    `).get(s.id) as { count: number; total_ms: number | null };
    
    const totalSec = stats.total_ms ? (stats.total_ms / 1000).toFixed(1) : "?";
    
    console.log(`│ ${id}… | ${date} | ${stats.count} experts | ${totalSec}s`);
    console.log(`│   Plan: ${summary}…`);
    if (s.tech_stack) {
      console.log(`│   Stack: ${s.tech_stack}`);
    }
    console.log("│");
  }

  console.log("├──────────────────────────────────────────────────────────────┤");
  console.log("│ Run `npm run history <session-id>` for full details         │");
  console.log("╰──────────────────────────────────────────────────────────────╯\n");
}

function showSession(db: Database.Database, sessionId: string): void {
  // Get session
  const session = db.prepare(`
    SELECT * FROM sessions WHERE id = ? OR id LIKE ?
  `).get(sessionId, `${sessionId}%`) as Session | undefined;

  if (!session) {
    console.log(`❌ Session not found: ${sessionId}`);
    return;
  }

  const fullId = session.id;
  const date = new Date(session.created_at).toLocaleString();

  console.log("\n╭──────────────────────────────────────────────────────────────╮");
  console.log(`│ 📋 Session: ${session.id}           │`);
  console.log("├──────────────────────────────────────────────────────────────┤");
  console.log(`│ 📅 ${date}`);
  if (session.tech_stack) {
    console.log(`│ 🔧 Stack: ${session.tech_stack}`);
  }
  if (session.constraints) {
    console.log(`│ ⚠️ Constraints: ${session.constraints}`);
  }
  console.log("├──────────────────────────────────────────────────────────────┤");
  console.log("│ 📝 Draft Plan:");
  console.log("│");
  
  // Get user message (draft plan)
  const userMsg = db.prepare(`
    SELECT content FROM messages
    WHERE session_id = ? AND role = 'user'
    ORDER BY created_at ASC LIMIT 1
  `).get(fullId) as { content: string } | undefined;

  if (userMsg) {
    for (const line of userMsg.content.split("\n")) {
      console.log(`│   ${line}`);
    }
  }

  // Get expert findings grouped by persona
  const findings = db.prepare(`
    SELECT * FROM expert_findings
    WHERE session_id = ?
    ORDER BY persona_id, severity
  `).all(fullId) as ExpertFinding[];

  console.log("├──────────────────────────────────────────────────────────────┤");
  console.log("│ 🧠 Expert Findings:");
  console.log("│");

  // Group by persona
  const byPersona = new Map<string, ExpertFinding[]>();
  for (const f of findings) {
    const existing = byPersona.get(f.persona_id) ?? [];
    existing.push(f);
    byPersona.set(f.persona_id, existing);
  }

  for (const [personaId, personaFindings] of byPersona) {
    const emoji = personaFindings[0]?.persona_emoji ?? "👤";
    const name = personaFindings[0]?.persona_name ?? personaId;
    
    console.log(`│ ${emoji} ${name}`);
    console.log("│ ───────────────────────────────────────────");
    
    for (const f of personaFindings) {
      const status = f.accepted ? "✅" : "❌";
      console.log(`│   ${status} [${f.severity}] ${f.component}`);
      console.log(`│      Issue: ${f.issue.slice(0, 60)}${f.issue.length > 60 ? "…" : ""}`);
      console.log(`│      Fix: ${f.mitigation.slice(0, 60)}${f.mitigation.length > 60 ? "…" : ""}`);
    }
    console.log("│");
  }

  // Final blueprint (from consolidation phase)
  const blueprint = db.prepare(`
    SELECT content FROM messages
    WHERE session_id = ? AND role = 'assistant' AND persona_id = 'consolidation'
    ORDER BY created_at DESC LIMIT 1
  `).get(fullId) as { content: string } | undefined;

  if (blueprint) {
    console.log("├──────────────────────────────────────────────────────────────┤");
    console.log("│ 👑 Council Blueprint:");
    console.log("│");
    
    for (const line of blueprint.content.split("\n")) {
      console.log(`│   ${line}`);
    }
  }

  console.log("╰──────────────────────────────────────────────────────────────╯\n");
}

// Main
const args = process.argv.slice(2);
const db = getDatabase();

if (!db) {
  console.log("❌ No database found at ./data/konsilio.db");
  console.log("   Run a council session first to create data.");
  process.exit(1);
}

try {
  if (args.length === 0) {
    listSessions(db);
  } else {
    showSession(db, args[0]);
  }
} finally {
  db.close();
}