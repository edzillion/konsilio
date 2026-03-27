/**
 * Domain Expert Types
 * 
 * Defines interfaces for expert personas that analyze and synthesize
 * architectural recommendations.
 */

import type { Logger } from '../../logger.js';
import type { OpenRouterCallOptions } from '../../gateway.js';

// Re-export OpenRouterCallOptions for convenience
export type { OpenRouterCallOptions } from '../../gateway.js';

// ─── OpenRouter Gateway Interface ───

/**
 * Interface for OpenRouter API gateway
 * Allows dependency injection for testability
 */
export interface IOpenRouterGateway {
  call(opts: OpenRouterCallOptions, correlationId?: string): Promise<string>;
}

// ─── Expert Input/Output Types ───

/**
 * Input from a single expert persona's analysis
 */
export interface ExpertAnalysis {
  personaId: string;
  personaName: string;
  personaEmoji: string;
  content: string;
  durationMs: number;
  modelUsed: string;
  /** Whether this is from a debate round */
  isDebate?: boolean;
}

/**
 * Input for the Lead Architect's analyze method
 */
export interface LeadArchitectInput {
  /** The original draft plan being analyzed */
  draftPlan: string;
  /** Tech stack context (if provided) */
  techStack?: string;
  /** Additional constraints (if provided) */
  constraints?: string;
  /** Aggregated expert analyses from Phase 1 */
  expertReports: ExpertAnalysis[];
  /** Optional debate round reports from Phase 2 */
  debateReports?: ExpertAnalysis[];
}

/**
 * Synthesized architecture directive from Lead Architect
 */
export interface ArchitectureDirective {
  /** The directive/decision */
  directive: string;
  /** Which expert raised the related concern */
  sourceExpert?: string;
  /** Priority level */
  priority: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Edge case or failure mode identified
 */
export interface EdgeCase {
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  mitigation?: string;
}

/**
 * Recommended pattern for implementation
 */
export interface RecommendedPattern {
  name: string;
  description: string;
  addressesConcerns: string[];
}

/**
 * Actionable step for AI agent execution
 */
export interface ActionableStep {
  stepNumber: number;
  description: string;
  targetFile?: string;
  targetComponent?: string;
  dependencies?: number[];
}

/**
 * Validated Lead Architect response structure
 */
export interface LeadArchitectResponse {
  /** Header with blueprint title */
  header: string;
  /** Architecture directives resolving expert conflicts */
  architectureDirectives: ArchitectureDirective[];
  /** Edge cases and failure modes */
  edgeCases: EdgeCase[];
  /** Non-negotiable constraints */
  requiredConstraints: string[];
  /** Recommended design patterns */
  recommendedPatterns: RecommendedPattern[];
  /** Ordered actionable steps for AI agent */
  nextSteps: ActionableStep[];
  /** Raw markdown content (for backward compatibility) */
  rawContent: string;
}

/**
 * Result from Lead Architect's analyze method
 */
export interface LeadArchitectResult {
  /** Session ID for correlation */
  sessionId: string;
  /** Parsed and validated response */
  response: LeadArchitectResponse;
  /** Raw markdown content from LLM */
  rawContent: string;
  /** Model used for synthesis */
  modelUsed: string;
  /** Duration of the LLM call */
  durationMs: number;
}

// ─── Expert Interface ───

/**
 * Interface for expert personas that analyze architectural plans
 */
export interface IExpert {
  /** Unique identifier for this expert */
  readonly id: string;
  
  /** Display name */
  readonly name: string;
  
  /** Emoji representation */
  readonly emoji: string;
  
  /** Areas this expert focuses on */
  readonly focusAreas: string[];
  
  /**
   * Analyze input and produce expert output
   * 
   * @param input - The input data to analyze
   * @param correlationId - Optional correlation ID for logging
   * @returns The analysis result
   */
  analyze(input: unknown, correlationId?: string): Promise<unknown>;
}

/**
 * Interface specifically for the Lead Architect expert
 * who synthesizes results from other experts
 */
export interface ILeadArchitectExpert extends IExpert {
  /**
   * Synthesize aggregated expert outputs into unified architecture recommendation
   * 
   * @param input - Aggregated expert reports and context
   * @param correlationId - Optional correlation ID for logging
   * @returns Synthesized architecture blueprint
   */
  analyze(input: LeadArchitectInput, correlationId?: string): Promise<LeadArchitectResult>;
}

// ─── Response Validation ───

/**
 * Validation error for LLM response
 */
export class ResponseValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: unknown
  ) {
    super(`Response validation failed: ${message} (field: ${field})`);
    this.name = 'ResponseValidationError';
  }
}

/**
 * Result of response validation
 */
export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    field: string;
    message: string;
    value: unknown;
  }>;
}
