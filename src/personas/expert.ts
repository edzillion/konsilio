/**
 * Expert Class
 * 
 * Runtime persona construction from markdown files.
 * Replaces individual persona TypeScript files.
 */

import type { PersonaPromptData } from '../services/prompt.service.js';
import type { Persona } from './schemas.js';

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
      parts.push('## Anti-Patterns\n\n' + data.antiPatterns.map((ap, i) => `${i + 1}. ${ap}`).join('\n') + '\n');
    }

    return parts.join('\n');
  }
}
