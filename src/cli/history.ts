#!/usr/bin/env node

import initSqlJs, { type Database } from "sql.js";
import { existsSync, readFileSync } from "node:fs";
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

async function getDatabase(): Promise<Database | null> {
  if (!existsSync(DB_PATH)) return null;
  const SQL = await initSqlJs({
    locateFile: (file: string) => `https://sql.js.org/dist/${file}`
  });
  const buffer = readFileSync(DB_PATH);
  return new SQL.Database(buffer);
}

function mapRow(columns: string[], values: unknown[]): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    row[columns[i]] = values[i];
  }
  return row;
}

function listSessions(db: Database, limit: number = 10): void {
  const result = db.exec(`
    SELECT id, created_at, draft_plan_summary, tech_stack
    FROM sessions
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);

  if (result.length === 0 || result[0].values.length === 0) {
    console.log("No sessions found.");
    return;
  }

  const sessions = result[0].values.map(v => mapRow(result[0].columns, v)) as unknown as Session[];

  console.log("\n╭──────────────────────────────────────────────────────────────╮");
  console.log("│ 📋 Council Sessions                                           │");
  console.log("├──────────────────────────────────────────────────────────────┤");

  for (const s of sessions) {
    const id = s.id.slice(0, 8);
    const date = new Date(s.created_at).toLocaleString();
    const summary = s.draft_plan_summary?.slice(0, 50) ?? "No summary";
    
    // Get expert count and total time
    const statsResult = db.exec(`
      SELECT COUNT(*) as count, SUM(duration_ms) as total_ms
      FROM expert_findings
      WHERE session_id = '${s.id.replace(/'/g, "''")}'
    `);
    
    let stats: { count: number; total_ms: number | null } = { count: 0, total_ms: null };
    if (statsResult.length > 0 && statsResult[0].values.length > 0) {
      const row = mapRow(statsResult[0].columns, statsResult[0].values[0]);
      stats = { count: Number(row.count), total_ms: row.total_ms as number | null };
    }
    
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

function showSession(db: Database, sessionId: string): void {
  const escapedId = sessionId.replace(/'/g, "''");
  
  // Get session
  const sessionResult = db.exec(`
    SELECT * FROM sessions WHERE id = '${escapedId}' OR id LIKE '${escapedId}%'
  `);

  if (sessionResult.length === 0 || sessionResult[0].values.length === 0) {
    console.log(`❌ Session not found: ${sessionId}`);
    return;
  }

  const session = mapRow(sessionResult[0].columns, sessionResult[0].values[0]) as unknown as Session;
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
  const userMsgResult = db.exec(`
    SELECT content FROM messages
    WHERE session_id = '${escapedId}' AND role = 'user'
    ORDER BY created_at ASC LIMIT 1
  `);

  if (userMsgResult.length > 0 && userMsgResult[0].values.length > 0) {
    const userMsg = userMsgResult[0].values[0][0] as string;
    for (const line of userMsg.split("\n")) {
      console.log(`│   ${line}`);
    }
  }

  // Get expert findings grouped by persona
  const findingsResult = db.exec(`
    SELECT * FROM expert_findings
    WHERE session_id = '${escapedId}'
    ORDER BY persona_id, severity
  `);

  const findings: ExpertFinding[] = [];
  if (findingsResult.length > 0) {
    for (const values of findingsResult[0].values) {
      findings.push(mapRow(findingsResult[0].columns, values) as unknown as ExpertFinding);
    }
  }

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
  const blueprintResult = db.exec(`
    SELECT content FROM messages
    WHERE session_id = '${escapedId}' AND role = 'assistant' AND persona_id = 'consolidation'
    ORDER BY created_at DESC LIMIT 1
  `);

  if (blueprintResult.length > 0 && blueprintResult[0].values.length > 0) {
    const blueprint = blueprintResult[0].values[0][0] as string;
    console.log("├──────────────────────────────────────────────────────────────┤");
    console.log("│ 👑 Council Blueprint:");
    console.log("│");
    
    for (const line of blueprint.split("\n")) {
      console.log(`│   ${line}`);
    }
  }

  console.log("╰──────────────────────────────────────────────────────────────╯\n");
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const db = await getDatabase();

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
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});