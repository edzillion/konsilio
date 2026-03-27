/**
 * Council Orchestrator - Dependency Injection Root
 * 
 * Coordinates the council of experts analysis with all dependencies injected.
 * Features:
 * - Parallel expert analysis with caching
 * - Graceful partial failure handling
 * - Debate mode for expert refinement
 * - Lead Architect synthesis
 * - Correlation ID support for request tracing
 */

import { randomUUID, createHash } from 'node:crypto';
import type { LogWriter, Logger, CorrelatedLogger } from './logger.js';
import type { SQLiteGateway, OpenRouterGateway } from './gateway.js';
import type { CacheService } from './cache.js';
import type { Persona, ExpertReport, CouncilResult } from './personas/types.js';
import type { Message } from './openrouter.js';

// ─── Configuration Types ───

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
  debateMode?: boolean;
  modelOverride?: {
    experts?: string;
    lead?: string;
  };
}

// ─── Message Builders ───

function buildUserMessage(params: CouncilParams): string {
  let msg = `## Draft Plan\n\n${params.draftPlan}`;
  if (params.techStack) msg += `\n\n## Tech Stack\n\n${params.techStack}`;
  if (params.contextConstraints) msg += `\n\n## Context Constraints\n\n${params.contextConstraints}`;
  return msg;
}

function buildLeadMessage(params: CouncilParams, reports: ExpertReport[]): string {
  let msg = `## Original Draft Plan\n\n${params.draftPlan}`;
  if (params.techStack) msg += `\n\n## Tech Stack\n\n${params.techStack}`;
  if (params.contextConstraints) msg += `\n\n## Context Constraints\n\n${params.contextConstraints}`;
  msg += `\n\n---\n\n# Expert Council Reports\n\n`;
  for (const report of reports) {
    msg += `${report.content}\n\n---\n\n`;
  }
  msg += `Based on the original draft plan and ALL expert reports above, produce the final unified architecture blueprint.`;
  return msg;
}

function buildDebateMessage(persona: Persona, originalMessage: string, allReports: ExpertReport[]): string {
  let msg = originalMessage;
  msg += `\n\n---\n\n# Other Expert Reports for Your Review\n\n`;
  for (const report of allReports) {
    if (report.personaId !== persona.id) {
      msg += `## ${report.personaEmoji} ${report.personaName}\n\n${report.content}\n\n`;
    }
  }
  msg += `---\n\nReview the other experts' findings. Identify gaps, agreements, and disagreements. Refine your analysis.`;
  return msg;
}

// ─── Council Orchestrator ───

export class CouncilOrchestrator {
  constructor(
    private readonly deps: {
      logger: Logger;
      sqliteGateway: SQLiteGateway;
      openRouterGateway: OpenRouterGateway;
      cacheService: CacheService;
      expertPersonas: Persona[];
      leadPersona: Persona;
      config: CouncilConfig;
    },
  ) {}

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
    const leadModel = options?.modelOverride?.lead ?? this.deps.config.models.lead;
    const personas = this.deps.expertPersonas.filter((p) => this.deps.config.enabledPersonaIds.includes(p.id));

    if (personas.length < 2) throw new Error(`At least 2 personas required. Found: ${this.deps.config.enabledPersonaIds.join(', ')}`);

    const userMessage = buildUserMessage(params);
    const expertPromises = personas.map((p) => this.callExpert(p, expertModel, userMessage, this.deps.config.timeouts.expertMs, log));
    const expertResults = await Promise.allSettled(expertPromises);

    const successfulReports: ExpertReport[] = [];
    const failedExperts: string[] = [];
    for (let i = 0; i < expertResults.length; i++) {
      const result = expertResults[i];
      if (result.status === 'fulfilled') successfulReports.push(result.value);
      else failedExperts.push(`${personas[i].emoji} ${personas[i].name}: ${result.reason}`);
    }

    if (successfulReports.length < 2) throw new Error(`Too many failures. ${failedExperts.join('\n')}`);

    log.info('Expert analysis complete', { succeeded: successfulReports.length, failed: failedExperts.length });

    // Phase 2: Debate Mode
    let debateReports: ExpertReport[] | undefined;
    if (options?.debateMode) {
      log.debug('Starting debate phase');
      const debatePromises = personas
        .filter((p) => successfulReports.some((r) => r.personaId === p.id))
        .map((p) => this.callExpert(p, expertModel, buildDebateMessage(p, userMessage, successfulReports), this.deps.config.timeouts.debateMs, log));
      const debateResults = await Promise.allSettled(debatePromises);
      debateReports = debateResults.filter(r => r.status === 'fulfilled').map(r => (r as PromiseFulfilledResult<ExpertReport>).value);
      log.info('Debate phase complete', { debateCount: debateReports.length });
    }

    // Phase 3: Lead Synthesis
    const allReportsForLead = debateReports ? [...successfulReports, ...debateReports] : successfulReports;
    const leadMessages: Message[] = [
      { role: 'system', content: this.deps.leadPersona.systemPrompt },
      { role: 'user', content: buildLeadMessage(params, allReportsForLead) },
    ];
    const finalBlueprint = await this.deps.openRouterGateway.call({
      model: leadModel, messages: leadMessages, maxTokens: 8192, temperature: 0.3, timeoutMs: this.deps.config.timeouts.leadMs,
    }, correlationId);

    const totalDurationMs = Date.now() - totalStart;
    let output = failedExperts.length > 0 ? `> ⚠️ ${failedExperts.length} failed\n\n` : '';
    output += `> 👑 Council: ${successfulReports.length} experts (${expertModel}) → Lead (${leadModel})`;
    if (debateReports) output += ` | debate: ${debateReports.length}`;
    output += `\n> ⏱️ ${(totalDurationMs / 1000).toFixed(1)}s\n\n---\n\n${finalBlueprint}`;

    const result: CouncilResult = { sessionId, expertReports: successfulReports, debateReports, finalBlueprint: output, leadModel, totalDurationMs };
    try { this.deps.sqliteGateway.saveCouncilResult(result, params.draftPlan, params.techStack, params.contextConstraints, log); } catch {}
    log.info('Council session complete', { sessionId, totalDurationMs });
    return result;
  }

  private async callExpert(persona: Persona, model: string, userMessage: string, timeoutMs: number, log: LogWriter): Promise<ExpertReport> {
    // Generate cache key from persona ID and input hash
    const inputHash = createHash('sha256').update(userMessage).digest('hex').slice(0, 16);
    const cacheKey = `expert:${persona.id}:${inputHash}`;
    
    // Check cache first
    const cached = this.deps.cacheService.get<ExpertReport>(cacheKey);
    if (cached) {
      log.debug('Cache hit for expert', { personaId: persona.id, cacheKey });
      return { ...cached, durationMs: 0 }; // Indicate cached response
    }
    
    const start = Date.now();
    const messages: Message[] = [{ role: 'system', content: persona.systemPrompt }, { role: 'user', content: userMessage }];
    const content = await this.deps.openRouterGateway.call({ model, messages, maxTokens: 4096, temperature: 0.3, timeoutMs });
    const report: ExpertReport = { personaId: persona.id, personaName: persona.name, personaEmoji: persona.emoji, content, durationMs: Date.now() - start, modelUsed: model };
    
    // Cache the result (default TTL from CacheService)
    this.deps.cacheService.set(cacheKey, report);
    log.debug('Cached expert response', { personaId: persona.id, cacheKey });
    
    return report;
  }
}