/**
 * OpenRouterService Tests
 *
 * Tests for the external API boundary: retry logic, timeout handling,
 * error parsing (401, 402, 429), and response parsing.
 *
 * Strategy: mock global fetch to control HTTP responses without hitting
 * the real API.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenRouterService, type OpenRouterServiceConfig, type OpenRouterCallOptions } from '../openrouter.service.js';
import type { Logger } from '../../logger.js';

// ─── Helpers ───

/** Create a fresh mock logger (avoids mockReset clearing shared instances) */
function makeMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withCorrelationId: vi.fn().mockReturnThis(),
  };
}

const BASE_CONFIG: OpenRouterServiceConfig = {
  apiKey: 'test-api-key',
  baseUrl: 'https://openrouter.ai/api/v1',
  maxRetries: 3,
  baseDelayMs: 10, // fast retries in tests
};

const BASE_CALL_OPTS: OpenRouterCallOptions = {
  model: 'google/gemini-2.5-flash-lite',
  messages: [{ role: 'user', content: 'Hello' }],
  maxTokens: 100,
  temperature: 0.3,
  timeoutMs: 5000,
};

/** Build a successful fetch Response with given content */
function makeSuccessResponse(content: string): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: vi.fn().mockResolvedValue({
      choices: [{ message: { content } }],
    }),
  } as unknown as Response;
}

/** Build an error fetch Response with given status */
function makeErrorResponse(status: number, statusText = 'Error'): Response {
  return {
    ok: false,
    status,
    statusText,
    json: vi.fn().mockResolvedValue({ error: { message: `HTTP ${status}` } }),
  } as unknown as Response;
}

// ─── Tests ───

describe('OpenRouterService', () => {
  let service: OpenRouterService;
  let mockLogger: Logger;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    mockLogger = makeMockLogger();
    service = new OpenRouterService(BASE_CONFIG, mockLogger);
  });

  // ─── Happy path ───

  describe('call() - success', () => {
    it('returns content from a successful response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(makeSuccessResponse('Hello world'));
      const result = await service.call(BASE_CALL_OPTS);
      expect(result).toBe('Hello world');
    });

    it('sends correct Authorization header', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(makeSuccessResponse('ok'));
      await service.call(BASE_CALL_OPTS);
      const [, init] = vi.mocked(fetch).mock.calls[0];
      const headers = init?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-api-key');
    });

    it('sends correct model in request body', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(makeSuccessResponse('ok'));
      await service.call(BASE_CALL_OPTS);
      const [, init] = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(init?.body as string);
      expect(body.model).toBe('google/gemini-2.5-flash-lite');
    });
  });

  // ─── Error handling ───

  describe('call() - error handling', () => {
    it('throws on 401 Unauthorized', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(makeErrorResponse(401));
      await expect(service.call(BASE_CALL_OPTS)).rejects.toThrow('Unauthorized');
    });

    it('throws on 402 No credits', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(makeErrorResponse(402));
      await expect(service.call(BASE_CALL_OPTS)).rejects.toThrow('No credits');
    });

    it('throws when API key is missing', async () => {
      const noKeyService = new OpenRouterService(
        { ...BASE_CONFIG, apiKey: '' },
        mockLogger,
      );
      await expect(noKeyService.call(BASE_CALL_OPTS)).rejects.toThrow('Missing OPENROUTER_API_KEY');
    });

    it('throws when response has no content', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ choices: [{ message: { content: '' } }] }),
      } as unknown as Response);
      await expect(service.call(BASE_CALL_OPTS)).rejects.toThrow('Empty response');
    });

    it('throws when choices array is missing', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      } as unknown as Response);
      await expect(service.call(BASE_CALL_OPTS)).rejects.toThrow('Empty response');
    });

    it('throws when response contains an error field', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ error: { message: 'Model not found' } }),
      } as unknown as Response);
      await expect(service.call(BASE_CALL_OPTS)).rejects.toThrow('OpenRouter error: Model not found');
    });
  });

  // ─── Retry logic ───

  describe('call() - retry logic', () => {
    it('retries on 429 and eventually throws after max retries', async () => {
      vi.mocked(fetch).mockResolvedValue(makeErrorResponse(429));
      await expect(service.call(BASE_CALL_OPTS)).rejects.toThrow('Rate limited');
      // Should have attempted maxRetries (3) times
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
    });

    it('succeeds on second attempt after initial 429', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(makeErrorResponse(429))
        .mockResolvedValueOnce(makeSuccessResponse('retry success'));
      const result = await service.call(BASE_CALL_OPTS);
      expect(result).toBe('retry success');
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    });

    it('logs a warning on retry for network errors', async () => {
      // The warn log is triggered in the catch block for retryable errors (503, rate)
      // not for 429 status codes (those are handled in the if-block directly)
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error('503 service unavailable'))
        .mockResolvedValueOnce(makeSuccessResponse('ok'));
      await service.call(BASE_CALL_OPTS);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Retrying OpenRouter call',
        expect.objectContaining({ attempt: 1 }),
        undefined,
      );
    });
  });

  // ─── Timeout handling ───

  describe('call() - timeout', () => {
    it('throws on AbortError (timeout)', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      vi.mocked(fetch).mockRejectedValueOnce(abortError);
      await expect(service.call({ ...BASE_CALL_OPTS, timeoutMs: 100 })).rejects.toThrow('Request timeout');
    });
  });

  // ─── checkHealth ───

  describe('checkHealth()', () => {
    it('returns healthy when models endpoint responds ok', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as unknown as Response);
      const result = await service.checkHealth();
      expect(result.status).toBe('healthy');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('returns unhealthy when models endpoint fails', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      } as unknown as Response);
      const result = await service.checkHealth();
      expect(result.status).toBe('unhealthy');
      expect(result.error).toContain('503');
    });

    it('returns unhealthy when API key is missing', async () => {
      const noKeyService = new OpenRouterService(
        { ...BASE_CONFIG, apiKey: '' },
        mockLogger,
      );
      const result = await noKeyService.checkHealth();
      expect(result.status).toBe('unhealthy');
      expect(result.error).toContain('OPENROUTER_API_KEY');
    });

    it('returns unhealthy when fetch throws', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));
      const result = await service.checkHealth();
      expect(result.status).toBe('unhealthy');
      expect(result.error).toContain('Network error');
    });
  });
});
