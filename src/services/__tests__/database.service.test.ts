/**
 * DatabaseService Tests
 *
 * Tests for SQLite operations, schema initialization, session saving,
 * session pruning, and health checks.
 *
 * Strategy: mock sql.js and node:fs to avoid real disk I/O and WASM loading.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Logger } from '../../logger.js';
import type { CouncilResult } from '../../personas/schemas.js';

// ─── Mock node:fs ───
vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
}));

// ─── Mock sql.js ───
// vi.mock is hoisted to the top of the file, before any imports.
// The factory function must return an object with a "default" key for ESM compatibility.
vi.mock('sql.js', () => {
  const db = {
    run: vi.fn(),
    exec: vi.fn(),
    export: vi.fn().mockReturnValue(new Uint8Array([])),
    close: vi.fn(),
  };
  const Database = vi.fn().mockImplementation(() => db);
  const initSqlJs = vi.fn().mockResolvedValue({ Database });
  return { default: initSqlJs };
});

import { DatabaseService, type DatabaseServiceConfig } from '../database.service.js';
import { SCHEMA } from '../../db/schema.js';

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

const BASE_CONFIG: DatabaseServiceConfig = {
  dbPath: './data/test.db',
  maxHistorySessions: 10,
};

/** Minimal CouncilResult fixture for save tests */
function makeCouncilResult(sessionId = 'test-session-id'): CouncilResult {
  return {
    sessionId,
    expertReports: [
      {
        personaId: 'graph-dba',
        personaName: 'Graph DBA',
        personaEmoji: '🗄️',
        structuredOutput: {
          personaId: 'graph-dba',
          findings: [
            {
              id: 'finding-1',
              severity: 'HIGH',
              component: 'Database',
              issue: 'Missing index',
              mitigation: 'Add index on user_id',
            },
          ],
          risks: [
            {
              id: 'risk-1',
              category: 'performance',
              probability: 'high',
              impact: 'high',
              description: 'Slow queries without index',
            },
          ],
          missingAssumptions: [],
          dependencies: [],
        },
        rawContent: '{}',
        durationMs: 1000,
        modelUsed: 'google/gemini-2.5-flash-lite',
      },
    ],
    extractionOutput: { claims: [], totalFindings: 1 },
    critiqueOutput: {
      contradictions: [],
      unsupportedClaims: [],
      reasoningScores: [],
      consensusRisks: [],
    },
    decisionOutput: {
      decisions: [{ findingId: 'finding-1', personaId: 'graph-dba', action: 'ACCEPT', reasoning: 'Valid' }],
      resolutions: [],
      acceptedCount: 1,
      rejectedCount: 0,
    },
    synthesisOutput: {
      blueprint: '# Blueprint',
      acceptedFindings: [],
      attributions: { 'finding-1': 'graph-dba' },
    },
    finalBlueprint: '# Final Blueprint',
    consolidationModel: 'google/gemini-2.5-pro',
    totalDurationMs: 5000,
  };
}

// ─── Tests ───

describe('DatabaseService', () => {
  let service: DatabaseService;
  let mockLogger: Logger;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLogger = makeMockLogger();
    service = await DatabaseService.create(BASE_CONFIG, mockLogger, SCHEMA);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Initialization ───

  describe('initialization', () => {
    it('logs initialization success', () => {
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Database service initialized',
        expect.objectContaining({ path: './data/test.db' }),
      );
    });
  });

  // ─── checkHealth ───

  describe('checkHealth()', () => {
    it('returns healthy when database is initialized', () => {
      const result = service.checkHealth();
      expect(result.status).toBe('healthy');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── saveCouncilResult ───

  describe('saveCouncilResult()', () => {
    it('logs debug on successful save', () => {
      service.saveCouncilResult(makeCouncilResult('session-abc'), 'Draft plan');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Council result saved',
        expect.objectContaining({ sessionId: 'session-abc' }),
        undefined,
      );
    });
  });

  // ─── getRecentSessions ───

  describe('getRecentSessions()', () => {
    it('returns empty array when no sessions exist', () => {
      const sessions = service.getRecentSessions(5);
      expect(sessions).toEqual([]);
    });
  });

  // ─── getSessionBlueprint ───

  describe('getSessionBlueprint()', () => {
    it('returns null when session not found', () => {
      expect(service.getSessionBlueprint('nonexistent')).toBeNull();
    });
  });

  // ─── close ───

  describe('close()', () => {
    it('logs close message', () => {
      service.close();
      expect(mockLogger.info).toHaveBeenCalledWith('Database service closed');
    });
  });
});