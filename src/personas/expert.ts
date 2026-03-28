/**
 * Expert Class
 * 
 * Runtime persona construction from markdown files.
 * Replaces individual persona TypeScript files.
 */

import type { PersonaPromptData } from '../services/prompt.service.js';
import type { Persona } from './types.js';

export interface ExpertConfig {
  personaId: string;
  model: string;
  expertRules: string;
  workflowRules?: string;
  promptService: {
    loadPersonaPromptData: (id: string) => PersonaPromptData;
  };
}

/**
 * Expert - Runtime persona construction
 */
export class Expert implements Persona {
  public readonly id: string;
  public readonly name: string;
  public readonly emoji: string;
  public readonly focusAreas: string[];
  public readonly domains?: string[];
  public readonly systemPrompt: string;

  constructor(config: ExpertConfig) {
    const personaData = config.promptService.loadPersonaPromptData(config.personaId);
    
    this.id = personaData.id;
    this.name = personaData.name;
    this.emoji = personaData.emoji;
    this.focusAreas = personaData.focusAreas;
    this.domains = personaData.domains;
    this.systemPrompt = this.buildSystemPrompt(personaData, config);
  }

  /**
   * Build the system prompt for the expert
   */
  private buildSystemPrompt(
    data: PersonaPromptData,
    config: ExpertConfig
  ): string {
    const parts: string[] = [];

    // Expert rules (always included for experts)
    parts.push(config.expertRules);

    // Workflow rules (optional)
    if (config.workflowRules) {
      parts.push('\n' + config.workflowRules);
    }

    // Persona-specific content
    parts.push(`\nYou are a ${data.name}. Review the draft plan for architecture issues within your domain.\n`);

    // Anti-patterns
    if (data.antiPatterns.length > 0) {
      parts.push('ANTI-PATTERNS:\n' + data.antiPatterns.map((ap, i) => `${i + 1}. ${ap}`).join('\n') + '\n');
    }

    // Output template with examples
    parts.push(this.buildOutputTemplate(data));

    return parts.join('\n');
  }

  /**
   * Build the JSON output template with examples
   */
  private buildOutputTemplate(data: PersonaPromptData): string {
    const examples: string[] = [];

    // Add example findings if available
    if (data.exampleFindings.length > 0) {
      examples.push('"findings": [' + data.exampleFindings.map(f => `
    {
      "id": "${f.id}",
      "severity": "${f.severity}",
      "component": "${f.component}",
      "issue": "${f.issue}",
      "mitigation": "${f.mitigation}"
    }`).join(',') + ']');
    }

    // Add example risks if available
    if (data.exampleRisks.length > 0) {
      examples.push('"risks": [' + data.exampleRisks.map(r => `
    {
      "id": "${r.id}",
      "category": "${r.category}",
      "probability": "${r.probability}",
      "impact": "${r.impact}",
      "description": "${r.description}"
    }`).join(',') + ']');
    }

    // Add example assumptions if available
    if (data.exampleMissingAssumptions.length > 0) {
      examples.push('"missingAssumptions": [' + data.exampleMissingAssumptions.map(a => `"${a}"`).join(', ') + ']');
    }

    // Add example dependencies if available
    if (data.exampleDependencies.length > 0) {
      examples.push('"dependencies": [' + data.exampleDependencies.map(d => `"${d}"`).join(', ') + ']');
    }

    return `OUTPUT EXACTLY THIS JSON FORMAT (no markdown, no code blocks, no explanatory text):

{
  "personaId": "${data.id}",
  ${examples.join(',\n  ')}
}

${data.exampleFindings.length > 0 ? `Example finding format: ${data.exampleFindings[0].id} | ${data.exampleFindings[0].severity} | ${data.exampleFindings[0].component} | ${data.exampleFindings[0].issue} | ${data.exampleFindings[0].mitigation}` : ''}`;
  }
}