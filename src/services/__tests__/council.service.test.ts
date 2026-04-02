/**
 * CouncilService Tests
 *
 * Tests for the two-stage pipeline orchestration, expert parallel execution,
 * failure handling, and structured output parsing.
 *
 * Strategy: mock all service dependencies (OpenRouter, Database, Cache,
 * Prompt, Persona, Formatter) and control what each phase returns.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CouncilService, type CouncilConfig } from '../council.service.js';
import type { Logger } from '../../logger.js';
import type { Persona, StructuredExpertOutput, ExtractionPhaseOutput, CritiquePhaseOutput, DecisionPhaseOutput } from '../../personas/schemas.js';

// ─── Helpers ───

function makeMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withCorrelationId: vi.fn().mockReturnThis(),
  };
}

/** Minimal valid Persona fixture */
function makePersona(id: string): Persona {
  return {
    id,
    name: `${id} Expert`,
    emoji: '🔧',
    systemPrompt: `You are the ${id} expert.`,
    focusAreas: ['testing'],
  };
}

/** Valid StructuredExpertOutput JSON string */
function makeExpertOutputJson(personaId: string, findingId = `finding-${personaId}`): string {
  const output: StructuredExpertOutput = {
    personaId,
    findings: [
      {
        id: findingId,
        severity: 'HIGH',
        component: 'API',
        issue: `Issue from ${personaId}`,
        mitigation: `Fix from ${personaId}`,
      },
    ],
    risks: [],
    missingAssumptions: [],
    dependencies: [],
  };
  return JSON.stringify(output);
}

/** Valid ExtractionPhaseOutput JSON string */
function makeExtractionJson(): string {
  const output: ExtractionPhaseOutput = {
    claims: [{ id: 'claim-1', personaId: 'graph-dba', findingId: 'finding-graph-dba', claim: 'Test claim', context: { id: 'finding-graph-dba' } }],
    totalFindings: 1,
  };
  return JSON.stringify(output);
}

/** Valid CritiquePhaseOutput JSON string */
function makeCritiqueJson(): string {
  const output: CritiquePhaseOutput = {
    contradictions: [],
    unsupportedClaims: [],
    reasoningScores: [],
    consensusRisks: [],
  };
  return JSON.stringify(output);
}

/** Valid DecisionPhaseOutput JSON string */
function makeDecisionJson(findingId = 'finding-graph-dba'): string {
  return JSON.stringify({
    decisions: [{ findingId, personaId: 'graph-dba', action: 'ACCEPT', reasoning: 'Valid finding' }],
    resolutions: [],
    acceptedCount: 1,
    rejectedCount: 0,
  });
}

const COUNCIL_CONFIG: CouncilConfig = {
  enabledPersonaIds: ['graph-dba', 'node-fullstack'],
  models: {
    experts: 'google/gemini-2.5-flash-lite',
    lead: 'google/gemini-2.5-pro',
    formatter: 'openai/gpt-4o-mini',
  },
  personaModels: {},
  timeouts: {
    expertMs: 90000,
    leadMs: 120000,
    formatterMs: 30000,
  },
  maxTokens: {
    experts: 4096,
    lead: 16384,
  },
  maxDraftPlanLength: 12000,
  formatterMaxRetries: 3,
};

// ─── Tests ───

describe('CouncilService', () => {
  let mockLogger: Logger;
  let mockOpenRouter: { call: ReturnType<typeof vi.fn> };
  let mockDatabase: { saveCouncilResult: ReturnType<typeof vi.fn> };
  let mockCache: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
  let mockPromptService: { loadCoreRules: ReturnType<typeof vi.fn>; loadWorkflowRules: ReturnType<typeof vi.fn>; loadConsolidationPhase: ReturnType<typeof vi.fn>; loadPersonaPromptData: ReturnType<typeof vi.fn> };
  let mockPersonaService: { createExperts: ReturnType<typeof vi.fn>; createExpert: ReturnType<typeof vi.fn>; createLead: ReturnType<typeof vi.fn> };
  let mockFormatterService: { formatProse: ReturnType<typeof vi.fn> };
  let service: CouncilService;

  beforeEach(() => {
    mockLogger = makeMockLogger();

    mockOpenRouter = { call: vi.fn() };
    mockDatabase = { saveCouncilResult: vi.fn() };
    mockCache = { get: vi.fn().mockReturnValue(undefined), set: vi.fn() };
    mockPromptService = {
      loadCoreRules: vi.fn().mockReturnValue('expert rules'),
      loadWorkflowRules: vi.fn().mockReturnValue('workflow rules'),
      loadConsolidationPhase: vi.fn().mockReturnValue('phase prompt'),
      loadPersonaPromptData: vi.fn(),
    };
    mockPersonaService = {
      createExperts: vi.fn().mockReturnValue([
        makePersona('graph-dba'),
        makePersona('node-fullstack'),
      ]),
      createExpert: vi.fn().mockImplementation((id: string) => makePersona(id)),
      createLead: vi.fn().mockReturnValue(makePersona('lead')),
    };
    mockFormatterService = { formatProse: vi.fn() };

    // Formatter service mock returns structured output
    mockFormatterService.formatProse
      .mockResolvedValueOnce({
        output: JSON.parse(makeExpertOutputJson('graph-dba')),
        formattingConfidence: 9,
        originalProse: 'prose from graph-dba',
        durationMs: 500,
        retries: 0,
      })
      .mockResolvedValueOnce({
        output: JSON.parse(makeExpertOutputJson('node-fullstack')),
        formattingConfidence: 8,
        originalProse: 'prose from node-fullstack',
        durationMs: 600,
        retries: 0,
      });

    // OpenRouter: experts return prose, consolidation phases return JSON
    mockOpenRouter.call
      .mockResolvedValueOnce('prose from graph-dba')       // expert 1 prose
      .mockResolvedValueOnce('prose from node-fullstack')   // expert 2 prose
      .mockResolvedValueOnce(makeExtractionJson())                     // extraction
      .mockResolvedValueOnce(makeCritiqueJson())                       // critique
      .mockResolvedValueOnce(makeDecisionJson())                       // decision
      .mockResolvedValueOnce('# Final Blueprint');                     // synthesis

    service = new CouncilService({
      logger: mockLogger,
      openRouterService: mockOpenRouter as never,
      databaseService: mockDatabase as never,
      cacheService: mockCache as never,
      promptService: mockPromptService as never,
      personaService: mockPersonaService as never,
      formatterService: mockFormatterService as never,
      config: COUNCIL_CONFIG,
    });
  });

  // ─── Input validation ───

  describe('input validation', () => {
    it('throws when draft_plan is empty', async () => {
      await expect(service.run({ draftPlan: '' })).rejects.toThrow('draft_plan cannot be empty');
    });

    it('throws when draft_plan is only whitespace', async () => {
      await expect(service.run({ draftPlan: '   ' })).rejects.toThrow('draft_plan cannot be empty');
    });

    it('throws when draft_plan exceeds maxDraftPlanLength', async () => {
      const longPlan = 'x'.repeat(12001);
      await expect(service.run({ draftPlan: longPlan })).rejects.toThrow('draft_plan too long');
    });

    it('throws when fewer than 2 personas are configured', async () => {
      // Override the config to only have 1 persona
      const svc = new CouncilService({
        logger: mockLogger,
        openRouterService: mockOpenRouter as never,
        databaseService: mockDatabase as never,
        cacheService: mockCache as never,
        promptService: mockPromptService as never,
        personaService: mockPersonaService as never,
        formatterService: mockFormatterService as never,
        config: { ...COUNCIL_CONFIG, enabledPersonaIds: ['graph-dba'] },
      });
      await expect(svc.run({ draftPlan: 'Test plan' })).rejects.toThrow('At least 2 personas required');
    });
  });

  // ─── Happy path ───

  describe('run() - happy path', () => {
    it('returns a CouncilResult with sessionId', async () => {
      const result = await service.run({ draftPlan: 'Build a REST API' });
      expect(result.sessionId).toBeDefined();
      expect(typeof result.sessionId).toBe('string');
    });

    it('returns expert reports for each persona', async () => {
      const result = await service.run({ draftPlan: 'Build a REST API' });
      expect(result.expertReports).toHaveLength(2);
      expect(result.expertReports[0].personaId).toBe('graph-dba');
      expect(result.expertReports[1].personaId).toBe('node-fullstack');
    });

    it('calls openRouter for each expert and consolidation phases', async () => {
      await service.run({ draftPlan: 'Build a REST API' });
      // 2 experts + 4 consolidation phases = 6 calls (formatter is mocked)
      expect(mockOpenRouter.call).toHaveBeenCalledTimes(6);
    });

    it('calls personaService.createExpert for each persona', async () => {
      await service.run({ draftPlan: 'Build a REST API' });
      // With 3-tier resolution, createExpert is called per-persona
      expect(mockPersonaService.createExpert).toHaveBeenCalledTimes(2);
      expect(mockPersonaService.createExpert).toHaveBeenCalledWith('graph-dba', 'google/gemini-2.5-flash-lite');
      expect(mockPersonaService.createExpert).toHaveBeenCalledWith('node-fullstack', 'google/gemini-2.5-flash-lite');
    });

    it('saves result to database', async () => {
      await service.run({ draftPlan: 'Build a REST API' });
      expect(mockDatabase.saveCouncilResult).toHaveBeenCalledTimes(1);
    });

    it('includes synthesis blueprint in finalBlueprint output', async () => {
      const result = await service.run({ draftPlan: 'Build a REST API' });
      expect(result.finalBlueprint).toContain('# Final Blueprint');
    });

    it('uses correlationId as sessionId when provided', async () => {
      const result = await service.run({ draftPlan: 'Build a REST API' }, undefined, 'my-correlation-id');
      expect(result.sessionId).toBe('my-correlation-id');
    });

    it('uses persona model override when provided', async () => {
      await service.run(
        { draftPlan: 'Build a REST API' },
        { personaModelsOverride: { 'graph-dba': 'custom/model' } },
      );
      // With the new 3-tier resolution, each persona gets its own model
      expect(mockOpenRouter.call).toHaveBeenCalled();
    });

    it('uses persona override when provided', async () => {
      await service.run(
        { draftPlan: 'Build a REST API' },
        { personaOverride: ['graph-dba', 'devops'] },
      );
      // The service should use graph-dba and devops instead of the defaults
      expect(mockPersonaService.createExperts).not.toHaveBeenCalled();
      // createExpert is called per-persona now
    });
  });

  // ─── Expert failure handling ───

  describe('run() - expert failure handling', () => {
    it('succeeds when one expert fails but at least 2 succeed', async () => {
      // 3 experts, one fails
      const svc = new CouncilService({
        logger: mockLogger,
        openRouterService: mockOpenRouter as never,
        databaseService: mockDatabase as never,
        cacheService: mockCache as never,
        promptService: mockPromptService as never,
        personaService: {
          ...mockPersonaService,
          createExpert: vi.fn().mockImplementation((id: string) => makePersona(id)),
        } as never,
        formatterService: mockFormatterService as never,
        config: { ...COUNCIL_CONFIG, enabledPersonaIds: ['graph-dba', 'node-fullstack', 'devops'] },
      });
      // Reset formatter mock
      mockFormatterService.formatProse
        .mockReset()
        .mockResolvedValueOnce({
          output: JSON.parse(makeExpertOutputJson('node-fullstack')),
          formattingConfidence: 9,
          originalProse: 'prose from node-fullstack',
          durationMs: 500,
          retries: 0,
        })
        .mockResolvedValueOnce({
          output: JSON.parse(makeExpertOutputJson('devops')),
          formattingConfidence: 8,
          originalProse: 'prose from devops',
          durationMs: 600,
          retries: 0,
        });
      // Reset and set up: expert 1 fails, experts 2 & 3 succeed
      mockOpenRouter.call
        .mockReset()
        .mockRejectedValueOnce(new Error('Expert timeout'))           // expert 1 fails
        .mockResolvedValueOnce('prose from node-fullstack')           // expert 2 prose
        .mockResolvedValueOnce('prose from devops')                   // expert 3 prose
        .mockResolvedValueOnce(makeExtractionJson())
        .mockResolvedValueOnce(makeCritiqueJson())
        .mockResolvedValueOnce(makeDecisionJson())
        .mockResolvedValueOnce('# Blueprint');

      const result = await svc.run({ draftPlan: 'Build a REST API' });
      expect(result.expertReports).toHaveLength(2);
      expect(result.finalBlueprint).toContain('⚠️ 1 expert(s) failed');
    });

    it('throws when fewer than 2 experts succeed', async () => {
      mockOpenRouter.call
        .mockReset()
        .mockRejectedValueOnce(new Error('Expert 1 failed'))
        .mockRejectedValueOnce(new Error('Expert 2 failed'));

      await expect(service.run({ draftPlan: 'Build a REST API' })).rejects.toThrow('Too many expert failures');
    });
  });

  // ─── Database failure resilience ───

  describe('run() - database failure resilience', () => {
    it('still returns result when database save fails', async () => {
      mockDatabase.saveCouncilResult.mockImplementationOnce(() => {
        throw new Error('DB write failed');
      });
      const result = await service.run({ draftPlan: 'Build a REST API' });
      expect(result.sessionId).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to save to database',
        expect.objectContaining({ error: 'DB write failed' }),
      );
    });
  });

  // ─── Two-stage formatting ───

  describe('run() - two-stage formatting', () => {
    it('calls formatterService for each expert prose', async () => {
      const result = await service.run({ draftPlan: 'Build a REST API' });
      expect(mockFormatterService.formatProse).toHaveBeenCalledTimes(2);
      expect(result.formattingDetails).toBeDefined();
      expect(result.formattingDetails?.formattingSuccessRate).toBe(1);
    });

    it('includes formatting details in result', async () => {
      const result = await service.run({ draftPlan: 'Build a REST API' });
      expect(result.formattingDetails).toBeDefined();
      expect(result.formattingDetails?.totalFormattingTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.finalBlueprint).toContain('Formatted');
    });

    it('handles formatter failures gracefully', async () => {
      // Use 3 experts so 1 formatter failure still leaves 2 successful
      const threePersonaConfig = { ...COUNCIL_CONFIG, enabledPersonaIds: ['graph-dba', 'node-fullstack', 'devops'] };
      const mockPersonaServiceWith3 = {
        createExperts: vi.fn(),
        createExpert: vi.fn().mockImplementation((id: string) => makePersona(id)),
        createLead: vi.fn().mockReturnValue(makePersona('lead')),
      };

      mockFormatterService.formatProse
        .mockReset()
        .mockResolvedValueOnce({
          output: JSON.parse(makeExpertOutputJson('graph-dba')),
          formattingConfidence: 9,
          originalProse: 'prose',
          durationMs: 500,
          retries: 0,
        })
        .mockRejectedValueOnce(new Error('Formatter timeout'))
        .mockResolvedValueOnce({
          output: JSON.parse(makeExpertOutputJson('devops')),
          formattingConfidence: 8,
          originalProse: 'prose',
          durationMs: 600,
          retries: 0,
        });

      mockOpenRouter.call
        .mockReset()
        .mockResolvedValueOnce('prose 1')
        .mockResolvedValueOnce('prose 2')
        .mockResolvedValueOnce('prose 3')
        .mockResolvedValueOnce(makeExtractionJson())
        .mockResolvedValueOnce(makeCritiqueJson())
        .mockResolvedValueOnce(makeDecisionJson())
        .mockResolvedValueOnce('# Blueprint');

      const svc = new CouncilService({
        logger: mockLogger,
        openRouterService: mockOpenRouter as never,
        databaseService: mockDatabase as never,
        cacheService: mockCache as never,
        promptService: mockPromptService as never,
        personaService: mockPersonaServiceWith3 as never,
        formatterService: mockFormatterService as never,
        config: threePersonaConfig,
      });

      const result = await svc.run({ draftPlan: 'Build a REST API' });
      expect(result.formattingDetails?.formattingSuccessRate).toBeCloseTo(0.667, 2);
      expect(result.formattingDetails?.formattingErrors).toHaveLength(1);
    });
  });
});