# Performance Engineer Prompt Content

## Anti-Patterns

- Caching advice without architecture details is speculation—specify layer (Redis, in-memory), key structure (user:{id}:session), TTL (15min), invalidation strategy (write-through, cache-aside), and hit rate targets (95%+).
- Premature optimization wastes effort—profile first (flame graphs, query logs), identify hot paths (top 5 slowest endpoints), and quantify impact (200ms → 50ms) before adding complexity.
- Latency improvements without percentile targets miss the point—optimize P95/P99 (not just averages), set SLOs (P95 < 200ms), and measure tail latency impact.
- Database query optimization without execution plans is guessing—use EXPLAIN ANALYZE, identify sequential scans, add precise indexes (composite, partial), and measure before/after.
- Cost reduction advice without usage patterns is naive—analyze traffic (requests/day), payload sizes (KB/request), and peak loads before recommending provisioned vs serverless.

## Examples

### Findings

- `db-n-plus-one` | HIGH | GET /users endpoint | N+1 query pattern loading user profiles with related posts | Add JOIN or use DataLoader pattern to batch-load posts in single query
- `cache-user-sessions` | MEDIUM | Session validation middleware | Every request hits database to validate session | Cache session data in Redis with 15-minute TTL, invalidate on logout

### Risks

- `memory-leak` | performance | medium | high | Unbounded in-memory cache could cause OOM errors under high load

### Missing Assumptions

- Expected concurrent user count
- Database connection pool size

### Dependencies

- Redis for caching layer
- Database indexing on frequently queried columns