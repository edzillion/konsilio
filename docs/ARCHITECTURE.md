# Council MCP - Architecture Document

## Overview

Council MCP is a local-first, stateful MCP (Model Context Protocol) server that implements a "Council of Experts" pattern to provide critical, multi-perspective architectural analysis. Unlike standard AI assistants that may act as "yes-men," Council MCP routes every request through multiple expert personas who analyze the plan from different angles, then synthesizes their findings into a unified, actionable blueprint.

## Core Philosophy

**The Problem**: AI coding assistants often agree with user plans without critical analysis, leading to architectural flaws that become expensive to fix later.

**The Solution**: A council of specialized AI personas that:
1. Analyze plans from distinct perspectives (Security, Performance, UX/DX, DevOps)
2. Identify issues the user (and each other) might miss
3. Provide concrete, tech-stack-specific recommendations
4. Synthesize into an executable action plan

## MCP Server Lifecycle

Understanding how MCP stdio servers work is critical to this architecture:

1. **Cline spawns the process** when you first invoke a council tool
2. **The process stays alive** for the VS Code window lifetime (multiple tool calls reuse it)
3. **Communication is via stdin/stdout** — nothing else may write to stdout
4. **When Cline shuts down**, the process is killed (SIGTERM or SIGKILL)

This means:
- **In-memory state persists** across multiple tool calls within a session
- **SQLite is for cross-session persistence** (surviving VS Code restarts), not intra-session
- **PM2/systemd are incompatible** — they capture stdout and break the MCP protocol
- **The server must tolerate ungraceful shutdown** — use WAL mode for SQLite, no cleanup-on-exit assumptions

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MCP Client (Cline in VS Code)               │
│                                                                     │
│  User asks: "Review my auth system plan with JWT + refresh tokens"  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ stdio (MCP Protocol — stdin/stdout)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Council MCP Server                            │
│                    (spawned by Cline, lives until VS Code closes)    │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     Tool Layer                                 │  │
│  │  • consult_council(draft_plan, tech_stack, constraints, ...)  │  │
│  │  • get_session_history(limit)                                  │  │
│  │  • list_personas()                                             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                               │                                     │
│                               ▼                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  Council Orchestrator                          │  │
│  │                                                                │  │
│  │  Phase 1: Parallel Expert Analysis                             │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │  │
│  │  │ 🔒Security│ │⚡Perf    │ │🎨UX/DX   │ │🔧DevOps  │          │  │
│  │  │          │ │          │ │          │ │          │          │  │
│  │  │ Auth gaps│ │ Latency  │ │ Dev exp  │ │ Deploy   │          │  │
│  │  │ Injection│ │ Caching  │ │ Errors   │ │ CI/CD    │          │  │
│  │  │ Data exp │ │ Cold strt│ │ Onboard  │ │ Monitor  │          │  │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘          │  │
│  │       │            │            │            │                 │  │
│  │       └────────────┴─────┬──────┴────────────┘                 │  │
│  │                          │                                     │  │
│  │  Phase 2 (Optional): Debate Mode                               │  │
│  │  ┌──────────────────────────────────────────────────────────┐ │  │
│  │  │ Experts see each other's findings, identify gaps,        │ │  │
│  │  │ and refine recommendations. Both original AND debate     │ │  │
│  │  │ reports are passed to synthesis.                          │ │  │
│  │  └──────────────────────────────────────────────────────────┘ │  │
│  │                          │                                     │  │
│  │                          ▼                                     │  │
│  │  Phase 3: Lead Architect Synthesis                             │  │
│  │  ┌──────────────────────────────────────────────────────────┐ │  │
│  │  │ 👑 Lead Architect                                         │ │  │
│  │  │ • Receives ALL expert reports (original + debate)         │ │  │
│  │  │ • Resolves conflicts between experts                      │ │  │
│  │  │ • Deduplicates findings                                   │ │  │
│  │  │ • Produces unified blueprint with numbered action steps   │ │  │
│  │  └──────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                               │                                     │
│                               ▼                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │               Persistence Layer (SQLite — Optional)           │  │
│  │                                                                │  │
│  │  • sessions (id, created_at, metadata)                        │  │
│  │  • messages (id, session_id, role, persona_id, content, ...)  │  │
│  │  • expert_reports (id, session_id, persona, findings, ...)    │  │
│  │                                                                │  │
│  │  Server works without persistence (in-memory or disabled).    │  │
│  │  SQLite adds cross-session history only.                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                               │                                     │
│                               ▼                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  OpenRouter Gateway                            │  │
│  │                                                                │  │
│  │  • Unified API client for all LLM calls                       │  │
│  │  • Exponential backoff retry (429, 503)                       │  │
│  │  • Timeout handling (90s per expert, 120s for lead)           │  │
│  │  • Concurrency control (avoid rate limit on parallel calls)   │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   OpenRouter API    │
                    │   (Multiple Models) │
                    └─────────────────────┘
```

## Data Flow

### Request Lifecycle

1. **User submits draft plan** via Cline MCP client
2. **MCP Server receives** the `consult_council` tool call
3. **Orchestrator** builds context from:
   - Current draft plan
   - Tech stack (if provided)
   - Constraints (if provided)
   - Recent session summaries (if `include_history=true` and persistence is enabled)
4. **Phase 1**: Expert personas analyze in parallel (with concurrency control)
   - Each expert receives the same input + their domain-specific system prompt
   - Each produces findings in their domain
   - Calls timeout after 90 seconds each
   - Uses `Promise.allSettled` — individual failures don't kill the run
5. **Phase 2** (optional, if `debate_mode=true`):
   - Experts receive each other's findings
   - Each expert critiques and refines
   - Additional 60 seconds per expert
6. **Phase 3**: Lead Architect synthesizes
   - Receives ALL reports (original + debate if enabled)
   - Resolves conflicts
   - Produces final blueprint
7. **Response** returned to MCP client as structured Markdown
8. **Persistence** (if enabled): Session, messages, and reports saved to SQLite

## Component Details

### 1. MCP Tool Layer (`src/index.ts`)

Registers tools with the MCP SDK:

```typescript
// Primary tool
server.tool(
  "consult_council",
  "Send a draft plan to the Council of Experts for multi-perspective analysis...",
  {
    draft_plan: z.string(),
    tech_stack: z.string().optional(),
    context_constraints: z.string().optional(),
    debate_mode: z.boolean().optional().default(false),
    include_history: z.boolean().optional().default(false),
    model_override: z.object({
      experts: z.string().optional(),
      lead: z.string().optional(),
    }).optional(),
  },
  async (params) => { /* ... */ }
);

// History retrieval
server.tool(
  "get_session_history",
  "Retrieve previous council sessions...",
  { limit: z.number().min(1).max(50).default(10) },
  async (params) => { /* ... */ }
);

// Persona listing
server.tool(
  "list_personas",
  "List available expert personas...",
  {},
  async () => { /* ... */ }
);
```

### 2. Council Orchestrator (`src/council.ts`)

Core orchestration logic:

```typescript
interface CouncilOptions {
  debateMode?: boolean;
  includeHistory?: boolean;
  modelOverride?: {
    experts?: string;
    lead?: string;
  };
}

async function runCouncil(
  params: CouncilParams,
  options?: CouncilOptions
): Promise<CouncilResult> {
  // Phase 1: Parallel expert analysis (with concurrency control)
  const expertReports = await runExpertsInParallel(params, options);
  
  // Phase 2: Debate mode (optional)
  let debateReports: ExpertReport[] | undefined;
  if (options?.debateMode) {
    debateReports = await runDebateRound(params, expertReports, options);
  }
  
  // Phase 3: Lead Architect synthesis
  // Lead receives ALL reports — originals AND debate refinements
  const allReports = debateReports 
    ? [...expertReports, ...debateReports] 
    : expertReports;
  const blueprint = await synthesizeBlueprint(params, allReports, options);
  
  return { expertReports, debateReports, blueprint };
}
```

### 3. Expert Personas (`src/personas/`)

Each persona has:
- **Name & emoji** for identification
- **System prompt** with domain-specific focus areas + core quality rules
- **Output format** requirements

#### Security Architect (`🔒`)
Focus: Authentication, authorization, data exposure, injection vectors, CORS/CSP, secrets management, audit trails, supply-chain risks.

#### Performance Engineer (`⚡`)
Focus: Latency (P50/P95), caching strategy, token/API cost, runtime limits, DB query patterns, cold starts, payload sizes, concurrency.

#### UX/DX Designer (`🎨`)
Focus: Developer experience, error clarity, onboarding, configuration complexity, feedback loops, discoverability.

#### DevOps Engineer (`🔧`)
Focus: Deployment strategy, zero-downtime, monitoring/alerting, CI/CD, disaster recovery, scaling, environment management.

#### Lead Architect (`👑`)
Focus: Synthesis, conflict resolution, prioritization, actionable step generation.

### 4. Quality Rules (`src/constitution.ts`)

Lightweight quality rules appended to every expert's system prompt (~300 tokens):

```typescript
export const QUALITY_RULES = `
QUALITY STANDARDS:
1. BE SPECIFIC — Never give generic advice. Name the exact component, flow, or endpoint affected.
2. REFERENCE THE TECH STACK — All recommendations must use the stated technologies. Never suggest incompatible solutions.
3. PRIORITIZE BY IMPACT — CRITICAL first, HIGH second, MEDIUM/LOW last. No filler.
4. BE ACTIONABLE — Each finding must have a concrete mitigation executable by an AI coding agent.
5. NO CODE — Focus on WHAT and WHY. Never write implementation code. Pseudocode acceptable for algorithms.
6. STAY IN YOUR LANE — Analyze from your persona's perspective. Don't duplicate other experts' domains.
`;
```

The Lead Architect prompt includes additional synthesis-specific rules (output template, conflict resolution instructions) since it's called only once per request.

### 5. Persistence Layer (`src/db/` — Optional)

SQLite persistence is **optional**. The server operates correctly without it. When enabled, it provides cross-session history.

#### Schema (inlined in `src/db/schema.ts`)

```sql
-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  draft_plan_summary TEXT,
  tech_stack TEXT,
  constraints TEXT,
  debate_mode BOOLEAN DEFAULT 0
);

-- Messages (user inputs and final outputs)
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  persona_id TEXT,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Expert Reports (individual persona outputs)
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

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_reports_session ON expert_reports(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at DESC);
```

**Important pragmas** (set on connection):
```typescript
db.pragma("journal_mode = WAL");     // Safe for ungraceful shutdown
db.pragma("foreign_keys = ON");       // Actually enforce CASCADE
```

#### History Management

```typescript
// Keep only last N sessions (default 10)
function pruneOldSessions(limit: number): void {
  db.prepare(`
    DELETE FROM sessions 
    WHERE id NOT IN (
      SELECT id FROM sessions 
      ORDER BY created_at DESC 
      LIMIT ?
    )
  `).run(limit);
}
```

### 6. OpenRouter Gateway (`src/openrouter.ts`)

```typescript
interface OpenRouterOptions {
  model: string;
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

async function callOpenRouter(opts: OpenRouterOptions): Promise<string> {
  const maxRetries = 3;
  const baseDelay = 1000;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 90_000);
    
    try {
      const response = await fetch(/*...*/);
      // ... parse response
      return content;
    } catch (error) {
      if (isRetryable(error) && attempt < maxRetries - 1) {
        await delay(baseDelay * Math.pow(2, attempt));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);  // Always clean up
    }
  }
}
```

### 7. Configuration (`src/config.ts`)

```typescript
// Priority: CLI args > env vars > .env file > defaults
export const config = {
  openrouterApiKey: env("OPENROUTER_API_KEY") ?? "",
  openrouterBaseUrl: "https://openrouter.ai/api/v1",
  
  models: {
    experts: env("EXPERT_MODEL", "google/gemini-2.5-flash-lite"),
    lead: env("LEAD_MODEL", "google/gemini-2.5-pro"),
    debate: env("DEBATE_MODEL", "google/gemini-2.5-flash-lite"),
  },
  
  timeouts: {
    expertMs: 90_000,
    leadMs: 120_000,
    debateMs: 60_000,
  },
  
  maxDraftPlanLength: 12_000,
  maxHistorySessions: 10,
  maxParallelExperts: 4,  // Concurrency limit for OpenRouter
  
  // SQLite — set to empty string to disable persistence
  databasePath: env("DATABASE_PATH", "./data/council.db"),
} as const;
```

## Model Selection Rationale (March 2026)

### Expert Models: `google/gemini-2.5-flash-lite`
- **Fast**: Sub-2-second responses
- **Cost-effective**: $0.10/$0.40 per 1M tokens (prompt/completion)
- **Quality**: Newest generation flash model, better than 2.0-flash
- **Context**: 1M token context window

### Lead Architect: `google/gemini-2.5-pro`
- **Reasoning**: Excellent at synthesis and conflict resolution
- **Structure**: Follows complex output templates reliably
- **Context**: Handles 4+ expert reports well
- **Cost**: $1.25/$10.00 per 1M tokens — 6x cheaper than Sonnet with comparable synthesis quality

### Override for High-Stakes Reviews
For critical architecture decisions, override the lead model:
```
model_override: { lead: "anthropic/claude-3.5-sonnet" }
```
This costs ~$0.30-0.50 per call but gives the strongest synthesis available.

### Debate Model: `google/gemini-2.5-flash-lite`
- Same as expert models — quick critique rounds at minimal cost

## Deployment Architecture

### LXC Container Setup

MCP stdio servers are spawned by the client, not run as daemons. The LXC just needs the runtime environment.

```
Proxmox Host
└── LXC Container (Debian 12)
    ├── Node.js 20.x (or 22.x)
    ├── build-essential + python3 (for better-sqlite3 compilation)
    ├── SQLite3
    └── /opt/konsilio/
        ├── build/           # Compiled TypeScript
        ├── data/            # SQLite database (auto-created)
        ├── .env             # Configuration (optional — can use MCP env instead)
        └── node_modules/
```

**There is no daemon to manage.** Cline spawns the server process on demand via MCP config.

### MCP Client Configuration (Cline)

```json
{
  "mcpServers": {
    "council": {
      "command": "node",
      "args": ["/opt/konsilio/build/index.js"],
      "env": {
        "OPENROUTER_API_KEY": "sk-or-v1-...",
        "DATABASE_PATH": "/opt/konsilio/data/council.db"
      }
    }
  }
}
```

If the LXC is on a different host, use SSH:
```json
{
  "mcpServers": {
    "council": {
      "command": "ssh",
      "args": ["user@proxmox-lxc", "node", "/opt/konsilio/build/index.js"],
      "env": {
        "OPENROUTER_API_KEY": "sk-or-v1-..."
      }
    }
  }
}
```

## Error Handling

### Graceful Degradation

1. **Expert failure**: Continue with remaining experts (minimum 2 required for meaningful synthesis)
2. **Lead Architect failure**: Return raw expert reports with error message
3. **Database failure**: Continue without persistence, log warning to stderr
4. **API timeout**: Retry with exponential backoff, then fail gracefully
5. **All experts fail**: Return clear error with actionable guidance

### Error Messages

All errors include actionable guidance:
```
❌ Security Architect analysis failed (timeout after 90s).
   Proceeding with 3/4 expert reports.
   
   If this recurs, try:
   1. Breaking your plan into smaller sub-plans
   2. Using a faster expert model (EXPERT_MODEL env var)
   3. Running without debate mode
```

## Security Considerations

### Local-Only Deployment
- No external network exposure required
- Only OpenRouter API calls leave the network
- SQLite database stored locally

### API Key Management
- Passed via Cline MCP config `env` block (preferred)
- Or stored in `.env` file (not committed to git)
- Never logged or returned in responses
- Never written to stderr (which Cline may display)

### Data Privacy
- All conversation data stays local
- Only plan text sent to OpenRouter
- No telemetry or analytics

## Performance Characteristics

### Expected Latency
- **Without debate mode**: 15-30 seconds total
  - Experts: 5-10s (parallel, limited to 4 concurrent)
  - Lead: 10-20s
- **With debate mode**: 25-50 seconds total
  - Experts: 5-10s (parallel)
  - Debate: 5-10s (parallel)
  - Lead: 15-25s (more input to process)

### Resource Usage
- **Memory**: ~100MB baseline (Node.js + SQLite), +30MB per active request
- **CPU**: Minimal (I/O bound — waiting on OpenRouter)
- **Disk**: ~5-10MB for database (10 sessions with full reports)

### Cost Estimation (March 2026 pricing)

| Scenario | Expert Calls | Lead Call | Estimated Total |
|---|---|---|---|
| Normal (no debate) | 4 × Gemini 2.5 Flash Lite | 1 × Gemini 2.5 Pro | ~$0.02-0.04 |
| With debate | 8 × Gemini 2.5 Flash Lite | 1 × Gemini 2.5 Pro | ~$0.03-0.06 |
| Premium lead | 4 × Gemini 2.5 Flash Lite | 1 × Claude 3.5 Sonnet | ~$0.30-0.50 |

**Monthly estimate** at 3-5 runs/day with defaults: **$3-6/month**.

## Future Enhancements (Out of Scope for MVP)

1. **`auto_select_personas` tool**: AI recommends which experts are relevant for a given plan
2. **Custom personas via config file**: Domain-specific experts (ML Engineer, Database Architect)
3. **Streaming responses**: Stream expert outputs as they complete
4. **Web UI**: Dashboard for viewing history and managing personas
5. **Cost tracking**: Monitor OpenRouter spending per session
6. **Search integration**: Web search for supplementary context (reference impl has this as a stub)
7. **Export/Import**: Backup and restore sessions
