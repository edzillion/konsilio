/**
 * CouncilService Tests
 *
 * Tests the 4-phase pipeline orchestration, expert parallel execution,
 * failure handling, and structured output parsing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CouncilService, type CouncilConfig, type CouncilParams } from '../council.service.js';
import type { OpenRouterService } from '../openrouter.service.js';
import type { DatabaseService } from '../database.service.js';
import type { CacheService } from '../cache.service.js';
import type { PromptService } from '../prompt.service.js';
import type { PersonaService } from '../persona.service.js';
import {
  createMockLogger,
  makePersona,
  makeStructuredExpertOutput,
  makeExtractionOutput,
  makeCritiqueOutput,
  makeDecisionOutput,
  SAMPLE_DRAFT_PLAN,
} from '../../__tests__/helpers.js';

// ─── Mock Factories ───

function makeCouncilConfig(overrides: Partial<CouncilConfig> = {}): CouncilConfig {
  return {
    enabledPersonaIds: ['security', 'performance'],
    models: {
      experts: 'google/gemini-2.5-flash-lite',
      lead: 'google/gemini-2.5-pro',
    },
    timeouts: {
      expertMs: 90000,
      leadMs: 120000,
    },
    maxDraftPlanLength: 12000,
    ...overrides,
  };
}

function makeExpertOutputJson(personaId: string, findingId: string): string {
  return JSON.stringify(
    makeStructuredExpertOutput({
      personaId,
      findings: [
        {
          id: findingId,
          severity: 'HIGH',
          component: 'AuthService',
          issue: `Issue from ${personaId}`,
          mitigation: `Fix from ${personaId}`,
        },
      ],
    }),
  );
}

function makeExtractionJson(): string {
  return JSON.stringify(makeExtractionOutput({ totalFindings: 2 }));
}

function makeCritiqueJson(): string {
  return JSON.stringify(makeCritiqueOutput());
}

function makeDecisionJson(): string {
  return JSON.stringify(
    makeDecisionOutput({
      decisions: [
        { findingId: 'finding-sec-001', personaId: 'security', action: 'ACCEPT', reasoning: 'Valid' },
        { findingId: 'finding-perf-001', personaId: 'performance', action: 'ACCEPT', reasoning: 'Valid' },
      ],
      acceptedCount: 2,
      rejectedCount: 0,
    }),
  );
}

function makeDeps(openRouterCallImpl: () => Promise<string>) {
  const logger = createMockLogger();

  const openRouterService = {
    call: vi.fn().mockImplementation(openRouterCallImpl),
  } as unknown as OpenRouterService;

  const databaseService = {
    saveCouncilResult: vi.fn(),
  } as unknown as DatabaseService;

  const cacheService = {
    get: vi.fn().mockReturnValue(undefined),
    set: vi.fn(),
  } as unknown as CacheService;

  const promptService = {} as unknown as PromptService;

  const personaService = {
    createExperts: vi.fn().mockReturnValue([
      makePersona({ id: 'security', name: 'Security Architect', emoji: '🔒' }),
      makePersona({ id: 'performance', name: 'Performance Engineer', emoji: '⚡' }),
    ]),
    createLead: vi.fn().mockReturnValue(
      makePersona({ id: 'lead-extraction', name: 'Extraction Lead', emoji: '👑', systemPrompt: 'You are the lead.' }),
    ),
  } as unknown as PersonaService;

  return { logger, openRouterService, databaseService, cacheService, promptService, personaService };
}

// ─── Tests ───

describe('CouncilService', () => {
  describe('run() - happy path', () => {
    it('returns a CouncilResult with all phases populated', async () => {
      let callCount = 0;
      const deps = makeDeps(() => {
        callCount++;
        // Calls: expert1, expert2, extraction, critique, decision, synthesis
        if (callCount === 1) return Promise.resolve(makeExpertOutputJson('security', 'finding-sec-001'));
        if (callCount === 2) return Promise.resolve(makeExpertOutputJson('performance', 'finding-perf-001'));
        if (callCount === 3) return Promise.resolve(makeExtractionJson());
        if (callCount === 4) return Promise.resolve(makeCritiqueJson());
        if (callCount === 5) return Promise.resolve(makeDecisionJson());
        // Synthesis returns plain markdown
        return Promise.resolve('# Final Blueprint\n\nAll findings accepted.');
      });

      const service = new CouncilService({ ...deps, config: makeCouncilConfig() });
      const result = await service.run({ draftPlan: SAMPLE_DRAFT_PLAN });

      expect(result.sessionId).toBeDefined();
      expect(result.expertReports).toHaveLength(2);
      expect(result.expertReports[0].personaId).toBe('security');
      expect(result.expertReports[1].personaId).toBe('performance');
      expect(result.extractionOutput.totalFindings).toBe(2);
      expect(result.critiqueOutput.contradictions).toHaveLength(0);
      expect(result.decisionOutput.acceptedCount).toBe(2);
      expect(result.decisionOutput.rejectedCount).toBe(0);
      expect(result.synthesisOutput.blueprint).toContain('Final Blueprint');
      expect(result.finalBlueprint).toContain('👑 Council');
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('calls openRouterService exactly 6 times (2 experts + 4 phases)', async () => {
      let callCount = 0;
      const deps = makeDeps(() => {
        callCount++;
        if (callCount <= 2) return Promise.resolve(makeExpertOutputJson('security', `finding-${callCount}`));
        if (callCount === 3) return Promise.resolve(makeExtractionJson());
        if (callCount === 4) return Promise.resolve(makeCritiqueJson());
        if (callCount === 5) return Promise.resolve(makeDecisionJson());
        return Promise.resolve('# Blueprint');
      });

      const service = new CouncilService({ ...deps, config: makeCouncilConfig() });
      await service.run({ draftPlan: SAMPLE_DRAFT_PLAN });

      expect(deps.openRouterService.call).toHaveBeenCalledTimes(6);
    });

    it('uses model overrides when provided', async () => {
      let callCount = 0;
      const deps = makeDeps(() => {
        callCount++;
        if (callCount <= 2) return Promise.resolve(makeExpertOutputJson('security', `finding-${callCount}`));
        if (callCount === 3) return Promise.resolve(makeExtractionJson());
        if (callCount === 4) return Promise.resolve(makeCritiqueJson());
        if (callCount === 5) return Promise.resolve(makeDecisionJson());
        return Promise.resolve('# Blueprint');
      });

      const service = new CouncilService({ ...deps, config: makeCouncilConfig() });
      await service.run(
        { draftPlan: SAMPLE_DRAFT_PLAN },
        { modelOverride: { experts: 'openai/gpt-4o', consolidation: 'anthropic/claude-3-5-sonnet' } },
      );

      // Expert calls use the override model
      const expertCall = vi.mocked(deps.openRouterService.call).mock.calls[0][0];
      expect(expertCall.model).toBe('openai/gpt-4o');

      // Consolidation calls use the override model
      const extractionCall = vi.mocked(deps.openRouterService.call).mock.calls[2][0];
      expect(extractionCall.model).toBe('anthropic/claude-3-5-sonnet');
    });

    it('saves result to database after successful run', async () => {
      let callCount = 0;
      const deps = makeDeps(() => {
        callCount++;
        if (callCount <= 2) return Promise.resolve(makeExpertOutputJson('security', `finding-${callCount}`));
        if (callCount === 3) return Promise.resolve(makeExtractionJson());
        if (callCount === 4) return Promise.resolve(makeCritiqueJson());
        if (callCount === 5) return Promise.resolve(makeDecisionJson());
        return Promise.resolve('# Blueprint');
      });

      const service = new CouncilService({ ...deps, config: makeCouncilConfig() });
      await service.run({ draftPlan: SAMPLE_DRAFT_PLAN, techStack: 'Node.js' });

      expect(deps.databaseService.saveCouncilResult).toHaveBeenCalledOnce();
      const [savedResult, savedDraftPlan, savedTechStack] = vi.mocked(
        deps.databaseService.saveCouncilResult,
      ).mock.calls[0];
      expect(savedDraftPlan).toBe(SAMPLE_DRAFT_PLAN);
      expect(savedTechStack).toBe('Node.js');
      expect(savedResult.expertReports).toHaveLength(2);
    });

    it('includes techStack and contextConstraints in user message', async () => {
      let callCount = 0;
      const deps = makeDeps(() => {
        callCount++;
        if (callCount <= 2) return Promise.resolve(makeExpertOutputJson('security', `finding-${callCount}`));
        if (callCount === 3) return Promise.resolve(makeExtractionJson());
        if (callCount === 4) return Promise.resolve(makeCritiqueJson());
        if (callCount === 5) return Promise.resolve(makeDecisionJson());
        return Promise.resolve('# Blueprint');
      });

      const service = new CouncilService({ ...deps, config: makeCouncilConfig() });
      await service.run({
        draftPlan: SAMPLE_DRAFT_PLAN,
        techStack: 'Node.js + PostgreSQL',
        contextConstraints: 'Must be GDPR compliant',
      });

      const expertCallMessages = vi.mocked(deps.openRouterService.call).mock.calls[0][0].messages;
      const userMessage = expertCallMessages.find((m: { role: string }) => m.role === 'user')!;
      expect(userMessage.content).toContain('Node.js + PostgreSQL');
      expect(userMessage.content).toContain('Must be GDPR compliant');
    });

    it('strips markdown code blocks from expert JSON output', async () => {
      let callCount = 0;
      const deps = makeDeps(() => {
        callCount++;
        if (callCount === 1) {
          // Wrap in markdown code block
          return Promise.resolve('```json\n' + makeExpertOutputJson('security', 'finding-sec-001') + '\n```');
        }
        if (callCount === 2) return Promise.resolve(makeExpertOutputJson('performance', 'finding-perf-001'));
        if (callCount === 3) return Promise.resolve(makeExtractionJson());
        if (callCount === 4) return Promise.resolve(makeCritiqueJson());
        if (callCount === 5) return Promise.resolve(makeDecisionJson());
        return Promise.resolve('# Blueprint');
      });

      const service = new CouncilService({ ...deps, config: makeCouncilConfig() });
      const result = await service.run({ draftPlan: SAMPLE_DRAFT_PLAN });

      // Should parse successfully despite markdown wrapping
      expect(result.expertReports[0].personaId).toBe('security');
    });
  });

  describe('run() - validation', () => {
    it('throws when draftPlan is empty', async () => {
      const deps = makeDeps(() => Promise.resolve(''));
      const service = new CouncilService({ ...deps, config: makeCouncilConfig() });

      await expect(service.run({ draftPlan: '   ' })).rejects.toThrow('draft_plan cannot be empty');
    });

    it('throws when draftPlan exceeds maxDraftPlanLength', async () => {
      const deps = makeDeps(() => Promise.resolve(''));
      const service = new CouncilService({ ...deps, config: makeCouncilConfig({ maxDraftPlanLength: 10 }) });

      await expect(service.run({ draftPlan: 'x'.repeat(11) })).rejects.toThrow('draft_plan too long');
    });

    it('throws when fewer than 2 personas are configured', async () => {
      const deps = makeDeps(() => Promise.resolve(''));
      // Override createExperts to return only 1 persona
      vi.mocked(deps.personaService.createExperts).mockReturnValue([makePersona()]);

      const service = new CouncilService({ ...deps, config: makeCouncilConfig({ enabledPersonaIds: ['security'] }) });

      await expect(service.run({ draftPlan: SAMPLE_DRAFT_PLAN })).rejects.toThrow('At least 2 personas required');
    });
  });

  describe('run() - expert failure handling', () => {
    it('continues when one expert fails but at least 2 succeed', async () => {
      // 3 experts configured, 1 fails
      const deps = makeDeps(() => Promise.resolve(''));
      vi.mocked(deps.personaService.createExperts).mockReturnValue([
        makePersona({ id: 'security', name: 'Security Architect', emoji: '🔒' }),
        makePersona({ id: 'performance', name: 'Performance Engineer', emoji: '⚡' }),
        makePersona({ id: 'devops', name: 'DevOps Engineer', emoji: '🚀' }),
      ]);

      let callCount = 0;
      vi.mocked(deps.openRouterService.call).mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(makeExpertOutputJson('security', 'finding-sec-001'));
        if (callCount === 2) return Promise.reject(new Error('Timeout'));
        if (callCount === 3) return Promise.resolve(makeExpertOutputJson('devops', 'finding-devops-001'));
        if (callCount === 4) return Promise.resolve(makeExtractionJson());
        if (callCount === 5) return Promise.resolve(makeCritiqueJson());
        if (callCount === 6) return Promise.resolve(makeDecisionJson());
        return Promise.resolve('# Blueprint');
      });

      const service = new CouncilService({
        ...deps,
        config: makeCouncilConfig({ enabledPersonaIds: ['security', 'performance', 'devops'] }),
      });
      const result = await service.run({ draftPlan: SAMPLE_DRAFT_PLAN });

      expect(result.expertReports).toHaveLength(2);
      expect(result.finalBlueprint).toContain('⚠️ 1 expert(s) failed');
    });

    it('throws when too many experts fail (fewer than 2 succeed)', async () => {
      const deps = makeDeps(() => Promise.resolve(''));
      vi.mocked(deps.personaService.createExperts).mockReturnValue([
        makePersona({ id: 'security', name: 'Security Architect', emoji: '🔒' }),
        makePersona({ id: 'performance', name: 'Performance Engineer', emoji: '⚡' }),
      ]);

      vi.mocked(deps.openRouterService.call).mockRejectedValue(new Error('API unavailable'));

      const service = new CouncilService({ ...deps, config: makeCouncilConfig() });

      await expect(service.run({ draftPlan: SAMPLE_DRAFT_PLAN })).rejects.toThrow('Too many expert failures');
    });
  });

  describe('run() - database failure resilience', () => {
    it('still returns result even when database save fails', async () => {
      let callCount = 0;
      const deps = makeDeps(() => {
        callCount++;
        if (callCount <= 2) return Promise.resolve(makeExpertOutputJson('security', `finding-${callCount}`));
        if (callCount === 3) return Promise.resolve(makeExtractionJson());
        if (callCount === 4) return Promise.resolve(makeCritiqueJson());
        if (callCount === 5) return Promise.resolve(makeDecisionJson());
        return Promise.resolve('# Blueprint');
      });

      vi.mocked(deps.databaseService.saveCouncilResult).mockImplementation(() => {
        throw new Error('DB write failed');
      });

      const service = new CouncilService({ ...deps, config: makeCouncilConfig() });
      const result = await service.run({ draftPlan: SAMPLE_DRAFT_PLAN });

      // Should still return a valid result
      expect(result.expertReports).toHaveLength(2);
      // Should log a warning about the DB failure
      expect(deps.logger.warn).toHaveBeenCalledWith(
        'Failed to save to database',
        expect.objectContaining({ error: 'DB write failed' }),
      );
    });
  });

  describe('run() - output format', () => {
    it('includes expert count and model info in finalBlueprint header', async () => {
      let callCount = 0;
      const deps = makeDeps(() => {
        callCount++;
        if (callCount <= 2) return Promise.resolve(makeExpertOutputJson('security', `finding-${callCount}`));
        if (callCount === 3) return Promise.resolve(makeExtractionJson());
        if (callCount === 4) return Promise.resolve(makeCritiqueJson());
        if (callCount === 5) return Promise.resolve(makeDecisionJson());
        return Promise.resolve('# Blueprint');
      });

      const service = new CouncilService({ ...deps, config: makeCouncilConfig() });
      const result = await service.run({ draftPlan: SAMPLE_DRAFT_PLAN });

      expect(result.finalBlueprint).toContain('2 experts');
      expect(result.finalBlueprint).toContain('google/gemini-2.5-flash-lite');
      expect(result.finalBlueprint).toContain('google/gemini-2.5-pro');
      expect(result.finalBlueprint).toContain('4-phase consolidation');
    });

    it('uses provided correlationId as sessionId', async () => {
      let callCount = 0;
      const deps = makeDeps(() => {
        callCount++;
        if (callCount <= 2) return Promise.resolve(makeExpertOutputJson('security', `finding-${callCount}`));
        if (callCount === 3) return Promise.resolve(makeExtractionJson());
        if (callCount === 4) return Promise.resolve(makeCritiqueJson());
        if (callCount === 5) return Promise.resolve(makeDecisionJson());
        return Promise.resolve('# Blueprint');
      });

      const service = new CouncilService({ ...deps, config: makeCouncilConfig() });
      const result = await service.run({ draftPlan: SAMPLE_DRAFT_PLAN }, undefined, 'my-correlation-id');

      expect(result.sessionId).toBe('my-correlation-id');
    });
  });
});
