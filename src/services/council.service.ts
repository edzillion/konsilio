/**
 * Council Service - 4-Phase Consolidation Pipeline
 * 
 * Orchestrates expert analysis with structured outputs and phase-based consolidation:
 * Phase 1: Expert Analysis (parallel, structured JSON output)
 * Phase 2: Extraction (extract claims from expert reports)
 * Phase 3: Critique (identify contradictions and weaknesses)
 * Phase 4: Decision (accept/reject findings)
 * Phase 5: Synthesis (assemble final blueprint)
 */

import { randomUUID } from 'node:crypto';
import type { Logger, CorrelatedLogger } from '../logger.js';
import type { 
  Persona, 
  ExpertReport, 
  CouncilResult,
  StructuredExpertOutput,
  ExtractionPhaseOutput,
  CritiquePhaseOutput,
  DecisionPhaseOutput,
  SynthesisPhaseOutput,
  StructuredFinding
} from '../personas/types.js';
import type { OpenRouterService, Message } from './openrouter.service.js';
import type { DatabaseService } from './database.service.js';
import type { CacheService } from './cache.service.js';
import { 
  EXTRACTION_PHASE_PROMPT,
  CRITIQUE_PHASE_PROMPT,
  DECISION_PHASE_PROMPT,
  SYNTHESIS_PHASE_PROMPT
} from '../personas/consolidation.js';

export interface CouncilConfig {
  enabledPersonaIds: string[];
  models: {
    experts: string;
    lead: string;
    debate: string;
  };
  timeouts: {
    expertMs: number;
    leadMs: number;
    debateMs: number;
  };
  maxDraftPlanLength: number;
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
 * CouncilService - Orchestrates 4-phase expert analysis and consolidation
 */
export class CouncilService {
  constructor(
    private readonly deps: {
      logger: Logger;
      openRouterService: OpenRouterService;
      databaseService: DatabaseService;
      cacheService: CacheService;
      expertPersonas: Persona[];
      config: CouncilConfig;
    },
  ) {}

  /**
   * Run a council analysis with 4-phase consolidation
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
    const personas = this.deps.expertPersonas.filter((p) => this.deps.config.enabledPersonaIds.includes(p.id));

    if (personas.length < 2) throw new Error(`At least 2 personas required. Found: ${this.deps.config.enabledPersonaIds.join(', ')}`);

    // Phase 1: Expert Analysis (parallel, structured JSON output)
    log.info('Phase 1: Expert Analysis');
    const userMessage = this.buildUserMessage(params);
    const expertPromises = personas.map((p) => this.callExpert(p, expertModel, userMessage, this.deps.config.timeouts.expertMs, log));
    const expertResults = await Promise.allSettled(expertPromises);

    const successfulReports: ExpertReport[] = [];
    const failedExperts: string[] = [];
    for (let i = 0; i < expertResults.length; i++) {
      const result = expertResults[i];
      if (result.status === 'fulfilled') successfulReports.push(result.value);
      else failedExperts.push(`${personas[i].emoji} ${personas[i].name}: ${result.reason}`);
    }

    if (successfulReports.length < 2) throw new Error(`Too many expert failures. ${failedExperts.join('\n')}`);

    log.info('Expert analysis complete', { succeeded: successfulReports.length, failed: failedExperts.length });

    // Phase 2: Extraction
    log.info('Phase 2: Extraction');
    const extractionOutput = await this.runExtractionPhase(successfulReports, consolidationModel, log);

    // Phase 3: Critique
    log.info('Phase 3: Critique');
    const critiqueOutput = await this.runCritiquePhase(successfulReports, extractionOutput, params, consolidationModel, log);

    // Phase 4: Decision
    log.info('Phase 4: Decision');
    const decisionOutput = await this.runDecisionPhase(successfulReports, critiqueOutput, consolidationModel, log);

    // Phase 5: Synthesis
    log.info('Phase 5: Synthesis');
    const synthesisOutput = await this.runSynthesisPhase(successfulReports, decisionOutput, params, consolidationModel, log);

    const totalDurationMs = Date.now() - totalStart;
    let output = failedExperts.length > 0 ? `> ⚠️ ${failedExperts.length} expert(s) failed\n\n` : '';
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
      totalDurationMs
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
   * Call an expert persona and parse structured JSON output
   */
  private async callExpert(persona: Persona, model: string, userMessage: string, timeoutMs: number, log: Logger | CorrelatedLogger): Promise<ExpertReport> {
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

      // Parse JSON output (strip markdown code blocks if present)
      let jsonContent = rawContent.trim();
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const structuredOutput: StructuredExpertOutput = JSON.parse(jsonContent);

      // Validate structure
      if (!structuredOutput.personaId || !Array.isArray(structuredOutput.findings)) {
        throw new Error('Invalid structured output: missing personaId or findings array');
      }

      const report: ExpertReport = {
        personaId: persona.id,
        personaName: persona.name,
        personaEmoji: persona.emoji,
        structuredOutput,
        rawContent,
        durationMs: Date.now() - start,
        modelUsed: model
      };

      log.debug('Expert analysis complete', { personaId: persona.id, findingsCount: structuredOutput.findings.length });
      return report;
    } catch (err) {
      log.error('Expert analysis failed', { personaId: persona.id, error: err instanceof Error ? err.message : String(err) });
      throw new Error(`${persona.name} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Phase 2: Extraction - Extract structured claims from expert reports
   */
  private async runExtractionPhase(reports: ExpertReport[], model: string, log: Logger | CorrelatedLogger): Promise<ExtractionPhaseOutput> {
    const expertReportsText = reports.map(r => 
      `## ${r.personaEmoji} ${r.personaName}\n\n${JSON.stringify(r.structuredOutput, null, 2)}`
    ).join('\n\n---\n\n');

    const messages: Message[] = [
      { role: 'system', content: EXTRACTION_PHASE_PROMPT },
      { role: 'user', content: `Extract all findings from these expert reports:\n\n${expertReportsText}` }
    ];

    const rawOutput = await this.deps.openRouterService.call({
      model,
      messages,
      maxTokens: 8192,
      temperature: 0.2,
      timeoutMs: this.deps.config.timeouts.leadMs
    });

    const output: ExtractionPhaseOutput = JSON.parse(this.cleanJsonOutput(rawOutput));
    log.info('Extraction complete', { totalFindings: output.totalFindings });
    return output;
  }

  /**
   * Phase 3: Critique - Analyze for contradictions and weaknesses
   */
  private async runCritiquePhase(
    reports: ExpertReport[], 
    extraction: ExtractionPhaseOutput, 
    params: CouncilParams,
    model: string, 
    log: Logger | CorrelatedLogger
  ): Promise<CritiquePhaseOutput> {
    const context = `## Original Draft Plan\n\n${params.draftPlan}\n\n## Extracted Claims\n\n${JSON.stringify(extraction, null, 2)}`;

    const messages: Message[] = [
      { role: 'system', content: CRITIQUE_PHASE_PROMPT },
      { role: 'user', content: context }
    ];

    const rawOutput = await this.deps.openRouterService.call({
      model,
      messages,
      maxTokens: 8192,
      temperature: 0.3,
      timeoutMs: this.deps.config.timeouts.leadMs
    });

    const output: CritiquePhaseOutput = JSON.parse(this.cleanJsonOutput(rawOutput));
    log.info('Critique complete', { 
      contradictions: output.contradictions.length, 
      unsupportedClaims: output.unsupportedClaims.length 
    });
    return output;
  }

  /**
   * Phase 4: Decision - Accept/reject findings explicitly
   */
  private async runDecisionPhase(
    reports: ExpertReport[], 
    critique: CritiquePhaseOutput, 
    model: string, 
    log: Logger | CorrelatedLogger
  ): Promise<DecisionPhaseOutput> {
    const allFindings = reports.flatMap(r => r.structuredOutput.findings);
    const context = `## All Findings\n\n${JSON.stringify(allFindings, null, 2)}\n\n## Critique Analysis\n\n${JSON.stringify(critique, null, 2)}`;

    const messages: Message[] = [
      { role: 'system', content: DECISION_PHASE_PROMPT },
      { role: 'user', content: context }
    ];

    const rawOutput = await this.deps.openRouterService.call({
      model,
      messages,
      maxTokens: 8192,
      temperature: 0.2,
      timeoutMs: this.deps.config.timeouts.leadMs
    });

    const output: DecisionPhaseOutput = JSON.parse(this.cleanJsonOutput(rawOutput));
    log.info('Decision complete', { accepted: output.acceptedCount, rejected: output.rejectedCount });
    return output;
  }

  /**
   * Phase 5: Synthesis - Assemble final blueprint from accepted findings
   */
  private async runSynthesisPhase(
    reports: ExpertReport[], 
    decision: DecisionPhaseOutput, 
    params: CouncilParams,
    model: string, 
    log: Logger | CorrelatedLogger
  ): Promise<SynthesisPhaseOutput> {
    // Collect accepted findings
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
      { role: 'system', content: SYNTHESIS_PHASE_PROMPT },
      { role: 'user', content: context }
    ];

    const blueprint = await this.deps.openRouterService.call({
      model,
      messages,
      maxTokens: 8192,
      temperature: 0.4,
      timeoutMs: this.deps.config.timeouts.leadMs
    });

    log.info('Synthesis complete', { acceptedFindings: acceptedFindings.length });
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
   * Clean JSON output (remove markdown code blocks)
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
