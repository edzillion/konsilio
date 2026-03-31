/**
 * DatabaseService Tests
 *
 * Tests for SQLite operations, schema initialization, session saving,
 * session pruning, and health checks.
 *
 * Strategy: mock better-sqlite3 and node:fs (mkdirSync) to avoid real
 * disk I/O. Module-scoped mockDb object is used directly in tests since
 * it's the stable reference returned by the Database constructor mock.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Logger } from '../../logger.js';
import type { CouncilResult } from '../../personas/schemas.js';

// ─── Mock node:fs ───
vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

// ─── Mock better-sqlite3 ───
// Module-scoped mock objects: their references are stable across tests.
// mockReset clears call history but not the object identity, so we restore
// implementations in beforeEach.
const mockStatement = {
  run: vi.fn(),
  get: vi.fn(),
  all: vi.fn(),
};

const mockDb = {
  pragma: vi.fn(),
  exec: vi.fn(),
  prepare: vi.fn(),
  transaction: vi.fn(),
  close: vi.fn(),
};

vi.mock('better-sqlite3', () => ({
  default: vi.fn(),
}));

import Database from 'better-sqlite3';
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

  beforeEach(() => {
    // Restore implementations cleared by mockReset.
    // Database is called with `new` so must use function keyword (Vitest v4).
    mockStatement.run.mockReturnValue({ changes: 1 });
    mockStatement.get.mockReturnValue({ 1: 1 });
    mockStatement.all.mockReturnValue([]);
    mockDb.prepare.mockReturnValue(mockStatement);
    mockDb.transaction.mockImplementation((fn: () => void) => fn);
    vi.mocked(Database).mockImplementation(function () {
      return mockDb as unknown as InstanceType<typeof Database>;
    });

    mockLogger = makeMockLogger();
    service = new DatabaseService(BASE_CONFIG, mockLogger, SCHEMA);
  });

  // ─── Initialization ───

  describe('initialization', () => {
    it('creates the database at the configured path', () => {
      expect(Database).toHaveBeenCalledWith('./data/test.db');
    });

    it('sets WAL journal mode pragma', () => {
      expect(mockDb.pragma).toHaveBeenCalledWith('journal_mode = WAL');
    });

    it('enables foreign keys pragma', () => {
      expect(mockDb.pragma).toHaveBeenCalledWith('foreign_keys = ON');
    });

    it('executes the schema SQL', () => {
      expect(mockDb.exec).toHaveBeenCalledWith(SCHEMA);
    });

    it('logs initialization success', () => {
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Database service initialized',
        expect.objectContaining({ path: './data/test.db' }),
      );
    });
  });

  // ─── checkHealth ───

  describe('checkHealth()', () => {
    it('returns healthy when SELECT 1 succeeds', () => {
      const result = service.checkHealth();
      expect(result.status).toBe('healthy');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('returns unhealthy when prepare throws', () => {
      mockDb.prepare.mockImplementationOnce(() => {
        throw new Error('DB error');
      });
      const result = service.checkHealth();
      expect(result.status).toBe('unhealthy');
      expect(result.error).toContain('DB error');
    });
  });

  // ─── saveCouncilResult ───

  describe('saveCouncilResult()', () => {
    it('calls db.transaction to wrap the save', () => {
      service.saveCouncilResult(makeCouncilResult(), 'Draft plan text');
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('logs debug on successful save', () => {
      service.saveCouncilResult(makeCouncilResult('session-abc'), 'Draft plan');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Council result saved',
        expect.objectContaining({ sessionId: 'session-abc' }),
        undefined,
      );
    });

    it('logs error when transaction throws', () => {
      mockDb.transaction.mockImplementationOnce(() => {
        throw new Error('Transaction failed');
      });
      service.saveCouncilResult(makeCouncilResult(), 'Draft plan');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to save council result',
        expect.objectContaining({ error: 'Transaction failed' }),
        undefined,
      );
    });
  });

  // ─── getRecentSessions ───

  describe('getRecentSessions()', () => {
    it('returns empty array when no sessions exist', () => {
      mockDb.prepare.mockReturnValueOnce({
        run: vi.fn(),
        get: vi.fn(),
        all: vi.fn().mockReturnValue([]),
      });
      const sessions = service.getRecentSessions(5);
      expect(sessions).toEqual([]);
    });

    it('passes limit to the query', () => {
      const mockStmt = { run: vi.fn(), get: vi.fn(), all: vi.fn().mockReturnValue([]) };
      mockDb.prepare.mockReturnValueOnce(mockStmt);
      service.getRecentSessions(5);
      expect(mockStmt.all).toHaveBeenCalledWith(5);
    });
  });

  // ─── getSessionBlueprint ───

  describe('getSessionBlueprint()', () => {
    it('returns null when session not found', () => {
      mockDb.prepare.mockReturnValueOnce({
        run: vi.fn(),
        get: vi.fn().mockReturnValue(undefined),
        all: vi.fn(),
      });
      expect(service.getSessionBlueprint('nonexistent')).toBeNull();
    });

    it('returns blueprint content when session exists', () => {
      mockDb.prepare.mockReturnValueOnce({
        run: vi.fn(),
        get: vi.fn().mockReturnValue({ content: '# My Blueprint' }),
        all: vi.fn(),
      });
      expect(service.getSessionBlueprint('session-123')).toBe('# My Blueprint');
    });
  });

  // ─── close ───

  describe('close()', () => {
    it('calls db.close()', () => {
      service.close();
      expect(mockDb.close).toHaveBeenCalled();
    });

    it('logs close message', () => {
      service.close();
      expect(mockLogger.info).toHaveBeenCalledWith('Database service closed');
    });
  });
});
