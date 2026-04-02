# Council MCP — Round 2 Review & Contributions

## Document Purpose

This document is a critical review of the existing planning documents (`council2.md`, `docs/ARCHITECTURE.md`, `docs/CONTRIBUTIONS.md`, `docs/IMPLEMENTATION_PLAN.md`) and the reference implementation (`gapgapweiqi/deepplan-mcp`). It identifies concrete issues, missed opportunities, and architectural pitfalls, then provides actionable fixes that have been incorporated into the updated planning documents.

---

## Executive Summary of Findings

The previous contributor did excellent work elevating the original `council2.md` skeleton into a structured, multi-phase plan. The parallel-expert pattern, constitution layer, debate mode, and graceful degradation are all sound ideas. However, after comparing the plan against the actual reference implementation source code, the current MCP SDK (v1.28.0), and the live OpenRouter model catalogue (March 2026), I found **14 issues** ranging from stale model references to a fundamental architectural gap (the plan builds code the reference implementation explicitly avoids needing). Below are the findings, grouped by severity.

---

## CRITICAL Issues

### C1. Stale / Mismatched Model Defaults

**Problem**: The plan hardcodes `google/gemini-2.0-flash-001` for experts and `anthropic/claude-3.5-sonnet` for the Lead Architect. These are from mid-2024. The reference implementation itself has already moved to `minimax/minimax-m2.5` for experts and `google/gemini-3-flash-preview` for the lead.

**Live OpenRouter pricing (March 2026)**:

| Model | Prompt ($/1M tok) | Completion ($/1M tok) | Notes |
|---|---|---|---|
| `google/gemini-2.0-flash-001` | $0.10 | $0.40 | Still available, cheap |
| `google/gemini-2.5-flash` | $0.30 | $2.50 | Much better quality, ~3x pricier |
| `google/gemini-2.5-flash-lite` | $0.10 | $0.40 | New — same price as 2.0-flash, newer model |
| `minimax/minimax-m2.5` | $0.20 | $1.17 | Reference impl default. Also has free tier |
| `anthropic/claude-3.5-sonnet` | $6.00 | $30.00 | **60x more expensive** than Gemini Flash |
| `google/gemini-2.5-pro` | $1.25 | $10.00 | Strong synthesis, 8x cheaper than Sonnet |

**Impact**: Using Claude 3.5 Sonnet for the Lead Architect makes each council run cost ~$0.30-0.50 for the lead call alone. Over daily usage that's $10-15/month for just the synthesis step.

**Fix applied**: Updated defaults:
- **Experts**: `google/gemini-2.5-flash-lite` — newest flash model, same dirt-cheap pricing as 2.0-flash, better quality
- **Lead Architect**: `google/gemini-2.5-pro` — excellent synthesis capabilities, 6x cheaper than Sonnet
- **Debate**: `google/gemini-2.5-flash-lite` — same as experts

Sonnet remains a good override for important reviews, but shouldn't be the default for a personal tool.

### C2. The `schema.sql` File Won't Be Found at Runtime

**Problem**: The implementation plan loads `schema.sql` at runtime via:
```typescript
const schemaPath = resolve(__dirname, "schema.sql");
const schema = readFileSync(schemaPath, "utf-8");
```

But `__dirname` after TypeScript compilation points to `build/db/`, and the `.sql` file won't be copied there by `tsc`. TypeScript only transpiles `.ts` files.

**Impact**: The server will crash on first run with `ENOENT: no such file or directory`.

**Fix applied**: Inline the schema as a string constant in `src/db/schema.ts` instead of relying on a `.sql` file. This is how production Node.js apps handle embedded SQL — it compiles cleanly, has no runtime file dependency, and is searchable in the codebase.

### C3. `dotenv` Dependency Is Unnecessary — Custom Loader Already Exists

**Problem**: The plan lists `dotenv` in `npm install` dependencies, but `src/config.ts` already implements a custom `.env` file parser (`loadEnvFile()`). The `dotenv` package is never imported anywhere.

**Impact**: Dead dependency adds size, potential supply-chain risk, and confusion.

**Fix applied**: Removed `dotenv` from dependencies. The custom loader is sufficient for a local single-user tool.

### C4. PM2 Is Unnecessary for an MCP stdio Server

**Problem**: The plan uses PM2 for process management. But MCP servers communicate over **stdio** — they are spawned as child processes by the MCP client (Cline). They don't run as persistent daemons.

The MCP client configuration is:
```json
{
  "mcpServers": {
    "council": {
      "command": "node",
      "args": ["/opt/konsilio/build/index.js"],
      "env": { "OPENROUTER_API_KEY": "..." }
    }
  }
}
```

Cline spawns the process, talks to it via stdin/stdout, and kills it when done. PM2 wrapping a stdio-based process will **break MCP communication** because PM2 captures and redirects stdout for its own logging.

**Impact**: MCP will fail to communicate with Cline if run under PM2. The entire deployment section is built around a flawed assumption.

**Fix applied**: Removed PM2 from the deployment plan entirely. The MCP server is lifecycle-managed by the MCP client. For the LXC setup, we just need Node.js installed and the built project accessible. If a persistent HTTP mode is added later (for a web UI), PM2 can be revisited then.

---

## HIGH Issues

### H1. `axios` Listed but `fetch` Used Everywhere

**Problem**: The original `council2.md` lists `axios` as a dependency, but the implementation plan and reference implementation both use native `fetch()`. Node.js 18+ has built-in `fetch` via undici.

**Fix applied**: Removed `axios` from dependencies. Native `fetch` is correct.

### H2. The Constitution Is Over-Engineered for Expert Prompts

**Problem**: The constitution layer appends ~800 tokens of rules to *every* expert's system prompt. The reference implementation's `CONSTITUTION_LAYER_1` is even more aggressive at ~1200 tokens. For 4 experts, that's 3,200-4,800 extra input tokens per request that go to models that already follow instructions well.

Key offenders:
- **Terminology Precision rules** ("query not fetch") — These are pedantic corrections for *output text*, not architectural analysis. An expert analyzing a security gap doesn't need to know the difference between "query" and "fetch."
- **"No Code Output" rule** — Already implied by the persona prompt. Doubling up wastes tokens.
- **The `§1.1 MANDATORY VIOLATION REPORT`** in the reference impl forces every expert to waste output tokens on ontological violation reports, even when there are none.

**Fix applied**: 
- Slimmed constitution to ~300 tokens of essential rules (be specific, reference tech stack, prioritize by severity, no code)
- Moved the verbose ontology/terminology checking to an *optional* persona rather than a mandatory tax on all experts
- The Lead Architect prompt retains the full quality standards since it's called once

### H3. No `assistant` Role in OpenRouter Message Types

**Problem**: The `OpenRouterMessage` type in the implementation plan defines `role: "system" | "user" | "assistant"`, but the `callOpenRouter` function only ever sends `system` and `user` messages. The `assistant` role is important for few-shot examples or conversation continuation.

More critically, OpenRouter's rate limiting applies per-key, and sending 4 parallel requests with the same key may trigger `429` responses on some model providers.

**Fix applied**: 
- Keep the `assistant` role in the type (it's correct for the API)
- Added a note about parallel request limits and a configurable concurrency parameter
- Added `p-limit` or manual concurrency control for the expert phase

### H4. Session History Is Never Fed Back to the Council

**Problem**: The architecture document says the orchestrator "builds context from recent session history (last 10 sessions)" but the implementation plan **never actually does this**. The `runCouncil` function only receives the current draft plan — it has no access to previous sessions.

The `get_session_history` tool returns history to the *user*, but the council itself is amnesiac.

**Impact**: The entire SQLite persistence layer provides zero value to the council's analysis quality. It's only useful as a log viewer.

**Fix applied**: Added an optional `include_history` parameter to `consult_council` that, when true, prepends a summary of recent sessions to the expert context. This makes persistence actually *useful*. Default is false to keep token costs down.

### H5. Debate Mode Logic Bug — Uses Wrong Reports for Synthesis

**Problem**: In the debate mode implementation:
```typescript
finalReports = debateReports.length > 0 ? debateReports : successfulReports;
```

This completely **replaces** the original reports with debate reports. But if only 2 of 4 debate calls succeed, the Lead Architect only sees 2 refined reports and misses the other 2 experts' analysis entirely.

**Fix applied**: The Lead Architect should receive *both* the original reports and the debate refinements. The debate reports are additive, not replacements. Updated the synthesis to merge both sets.

### H6. Missing `ON DELETE CASCADE` Enforcement in SQLite

**Problem**: The schema declares `FOREIGN KEY ... ON DELETE CASCADE` but SQLite doesn't enforce foreign keys by default. You must run `PRAGMA foreign_keys = ON;` before it works.

**Fix applied**: Added `db.pragma("foreign_keys = ON")` alongside the existing WAL mode pragma.

---

## MEDIUM Issues

### M1. `nanoid` Dependency — Use `crypto.randomUUID()` Instead

**Problem**: The plan adds `nanoid` as a dependency solely for generating session IDs. Node.js 18+ has `crypto.randomUUID()` built-in.

**Fix applied**: Replaced `nanoid` with `crypto.randomUUID()`. One fewer dependency.

### M2. Config Module Has Fragile `.env` Path Resolution

**Problem**: The config module resolves `.env` relative to `__dirname` (the compiled JS location in `build/`), so it looks for `.env` at the project root only if run from the expected directory structure. If someone runs the built file from a different working directory, the `.env` won't be found.

**Fix applied**: Search for `.env` in multiple locations: `process.cwd()`, then the script's parent directory, then fall back. Also prioritize actual environment variables (which Cline passes via MCP config) over the file.

### M3. Expert `maxTokens: 2048` May Be Too Low

**Problem**: Each expert gets 2048 max output tokens. For a complex architecture plan, a thorough security analysis can easily need 3000+ tokens, especially with the required format (heading + numbered findings + severity + mitigation for each).

The reference implementation uses 2048 for experts but 8192 for the lead. Since the experts' output directly determines the lead's quality, truncated expert output is a significant quality bottleneck.

**Fix applied**: Increased expert `maxTokens` to 4096. The cost difference is negligible with flash-tier models ($0.001 difference per call).

### M4. No Timeout Cleanup for `AbortController`

**Problem**: In the OpenRouter client, if the `fetch` succeeds, `clearTimeout` is correctly called. But if an error is thrown *after* the fetch completes (e.g., during JSON parsing), the timeout may still be pending.

**Fix applied**: Moved `clearTimeout` to a `finally` block, matching the reference implementation's pattern.

### M5. Missing `data/` Directory Auto-Creation

**Problem**: The SQLite database path is `./data/konsilio.db`, but nothing creates the `data/` directory. `better-sqlite3` will throw `SQLITE_CANTOPEN` if the directory doesn't exist.

**Fix applied**: Added `mkdirSync(dirname(dbPath), { recursive: true })` before database initialization.

### M6. The `configure_personas` Tool Is Overscoped for MVP

**Problem**: The architecture document lists a `configure_personas` tool that allows modifying expert personas at runtime. This requires:
- Storing custom personas in SQLite
- Loading them at council time
- Merging with defaults
- A schema for prompt editing

This is significant complexity for a "get to workable state" MVP.

**Fix applied**: Removed `configure_personas` from MVP scope. Kept `list_personas` (trivial to implement). Custom personas can be done via config file editing initially.

---

## LOW Issues / Observations

### L1. The Reference Implementation Has Features We Should Adopt

Features present in the reference implementation that are absent from the plan:

1. **`auto_select_personas` tool** — Lets the AI recommend which experts are most relevant for a given plan. Cheap (one small LLM call). Good for niche domains.
2. **Search provider interface** — Extensible pattern for adding web search context. Currently a stub but architecturally clean.
3. **CLI argument parsing** — `--api-key=xxx` flags, useful for quick testing.

**Fix applied**: Added `auto_select_personas` as a Phase 10 (post-MVP) enhancement. Added CLI arg support to config. Search provider deferred to post-MVP.

### L2. TypeScript `module: "NodeNext"` vs `"Node16"`

The plan uses `module: "NodeNext"`, the reference uses `"Node16"`. Both work, but `NodeNext` is the forward-compatible choice. No change needed.

### L3. Cost Estimation in Docs Is Wrong

The plan estimates "$0.02-0.05 per request" but with Claude Sonnet as lead, actual cost is more like $0.30-0.60. With the updated Gemini 2.5 Pro defaults, the estimate becomes ~$0.02-0.08, which should be documented accurately.

---

## Architectural Critique: What the Plan Gets Right

For balance, these are the things the previous contributor nailed:

1. **Parallel expert pattern** — Correct architecture. The sequential Expert → Critic from `council2.md` was objectively worse.
2. **`Promise.allSettled` for resilience** — Best practice for parallel LLM calls.
3. **Structured Lead Architect output format** — The 5-section template is excellent for AI agent consumption.
4. **Constitution concept** — Right idea, just needed trimming.
5. **Graceful degradation strategy** — Continue with 2+ experts, report failures.
6. **Session pruning** — Prevents unbounded disk growth.
7. **Environment variable overrides for models** — Essential given how fast the model landscape moves.

---

## Architectural Critique: Structural Observations

### The Role of SQLite in This System

The previous plan treats SQLite as critical infrastructure ("ensures memory survives LXC restarts"). But for an MCP stdio server:

1. The server is ephemeral — spawned per-session by Cline
2. Session history is nice-to-have, not core functionality  
3. The council's value comes from parallel expert analysis, not memory

**Recommendation**: Keep SQLite, but make it fully optional. The server should work perfectly with `DATABASE_PATH=:memory:` or even with persistence disabled entirely. This dramatically simplifies the MVP path — you can get a working council in Phases 1-6 without touching SQLite at all, then add it as a non-blocking enhancement.

### MCP Server Lifecycle Understanding

A critical thing missing from all the docs: **how MCP stdio servers actually work in practice with Cline**.

1. Cline spawns the MCP server process when you first use a tool from it
2. The process stays alive for the duration of the Cline session (usually the VS Code window lifetime)
3. Multiple tool calls go to the same running process
4. When Cline shuts down, the process is killed

This means:
- In-memory state *does* persist across multiple tool calls within a session
- SQLite persistence is useful for surviving VS Code restarts, not individual tool calls
- PM2 is wrong (it's for long-running daemons, not spawned processes)
- The server must handle being killed ungracefully (SIGTERM/SIGKILL)

### The Constitution's Real Value

The constitution concept is good but the implementation is confused about its purpose. There are two distinct concerns:

1. **Output quality rules** (be specific, reference tech stack, prioritize by impact) — These belong in every expert prompt. They're short and high-value.
2. **Ontological/terminology policing** (§1 and §1.1 in the reference) — This is a niche concern that bloats prompts and wastes tokens. It should be an optional expert, not a mandatory appendix.

The updated plan separates these concerns.

---

## Summary of Changes to Planning Documents

### ARCHITECTURE.md Changes
1. Fixed model defaults to March 2026 pricing
2. Removed PM2 from deployment (incompatible with stdio MCP)
3. Made SQLite optional (server works without it)
4. Fixed cost estimates
5. Added MCP lifecycle documentation
6. Simplified constitution to essential rules only
7. Added `include_history` parameter
8. Fixed debate mode logic
9. Removed `configure_personas` from MVP

### IMPLEMENTATION_PLAN.md Changes
1. Removed `dotenv`, `axios`, `nanoid` dependencies
2. Fixed schema.sql → inline schema.ts
3. Added `mkdirSync` for data directory 
4. Added `PRAGMA foreign_keys = ON`
5. Fixed `clearTimeout` to `finally` block
6. Increased expert `maxTokens` to 4096
7. Updated model defaults
8. Replaced PM2 deployment with simple LXC + node setup
9. Reordered phases: working council first (Phases 1-6), persistence second (Phase 7)
10. Fixed debate mode merge logic
11. Added `crypto.randomUUID()` instead of nanoid
12. Added concurrency control note for parallel requests

---

## Revised Cost Estimation

With updated model defaults:

| Scenario | Expert Calls | Lead Call | Total Est. |
|---|---|---|---|
| Normal (no debate) | 4 × Gemini 2.5 Flash Lite | 1 × Gemini 2.5 Pro | ~$0.02-0.04 |
| With debate | 8 × Gemini 2.5 Flash Lite | 1 × Gemini 2.5 Pro | ~$0.03-0.06 |
| Premium (Sonnet lead) | 4 × Gemini 2.5 Flash Lite | 1 × Claude 3.5 Sonnet | ~$0.30-0.50 |

At 3-5 council runs per day with default models: **~$3-6/month**.

---

## Risk Register (Updated)

| Risk | Severity | Probability | Mitigation |
|---|---|---|---|
| OpenRouter rate limits on parallel calls | HIGH | MEDIUM | Add concurrency limit (2-3 parallel max), retry with backoff |
| Expert output truncated at 2048 tokens | HIGH | HIGH | **Fixed**: increased to 4096 |
| Schema.sql not found at runtime | CRITICAL | CERTAIN | **Fixed**: inlined as TypeScript |
| PM2 breaks MCP stdio | CRITICAL | CERTAIN | **Fixed**: removed PM2 |
| Model deprecated on OpenRouter | MEDIUM | HIGH | Env var overrides, document alternatives |
| better-sqlite3 fails to compile in LXC | MEDIUM | MEDIUM | Install build-essential, python3; fallback to in-memory |
| Debate mode loses expert reports | HIGH | CERTAIN | **Fixed**: merge instead of replace |
| Context window overflow with history | MEDIUM | LOW | History is opt-in, summarized, bounded |
