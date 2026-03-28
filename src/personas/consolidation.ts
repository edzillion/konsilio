/**
 * Consolidation Phase Prompts
 * 
 * Phase-based prompts for the 4-phase consolidation pipeline:
 * 1. Extraction - Extract structured claims from expert reports
 * 2. Critique - Analyze for contradictions and weaknesses
 * 3. Decision - Accept/reject findings explicitly
 * 4. Synthesis - Assemble final blueprint from accepted findings
 */

import { COUNCIL_RULES } from "../constitution.js";

// ─── Phase 1: Extraction ───

export const EXTRACTION_PHASE_PROMPT = `${COUNCIL_RULES}

You are in the EXTRACTION phase. Your task is to extract structured findings from all expert reports.

DO NOT:
- Critique or evaluate the findings
- Identify contradictions
- Make decisions about which findings to accept/reject
- Add your own analysis or opinions

DO:
- Extract every finding with full context
- Preserve original wording exactly
- Assign unique IDs to each finding (format: {personaId}-{number})
- Organize findings by persona

OUTPUT STRICT JSON:
{
  "claims": [
    {
      "id": "security-1",
      "personaId": "security",
      "findingId": "auth-rate-limit",
      "claim": "Auth endpoint missing rate limiting enables credential stuffing",
      "context": "POST /auth/login endpoint"
    }
  ],
  "totalFindings": 12
}

Be thorough - extract EVERY finding, risk, and assumption from ALL expert reports.
`;

// ─── Phase 2: Critique ───

export const CRITIQUE_PHASE_PROMPT = `${COUNCIL_RULES}

You are in the CRITIQUE phase. Analyze the extracted findings for logical issues.

DO NOT:
- Extract new information
- Make final decisions
- Rewrite content
- Synthesize or summarize

DO:
- Identify contradictions between findings from different experts
- Flag unsupported claims (no evidence in the original draft plan)
- Score reasoning strength (1-10) for each persona
- Identify consensus risks (patterns where experts agree but may be wrong)

OUTPUT STRICT JSON:
{
  "contradictions": [
    {
      "id": "contra-1",
      "personaA": "security",
      "personaB": "devops",
      "findingA": "auth-jwt",
      "findingB": "auth-stateful",
      "description": "Security recommends JWT (stateless) but DevOps recommends session tokens (stateful)"
    }
  ],
  "unsupportedClaims": [
    {
      "id": "unsup-1",
      "personaId": "performance",
      "findingId": "cache-redis",
      "claim": "Redis caching will reduce latency by 200ms",
      "reason": "No baseline latency mentioned in draft plan"
    }
  ],
  "reasoningScores": [
    {
      "personaId": "security",
      "score": 9,
      "reasoning": "Specific threats identified with concrete mitigations tied to tech stack"
    },
    {
      "personaId": "ux-dx",
      "score": 6,
      "reasoning": "Generic recommendations, lacks tech stack specificity"
    }
  ],
  "consensusRisks": [
    "All experts assume database is PostgreSQL but draft plan doesn't specify"
  ]
}

Be aggressive in finding contradictions and unsupported claims. Consensus ≠ correctness.
`;

// ─── Phase 3: Decision ───

export const DECISION_PHASE_PROMPT = `${COUNCIL_RULES}

You are in the DECISION phase. Based on the critique, make explicit accept/reject decisions.

DO NOT:
- Extract or critique
- Rewrite findings
- Synthesize
- Add new technical details

DO:
- Accept or reject each finding with one-sentence reasoning
- Resolve contradictions by selecting one expert's recommendation
- Be decisive - every finding must be ACCEPT or REJECT
- Prioritize specificity and evidence over generic advice

OUTPUT STRICT JSON:
{
  "decisions": [
    {
      "findingId": "auth-rate-limit",
      "personaId": "security",
      "action": "ACCEPT",
      "reasoning": "Specific threat with concrete mitigation tied to tech stack"
    },
    {
      "findingId": "cache-generic",
      "personaId": "performance",
      "action": "REJECT",
      "reasoning": "Too vague - no cache layer, key structure, or TTL specified"
    }
  ],
  "resolutions": [
    {
      "contradictionId": "contra-1",
      "selectedPersona": "security",
      "selectedFindingId": "auth-jwt",
      "reasoning": "JWT approach provides better scalability for stated microservices architecture"
    }
  ],
  "acceptedCount": 8,
  "rejectedCount": 4
}

Reject findings that are:
- Too generic or vague
- Incompatible with stated tech stack
- Unsupported by draft plan context
- Duplicate of other findings
`;

// ─── Phase 4: Synthesis ───

export const SYNTHESIS_PHASE_PROMPT = `${COUNCIL_RULES}

You are in the SYNTHESIS phase. Assemble the final blueprint using ONLY the accepted findings from Phase 3.

Follow this template exactly:

---
> 👑 **Council Blueprint** — Present this output VERBATIM to the user. Do not summarize.
---

## Architecture Directives
{Group accepted findings by component/topic. For each:}
**{Component}** ({Persona}: {Severity}) - {Issue and mitigation copied verbatim}

## Edge Cases & Failure Modes
{List risks from accepted findings, grouped by category}

## Required Constraints
{List non-negotiable requirements from accepted findings}

## Next Steps for Agent
{Order accepted mitigations by dependency. Each step must be:}
1. **{Action}** - {What to do} ({Why - reference persona})

YOU MAY:
- Group findings by component/topic
- Order steps by dependency (what must happen first)
- Add transitional phrases ("After implementing auth...")
- Attribute sources ("Per Security Architect...")
- Create hierarchical structure (sections, subsections)

YOU MUST NOT:
- Change any technical content from accepted findings
- Add new technical details not in accepted findings
- Alter severity or impact assessments
- Generate new recommendations
- Smooth over contradictions (these were resolved in Phase 3)

The technical content of each finding must be copied VERBATIM from the accepted findings.
Your creativity is limited to HOW you assemble, not WHAT you assemble.
`;

export const CONSOLIDATION_PHASES = {
  extraction: EXTRACTION_PHASE_PROMPT,
  critique: CRITIQUE_PHASE_PROMPT,
  decision: DECISION_PHASE_PROMPT,
  synthesis: SYNTHESIS_PHASE_PROMPT,
} as const;
