/**
 * Council Service - Two-Stage Consulting Pipeline
 * 
 * Stage 1: Expert Analysis (parallel, prose output)
 * Stage 2: Formatting (convert prose to structured JSON via FormatterService)
 * Stage 3: Extraction (extract claims from expert reports)
 * Stage 4: Critique (identify contradictions and weaknesses)
 * Stage 5: Decision (accept/reject findings)
 * Stage 6: Synthesis (assemble final blueprint)
 */

import { randomUUID } from 'node:crypto';
import type { Logger, CorrelatedLogger } from '../logger.js';
import {
  StructuredExpertOutputSchema,
  ExtractionPhaseOutputSchema,
  CritiquePhaseOutputSchema,
  DecisionPhaseOutputSchema,
  SynthesisPhaseOutputSchema
} from '../personas/schemas.js';
import type {
  Persona,
  ExpertReport,
  CouncilResult,
  ExtractionPhaseOutput,
  CritiquePhaseOutput,
  DecisionPhaseOutput,
  SynthesisPhaseOutput,
  StructuredFinding
} from '../personas/schemas.js';
import type { OpenRouterService, Message } from './openrouter.service.js';
import type { DatabaseService } from './database.service.js';
import type { CacheService } from './cache.service.js';
import type { PromptService } from './prompt.service.js';
import type { PersonaService } from './persona.service.js';
import type { FormatterService } from './formatter.service.js';

export interface CouncilConfig {
  enabledPersonaIds: string[];
  models: {
    experts: string;
    lead: string;
    formatter: string;
  };
  timeouts: {
    expertMs: number;
    leadMs: number;
    formatterMs: number;
  };
  maxTokens: {
    experts: number;
    lead: number;
  };
  maxDraftPlanLength: number;
  formatterMaxRetries: number;
}

export interface CouncilParams {
  draftPlan: string;
  techStack?: string;
  contextConstraints?: string;
}

export interface CouncilOptions {
  modelOverride?: {
    experts?: string;
    consolidation?: string;
  };
}

/**
 * CouncilService - Orchestrates two-stage expert analysis and consolidation
 */
export class CouncilService {
  constructor(
    private readonly deps: {
      logger: Logger;
      openRouterService: OpenRouterService;
      databaseService: DatabaseService;
      cacheService: CacheService;
      promptService: PromptService;
      personaService: PersonaService;
      formatterService: FormatterService;
      config: CouncilConfig;
    },
  ) {}

  /**
   * Run a council analysis with two-stage consolidation
   */
  async run(params: CouncilParams, options?: CouncilOptions, correlationId?: string): Promise<CouncilResult> {
    const log = correlationId ? this.deps.logger.withCorrelationId(correlationId) : this.deps.logger;
    const totalStart = Date.now();
    const sessionId = correlationId ?? randomUUID();

    log.info('Starting council session', { sessionId, draftPlanLength: params.draftPlan.length });

    if (!params.draftPlan.trim()) throw new Error('draft_plan cannot be empty');
    if (params.draftPlan.length > this.deps.config.maxDraftPlanLength) {
      throw new Error(`draft_plan too long (${params.draftPlan.length}/${this.deps.config.maxDraftPlanLength} chars)`);
    }

    const expertModel = options?.modelOverride?.experts ?? this.deps.config.models.experts;
    const consolidationModel = options?.modelOverride?.consolidation ?? this.deps.config.models.lead;

    const personas = this.deps.personaService.createExperts(
      this.deps.config.enabledPersonaIds,
      expertModel
    );

    if (personas.length < 2) throw new Error(`At least 2 personas required. Found: ${this.deps.config.enabledPersonaIds.join(', ')}`);

    // Stage 1: Expert Analysis (parallel, prose output)
    log.debug('Stage 1: Expert Analysis (prose)');
    const userMessage = this.buildUserMessage(params);
    const expertPromises = personas.map((p) => this.callExpert(p, expertModel, userMessage, this.deps.config.timeouts.expertMs, log));
    const expertResults = await Promise.allSettled(expertPromises);

    const successfulProseReports: { persona: Persona; prose: string; durationMs: number }[] = [];
    const failedExperts: string[] = [];
    for (let i = 0; i < expertResults.length; i++) {
      const result = expertResults[i];
      if (result.status === 'fulfilled') successfulProseReports.push(result.value);
      else failedExperts.push(`${personas[i].emoji} ${personas[i].name}: ${result.reason}`);
    }

    if (successfulProseReports.length < 2) throw new Error(`Too many expert failures. ${failedExperts.join('\n')}`);

    log.debug('Expert prose analysis complete', { succeeded: successfulProseReports.length, failed: failedExperts.length });

    // Stage 2: Format prose to structured JSON
    log.debug('Stage 2: Formatting prose to structured JSON');
    const formatStart = Date.now();
    const formatResults = await Promise.allSettled(
      successfulProseReports.map((r) =>
        this.deps.formatterService.formatProse(r.prose, r.persona.id, correlationId)
      )
    );

    const successfulReports: ExpertReport[] = [];
    const formattingErrors: string[] = [];
    let formatSuccessCount = 0;

    for (let i = 0; i < formatResults.length; i++) {
      const result = formatResults[i];
      const proseReport = successfulProseReports[i];

      if (result.status === 'fulfilled') {
        const formatResult = result.value;
        successfulReports.push({
          personaId: proseReport.persona.id,
          personaName: proseReport.persona.name,
          personaEmoji: proseReport.persona.emoji,
          structuredOutput: formatResult.output,
          rawContent: formatResult.originalProse,
          durationMs: proseReport.durationMs + formatResult.durationMs,
          modelUsed: this.deps.config.models.formatter
        });
        formatSuccessCount++;
      } else {
        formattingErrors.push(`${proseReport.persona.name}: ${result.reason}`);
      }
    }

    const totalFormattingTimeMs = Date.now() - formatStart;
    const formattingDetails = {
      totalFormattingTimeMs,
      formattingSuccessRate: formatSuccessCount / successfulProseReports.length,
      formattingErrors
    };

    log.debug('Formatting complete', { successRate: formattingDetails.formattingSuccessRate, errors: formattingErrors.length });

    if (successfulReports.length < 2) throw new Error(`Too many expert failures after formatting. ${failedExperts.join('\n')}`);

    log.info('Expert analysis complete', { succeeded: successfulReports.length, failed: failedExperts.length });

    // Stage 3: Extraction
    log.debug('Stage 3: Extraction');
    const extractionOutput = await this.runExtractionPhase(successfulReports, consolidationModel, log);

    // Stage 4: Critique
    log.debug('Stage 4: Critique');
    const critiqueOutput = await this.runCritiquePhase(successfulReports, extractionOutput, params, consolidationModel, log);

    // Stage 5: Decision
    log.debug('Stage 5: Decision');
    const decisionOutput = await this.runDecisionPhase(successfulReports, critiqueOutput, consolidationModel, log);

    // Stage 6: Synthesis
    log.debug('Stage 6: Synthesis');
    const synthesisOutput = await this.runSynthesisPhase(successfulReports, decisionOutput, params, consolidationModel, log);

    const totalDurationMs = Date.now() - totalStart;
    let output = failedExperts.length > 0 ? `> ⚠️ ${failedExperts.length} expert(s) failed\n\n` : '';
    output += `> 📝 Formatted: ${(formattingDetails.formattingSuccessRate * 100).toFixed(0)}% success (${(formattingDetails.totalFormattingTimeMs / 1000).toFixed(1)}s)\n`;
    output += `> 👑 Council: ${successfulReports.length} experts (${expertModel}) → 4-phase consolidation (${consolidationModel})\n`;
    output += `> ⏱️ ${(totalDurationMs / 1000).toFixed(1)}s | Accepted: ${decisionOutput.acceptedCount} | Rejected: ${decisionOutput.rejectedCount}\n\n---\n\n`;
    output += synthesisOutput.blueprint;

    const result: CouncilResult = {
      sessionId,
      expertReports: successfulReports,
      extractionOutput,
      critiqueOutput,
      decisionOutput,
      synthesisOutput,
      finalBlueprint: output,
      consolidationModel,
      totalDurationMs,
      formattingDetails
    };

    try {
      this.deps.databaseService.saveCouncilResult(result, params.draftPlan, params.techStack, params.contextConstraints, correlationId);
    } catch (err) {
      log.warn('Failed to save to database', { error: err instanceof Error ? err.message : String(err) });
    }

    log.info('Council session complete', { sessionId, totalDurationMs });
    return result;
  }

  /**
   * Call an expert persona for prose analysis
   */
  private async callExpert(persona: Persona, model: string, userMessage: string, timeoutMs: number, log: Logger | CorrelatedLogger): Promise<{ persona: Persona; prose: string; durationMs: number }> {
    const start = Date.now();
    const messages: Message[] = [
      { role: 'system', content: persona.systemPrompt },
      { role: 'user', content: userMessage }
    ];

    try {
      const rawContent = await this.deps.openRouterService.call({
        model,
        messages,
        maxTokens: 4096,
        temperature: 0.3,
        timeoutMs
      });

      log.debug('Expert prose analysis complete', { personaId: persona.id, contentLength: rawContent.length });
      return { persona, prose: rawContent, durationMs: Date.now() - start };
    } catch (err) {
      log.error('Expert analysis failed', { personaId: persona.id, error: err instanceof Error ? err.message : String(err) });
      throw new Error(`${persona.name} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Stage 3: Extraction - Extract structured claims from expert reports
   */
  private async runExtractionPhase(reports: ExpertReport[], model: string, log: Logger | CorrelatedLogger): Promise<ExtractionPhaseOutput> {
    const lead = this.deps.personaService.createLead('extraction');

    const expertReportsText = reports.map(r =>
      `## ${r.personaEmoji} ${r.personaName}\n\n${JSON.stringify(r.structuredOutput, null, 2)}`
    ).join('\n\n---\n\n');

    const messages: Message[] = [
      { role: 'system', content: lead.systemPrompt },
      { role: 'user', content: `Extract all findings from these expert reports:\n\n${expertReportsText}` }
    ];

    const rawOutput = await this.deps.openRouterService.call({
      model,
      messages,
      maxTokens: this.deps.config.maxTokens.lead,
      temperature: 0.2,
      timeoutMs: this.deps.config.timeouts.leadMs
    });

    const cleaned = this.cleanJsonOutput(rawOutput);
    try {
      const parsed = JSON.parse(cleaned);
      const output = ExtractionPhaseOutputSchema.parse(parsed);
      log.debug('Extraction complete', { totalFindings: output.totalFindings });
      return output;
    } catch (err) {
      log.error('Failed to parse extraction JSON', {
        rawLength: rawOutput.length,
        cleanedLength: cleaned.length,
        rawPreview: rawOutput.slice(0, 500),
        error: err instanceof Error ? err.message : String(err)
      });
      throw new Error(`Extraction phase: failed to parse JSON. ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Stage 4: Critique - Analyze for contradictions and weaknesses
   */
  private async runCritiquePhase(
    reports: ExpertReport[],
    extraction: ExtractionPhaseOutput,
    params: CouncilParams,
    model: string,
    log: Logger | CorrelatedLogger
  ): Promise<CritiquePhaseOutput> {
    const lead = this.deps.personaService.createLead('critique');

    const context = `## Original Draft Plan\n\n${params.draftPlan}\n\n## Extracted Claims\n\n${JSON.stringify(extraction, null, 2)}`;

    const messages: Message[] = [
      { role: 'system', content: lead.systemPrompt },
      { role: 'user', content: context }
    ];

    const rawOutput = await this.deps.openRouterService.call({
      model,
      messages,
      maxTokens: this.deps.config.maxTokens.lead,
      temperature: 0.3,
      timeoutMs: this.deps.config.timeouts.leadMs
    });

    const cleaned = this.cleanJsonOutput(rawOutput);
    try {
      const parsed = JSON.parse(cleaned);
      const output = CritiquePhaseOutputSchema.parse(parsed);
      log.debug('Critique complete', { contradictions: output.contradictions.length, unsupportedClaims: output.unsupportedClaims.length });
      return output;
    } catch (err) {
      log.error('Failed to parse critique JSON', {
        rawLength: rawOutput.length,
        cleanedLength: cleaned.length,
        rawPreview: rawOutput.slice(0, 500),
        error: err instanceof Error ? err.message : String(err)
      });
      throw new Error(`Critique phase: failed to parse JSON. ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Stage 5: Decision - Accept/reject findings explicitly
   */
  private async runDecisionPhase(
    reports: ExpertReport[],
    critique: CritiquePhaseOutput,
    model: string,
    log: Logger | CorrelatedLogger
  ): Promise<DecisionPhaseOutput> {
    const lead = this.deps.personaService.createLead('decision');

    const allFindings = reports.flatMap(r => r.structuredOutput.findings);
    const context = `## All Findings\n\n${JSON.stringify(allFindings, null, 2)}\n\n## Critique Analysis\n\n${JSON.stringify(critique, null, 2)}`;

    const messages: Message[] = [
      { role: 'system', content: lead.systemPrompt },
      { role: 'user', content: context }
    ];

    const rawOutput = await this.deps.openRouterService.call({
      model,
      messages,
      maxTokens: this.deps.config.maxTokens.lead,
      temperature: 0.2,
      timeoutMs: this.deps.config.timeouts.leadMs
    });

    const cleaned = this.cleanJsonOutput(rawOutput);
    try {
      const parsed = JSON.parse(cleaned);
      const output = DecisionPhaseOutputSchema.parse(parsed);
      log.debug('Decision complete', { accepted: output.acceptedCount, rejected: output.rejectedCount });
      return output;
    } catch (err) {
      log.error('Failed to parse decision JSON', {
        rawLength: rawOutput.length,
        cleanedLength: cleaned.length,
        rawPreview: rawOutput.slice(0, 500),
        error: err instanceof Error ? err.message : String(err)
      });
      throw new Error(`Decision phase: failed to parse JSON. ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Stage 6: Synthesis - Assemble final blueprint from accepted findings
   */
  private async runSynthesisPhase(
    reports: ExpertReport[],
    decision: DecisionPhaseOutput,
    params: CouncilParams,
    model: string,
    log: Logger | CorrelatedLogger
  ): Promise<SynthesisPhaseOutput> {
    const lead = this.deps.personaService.createLead('synthesis');

    const acceptedFindingIds = new Set(
      decision.decisions.filter(d => d.action === 'ACCEPT').map(d => d.findingId)
    );

    const acceptedFindings: StructuredFinding[] = [];
    const attributions: Record<string, string> = {};

    for (const report of reports) {
      for (const finding of report.structuredOutput.findings) {
        if (acceptedFindingIds.has(finding.id)) {
          acceptedFindings.push(finding);
          attributions[finding.id] = report.personaId;
        }
      }
    }

    const context = `## Original Draft Plan\n\n${params.draftPlan}\n\n${params.techStack ? `## Tech Stack\n\n${params.techStack}\n\n` : ''}## Accepted Findings\n\n${JSON.stringify(acceptedFindings, null, 2)}\n\n## Attributions\n\n${JSON.stringify(attributions, null, 2)}`;

    const messages: Message[] = [
      { role: 'system', content: lead.systemPrompt },
      { role: 'user', content: context }
    ];

    const blueprint = await this.deps.openRouterService.call({
      model,
      messages,
      maxTokens: 8192,
      temperature: 0.4,
      timeoutMs: this.deps.config.timeouts.leadMs
    });

    log.debug('Synthesis complete', { acceptedFindings: acceptedFindings.length });
    return { blueprint, acceptedFindings, attributions };
  }

  /**
   * Build user message for expert analysis
   */
  private buildUserMessage(params: CouncilParams): string {
    let msg = `## Draft Plan\n\n${params.draftPlan}`;
    if (params.techStack) msg += `\n\n## Tech Stack\n\n${params.techStack}`;
    if (params.contextConstraints) msg += `\n\n## Context Constraints\n\n${params.contextConstraints}`;
    return msg;
  }

  /**
   * Clean JSON output from LLM responses (strip markdown code fences)
   */
  private cleanJsonOutput(raw: string): string {
    let cleaned = raw.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    return cleaned;
  }
}