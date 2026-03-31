# Decision Phase

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
```json
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
```

Reject findings that are:
- Too generic or vague
- Incompatible with stated tech stack
- Unsupported by draft plan context
- Duplicate of other findings