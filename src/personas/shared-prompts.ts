/**
 * Shared Prompt Templates
 * 
 * DRY extraction of common prompt patterns used across all personas.
 * These strings are refined over time and should be consistent.
 */

import { COUNCIL_RULES } from "../constitution.js";

// ─── Generic Anti-Patterns ───

/**
 * The universal anti-pattern that appears in every persona.
 * Usage: `${GENERIC_ANTI_PATTERN.replace('{componentType}', 'endpoint/flow/query')}`
 */
export const GENERIC_ANTI_PATTERN = "Never give generic advice - name the exact {componentType} affected.";

// ─── Output Format ───

/**
 * JSON output instruction and Rule 7 - identical across all personas.
 * Used both as the output directive before the JSON template and as rule 7.
 */
export const OUTPUT_ONLY_JSON_RULE = "Output ONLY valid JSON - no markdown formatting, no code blocks, no explanatory text";

// ─── Critical Rules Builder ───

/**
 * Critical rules that are identical across all personas except for:
 * - Rule 3: component type (endpoint/flow/module, service/infrastructure, etc.)
 * - Rule 4: domain description (security risk, performance bottleneck, etc.)
 * - Rule 5: mitigation requirement (varies by domain)
 */
export interface CriticalRulesConfig {
  /** What type of component to name in rule 3 (e.g., "endpoint/flow/module") */
  componentType: string;
  /** What the issue must describe in rule 4 (e.g., "specific security risk") */
  issueDescription: string;
  /** What the mitigation must include in rule 5 (e.g., "be concrete and executable (not 'consider' or 'should')") */
  mitigationRequirement: string;
}

/**
 * Builds the CRITICAL RULES section with customizable parts.
 */
export function buildCriticalRules(config: CriticalRulesConfig): string {
  return `CRITICAL RULES:
1. Each finding MUST have a unique ID (format: component-description, kebab-case)
2. Severity MUST be one of: CRITICAL, HIGH, MEDIUM, LOW
3. Component MUST name the specific ${config.componentType} affected
4. Issue MUST describe the ${config.issueDescription}
5. Mitigation MUST ${config.mitigationRequirement}
6. Reference the stated tech stack in every mitigation
7. ${OUTPUT_ONLY_JSON_RULE}`;
}

// ─── Full Prompt Builder ───

export interface PersonaPromptConfig {
  /** Persona ID (e.g., "security", "performance") */
  personaId: string;
  /** Persona title (e.g., "Security Architect") */
  title: string;
  /** What to review for (e.g., "security risks") */
  reviewFocus: string;
  /** Focus areas as comma-separated string */
  focusList: string;
  /** Domain-specific anti-patterns (3 bullet points) */
  antiPatterns: string[];
  /** Critical rules configuration */
  criticalRules: CriticalRulesConfig;
  /** Example findings for the JSON template (2 examples) */
  exampleFindings: Array<{
    id: string;
    severity: string;
    component: string;
    issue: string;
    mitigation: string;
  }>;
  /** Example risks for the JSON template */
  exampleRisks: Array<{
    id: string;
    category: string;
    probability: string;
    impact: string;
    description: string;
  }>;
  /** Example missing assumptions */
  exampleMissingAssumptions: string[];
  /** Example dependencies */
  exampleDependencies: string[];
}

/**
 * Builds the complete system prompt for a persona.
 */
export function buildPersonaPrompt(config: PersonaPromptConfig): string {
  const antiPatternsSection = config.antiPatterns
    .map((ap, index) => `${index + 1}. ${ap}`)
    .join('\n');

  const findingsJson = config.exampleFindings
    .map(f => `    {
      "id": "${f.id}",
      "severity": "${f.severity}",
      "component": "${f.component}",
      "issue": "${f.issue}",
      "mitigation": "${f.mitigation}"
    }`)
    .join(',\n');

  const risksJson = config.exampleRisks
    .map(r => `    {
      "id": "${r.id}",
      "category": "${r.category}",
      "probability": "${r.probability}",
      "impact": "${r.impact}",
      "description": "${r.description}"
    }`)
    .join(',\n');

  const assumptionsJson = config.exampleMissingAssumptions
    .map(a => `    "${a}"`)
    .join(',\n');

  const dependenciesJson = config.exampleDependencies
    .map(d => `    "${d}"`)
    .join(',\n');

  return `${COUNCIL_RULES}

You are a ${config.title}. Review the draft plan for ${config.reviewFocus}.

Focus: ${config.focusList}.

ANTI-PATTERNS:
${antiPatternsSection}
${GENERIC_ANTI_PATTERN.replace('{componentType}', config.criticalRules.componentType)}

${OUTPUT_ONLY_JSON_RULE}
{
  "personaId": "${config.personaId}",
  "findings": [
${findingsJson}
  ],
  "risks": [
${risksJson}
  ],
  "missingAssumptions": [
${assumptionsJson}
  ],
  "dependencies": [
${dependenciesJson}
  ]
}

${buildCriticalRules(config.criticalRules)}`;
}