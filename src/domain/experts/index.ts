/**
 * Domain Experts Module
 * 
 * Exports expert interfaces and implementations for architectural analysis.
 */

// Types
export type {
  IExpert,
  ILeadArchitectExpert,
  IOpenRouterGateway,
  ExpertAnalysis,
  LeadArchitectInput,
  LeadArchitectResult,
  LeadArchitectResponse,
  ArchitectureDirective,
  EdgeCase,
  RecommendedPattern,
  ActionableStep,
  ValidationResult,
} from './types.js';

// Re-export OpenRouterCallOptions from gateway for convenience
export type { OpenRouterCallOptions } from './types.js';

export { ResponseValidationError } from './types.js';

// Lead Architect implementation
export {
  LeadArchitectPersona,
  createLeadArchitectPersona,
  type LeadArchitectPersonaConfig,
} from './lead-architect.persona.js';
