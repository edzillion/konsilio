/**
 * Persona Service
 * 
 * Provides persona creation and management.
 * Designed for dependency injection to enable testing.
 */

import type { Logger } from '../logger.js';
import type { CacheService } from './cache.service.js';
import type { PromptService } from './prompt.service.js';
import type { Persona } from '../personas/types.js';
import { Expert } from '../personas/expert.js';
import { Lead } from '../personas/lead.js';

/**
 * PersonaService - Creates and manages personas
 */
export class PersonaService {
  private readonly expertRules: string;
  private readonly workflowRules: string;
  private readonly cacheTtlMs = 300_000; // 5 minutes

  constructor(
    private readonly deps: {
      promptService: PromptService;
      cacheService?: CacheService;
      logger: Logger;
    }
  ) {
    // Load rules once at construction (they rarely change)
    this.expertRules = deps.promptService.loadCoreRules();
    this.workflowRules = deps.promptService.loadWorkflowRules();
  }

  /**
   * Create multiple expert personas
   * Used by: CouncilService for expert analysis phase
   */
  createExperts(personaIds: string[], model: string): Persona[] {
    return personaIds.map(id => this.createExpert(id, model));
  }

  /**
   * Create lead persona for consolidation phase
   * Used by: CouncilService for extraction, critique, decision, synthesis phases
   */
  createLead(phase: 'extraction' | 'critique' | 'decision' | 'synthesis'): Persona {
    const cacheKey = `lead:${phase}`;
    
    // Check cache
    const cached = this.deps.cacheService?.get<Persona>(cacheKey);
    if (cached) {
      this.deps.logger.debug('Lead persona loaded from cache', { phase });
      return cached;
    }

    const lead = new Lead({
      phase,
      workflowRules: this.workflowRules,
      promptService: this.deps.promptService,
    });

    // Cache the lead
    this.deps.cacheService?.set(cacheKey, lead, this.cacheTtlMs);
    
    return lead;
  }

  /**
   * Get available persona IDs from prompts directory
   * Used by: CLI for listing available personas
   */
  getAvailablePersonaIds(): string[] {
    // These are the persona IDs that have markdown files
    return [
      'security',
      'performance',
      'ux-dx',
      'devops',
      'typescript',
      'graph-dba',
      'node-fullstack',
      'dev-tooling',
      'distributed-systems',
      'test-architect',
    ];
  }

  /**
   * Create a single expert persona (private implementation detail)
   */
  private createExpert(personaId: string, model: string): Persona {
    const cacheKey = `expert:${personaId}:${model}`;
    
    // Check cache
    const cached = this.deps.cacheService?.get<Persona>(cacheKey);
    if (cached) {
      this.deps.logger.debug('Expert persona loaded from cache', { personaId });
      return cached;
    }

    const expert = new Expert({
      personaId,
      model,
      expertRules: this.expertRules,
      workflowRules: this.workflowRules,
      promptService: this.deps.promptService,
    });

    // Cache the expert
    this.deps.cacheService?.set(cacheKey, expert, this.cacheTtlMs);
    
    return expert;
  }
}