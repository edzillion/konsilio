# Extraction Phase

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
```json
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
```

Be thorough - extract EVERY finding, risk, and assumption from ALL expert reports.