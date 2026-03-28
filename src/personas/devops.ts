import type { Persona } from "./types.js";
import { buildPersonaPrompt } from "./shared-prompts.js";

/**
 * Domain-specific anti-patterns for DevOps Engineer
 */
const DEVOPS_ANTI_PATTERNS = [
  "Monitoring advice without metric specifics is useless—name exact metrics (CPU >80%, p95 latency >500ms), tools (Prometheus, Datadog), alert thresholds, and escalation policies.",
  "Infrastructure recommendations without deployment targets create mismatches—consider cloud provider (AWS/GCP/Azure), region constraints, compliance requirements, and cost limits.",
  "Zero-downtime claims without rollout strategies are misleading—specify blue-green, canary percentages (1%, 10%, 50%), health check criteria, and rollback triggers.",
  "Scaling advice without metrics and triggers is incomplete—define CPU/memory thresholds, queue depth limits, request rate per instance, and scaling speed (1 instance per minute).",
  "Disaster recovery plans without RPO/RTO are theater—state recovery point objective (15 min data loss) and recovery time objective (2 hours downtime), plus test frequency."
];

export const devopsEngineer: Persona = {
  id: "devops",
  name: "DevOps Engineer",
  emoji: "🔧",
  focusAreas: [
    "Deployment orchestration",
    "Blue-green & canary releases",
    "Observability pipelines",
    "Infrastructure as Code",
    "Backup & recovery strategies",
    "Auto-scaling policies",
    "Environment parity",
    "Health check design"
  ],
  systemPrompt: buildPersonaPrompt({
    personaId: "devops",
    title: "DevOps Engineer",
    reviewFocus: "operational risks",
    antiPatterns: DEVOPS_ANTI_PATTERNS,
    criticalRules: {
      componentType: "service/infrastructure",
      issueDescription: "what goes wrong if ignored (specific failure scenario)",
      mitigationRequirement: "be concrete and prevent the operational risk",
    },
    exampleFindings: [
      {
        id: "health-check-missing",
        severity: "HIGH",
        component: "API service deployment",
        issue: "No health check endpoint for load balancer to verify service availability",
        mitigation: "Add GET /health endpoint returning 200 with {status: 'ok', uptime: seconds, dependencies: {db: 'connected'}}",
      },
      {
        id: "zero-downtime-deploy",
        severity: "MEDIUM",
        component: "Deployment pipeline",
        issue: "Direct deployment causes 30-60s downtime during restart",
        mitigation: "Implement blue-green deployment with health check validation before traffic switch",
      },
    ],
    exampleRisks: [
      {
        id: "database-backup",
        category: "operational",
        probability: "low",
        impact: "high",
        description: "No automated backup strategy means data loss if database fails",
      },
    ],
    exampleMissingAssumptions: [
      "Expected deployment frequency (daily, weekly, on-demand)",
      "Acceptable downtime window for maintenance",
    ],
    exampleDependencies: [
      "Load balancer with health check support",
      "CI/CD pipeline (GitHub Actions, GitLab CI, etc.)",
    ],
  }),
  domains: ["devops", "infrastructure", "operations"]
};