# Council MCP — Implementation Plan

## Overview

This plan is split into phases, each in its own file. Each phase delivers a working increment. **Phases 1-6 produce a fully working council with no persistence.** Phase 7 adds optional SQLite history.

## Phase Index

| Phase | File | Description | Estimated Time |
|-------|------|-------------|----------------|
| 1 | [01-foundation.md](./01-foundation.md) | Project init, deps, config | 2-3 hours |
| 2 | [02-mcp-server.md](./02-mcp-server.md) | Basic MCP server with ping | 1-2 hours |
| 3 | [03-openrouter.md](./03-openrouter.md) | OpenRouter API gateway | 2-3 hours |
| 4 | [04-personas.md](./04-personas.md) | Constitution + expert personas | 2-3 hours |
| 5 | [05-orchestrator.md](./05-orchestrator.md) | Council orchestrator + debate | 3-4 hours |
| 6 | [06-tools.md](./06-tools.md) | MCP tool registration + testing | 2-3 hours |
| 7 | [07-persistence.md](./07-persistence.md) | SQLite persistence (optional) | 3-4 hours |
| 8 | [08-deployment.md](./08-deployment.md) | LXC deployment + testing | 2-3 hours |

**Total**: ~18-25 hours over 4-5 days

## Prerequisites

- Node.js 20.x or 22.x
- OpenRouter API key ([openrouter.ai/keys](https://openrouter.ai/keys))
- VS Code with Cline extension
- Basic TypeScript familiarity

## Key Dependencies (no extras)

```
@modelcontextprotocol/sdk  (MCP protocol)
zod                        (schema validation)
better-sqlite3             (Phase 7 only)
```

No `dotenv`, `axios`, `nanoid`, or `pm2` needed. See [CONTRIBUTIONS_R2.md](../CONTRIBUTIONS_R2.md) for rationale.

## Key Design Decisions

- **Models**: `google/gemini-2.5-flash-lite` (experts), `google/gemini-2.5-pro` (lead) — see pricing in [ARCHITECTURE.md](../ARCHITECTURE.md)
- **No PM2**: MCP stdio servers are spawned by Cline, not run as daemons
- **SQLite optional**: Core council works without persistence
- **Native `fetch`**: No axios needed (Node 18+)
- **`crypto.randomUUID()`**: No nanoid needed (Node 18+)
