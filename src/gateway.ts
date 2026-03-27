/**
 * Gateway Abstractions for External Systems
 * 
 * Provides clean interfaces for database and API integrations.
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { LogWriter, Logger } from './logger.js';

import type { CouncilResult } from './personas/types.js';
import type { Message } from './openrouter.js';

// ─── Health Check Types ───

export interface ComponentHealth {
  status: 'healthy' | 'unhealthy';
  latencyMs: number;
  error?: string;
}

export interface HealthCheckResult {
  database: ComponentHealth;
  openrouter: ComponentHealth;
}

// ─── Session Data Types ───

export interface SessionSummary {
  id: string;
  created_at: string;
  draft_plan_summary: string | null;
  tech_stack: string | null;
  debate_mode: number;
}

// ─── SQLite Gateway ───

export class SQLiteGateway {
  private db: Database.Database | null = null;
  private readonly dbPath: string;
  private readonly logger: Logger;

  constructor(dbPath: string, logger: Logger) {
    this.dbPath = dbPath;
    this.logger = logger;
  }

  /**
   * Initialize database connection
   */
  initialize(schema: string): void {
    if (this.db) return;

    try {
      mkdirSync(dirname(this.dbPath), { recursive: true });
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.db.exec(schema);
      this.logger.info('SQLite gateway initialized', { path: this.dbPath });
    } catch (err) {
      this.logger.error('Failed to initialize SQLite gateway', { 
        path: this.dbPath, 
        error: err instanceof Error ? err.message : String(err) 
      });
      throw err;
    }
  }

  /**
   * Check database health by running a simple query
   */
  checkHealth(): ComponentHealth {
    const start = Date.now();
    
    if (!this.db) {
      return {
        status: 'unhealthy',
        latencyMs: 0,
        error: 'Database not initialized',
      };
    }

    try {
      this.db.prepare('SELECT 1').get();
      return {
        status: 'healthy',
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Save a council session result
   */
  saveCouncilResult(
    result: CouncilResult,
    draftPlan: string,
    techStack?: string,
    constraints?: string,
    correlatedLogger?: LogWriter,
  ): void {
    const log = correlatedLogger ?? this.logger;
    
    if (!this.db) {
      log.warn('Database not initialized, skipping save');
      return;
    }

    try {
      const tx = this.db.transaction(() => {
        this.db!.prepare(`
          INSERT INTO sessions (id, draft_plan_summary, tech_stack, constraints, debate_mode)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          result.sessionId,
          draftPlan.slice(0, 500),
          techStack ?? null,
          constraints ?? null,
          result.debateReports ? 1 : 0,
        );

        this.db!.prepare(`
          INSERT INTO messages (session_id, role, content)
          VALUES (?, 'user', ?)
        `).run(result.sessionId, draftPlan);

        for (const r of result.expertReports) {
          this.db!.prepare(`
            INSERT INTO expert_reports (session_id, persona_id, persona_name, persona_emoji, content, duration_ms, model_used, is_debate)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0)
          `).run(result.sessionId, r.personaId, r.personaName, r.personaEmoji, r.content, r.durationMs, r.modelUsed);
        }

        if (result.debateReports) {
          for (const r of result.debateReports) {
            this.db!.prepare(`
              INSERT INTO expert_reports (session_id, persona_id, persona_name, persona_emoji, content, duration_ms, model_used, is_debate)
              VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            `).run(result.sessionId, r.personaId, r.personaName, r.personaEmoji, r.content, r.durationMs, r.modelUsed);
          }
        }

        this.db!.prepare(`
          INSERT INTO messages (session_id, role, persona_id, content)
          VALUES (?, 'assistant', 'lead', ?)
        `).run(result.sessionId, result.finalBlueprint);
      });

      tx();
      this.pruneOldSessions(10);
      log.debug('Council result saved', { sessionId: result.sessionId });
    } catch (err) {
      log.error('Failed to save council result', {
        sessionId: result.sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  getRecentSessions(limit: number = 10): SessionSummary[] {
    if (!this.db) return [];
    return this.db.prepare(`
      SELECT id, created_at, draft_plan_summary, tech_stack, debate_mode
      FROM sessions ORDER BY created_at DESC LIMIT ?
    `).all(limit) as SessionSummary[];
  }

  getSessionBlueprint(sessionId: string): string | null {
    if (!this.db) return null;
    const row = this.db.prepare(`
      SELECT content FROM messages
      WHERE session_id = ? AND role = 'assistant' AND persona_id = 'lead'
      ORDER BY created_at DESC LIMIT 1
    `).get(sessionId) as { content: string } | undefined;
    return row?.content ?? null;
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.logger.info('SQLite gateway closed');
    }
  }

  private pruneOldSessions(maxSessions: number): void {
    if (!this.db) return;
    this.db.prepare(`
      DELETE FROM sessions WHERE id NOT IN (
        SELECT id FROM sessions ORDER BY created_at DESC LIMIT ?
      )
    `).run(maxSessions);
  }
}

// ─── OpenRouter Gateway ───

interface OpenRouterChoice {
  message: { content: string };
}

interface OpenRouterResponse {
  choices: OpenRouterChoice[];
  error?: { message: string; code: number };
}

export interface OpenRouterCallOptions {
  model: string;
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export class OpenRouterGateway {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly logger: Logger;
  private readonly maxRetries = 3;
  private readonly baseDelay = 1000;

  constructor(apiKey: string, baseUrl: string, logger: Logger) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.logger = logger;
  }

  async checkHealth(): Promise<ComponentHealth> {
    const start = Date.now();

    if (!this.apiKey) {
      return {
        status: 'unhealthy',
        latencyMs: 0,
        error: 'OPENROUTER_API_KEY not configured',
      };
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
        return {
          status: 'unhealthy',
          latencyMs: Date.now() - start,
          error: `HTTP ${res.status}: ${res.statusText}`,
        };
      }
    } catch (err) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

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
            await this.delay(this.baseDelay * Math.pow(2, attempt));
            continue;
          }
          throw new Error('Rate limited by OpenRouter.');
        }

        const data = (await res.json()) as OpenRouterResponse;
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
          await this.delay(this.baseDelay * Math.pow(2, attempt));
          continue;
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error('Max retries exceeded.');
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