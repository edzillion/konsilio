/**
 * Database Service
 * 
 * Provides SQLite database operations for session persistence.
 * Designed for dependency injection to enable testing.
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Logger } from '../logger.js';
import type { CouncilResult } from '../personas/types.js';

export interface DatabaseServiceConfig {
  dbPath: string;
  maxHistorySessions?: number;
}

export interface SessionSummary {
  id: string;
  created_at: string;
  draft_plan_summary: string | null;
  tech_stack: string | null;
  debate_mode: number;
}

/**
 * DatabaseService - Handles SQLite persistence
 */
export class DatabaseService {
  private db: Database.Database | null = null;
  private readonly dbPath: string;
  private readonly maxHistorySessions: number;
  private readonly logger: Logger;

  constructor(config: DatabaseServiceConfig, logger: Logger, schema: string) {
    this.dbPath = config.dbPath;
    this.maxHistorySessions = config.maxHistorySessions ?? 10;
    this.logger = logger;
    this.initialize(schema);
  }

  /**
   * Initialize database connection
   */
  private initialize(schema: string): void {
    try {
      mkdirSync(dirname(this.dbPath), { recursive: true });
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.db.exec(schema);
      this.logger.info('Database service initialized', { path: this.dbPath });
    } catch (err) {
      this.logger.error('Failed to initialize database service', {
        path: this.dbPath,
        error: err instanceof Error ? err.message : String(err)
      });
      throw err;
    }
  }

  /**
   * Check database health
   */
  checkHealth(): { status: 'healthy' | 'unhealthy'; latencyMs: number; error?: string } {
    const start = Date.now();

    if (!this.db) {
      return { status: 'unhealthy', latencyMs: 0, error: 'Database not initialized' };
    }

    try {
      this.db.prepare('SELECT 1').get();
      return { status: 'healthy', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'unhealthy', latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
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
    correlationId?: string
  ): void {
    if (!this.db) {
      this.logger.warn('Database not initialized, skipping save', {}, correlationId);
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
      this.pruneOldSessions();
      this.logger.debug('Council result saved', { sessionId: result.sessionId }, correlationId);
    } catch (err) {
      this.logger.error('Failed to save council result', {
        sessionId: result.sessionId,
        error: err instanceof Error ? err.message : String(err),
      }, correlationId);
    }
  }

  /**
   * Get recent sessions
   */
  getRecentSessions(limit: number = 10): SessionSummary[] {
    if (!this.db) return [];
    return this.db.prepare(`
      SELECT id, created_at, draft_plan_summary, tech_stack, debate_mode
      FROM sessions ORDER BY created_at DESC LIMIT ?
    `).all(limit) as SessionSummary[];
  }

  /**
   * Get a session's blueprint
   */
  getSessionBlueprint(sessionId: string): string | null {
    if (!this.db) return null;
    const row = this.db.prepare(`
      SELECT content FROM messages
      WHERE session_id = ? AND role = 'assistant' AND persona_id = 'lead'
      ORDER BY created_at DESC LIMIT 1
    `).get(sessionId) as { content: string } | undefined;
    return row?.content ?? null;
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.logger.info('Database service closed');
    }
  }

  private pruneOldSessions(): void {
    if (!this.db) return;
    this.db.prepare(`
      DELETE FROM sessions WHERE id NOT IN (
        SELECT id FROM sessions ORDER BY created_at DESC LIMIT ?
      )
    `).run(this.maxHistorySessions);
  }
}