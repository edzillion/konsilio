/**
 * Lead Class
 * 
 * Runtime lead construction for consolidation phases.
 * Loads phase-specific prompts from markdown files.
 */

import type { Persona } from './schemas.js';

export interface LeadConfig {
  phase: 'extraction' | 'critique' | 'decision' | 'synthesis';
  workflowRules?: string;
  promptService: {
    loadConsolidationPhase: (phase: 'extraction' | 'critique' | 'decision' | 'synthesis') => string;
  };
}

/**
 * Lead - Runtime lead construction for consolidation phases
 */
export class Lead implements Persona {
  public readonly id: string;
  public readonly name: string;
  public readonly emoji: string;
  public readonly focusAreas: string[];
  public readonly systemPrompt: string;

  constructor(config: LeadConfig) {
    this.id = `lead-${config.phase}`;
    this.name = this.getPhaseName(config.phase);
    this.emoji = '👑';
    this.focusAreas = [config.phase];
    this.systemPrompt = this.buildSystemPrompt(config);
  }

  /**
   * Get human-readable phase name
   */
  private getPhaseName(phase: 'extraction' | 'critique' | 'decision' | 'synthesis'): string {
    const names: Record<string, string> = {
      extraction: 'Extraction Lead',
      critique: 'Critique Lead',
      decision: 'Decision Lead',
      synthesis: 'Synthesis Lead',
    };
    return names[phase] ?? 'Lead';
  }

  /**
   * Build the system prompt for the lead
   */
  private buildSystemPrompt(config: LeadConfig): string {
    const parts: string[] = [];

    // Workflow rules (optional)
    if (config.workflowRules) {
      parts.push(config.workflowRules);
      parts.push('\n');
    }

    // Phase-specific prompt
    const phasePrompt = config.promptService.loadConsolidationPhase(config.phase);
    parts.push(phasePrompt);

    return parts.join('\n');
  }
}