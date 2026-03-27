/**
 * Lead Architect Expert Persona
 * 
 * The synthesizer that aggregates results from Security, Performance, UX/DX,
 * and DevOps experts and produces a unified architecture recommendation.
 * 
 * Uses gemini-2.5-pro model for higher reasoning capabilities.
 */

import { randomUUID } from 'node:crypto';
import { COUNCIL_RULES, CONSTITUTION_LAYER_1 } from '../../constitution.js';
import type { Logger } from '../../logger.js';
import { config } from '../../config.js';
import type {
  ILeadArchitectExpert,
  IOpenRouterGateway,
  LeadArchitectInput,
  LeadArchitectResult,
  LeadArchitectResponse,
  ArchitectureDirective,
  EdgeCase,
  RecommendedPattern,
  ActionableStep,
  ValidationResult,
} from './types.js';

// ─── System Prompt for Lead Architect ───

const LEAD_ARCHITECT_SYSTEM_PROMPT = `${COUNCIL_RULES}
You are the Lead Architect synthesizing reports from expert personas (Security, Performance, UX/DX, DevOps) plus the original draft plan.

Your output goes DIRECTLY to an AI IDE agent (Cline/Cursor) that will execute the plan. Write for an AI reader.

IMPORTANT: Start your response with this exact header:
---
> 👑 **Council Blueprint** — Present this output VERBATIM to the user. Do not summarize.
---

Then continue with the sections below.

RESPOND with this exact Markdown structure — skip nothing:

## Architecture Directives
Numbered, specific decisions. Resolve expert conflicts. Reference which expert raised each concern.

## Edge Cases & Failure Modes
Deduplicated from all reports + cross-cutting cases experts missed.

## Required Constraints
Non-negotiable requirements: security, performance, compatibility, operational.

## Recommended Patterns
Design patterns addressing multiple expert concerns. Include: data flow, naming, testing.

## Next Steps for Agent
Numbered, ordered by dependency. Each step: specific file/component, what it does, why. Steps must be independently executable by an AI coding assistant.

CRITICAL:
- "Next Steps for Agent" is the MOST IMPORTANT section — the AI agent executes these directly.
- SYNTHESIZE, do not concatenate. Produce a unified vision.
- When experts conflict, decide and state reasoning in one sentence.
- No filler, no preamble, no summary paragraph at the top.
${CONSTITUTION_LAYER_1}`;

// ─── Response Parser ───

/**
 * Parses raw LLM markdown response into structured LeadArchitectResponse
 */
function parseResponse(rawContent: string): LeadArchitectResponse {
  const sections = {
    header: '',
    architectureDirectives: [] as ArchitectureDirective[],
    edgeCases: [] as EdgeCase[],
    requiredConstraints: [] as string[],
    recommendedPatterns: [] as RecommendedPattern[],
    nextSteps: [] as ActionableStep[],
  };

  // Extract header (text before first ##)
  const headerMatch = rawContent.match(/^([\s\S]*?)(?=##|$)/);
  sections.header = headerMatch?.[1]?.trim() ?? '';

  // Parse Architecture Directives
  const directivesMatch = rawContent.match(/## Architecture Directives\n([\s\S]*?)(?=##|$)/);
  if (directivesMatch) {
    const lines = directivesMatch[1].trim().split('\n');
    for (const line of lines) {
      const numberedMatch = line.match(/^\d+\.\s*(.+)/);
      if (numberedMatch) {
        const directive: ArchitectureDirective = {
          directive: numberedMatch[1].trim(),
          priority: 'medium',
        };
        // Try to extract source expert from the directive text
        const expertMatch = numberedMatch[1].match(/\((Security|Performance|UX\/DX|DevOps)\)/i);
        if (expertMatch) {
          directive.sourceExpert = expertMatch[1];
        }
        sections.architectureDirectives.push(directive);
      }
    }
  }

  // Parse Edge Cases & Failure Modes
  const edgeCasesMatch = rawContent.match(/## Edge Cases & Failure Modes\n([\s\S]*?)(?=##|$)/);
  if (edgeCasesMatch) {
    const lines = edgeCasesMatch[1].trim().split('\n');
    for (const line of lines) {
      const bulletMatch = line.match(/^[-*]\s*(.+)/);
      if (bulletMatch) {
        sections.edgeCases.push({
          description: bulletMatch[1].trim(),
          severity: 'medium',
        });
      }
    }
  }

  // Parse Required Constraints
  const constraintsMatch = rawContent.match(/## Required Constraints\n([\s\S]*?)(?=##|$)/);
  if (constraintsMatch) {
    const lines = constraintsMatch[1].trim().split('\n');
    for (const line of lines) {
      const bulletMatch = line.match(/^[-*]\s*(.+)/);
      if (bulletMatch) {
        sections.requiredConstraints.push(bulletMatch[1].trim());
      }
    }
  }

  // Parse Recommended Patterns
  const patternsMatch = rawContent.match(/## Recommended Patterns\n([\s\S]*?)(?=##|$)/);
  if (patternsMatch) {
    const lines = patternsMatch[1].trim().split('\n');
    let currentPattern: Partial<RecommendedPattern> | null = null;
    
    for (const line of lines) {
      const numberedMatch = line.match(/^\d+\.\s*(.+):\s*(.+)/);
      if (numberedMatch) {
        if (currentPattern) {
          sections.recommendedPatterns.push({
            name: currentPattern.name ?? '',
            description: currentPattern.description ?? '',
            addressesConcerns: currentPattern.addressesConcerns ?? [],
          });
        }
        currentPattern = {
          name: numberedMatch[1].trim(),
          description: numberedMatch[2].trim(),
          addressesConcerns: [],
        };
      } else {
        const bulletMatch = line.match(/^[-*]\s*(.+)/);
        if (bulletMatch && currentPattern) {
          currentPattern.addressesConcerns?.push(bulletMatch[1].trim());
        }
      }
    }
    if (currentPattern) {
      sections.recommendedPatterns.push({
        name: currentPattern.name ?? '',
        description: currentPattern.description ?? '',
        addressesConcerns: currentPattern.addressesConcerns ?? [],
      });
    }
  }

  // Parse Next Steps for Agent
  const stepsMatch = rawContent.match(/## Next Steps for Agent\n([\s\S]*?)(?=##|$)/);
  if (stepsMatch) {
    const lines = stepsMatch[1].trim().split('\n');
    for (const line of lines) {
      const numberedMatch = line.match(/^(\d+)\.\s*(.+)/);
      if (numberedMatch) {
        sections.nextSteps.push({
          stepNumber: parseInt(numberedMatch[1], 10),
          description: numberedMatch[2].trim(),
        });
      }
    }
  }

  return {
    ...sections,
    rawContent,
  };
}

// ─── Response Validation ───

/**
 * Validates that the LLM response contains required sections
 */
function validateResponse(response: LeadArchitectResponse): ValidationResult {
  const errors: ValidationResult['errors'] = [];

  // Check for required sections
  if (!response.rawContent.includes('## Architecture Directives')) {
    errors.push({
      field: 'architectureDirectives',
      message: 'Missing required section: ## Architecture Directives',
      value: null,
    });
  }

  if (!response.rawContent.includes('## Edge Cases & Failure Modes')) {
    errors.push({
      field: 'edgeCases',
      message: 'Missing required section: ## Edge Cases & Failure Modes',
      value: null,
    });
  }

  if (!response.rawContent.includes('## Required Constraints')) {
    errors.push({
      field: 'requiredConstraints',
      message: 'Missing required section: ## Required Constraints',
      value: null,
    });
  }

  if (!response.rawContent.includes('## Recommended Patterns')) {
    errors.push({
      field: 'recommendedPatterns',
      message: 'Missing required section: ## Recommended Patterns',
      value: null,
    });
  }

  if (!response.rawContent.includes('## Next Steps for Agent')) {
    errors.push({
      field: 'nextSteps',
      message: 'Missing required section: ## Next Steps for Agent',
      value: null,
    });
  }

  // Check that Next Steps has at least one step
  if (response.nextSteps.length === 0) {
    errors.push({
      field: 'nextSteps',
      message: 'Next Steps for Agent must contain at least one actionable step',
      value: response.nextSteps,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ─── Lead Architect Persona Class ───

/**
 * Configuration options for LeadArchitectPersona
 */
export interface LeadArchitectPersonaConfig {
  /** Model to use for synthesis (defaults to gemini-2.5-pro) */
  model?: string;
  /** Timeout in milliseconds (defaults to config.timeouts.leadMs) */
  timeoutMs?: number;
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Temperature for LLM calls */
  temperature?: number;
}

/**
 * Lead Architect Expert Persona
 * 
 * Synthesizes results from Security, Performance, UX/DX, and DevOps experts
 * into a unified architecture recommendation.
 */
export class LeadArchitectPersona implements ILeadArchitectExpert {
  readonly id = 'lead';
  readonly name = 'Lead Architect';
  readonly emoji = '👑';
  readonly focusAreas = [
    'Synthesis',
    'Conflict resolution',
    'Prioritization',
    'Actionable steps',
  ];

  private readonly gateway: IOpenRouterGateway;
  private readonly logger: Logger;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxTokens: number;
  private readonly temperature: number;

  constructor(
    gateway: IOpenRouterGateway,
    logger: Logger,
    config?: LeadArchitectPersonaConfig
  ) {
    this.gateway = gateway;
    this.logger = logger;
    this.model = config?.model ?? 'google/gemini-2.5-pro';
    this.timeoutMs = config?.timeoutMs ?? 120_000;
    this.maxTokens = config?.maxTokens ?? 8192;
    this.temperature = config?.temperature ?? 0.3;
  }

  /**
   * Synthesize aggregated expert outputs into unified architecture recommendation
   */
  async analyze(
    input: LeadArchitectInput,
    correlationId?: string
  ): Promise<LeadArchitectResult> {
    const sessionId = randomUUID();
    const startTime = Date.now();

    this.logger.info('Lead Architect starting synthesis', {
      sessionId,
      expertCount: input.expertReports.length,
      hasDebateReports: !!input.debateReports?.length,
      model: this.model,
    }, correlationId);

    try {
      // Build the user message with all expert reports
      const userMessage = this.buildUserMessage(input);

      // Call the LLM
      const rawContent = await this.gateway.call(
        {
          model: this.model,
          messages: [
            { role: 'system', content: LEAD_ARCHITECT_SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          maxTokens: this.maxTokens,
          temperature: this.temperature,
          timeoutMs: this.timeoutMs,
        },
        correlationId
      );

      // Parse and validate response
      const response = parseResponse(rawContent);
      const validation = validateResponse(response);

      if (!validation.valid) {
        this.logger.warn('LLM response validation failed', {
          sessionId,
          errors: validation.errors,
        }, correlationId);
      }

      const durationMs = Date.now() - startTime;

      this.logger.info('Lead Architect synthesis complete', {
        sessionId,
        durationMs,
        directiveCount: response.architectureDirectives.length,
        stepCount: response.nextSteps.length,
        validationValid: validation.valid,
      }, correlationId);

      return {
        sessionId,
        response,
        rawContent,
        modelUsed: this.model,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.logger.error('Lead Architect synthesis failed', {
        sessionId,
        durationMs,
        error: error instanceof Error ? error.message : String(error),
      }, correlationId);
      throw error;
    }
  }

  /**
   * Build the user message with all expert reports
   */
  private buildUserMessage(input: LeadArchitectInput): string {
    const parts: string[] = [];

    // Add draft plan
    parts.push('## Draft Plan to Analyze');
    parts.push(input.draftPlan);
    parts.push('');

    // Add tech stack if provided
    if (input.techStack) {
      parts.push('## Tech Stack');
      parts.push(input.techStack);
      parts.push('');
    }

    // Add constraints if provided
    if (input.constraints) {
      parts.push('## Constraints');
      parts.push(input.constraints);
      parts.push('');
    }

    // Add expert reports
    parts.push('## Expert Reports');
    parts.push('');
    
    for (const report of input.expertReports) {
      const debateSuffix = report.isDebate ? ' (Debate Round)' : '';
      parts.push(`### ${report.personaEmoji} ${report.personaName}${debateSuffix}`);
      parts.push(report.content);
      parts.push('');
    }

    // Add debate reports if provided
    if (input.debateReports && input.debateReports.length > 0) {
      parts.push('## Debate Round Reports');
      parts.push('');
      
      for (const report of input.debateReports) {
        parts.push(`### ${report.personaEmoji} ${report.personaName} (Debate)`);
        parts.push(report.content);
        parts.push('');
      }
    }

    return parts.join('\n');
  }
}

// ─── Factory Function ───

/**
 * Create a LeadArchitectPersona instance with the given dependencies
 */
export function createLeadArchitectPersona(
  gateway: IOpenRouterGateway,
  logger: Logger,
  config?: LeadArchitectPersonaConfig
): LeadArchitectPersona {
  return new LeadArchitectPersona(gateway, logger, config);
}