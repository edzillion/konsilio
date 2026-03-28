# Prompt Service Architecture (Simplified)

**Date:** 2025-03-28  
**Status:** Proposed  
**Dependencies:** None (0 new packages)

## Problem
Current prompt system mixes content with logic in TypeScript files, making it hard for non-developers to edit prompts and creating noisy git diffs.

## Solution
Externalize prompt content to markdown files while keeping the proven template logic in TypeScript.

## Architecture

```
src/services/prompt.service.ts    # Service for loading prompt content
src/prompts/
  expert_rules.md                  # Expert rules (static content)
  workflow-rules.md               # Single run rules (constitution)
  personas/
    security.md                   # Security anti-patterns + examples
    performance.md                # Performance anti-patterns + examples
    ...
  consolidation/
    extraction.md                 # Extraction phase instructions
    critique.md                   # Critique phase instructions
    ...
```

## File Format

**`src/prompts/personas/security.md`:**
```markdown
# Security Architect Prompt Content

## Anti-Patterns
- Encryption advice without specifics is dangerous—specify exact data (PII, credentials), algorithm (AES-256-GCM, ChaCha20), key management (KMS, envelope encryption), and rotation policy (90 days).
- Authentication recommendations without threat models miss the point—consider attack vectors (credential stuffing, phishing, session hijacking) and quantify protection (rate limits, MFA, device fingerprinting).
- Authorization advice without scope definitions creates gaps—define exact permissions (read:users, write:orders), enforcement points (API gateway, service-level), and audit requirements (who accessed what when).
- Secrets management suggestions without rotation plans are half-measures—state storage (vault, parameter store), access controls (IAM, policies), and automated rotation (30-90 days).
- API security without abuse scenarios is naive—specify rate limits (requests/IP/hour), quota strategies (tiered, hard), DDoS mitigation (WAF, CDN), and anomaly detection (spike alerts).

## Examples

### Findings
- `auth-rate-limit` | CRITICAL | POST /auth/login endpoint | No rate limiting enables credential stuffing attacks | Implement 5 attempts per IP per hour using Redis counter with sliding window
- `jwt-secret` | HIGH | JWT token generation | JWT secret key management not specified | Store JWT secret in environment variable, rotate every 90 days, use HS256 minimum

### Risks
- `sql-injection` | security | medium | high | User input in database queries without parameterization could enable SQL injection

### Missing Assumptions
- How user sessions are invalidated on logout
- Whether API supports HTTPS only or allows HTTP

### Dependencies
- Redis for rate limiting storage
- Environment variable management system
```

## Service Implementation

```typescript
// src/services/prompt.service.ts
import { readFileSync } from 'fs';
import { join } from 'path';

interface PersonaPromptData {
  antiPatterns: string[];
  exampleFindings: Array<{id: string, severity: string, component: string, issue: string, mitigation: string}>;
  exampleRisks: Array<{id: string, category: string, probability: string, impact: string, description: string}>;
  exampleMissingAssumptions: string[];
  exampleDependencies: string[];
}

export class PromptService {
  private promptsDir = join(process.cwd(), 'src', 'prompts');

  loadPersonaPromptData(personaId: string): PersonaPromptData {
    const promptData = readFileSync(
      join(this.promptsDir, 'personas', `${personaId}.md`),
      'utf-8'
    );
    
    // Simple parsing with regex (no gray-matter needed)
    return {
      antiPatterns: this.extractList(promptData, '## Anti-Patterns'),
      exampleFindings: this.extractExamples(promptData, '### Findings', ['id', 'severity', 'component', 'issue', 'mitigation']),
      exampleRisks: this.extractExamples(promptData, '### Risks', ['id', 'category', 'probability', 'impact', 'description']),
      exampleMissingAssumptions: this.extractList(promptData, '### Missing Assumptions'),
      exampleDependencies: this.extractList(promptData, '### Dependencies'),
    };
  }

  loadConsolidationPhase(phase: 'extraction' | 'critique' | 'decision' | 'synthesis'): string {
    return readFileSync(
      join(this.promptsDir, 'consolidation', `${phase}.md`),
      'utf-8'
    );
  }

  loadCoreRules(): string {
    return readFileSync(
      join(this.promptsDir, 'expert_rules.md'),
      'utf-8'
    );
  }

  loadWorkflowRules(): string {
    return readFileSync(
      join(this.promptsDir, 'workflow-rules.md'),
      'utf-8'
    );
  }

  private extractList(content: string, header: string): string[] {
    const match = content.match(new RegExp(`${header}\\n((- .+\\n?)+)`));
    if (!match) return [];
    return match[1].split('\n').filter(line => line.startsWith('- ')).map(line => line.slice(2));
  }

  private extractExamples(content: string, header: string, fields: string[]): any[] {
    const match = content.match(new RegExp(`${header}\\n((- \\\`.+\\n?)+)`));
    if (!match) return [];
    return match[1].split('\n').filter(line => line.startsWith('- ')).map(line => {
      const values = line.slice(2).split(' | ');
      const obj: any = {};
      fields.forEach((field, i) => obj[field] = values[i]?.replace(/`/g, '').trim());
      return obj;
    });
  }
}
```

## Persona Integration

```typescript
// src/personas/security.ts (simplified)
import type { Persona } from "./types.js";
import { PromptService } from "../services/prompt.service.js";
import { buildPersonaPrompt } from "./shared-prompts.js";

const promptService = new PromptService();
const personaPromptData = promptService.loadPersonaPromptData('security');

export const securityArchitect: Persona = {
  id: "security",
  name: "Security Architect",
  emoji: "🔒",
  focusAreas: [/* unchanged */],
  systemPrompt: buildPersonaPrompt({
    personaId: "security",
    title: "Security Architect",
    reviewFocus: "security risks",
    antiPatterns: personaPromptData.antiPatterns,
    expertRules: { /* unchanged */ },
    exampleFindings: personaPromptData.exampleFindings,
    exampleRisks: personaPromptData.exampleRisks,
    exampleMissingAssumptions: personaPromptData.exampleMissingAssumptions,
    exampleDependencies: personaPromptData.exampleDependencies,
  }),
  domains: ["security", "infrastructure", "compliance"]
};
```

## Benefits

✅ **No new dependencies** - Uses only Node.js built-ins  
✅ **Git-friendly diffs** - Markdown changes are readable  
✅ **Non-dev editing** - Domain experts can edit `.md` files  
✅ **Type safety preserved** - TypeScript validates parsed content  
✅ **Simple parsing** - Regex-based, no YAML/gray-matter complexity  
✅ **Proven templating** - Keep the working `buildPersonaPrompt()` function  

## Migration (2-3 hours)

1. Create `src/services/prompt.service.ts` (30 min)
2. Create `src/prompts/` directory structure (15 min)
3. Convert one persona to markdown format (30 min)
4. Update persona file to use PromptService (15 min)
5. Test and iterate (30 min)
6. Convert remaining 9 personas (1 hour)
7. Convert consolidation phases (30 min)

## Trade-offs

**Downside**: Simple regex parsing is fragile if format changes  
**Mitigation**: Add validation tests; format is simple and stable  

**Downside**: No syntax highlighting for prompt structure in markdown  
**Mitigation**: Content is free-text; structure is validated by TypeScript  

## Conclusion

This approach achieves the core goal (externalized, editable prompts) with zero dependencies while preserving the proven template logic. The regex parsing is crude but effective for a single-developer project where the format is controlled.