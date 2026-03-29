/**
 * CouncilService Tests
 *
 * Tests for the 4-phase pipeline orchestration, expert parallel execution,
 * failure handling, and structured output parsing.
 *
 * Strategy: mock all service dependencies (OpenRouter, Database, Cache,
 * Prompt, Persona) and control what each phase returns.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CouncilService, type CouncilConfig } from '../council.service.js';
import type { Logger } from '../../logger.js';
import type { Persona, StructuredExpertOutput, ExtractionPhaseOutput, CritiquePhaseOutput, DecisionPhaseOutput } from '../../personas/types.js';

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
    claims: [{ id: 'claim-1', personaId: 'graph-dba', findingId: 'finding-graph-dba', claim: 'Test claim', context: 'ctx' }],
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
  },
  timeouts: {
    expertMs: 90000,
    leadMs: 120000,
  },
  maxDraftPlanLength: 12000,
};

// ─── Tests ───

describe('CouncilService', () => {
  let mockLogger: Logger;
  let mockOpenRouter: { call: ReturnType<typeof vi.fn> };
  let mockDatabase: { saveCouncilResult: ReturnType<typeof vi.fn> };
  let mockCache: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
  let mockPromptService: { loadCoreRules: ReturnType<typeof vi.fn>; loadWorkflowRules: ReturnType<typeof vi.fn>; loadConsolidationPhase: ReturnType<typeof vi.fn>; loadPersonaPromptData: ReturnType<typeof vi.fn> };
  let mockPersonaService: { createExperts: ReturnType<typeof vi.fn>; createLead: ReturnType<typeof vi.fn> };
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
      createLead: vi.fn().mockReturnValue(makePersona('lead')),
    };

    // Default: all phases return valid JSON
    mockOpenRouter.call
      .mockResolvedValueOnce(makeExpertOutputJson('graph-dba'))       // expert 1
      .mockResolvedValueOnce(makeExpertOutputJson('node-fullstack'))   // expert 2
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
      mockPersonaService.createExperts.mockReturnValueOnce([makePersona('graph-dba')]);
      await expect(service.run({ draftPlan: 'Test plan' })).rejects.toThrow('At least 2 personas required');
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

    it('calls openRouter for each expert in parallel', async () => {
      await service.run({ draftPlan: 'Build a REST API' });
      // 2 experts + 4 consolidation phases = 6 calls
      expect(mockOpenRouter.call).toHaveBeenCalledTimes(6);
    });

    it('calls personaService.createExperts with configured persona IDs', async () => {
      await service.run({ draftPlan: 'Build a REST API' });
      expect(mockPersonaService.createExperts).toHaveBeenCalledWith(
        ['graph-dba', 'node-fullstack'],
        'google/gemini-2.5-flash-lite',
      );
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

    it('uses model override when provided', async () => {
      await service.run(
        { draftPlan: 'Build a REST API' },
        { modelOverride: { experts: 'custom/model' } },
      );
      expect(mockPersonaService.createExperts).toHaveBeenCalledWith(
        expect.any(Array),
        'custom/model',
      );
    });
  });

  // ─── Expert failure handling ───

  describe('run() - expert failure handling', () => {
    it('succeeds when one expert fails but at least 2 succeed', async () => {
      // 3 experts, one fails
      mockPersonaService.createExperts.mockReturnValueOnce([
        makePersona('graph-dba'),
        makePersona('node-fullstack'),
        makePersona('devops'),
      ]);
      // Reset and set up: expert 1 fails, experts 2 & 3 succeed
      mockOpenRouter.call
        .mockReset()
        .mockRejectedValueOnce(new Error('Expert timeout'))           // expert 1 fails
        .mockResolvedValueOnce(makeExpertOutputJson('node-fullstack')) // expert 2
        .mockResolvedValueOnce(makeExpertOutputJson('devops'))         // expert 3
        .mockResolvedValueOnce(makeExtractionJson())
        .mockResolvedValueOnce(makeCritiqueJson())
        .mockResolvedValueOnce(makeDecisionJson())
        .mockResolvedValueOnce('# Blueprint');

      const result = await service.run({ draftPlan: 'Build a REST API' });
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

  // ─── JSON parsing ───

  describe('run() - JSON parsing', () => {
    it('strips markdown code blocks from expert JSON output', async () => {
      mockOpenRouter.call
        .mockReset()
        .mockResolvedValueOnce('```json\n' + makeExpertOutputJson('graph-dba') + '\n```')
        .mockResolvedValueOnce(makeExpertOutputJson('node-fullstack'))
        .mockResolvedValueOnce(makeExtractionJson())
        .mockResolvedValueOnce(makeCritiqueJson())
        .mockResolvedValueOnce(makeDecisionJson())
        .mockResolvedValueOnce('# Blueprint');

      const result = await service.run({ draftPlan: 'Build a REST API' });
      expect(result.expertReports[0].personaId).toBe('graph-dba');
    });

    it('throws when expert returns invalid JSON', async () => {
      mockOpenRouter.call
        .mockReset()
        .mockResolvedValueOnce('not valid json')
        .mockResolvedValueOnce('also not json');

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
});
