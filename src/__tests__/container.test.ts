/**
 * Container Tests
 *
 * Tests for DI wiring, service creation, singleton pattern, and reset.
 *
 * Strategy: mock all service constructors and config/validateConfig so
 * we can verify the container wires dependencies correctly without
 * touching the filesystem or network.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock node:fs (needed by config) ───
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// ─── Mock all service modules ───
vi.mock('../services/openrouter.service.js', () => ({
  OpenRouterService: vi.fn(),
}));
vi.mock('../services/database.service.js', () => ({
  DatabaseService: {
    create: vi.fn().mockResolvedValue({
      checkHealth: vi.fn().mockReturnValue({ status: 'healthy', latencyMs: 1 }),
      close: vi.fn(),
    }),
  },
}));
vi.mock('../services/cache.service.js', () => ({
  CacheService: vi.fn(),
}));
vi.mock('../services/prompt.service.js', () => ({
  PromptService: vi.fn(),
}));
vi.mock('../services/persona.service.js', () => ({
  PersonaService: vi.fn(),
}));
vi.mock('../services/council.service.js', () => ({
  CouncilService: vi.fn(),
}));

// ─── Mock config ───
vi.mock('../config.js', () => ({
  config: {
    openrouterApiKey: 'test-key',
    openrouterBaseUrl: 'https://openrouter.ai/api/v1',
    databasePath: './data/test.db',
    maxHistorySessions: 10,
    cacheTtlSeconds: 3600,
    enabledPersonas: ['graph-dba', 'node-fullstack'],
    models: { experts: 'google/gemini-2.5-flash-lite', lead: 'google/gemini-2.5-pro' },
    timeouts: { expertMs: 90000, leadMs: 120000 },
    maxDraftPlanLength: 12000,
  },
  validateConfig: vi.fn(),
}));

// ─── Mock logger ───
vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withCorrelationId: vi.fn().mockReturnThis(),
  },
}));

// ─── Mock db schema ───
vi.mock('../db/schema.js', () => ({
  SCHEMA: 'CREATE TABLE IF NOT EXISTS test (id TEXT);',
}));

import { OpenRouterService } from '../services/openrouter.service.js';
import { DatabaseService } from '../services/database.service.js';
import { CacheService } from '../services/cache.service.js';
import { PromptService } from '../services/prompt.service.js';
import { PersonaService } from '../services/persona.service.js';
import { CouncilService } from '../services/council.service.js';
import { validateConfig } from '../config.js';

// ─── Tests ───

describe('container', () => {
  beforeEach(() => {
    // Reset module registry so the container singleton is cleared between tests.
    // The top-level vi.mock() calls are hoisted and remain active after resetModules.
    vi.resetModules();
  });

  // ─── createServices ───

  describe('createServices()', () => {
    it('calls validateConfig before creating services', async () => {
      const { createServices } = await import('../container.js');
      const { validateConfig: mockValidate } = await import('../config.js');
      await createServices();
      expect(mockValidate).toHaveBeenCalledOnce();
    });

    it('creates all 6 services', async () => {
      const { createServices } = await import('../container.js');
      const services = await createServices();
      expect(services).toHaveProperty('openRouterService');
      expect(services).toHaveProperty('databaseService');
      expect(services).toHaveProperty('cacheService');
      expect(services).toHaveProperty('promptService');
      expect(services).toHaveProperty('personaService');
      expect(services).toHaveProperty('councilService');
    });

    it('constructs OpenRouterService with apiKey and baseUrl', async () => {
      const { createServices } = await import('../container.js');
      const { OpenRouterService: MockOR } = await import('../services/openrouter.service.js');
      await createServices();
      expect(MockOR).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'test-key',
          baseUrl: 'https://openrouter.ai/api/v1',
        }),
        expect.anything(),
      );
    });

    it('constructs DatabaseService with dbPath and maxHistorySessions', async () => {
      const { createServices } = await import('../container.js');
      const { DatabaseService: MockDB } = await import('../services/database.service.js');
      await createServices();
      expect(MockDB.create).toHaveBeenCalledWith(
        expect.objectContaining({
          dbPath: './data/test.db',
          maxHistorySessions: 10,
        }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('constructs CacheService with TTL in milliseconds', async () => {
      const { createServices } = await import('../container.js');
      const { CacheService: MockCache } = await import('../services/cache.service.js');
      await createServices();
      // cacheTtlSeconds: 3600 → 3600 * 1000 = 3_600_000 ms
      expect(MockCache).toHaveBeenCalledWith(3_600_000);
    });

    it('constructs CouncilService with enabledPersonaIds from config', async () => {
      const { createServices } = await import('../container.js');
      const { CouncilService: MockCouncil } = await import('../services/council.service.js');
      await createServices();
      expect(MockCouncil).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            enabledPersonaIds: ['graph-dba', 'node-fullstack'],
          }),
        }),
      );
    });
  });

  // ─── Singleton pattern ───

  describe('getServices()', () => {
    it('returns the same promise instance on repeated calls', async () => {
      const { getServices } = await import('../container.js');
      const first = getServices();
      const second = getServices();
      expect(first).toBe(second);
      // Also verify the resolved value
      const resolved = await first;
      expect(resolved).toHaveProperty('databaseService');
    });
  });

  // ─── Reset ───

  describe('resetServices()', () => {
    it('causes getServices to create a new promise after reset', async () => {
      const { getServices, resetServices } = await import('../container.js');
      const first = getServices();
      resetServices();
      const second = getServices();
      expect(first).not.toBe(second);
      // Verify both resolve properly
      const resolvedFirst = await first;
      const resolvedSecond = await second;
      expect(resolvedFirst).not.toBe(resolvedSecond);
    });
  });
});
