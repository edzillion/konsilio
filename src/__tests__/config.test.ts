/**
 * Config Tests
 *
 * Tests for CLI arg parsing, env file loading, konsilio.json parsing,
 * and validation logic.
 *
 * Strategy: mock node:fs to control file system reads, and manipulate
 * process.argv / process.env to test priority ordering.
 * We use vi.resetModules() + dynamic import to force config to re-evaluate
 * with fresh env/argv on each test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock node:fs at top level (hoisted by Vitest) ───
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

import { readFileSync, existsSync } from 'node:fs';
const mockReadFileSync = vi.mocked(readFileSync);
const mockExistsSync = vi.mocked(existsSync);

// ─── Helpers ───

/** Reset module registry so config re-evaluates with fresh env/argv */
async function loadFreshConfig() {
  vi.resetModules();
  const mod = await import('../config.js');
  return mod;
}

/** Minimal valid konsilio.json content (matches actual konsilio.json values) */
const VALID_KONSILIO_JSON = JSON.stringify({
  personas: { enabled: ['graph-dba', 'node-fullstack'] },
  models: { experts: 'google/gemini-2.5-flash-lite', lead: 'google/gemini-2.5-pro' },
  timeouts: { expertMs: 90000, leadMs: 120000 },
  maxDraftPlanLength: 12000,
  maxHistorySessions: 10,
  databasePath: './data/konsilio.db',
});

/** Minimal valid .env file content */
const VALID_ENV_FILE = 'OPENROUTER_API_KEY=env-file-key\n';

// ─── Tests ───

describe('config', () => {
  let originalArgv: string[];
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalArgv = [...process.argv];
    originalEnv = { ...process.env };
    // Default: no .env file, valid konsilio.json
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      return path.endsWith('konsilio.json');
    });
    mockReadFileSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('konsilio.json')) return VALID_KONSILIO_JSON;
      return '';
    });
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
    vi.resetModules();
  });

  // ─── .env file loading ───

  describe('.env file loading', () => {
    it('reads OPENROUTER_API_KEY from .env file', async () => {
      delete process.env.OPENROUTER_API_KEY;
      mockExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        return path.endsWith('.env') || path.endsWith('konsilio.json');
      });
      mockReadFileSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('.env')) return VALID_ENV_FILE;
        if (path.endsWith('konsilio.json')) return VALID_KONSILIO_JSON;
        return '';
      });
      const { config } = await loadFreshConfig();
      expect(config.openrouterApiKey).toBe('env-file-key');
    });

    it('strips surrounding quotes from .env values', async () => {
      delete process.env.OPENROUTER_API_KEY;
      mockExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        return path.endsWith('.env') || path.endsWith('konsilio.json');
      });
      mockReadFileSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('.env')) return 'OPENROUTER_API_KEY="quoted-key"\n';
        if (path.endsWith('konsilio.json')) return VALID_KONSILIO_JSON;
        return '';
      });
      const { config } = await loadFreshConfig();
      expect(config.openrouterApiKey).toBe('quoted-key');
    });

    it('ignores comment lines in .env file', async () => {
      delete process.env.OPENROUTER_API_KEY;
      mockExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        return path.endsWith('.env') || path.endsWith('konsilio.json');
      });
      mockReadFileSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('.env')) return '# This is a comment\nOPENROUTER_API_KEY=real-key\n';
        if (path.endsWith('konsilio.json')) return VALID_KONSILIO_JSON;
        return '';
      });
      const { config } = await loadFreshConfig();
      expect(config.openrouterApiKey).toBe('real-key');
    });
  });

  // ─── CLI arg parsing ───

  describe('CLI arg parsing', () => {
    it('reads OPENROUTER_API_KEY from --api-key CLI arg', async () => {
      delete process.env.OPENROUTER_API_KEY;
      process.argv = ['node', 'index.js', '--api-key=cli-key'];
      const { config } = await loadFreshConfig();
      expect(config.openrouterApiKey).toBe('cli-key');
    });

    it('CLI arg takes priority over process.env', async () => {
      process.env.OPENROUTER_API_KEY = 'env-key';
      process.argv = ['node', 'index.js', '--api-key=cli-key'];
      const { config } = await loadFreshConfig();
      expect(config.openrouterApiKey).toBe('cli-key');
    });

    it('CLI arg takes priority over .env file', async () => {
      delete process.env.OPENROUTER_API_KEY;
      process.argv = ['node', 'index.js', '--api-key=cli-key'];
      mockExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        return path.endsWith('.env') || path.endsWith('konsilio.json');
      });
      mockReadFileSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('.env')) return VALID_ENV_FILE;
        if (path.endsWith('konsilio.json')) return VALID_KONSILIO_JSON;
        return '';
      });
      const { config } = await loadFreshConfig();
      expect(config.openrouterApiKey).toBe('cli-key');
    });
  });

  // ─── Validation ───

  describe('validateConfig', () => {
    it('throws when OPENROUTER_API_KEY is missing', async () => {
      delete process.env.OPENROUTER_API_KEY;
      process.argv = ['node', 'index.js'];
      const { validateConfig } = await loadFreshConfig();
      expect(() => validateConfig()).toThrow('Missing OPENROUTER_API_KEY');
    });

    it('throws when enabledPersonas is empty', async () => {
      process.env.OPENROUTER_API_KEY = 'test-key';
      mockReadFileSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('konsilio.json')) {
          return JSON.stringify({ personas: { enabled: [] } });
        }
        return '';
      });
      const { validateConfig } = await loadFreshConfig();
      expect(() => validateConfig()).toThrow('Missing enabled personas');
    });

    it('does not throw when config is valid', async () => {
      process.env.OPENROUTER_API_KEY = 'test-key';
      const { validateConfig } = await loadFreshConfig();
      expect(() => validateConfig()).not.toThrow();
    });
  });

  // ─── Log level / node env parsing ───

  describe('log level and node env parsing', () => {
    it('defaults logLevel to info', async () => {
      delete process.env.LOG_LEVEL;
      const { config } = await loadFreshConfig();
      expect(config.logLevel).toBe('info');
    });

    it('accepts valid log levels', async () => {
      process.env.LOG_LEVEL = 'debug';
      const { config } = await loadFreshConfig();
      expect(config.logLevel).toBe('debug');
    });

    it('falls back to info for invalid log level', async () => {
      process.env.LOG_LEVEL = 'verbose';
      const { config } = await loadFreshConfig();
      expect(config.logLevel).toBe('info');
    });

    it('defaults nodeEnv to development', async () => {
      delete process.env.NODE_ENV;
      const { config } = await loadFreshConfig();
      expect(config.nodeEnv).toBe('development');
    });
  });
});
