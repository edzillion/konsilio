/**
 * Shared Prompt Templates
 * 
 * DRY extraction of common prompt patterns used across all personas.
 * These strings are refined over time and should be consistent.
 */

import { loadConstitution } from "../constitution.js";

// ─── Core Rules (Non-negotiable, every run) ───

/**
 * Builds the CORE RULES section - non-negotiable rules for every council run.
 * These are merged with persona-specific critical rules configuration.
 */
export interface CoreRulesConfig {
  /** What type of component to name (e.g., "endpoint/flow/module") */
  componentType: string;
  /** What the issue must describe (e.g., "specific security risk") */
  issueDescription: string;
  /** What the mitigation must include (e.g., "be concrete and executable") */
  mitigationRequirement: string;
}

/**
 * Builds the complete CORE RULES section with customizable parts.
 * These rules are non-negotiable and apply to all expert analysis.
 */
export function buildCoreRules(config: CoreRulesConfig): string {
  return `CORE RULES (NON-NEGOTIABLE):
1. NEVER read, reference, or modify actual source code — analyze ONLY the plan text provided
2. Focus on ARCHITECTURE, not implementation — explain WHAT and WHY, minimize code snippets
3. Be SPECIFIC and OPINIONATED — vague advice like "consider security" or "use caching" is worthless
4. ALWAYS reference the stated tech stack by name — generic recommendations are forbidden
5. Respect context constraints strictly — never recommend incompatible solutions
6. Stay within your assigned role — analyze from your persona's expertise only
7. Each finding MUST have a unique ID (format: component-description, kebab-case)
8. Severity MUST be one of: CRITICAL, HIGH, MEDIUM, LOW
9. Component MUST name the specific ${config.componentType} affected
10. Issue MUST describe the ${config.issueDescription}
11. Mitigation MUST ${config.mitigationRequirement}
12. Reference the stated tech stack in every mitigation
13. Output ONLY valid JSON — no markdown formatting, no code blocks, no explanatory text`;
}

// ─── Generic Anti-Patterns ───

/**
 * The universal anti-pattern that appears in every persona.
 * Usage: `${GENERIC_ANTI_PATTERN.replace('{componentType}', 'endpoint/flow/query')}`
 */
export const GENERIC_ANTI_PATTERN = "Never give generic advice - name the exact {componentType} affected.";


// ─── Full Prompt Builder ───

export interface PersonaPromptConfig {
  /** Persona ID (e.g., "security", "performance") */
  personaId: string;
  /** Persona title (e.g., "Security Architect") */
  title: string;
  /** What to review for (e.g., "security risks") */
  reviewFocus: string;
  /** Domain-specific anti-patterns */
  antiPatterns: string[];
  /** Expert rules configuration */
  expertRules: CoreRulesConfig;
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

  const constitution = loadConstitution();
  
  return `${buildCoreRules(config.expertRules)}
${constitution ? `\n\n${constitution}` : ''}

You are a ${config.title}. Review the draft plan for ${config.reviewFocus}.

ANTI-PATTERNS:
${antiPatternsSection}
${GENERIC_ANTI_PATTERN.replace('{componentType}', config.expertRules.componentType)}

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
}`;
}
