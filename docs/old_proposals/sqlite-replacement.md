# SQLite Storage Backend Replacement: `better-sqlite3` → `sql.js`

## Problem

The MCP server uses `better-sqlite3` for local session persistence. The native binary fails on Windows because the installed `better_sqlite3.node` is a Linux ELF binary:

```
\\?\G:\dev\konsilio\node_modules\better-sqlite3\build\Release\better_sqlite3.node is not a valid Win32 application.
```

Native Node.js addons are compiled per-OS/per-arch. Any mismatch — copied `node_modules`, Node version change, CI artifact — breaks the install. This is a recurring class of problem with no permanent fix other than removing the native dependency.

## Current Usage

`DatabaseService` (`src/services/database.service.ts`) stores council session results in SQLite:

- **Write**: Save session metadata, expert findings, risks, consolidation phase outputs, final blueprint
- **Read**: Get recent session summaries (list), get a single session's blueprint by ID
- **Prune**: Delete old sessions beyond a configurable limit

Data volume is small — each session is ~10-50KB, pruned to ~10 sessions by default. Access pattern is append-only + read-recent-N. Single process, no concurrent writers.

## Solution: `sql.js`

SQLite compiled to WebAssembly. Same SQL engine, zero native binaries.

### Why `sql.js`

- Pure JS/WASM — works on any platform Node runs on, permanently
- Full SQLite — transactions, ACID, schema enforcement
- Existing SQL queries work as-is — no schema changes needed
- No build tools — just `npm install sql.js`

### Tradeoffs

- **Async init**: WASM loading on startup (one-time cost)
- **In-memory model**: Entire DB loaded as `Uint8Array`, persisted to disk via `writeFileSync` after writes
- **API differences**: `db.run()` / `db.exec()` instead of `db.prepare().run()` / `db.prepare().all()`

These are acceptable for our use case: small DB, infrequent writes, single process.

## Migration

### Files Changed

| File | Change |
|------|--------|
| `package.json` | Replace `better-sqlite3` + `@types/better-sqlite3` with `sql.js` |
| `src/services/database.service.ts` | Rewrite storage layer for `sql.js` API |
| `src/container.ts` | Handle async DatabaseService initialization |

### Files NOT Changed

- All persona files, prompts, schemas
- `CouncilService`, `OpenRouterService`, `FormatterService`
- Server, CLI, logging, config
- Test infrastructure

### DatabaseService Rewrite

Key changes:

1. **Async initialization** — load WASM + existing DB file on construction
2. **In-memory model** — all queries run against in-memory DB
3. **Explicit persistence** — `db.export()` → `writeFileSync` after writes
4. **API mapping** — `db.prepare().run()` → `db.run()`, `db.prepare().all()` → `db.exec()`

```typescript
// Before (better-sqlite3)
this.db.prepare('INSERT INTO sessions ...').run(id, summary, stack, constraints);
const rows = this.db.prepare('SELECT ...').all(limit);

// After (sql.js)
this.db.run('INSERT INTO sessions ...', [id, summary, stack, constraints]);
this.save(); // explicit persist
const result = this.db.exec('SELECT ...');
// map columns+values to objects
```

### Container Async Init

`DatabaseService` construction becomes async due to WASM loading:

```typescript
// Before
const db = new DatabaseService(config, logger, schema);

// After — factory pattern
const db = await DatabaseService.create(config, logger, schema);
```

### Steps

1. `npm uninstall better-sqlite3 @types/better-sqlite3 && npm install sql.js`
2. Rewrite `DatabaseService` with `sql.js` API
3. Update `container.ts` for async initialization
4. Verify end-to-end: `ping`, `list_personas`, `consult_council`, `get_session_history`

### Estimated Effort

~4 hours total.

## Conclusion

Replacing `better-sqlite3` with `sql.js` eliminates the native binary problem permanently. Same SQL engine, same reliability, zero platform-specific binaries. One-time migration, never see this error again.