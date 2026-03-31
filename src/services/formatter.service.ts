/**
 * Formatter Service
 * 
 * Converts expert prose analysis into structured JSON output.
 * Uses OpenAI's response_format with JSON schema for reliable formatting.
 * Leverages gpt-4o-mini as a dedicated formatter model.
 */

import type { Logger } from '../logger.js';
import type { OpenRouterService, Message, ResponseFormat } from './openrouter.service.js';
import { StructuredExpertOutputSchema, toResponseFormat } from '../personas/schemas.js';
import type { StructuredExpertOutput, ProseExpertOutput } from '../personas/schemas.js';

export interface FormatterConfig {
  model: string;
  timeoutMs: number;
  maxRetries: number;
}

export interface FormatResult {
  output: StructuredExpertOutput;
  formattingConfidence: number;
  originalProse: string;
  durationMs: number;
  retries: number;
}

/**
 * FormatterService - Converts prose to structured JSON using response_format
 */
export class FormatterService {
  private readonly config: FormatterConfig;
  private readonly responseFormat: ResponseFormat;

  constructor(
    private readonly deps: {
      openRouterService: OpenRouterService;
      logger: Logger;
      config: FormatterConfig;
    }
  ) {
    this.config = deps.config;
    this.responseFormat = toResponseFormat(StructuredExpertOutputSchema, 'expert_output');
  }

  /**
   * Format expert prose into structured JSON output.
   * Uses OpenAI's response_format feature for reliable structured output.
   */
  async formatProse(prose: string, personaId: string, correlationId?: string): Promise<FormatResult> {
    const start = Date.now();
    let retries = 0;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const messages: Message[] = [
          {
            role: 'system',
            content: this.buildFormatterSystemPrompt(personaId)
          },
          {
            role: 'user',
            content: this.buildFormatUserMessage(prose)
          }
        ];

        const rawOutput = await this.deps.openRouterService.call({
          model: this.config.model,
          messages,
          maxTokens: 4096,
          temperature: 0.1,
          timeoutMs: this.config.timeoutMs,
          responseFormat: this.responseFormat
        }, correlationId);

        const parsed = StructuredExpertOutputSchema.parse(JSON.parse(rawOutput));

        // Validate personaId matches
        if (parsed.personaId !== personaId) {
          parsed.personaId = personaId;
        }

        const result: FormatResult = {
          output: parsed,
          formattingConfidence: this.calculateConfidence(parsed),
          originalProse: prose,
          durationMs: Date.now() - start,
          retries: attempt
        };

        this.deps.logger.debug('Prose formatted successfully', {
          personaId,
          findingsCount: parsed.findings.length,
          durationMs: result.durationMs,
          retries: attempt
        }, correlationId);

        return result;
      } catch (err) {
        retries = attempt + 1;
        if (attempt < this.config.maxRetries - 1) {
          this.deps.logger.warn('Formatting attempt failed, retrying', {
            personaId,
            attempt: attempt + 1,
            error: err instanceof Error ? err.message : String(err)
          }, correlationId);
          continue;
        }
        throw new Error(`Formatter failed after ${this.config.maxRetries} attempts: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    throw new Error('Formatter exhausted all retries');
  }

  /**
   * Build the system prompt for the formatter
   */
  private buildFormatterSystemPrompt(personaId: string): string {
    return `You are a precise JSON formatter. Your job is to convert expert analysis prose into a structured JSON output.

Extract the following from the prose:
- findings: Specific issues with severity, component, issue description, and mitigation steps
- risks: Potential risks with category, probability, impact, and description
- missingAssumptions: Assumptions not stated in the analysis
- dependencies: External dependencies or prerequisites mentioned

Rules:
- Use severity values: CRITICAL, HIGH, MEDIUM, LOW
- Use category values: security, performance, operational, ux, technical-debt
- Use probability/impact values: high, medium, low
- Each finding must have a unique id (use kebab-case like "auth-rate-limit")
- Each risk must have a unique id
- Be precise and complete - capture all findings from the prose
- Do not add findings not supported by the prose
- Set personaId to: ${personaId}

Output ONLY valid JSON. No markdown, no explanations.`;
  }

  /**
   * Build the user message with the prose to format
   */
  private buildFormatUserMessage(prose: string): string {
    return `Convert the following expert analysis into structured JSON:\n\n${prose}`;
  }

  /**
   * Calculate formatting confidence based on output quality
   */
  private calculateConfidence(output: StructuredExpertOutput): number {
    let score = 10;

    // Penalize empty sections
    if (output.findings.length === 0) score -= 3;
    if (output.risks.length === 0) score -= 1;

    // Penalize very short findings
    for (const finding of output.findings) {
      if (finding.issue.length < 20) score -= 1;
      if (finding.mitigation.length < 20) score -= 1;
    }

    return Math.max(1, Math.min(10, score));
  }
}