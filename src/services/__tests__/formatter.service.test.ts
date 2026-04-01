/**
 * FormatterService Tests
 *
 * Tests for converting expert prose to structured JSON using response_format.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FormatterService, type FormatterConfig } from '../formatter.service.js';
import type { Logger } from '../../logger.js';

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

const DEFAULT_CONFIG: FormatterConfig = {
  model: 'openai/gpt-4o-mini',
  timeoutMs: 30000,
  maxRetries: 3,
};

function makeValidExpertOutputJson(personaId: string): string {
  return JSON.stringify({
    personaId,
    findings: [
      {
        id: 'auth-rate-limit',
        severity: 'HIGH',
        component: 'POST /api/auth/login',
        issue: 'No rate limiting on authentication endpoint allows brute force attacks',
        mitigation: 'Add rate limiting middleware to auth endpoints',
      },
    ],
    risks: [
      {
        id: 'brute-force-risk',
        category: 'security',
        probability: 'high',
        impact: 'high',
        description: 'Brute force attack on login endpoint',
      },
    ],
    missingAssumptions: ['Session duration not defined'],
    dependencies: ['Redis for rate limiting'],
  });
}

// ─── Tests ───

describe('FormatterService', () => {
  let mockLogger: Logger;
  let mockOpenRouter: { call: ReturnType<typeof vi.fn> };
  let service: FormatterService;

  beforeEach(() => {
    mockLogger = makeMockLogger();
    mockOpenRouter = { call: vi.fn() };

    service = new FormatterService({
      openRouterService: mockOpenRouter as never,
      logger: mockLogger,
      config: DEFAULT_CONFIG,
    });
  });

  // ─── Happy path ───

  describe('formatProse() - success', () => {
    it('returns formatted output when OpenRouter returns valid JSON', async () => {
      mockOpenRouter.call.mockResolvedValueOnce(makeValidExpertOutputJson('security'));

      const result = await service.formatProse('prose analysis', 'security');

      expect(result.output.personaId).toBe('security');
      expect(result.output.findings).toHaveLength(1);
      expect(result.output.findings[0].severity).toBe('HIGH');
      expect(result.formattingConfidence).toBeGreaterThan(0);
      expect(result.originalProse).toBe('prose analysis');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.retries).toBe(0);
    });

    it('calls OpenRouter with response_format', async () => {
      mockOpenRouter.call.mockResolvedValueOnce(makeValidExpertOutputJson('security'));

      await service.formatProse('prose', 'security');

      expect(mockOpenRouter.call).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'openai/gpt-4o-mini',
          responseFormat: expect.objectContaining({
            type: 'json_schema',
            json_schema: expect.objectContaining({
              name: 'expert_output',
              strict: true,
            }),
          }),
        }),
        undefined,
      );
    });

    it('passes correlationId to OpenRouter call', async () => {
      mockOpenRouter.call.mockResolvedValueOnce(makeValidExpertOutputJson('security'));

      await service.formatProse('prose', 'security', 'test-correlation-id');

      expect(mockOpenRouter.call).toHaveBeenCalledWith(
        expect.any(Object),
        'test-correlation-id',
      );
    });

    it('uses low temperature for deterministic output', async () => {
      mockOpenRouter.call.mockResolvedValueOnce(makeValidExpertOutputJson('security'));

      await service.formatProse('prose', 'security');

      expect(mockOpenRouter.call).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.1,
        }),
        undefined,
      );
    });
  });

  // ─── Error handling ───

  describe('formatProse() - error handling', () => {
    it('retries on failure and succeeds', async () => {
      mockOpenRouter.call
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce(makeValidExpertOutputJson('security'));

      const result = await service.formatProse('prose', 'security');

      expect(result.retries).toBe(2);
      expect(mockOpenRouter.call).toHaveBeenCalledTimes(3);
    });

    it('throws after max retries exhausted', async () => {
      mockOpenRouter.call.mockRejectedValue(new Error('API error'));

      await expect(service.formatProse('prose', 'security')).rejects.toThrow(
        'Formatter failed after 3 attempts',
      );
    });

    it('throws when OpenRouter returns invalid JSON', async () => {
      mockOpenRouter.call.mockResolvedValueOnce('not valid json');

      await expect(service.formatProse('prose', 'security')).rejects.toThrow(
        'Formatter failed after 3 attempts',
      );
    });

    it('throws when OpenRouter returns invalid schema', async () => {
      mockOpenRouter.call.mockResolvedValueOnce(JSON.stringify({ invalid: 'schema' }));

      await expect(service.formatProse('prose', 'security')).rejects.toThrow(
        'Formatter failed after 3 attempts',
      );
    });
  });

  // ─── Confidence calculation ───

  describe('formatProse() - confidence calculation', () => {
    it('calculates high confidence for complete output', async () => {
      mockOpenRouter.call.mockResolvedValueOnce(makeValidExpertOutputJson('security'));

      const result = await service.formatProse('prose', 'security');

      expect(result.formattingConfidence).toBeGreaterThan(5);
    });

    it('calculates lower confidence for empty findings', async () => {
      mockOpenRouter.call.mockResolvedValueOnce(JSON.stringify({
        personaId: 'security',
        findings: [],
        risks: [],
        missingAssumptions: [],
        dependencies: [],
      }));

      const result = await service.formatProse('prose', 'security');

      expect(result.formattingConfidence).toBeLessThan(10);
    });
  });

  // ─── Prompt building ───

  describe('prompt building', () => {
    it('builds messages with formatter system prompt', async () => {
      mockOpenRouter.call.mockResolvedValueOnce(makeValidExpertOutputJson('security'));

      await service.formatProse('prose analysis', 'security');

      const callArgs = mockOpenRouter.call.mock.calls[0][0];
      expect(callArgs.messages).toHaveLength(2);
      expect(callArgs.messages[0].role).toBe('system');
      expect(callArgs.messages[0].content).toContain('JSON formatter');
      expect(callArgs.messages[1].role).toBe('user');
      expect(callArgs.messages[1].content).toContain('prose analysis');
    });
  });
});