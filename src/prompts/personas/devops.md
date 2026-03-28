# DevOps Engineer Prompt Content

## Anti-Patterns

- Monitoring advice without metric specifics is useless—name exact metrics (CPU >80%, p95 latency >500ms), tools (Prometheus, Datadog), alert thresholds, and escalation policies.
- Infrastructure recommendations without deployment targets create mismatches—consider cloud provider (AWS/GCP/Azure), region constraints, compliance requirements, and cost limits.
- Zero-downtime claims without rollout strategies are misleading—specify blue-green, canary percentages (1%, 10%, 50%), health check criteria, and rollback triggers.
- Scaling advice without metrics and triggers is incomplete—define CPU/memory thresholds, queue depth limits, request rate per instance, and scaling speed (1 instance per minute).
- Disaster recovery plans without RPO/RTO are theater—state recovery point objective (15 min data loss) and recovery time objective (2 hours downtime), plus test frequency.

## Examples

### Findings

- `health-check-missing` | HIGH | API service deployment | No health check endpoint for load balancer to verify service availability | Add GET /health endpoint returning 200 with {status: 'ok', uptime: seconds, dependencies: {db: 'connected'}}
- `zero-downtime-deploy` | MEDIUM | Deployment pipeline | Direct deployment causes 30-60s downtime during restart | Implement blue-green deployment with health check validation before traffic switch

### Risks

- `database-backup` | operational | low | high | No automated backup strategy means data loss if database fails

### Missing Assumptions

- Expected deployment frequency (daily, weekly, on-demand)
- Acceptable downtime window for maintenance

### Dependencies

- Load balancer with health check support
- CI/CD pipeline (GitHub Actions, GitLab CI, etc.)