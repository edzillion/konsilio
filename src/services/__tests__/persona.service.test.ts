/**
 * PersonaService Tests
 *
 * Tests for persona creation and management.
 * Mocks PromptService, CacheService, and Logger dependencies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PersonaService } from '../persona.service.js';
import type { Logger } from '../../logger.js';
import type { CacheService } from '../cache.service.js';
import type { PromptService, PersonaPromptData } from '../prompt.service.js';

function makeMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withCorrelationId: vi.fn().mockReturnThis(),
  };
}

function makeMockPromptService(): PromptService {
  const mockLoadPersonaPromptData = vi.fn().mockImplementation((personaId: string) => {
    const personaMap: Record<string, PersonaPromptData> = {
      security: {
        id: 'security',
        name: 'Security Architect',
        emoji: '🔒',
        focusAreas: ['Identity & access management'],
        domains: ['security'],
        antiPatterns: ['Test anti-pattern'],
      },
      devops: {
        id: 'devops',
        name: 'DevOps Engineer',
        emoji: '🚀',
        focusAreas: ['CI/CD'],
        domains: ['devops'],
        antiPatterns: ['Test anti-pattern'],
      },
    };
    return personaMap[personaId] ?? {
      id: personaId,
      name: `${personaId} Expert`,
      emoji: '🔧',
      focusAreas: ['testing'],
      domains: [personaId],
      antiPatterns: [],
    };
  });

  return {
    loadPersonaPromptData: mockLoadPersonaPromptData,
    loadConsolidationPhase: vi.fn().mockReturnValue('phase prompt'),
    loadCoreRules: vi.fn().mockReturnValue('expert rules'),
    loadWorkflowRules: vi.fn().mockReturnValue('workflow rules'),
  } as unknown as PromptService;
}

function makeMockCacheService(): CacheService {
  return {
    get: vi.fn().mockReturnValue(undefined),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(),
    prune: vi.fn(),
    clear: vi.fn(),
    stats: vi.fn(),
  } as unknown as CacheService;
}

describe('PersonaService', () => {
  let logger: Logger;
  let promptService: PromptService;
  let cacheService: CacheService;
  let service: PersonaService;

  beforeEach(() => {
    logger = makeMockLogger();
    promptService = makeMockPromptService();
    cacheService = makeMockCacheService();
    service = new PersonaService({
      promptService,
      cacheService,
      logger,
    });
  });

  describe('constructor', () => {
    it('loads expert rules and workflow rules on construction', () => {
      expect(promptService.loadCoreRules).toHaveBeenCalledTimes(1);
      expect(promptService.loadWorkflowRules).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAvailablePersonaIds', () => {
    it('returns all available persona IDs', () => {
      const ids = service.getAvailablePersonaIds();

      expect(ids).toContain('security');
      expect(ids).toContain('devops');
      expect(ids).toContain('graph-dba');
      expect(ids).toContain('node-fullstack');
      expect(ids).toContain('performance');
      expect(ids).toContain('typescript');
      expect(ids).toContain('ux-dx');
      expect(ids).toContain('dev-tooling');
      expect(ids).toContain('distributed-systems');
      expect(ids).toContain('test-architect');
    });

    it('returns exactly 10 persona IDs', () => {
      const ids = service.getAvailablePersonaIds();
      expect(ids).toHaveLength(10);
    });
  });

  describe('createExpert', () => {
    it('creates an expert persona', () => {
      const persona = service.createExpert('security', 'google/gemini-2.5-flash-lite');

      expect(persona.id).toBe('security');
      expect(persona.name).toBe('Security Architect');
      expect(persona.emoji).toBe('🔒');
      expect(persona.systemPrompt).toContain('expert rules');
      expect(persona.systemPrompt).toContain('workflow rules');
    });

    it('caches the created expert', () => {
      service.createExpert('security', 'google/gemini-2.5-flash-lite');

      expect(cacheService.set).toHaveBeenCalledWith(
        expect.stringContaining('expert:security:'),
        expect.anything(),
        300_000
      );
    });

    it('returns cached expert on second call', () => {
      const cachedPersona = {
        id: 'cached-security',
        name: 'Cached Security Architect',
        emoji: '🔒',
        focusAreas: ['cached'],
        systemPrompt: 'cached prompt',
      };

      vi.mocked(cacheService.get).mockReturnValueOnce(cachedPersona);

      const persona = service.createExpert('security', 'google/gemini-2.5-flash-lite');

      expect(persona).toBe(cachedPersona);
      expect(logger.debug).toHaveBeenCalledWith(
        'Expert persona loaded from cache',
        { personaId: 'security' }
      );
    });

    it('creates different experts for different models', () => {
      const persona1 = service.createExpert('security', 'google/gemini-2.5-flash-lite');
      const persona2 = service.createExpert('security', 'openai/gpt-4o');

      expect(persona1).toBeDefined();
      expect(persona2).toBeDefined();
    });
  });

  describe('createExperts', () => {
    it('creates multiple expert personas', () => {
      const personas = service.createExperts(['security', 'devops'], 'google/gemini-2.5-flash-lite');

      expect(personas).toHaveLength(2);
      expect(personas[0].id).toBe('security');
      expect(personas[1].id).toBe('devops');
    });
  });

  describe('createLead', () => {
    it('creates a lead persona for extraction phase', () => {
      const persona = service.createLead('extraction');

      expect(persona.id).toBe('lead-extraction');
      expect(persona.name).toBe('Extraction Lead');
      expect(persona.emoji).toBe('👑');
    });

    it('creates a lead persona for critique phase', () => {
      const persona = service.createLead('critique');

      expect(persona.id).toBe('lead-critique');
      expect(persona.name).toBe('Critique Lead');
    });

    it('creates a lead persona for decision phase', () => {
      const persona = service.createLead('decision');

      expect(persona.id).toBe('lead-decision');
      expect(persona.name).toBe('Decision Lead');
    });

    it('creates a lead persona for synthesis phase', () => {
      const persona = service.createLead('synthesis');

      expect(persona.id).toBe('lead-synthesis');
      expect(persona.name).toBe('Synthesis Lead');
    });

    it('caches the created lead', () => {
      service.createLead('extraction');

      expect(cacheService.set).toHaveBeenCalledWith(
        'lead:extraction',
        expect.anything(),
        300_000
      );
    });

    it('returns cached lead on second call', () => {
      const cachedPersona = {
        id: 'cached-lead',
        name: 'Cached Lead',
        emoji: '👑',
        focusAreas: ['extraction'],
        systemPrompt: 'cached prompt',
      };

      vi.mocked(cacheService.get).mockReturnValueOnce(cachedPersona);

      const persona = service.createLead('extraction');

      expect(persona).toBe(cachedPersona);
      expect(logger.debug).toHaveBeenCalledWith(
        'Lead persona loaded from cache',
        { phase: 'extraction' }
      );
    });
  });
});