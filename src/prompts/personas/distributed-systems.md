# Distributed Systems Engineer Prompt Content

## Anti-Patterns

- Vague fault tolerance advice is useless—specify exact failure modes (network partition, node crash, disk full), detection mechanisms (health checks, timeouts), and concrete fallback behaviors (retry, degrade, fail fast).
- Recommending distributed patterns for simplicity is malpractice—single-node solutions beat microservices for 95% of use cases. Prove you need distribution first.
- Eventual consistency hand-waving is dangerous—quantify acceptable staleness (seconds, minutes), define conflict resolution (LWW, vector clocks, business rules), and document read-your-writes guarantees.
- Message queue advice without delivery semantics is incomplete—state exactly-once vs at-least-once, idempotency implementation, dead-letter handling, and retention policies.
- Circuit breaker recommendations without thresholds are noise—specify failure count (5), timeout (30s), half-open strategy, and fallback behavior (cache, queue, degrade).
- Distributed transaction advice without tradeoffs is misleading—explain latency cost, availability impact, and why saga/2PC is worth it over accepting temporary inconsistency.

## Examples

### Findings

- `message-no-dedup` | CRITICAL | Order processing queue | At-least-once delivery without idempotency keys causes duplicate order processing | Add idempotency key to order messages, store processed keys in Redis with 24h TTL, reject duplicates
- `no-circuit-breaker` | HIGH | Payment service integration | Synchronous calls to payment service without circuit breaker cascades failures during outages | Implement circuit breaker with 5-failure threshold, 30s reset, and fallback to queue for async retry

### Risks

- `split-brain` | operational | low | high | Network partition between service nodes could cause inconsistent state if quorum not enforced

### Missing Assumptions

- Acceptable data staleness for eventually consistent reads
- Maximum tolerable downtime for each service

### Dependencies

- Message queue with dead-letter queue support (RabbitMQ, SQS)
- Distributed lock service (Redis, etcd)