/**
 * OpenRouter Service
 * 
 * Provides LLM API calls through OpenRouter with retry logic and error handling.
 * Designed for dependency injection to enable testing.
 */

import type { Logger } from '../logger.js';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterCallOptions {
  model: string;
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface OpenRouterServiceConfig {
  apiKey: string;
  baseUrl: string;
  maxRetries?: number;
  baseDelayMs?: number;
}

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message: string };
}

/**
 * OpenRouterService - Handles LLM API calls
 */
export class OpenRouterService {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly logger: Logger;

  constructor(config: OpenRouterServiceConfig, logger: Logger) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.maxRetries = config.maxRetries ?? 3;
    this.baseDelayMs = config.baseDelayMs ?? 1000;
    this.logger = logger;
  }

  /**
   * Call the OpenRouter API
   */
  async call(opts: OpenRouterCallOptions, correlationId?: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error(
        'Missing OPENROUTER_API_KEY. Set it in your .env file.\n' +
        'Get your key at https://openrouter.ai/keys'
      );
    }

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 90_000);

      try {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/konsilio',
            'X-Title': 'Konsilio Council',
          },
          body: JSON.stringify({
            model: opts.model,
            messages: opts.messages,
            max_tokens: opts.maxTokens ?? 4096,
            temperature: opts.temperature ?? 0.3,
          }),
          signal: controller.signal,
        });

        if (res.status === 401) throw new Error('Unauthorized: Invalid OpenRouter API key.');
        if (res.status === 402) throw new Error('No credits remaining on OpenRouter.');
        if (res.status === 429) {
          if (attempt < this.maxRetries - 1) {
            await this.delay(this.baseDelayMs * Math.pow(2, attempt));
            continue;
          }
          throw new Error('Rate limited by OpenRouter.');
        }

        const data = await res.json() as OpenRouterResponse;
        if (data.error) throw new Error(`OpenRouter error: ${data.error.message}`);

        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error('Empty response from OpenRouter.');

        this.logger.debug('OpenRouter call successful', { model: opts.model }, correlationId);
        return content;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error(`Request timeout (>${(opts.timeoutMs ?? 90_000) / 1000}s).`);
        }
        if (this.isRetryable(err) && attempt < this.maxRetries - 1) {
          this.logger.warn('Retrying OpenRouter call', { attempt: attempt + 1 }, correlationId);
          await this.delay(this.baseDelayMs * Math.pow(2, attempt));
          continue;
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error('Max retries exceeded.');
  }

  /**
   * Check API health by calling the models endpoint
   */
  async checkHealth(): Promise<{ status: 'healthy' | 'unhealthy'; latencyMs: number; error?: string }> {
    const start = Date.now();

    if (!this.apiKey) {
      return { status: 'unhealthy', latencyMs: 0, error: 'OPENROUTER_API_KEY not configured' };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok) {
        return { status: 'healthy', latencyMs: Date.now() - start };
      } else {
        return { status: 'unhealthy', latencyMs: Date.now() - start, error: `HTTP ${res.status}: ${res.statusText}` };
      }
    } catch (err) {
      return { status: 'unhealthy', latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return msg.includes('429') || msg.includes('503') || msg.includes('rate');
    }
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}