# Phase 7: SQLite Persistence (Optional Enhancement)

**The council works without this phase.** Persistence adds cross-session history that survives VS Code restarts.

## Step 7.1: Install SQLite Dependency

```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3
```

> Requires `build-essential` and `python3` on Linux for native compilation.

## Step 7.2: Inline Schema

Create `src/db/schema.ts` (NOT a `.sql` file — see CONTRIBUTIONS_R2.md C2):
```typescript
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  draft_plan_summary TEXT,
  tech_stack TEXT,
  constraints TEXT,
  debate_mode BOOLEAN DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  persona_id TEXT,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expert_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  persona_name TEXT NOT NULL,
  persona_emoji TEXT,
  content TEXT NOT NULL,
  duration_ms INTEGER,
  model_used TEXT,
  is_debate BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_reports_session ON expert_reports(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at DESC);
`;
```

## Step 7.3: Database Module

Create `src/db/index.ts`:
```typescript
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";
import { SCHEMA } from "./schema.js";
import type { ExpertReport, CouncilResult } from "../personas/types.js";

let db: Database.Database | null = null;

export function getDatabase(): Database.Database | null {
  if (db) return db;

  const dbPath = config.databasePath;
  if (!dbPath) return null; // Persistence disabled

  try {
    mkdirSync(dirname(dbPath), { recursive: true }); // Fix M5
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON"); // Fix H6
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
```

## Step 7.4: Integrate Persistence into Council Tool

Update `src/index.ts` — add after the `runCouncil` call:
```typescript
import * as db from "./db/index.js";

// Inside consult_council handler, after const result = await runCouncil(...):
try {
  db.saveCouncilResult(result, draftPlan, params.tech_stack, params.context_constraints);
} catch {
  // Persistence failure is non-fatal
}
```

## Step 7.5: Add History Tool

Add to `src/index.ts`:
```typescript
server.tool(
  "get_session_history",
  "Retrieve previous council session summaries.",
  {
    limit: z.number().min(1).max(50).default(10).describe("Number of sessions to retrieve"),
  },
  async (params) => {
    const sessions = db.getRecentSessions(params.limit);
    if (sessions.length === 0) {
      return { content: [{ type: "text" as const, text: "No previous sessions found." }] };
    }

    let output = "# Recent Council Sessions\n\n";
    for (const s of sessions) {
      output += `## ${s.id.slice(0, 8)}… (${s.created_at})\n`;
      if (s.tech_stack) output += `**Stack**: ${s.tech_stack}\n`;
      if (s.debate_mode) output += `**Debate**: Yes\n`;
      if (s.draft_plan_summary) output += `**Plan**: ${s.draft_plan_summary}…\n`;
      output += "\n";
    }
    return { content: [{ type: "text" as const, text: output }] };
  }
);
```

## Verification

1. **Build**: `npm run build`
2. **Call council** → Check `data/council.db` exists
3. **Call `get_session_history`** → Previous session appears
4. **Restart VS Code** → History persists
5. **Set `DATABASE_PATH=` (empty)** → Council works without persistence
