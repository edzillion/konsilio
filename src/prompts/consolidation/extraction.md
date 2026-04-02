# Extraction Phase

You are in the EXTRACTION phase. Your task is to extract structured findings from all expert reports.

CRITICAL RULES:
- Do NOT decompose or break apart finding objects
- Copy each finding object AS-IS, preserving ALL fields (id, severity, component, issue, mitigation)
- Work with WHOLE OBJECTS — select, filter, or reorder them, but NEVER modify their internal structure
- The `context` field must contain the ENTIRE original finding object, not a string summary

DO NOT:
- Critique or evaluate the findings
- Identify contradictions
- Make decisions about which findings to accept/reject
- Add your own analysis or opinions
- Modify, summarize, or restructure individual finding objects

DO:
- Extract every finding with its FULL original structure
- Preserve original wording exactly
- Assign unique IDs to each finding (format: {personaId}-{number})
- Organize findings by persona

OUTPUT STRICT JSON:
```json
{
  "claims": [
    {
      "id": "security-1",
      "personaId": "security",
      "findingId": "auth-rate-limit",
      "claim": "Auth endpoint missing rate limiting enables credential stuffing",
      "context": {
        "id": "auth-rate-limit",
        "severity": "HIGH",
        "component": "POST /auth/login",
        "issue": "No rate limiting on authentication endpoint",
        "mitigation": "Add rate limiter middleware with sliding window"
      }
    }
  ],
  "totalFindings": 12
}
```

Be thorough - extract EVERY finding, risk, and assumption from ALL expert reports.