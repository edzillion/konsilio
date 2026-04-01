/**
 * Database Service
 * 
 * Provides SQLite database operations for session persistence using sql.js (WASM).
 * Designed for dependency injection to enable testing.
 */

import initSqlJs, { type Database } from 'sql.js';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Logger } from '../logger.js';
import type { CouncilResult } from '../personas/schemas.js';

export interface DatabaseServiceConfig {
  dbPath: string;
  maxHistorySessions?: number;
}

export interface SessionSummary {
  id: string;
  created_at: string;
  draft_plan_summary: string | null;
  tech_stack: string | null;
}

/**
 * DatabaseService - Handles SQLite persistence via sql.js (WASM)
 * 
 * Uses an in-memory database that is loaded from / saved to disk.
 * All queries run against the in-memory copy; changes are persisted
 * explicitly after writes.
 */
export class DatabaseService {
  private db: Database | null = null;
  private readonly dbPath: string;
  private readonly maxHistorySessions: number;
  private readonly logger: Logger;

  private constructor(config: DatabaseServiceConfig, logger: Logger) {
    this.dbPath = config.dbPath;
    this.maxHistorySessions = config.maxHistorySessions ?? 10;
    this.logger = logger;
  }

  /**
   * Factory method to create and initialize the DatabaseService.
   * Async because sql.js WASM loading and DB file reading are async.
   */
  static async create(config: DatabaseServiceConfig, logger: Logger, schema: string): Promise<DatabaseService> {
    const service = new DatabaseService(config, logger);
    await service.initialize(schema);
    return service;
  }

  /**
   * Initialize database: load WASM, read existing DB file (or create new), apply schema
   */
  private async initialize(schema: string): Promise<void> {
    try {
      // In Node.js, sql.js auto-locates the WASM file from node_modules.
      // No locateFile needed - per sql.js docs: "You can omit locateFile completely when running in node"
      const SQL = await initSqlJs();

      mkdirSync(dirname(this.dbPath), { recursive: true });

      if (existsSync(this.dbPath)) {
        const buffer = readFileSync(this.dbPath);
        this.db = new SQL.Database(buffer);
      } else {
        this.db = new SQL.Database();
      }

      // Apply schema (idempotent — uses IF NOT EXISTS)
      this.db.run(schema);
      this.save();

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
   * Persist the in-memory database to disk
   */
  private save(): void {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    writeFileSync(this.dbPath, buffer);
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
      this.db.exec('SELECT 1');
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
      // Save session
      this.db.run(
        `INSERT INTO sessions (id, draft_plan_summary, tech_stack, constraints) VALUES (?, ?, ?, ?)`,
        [result.sessionId, draftPlan.slice(0, 500), techStack ?? null, constraints ?? null]
      );

      // Save user message
      this.db.run(
        `INSERT INTO messages (session_id, role, content) VALUES (?, 'user', ?)`,
        [result.sessionId, draftPlan]
      );

      // Save expert findings
      for (const report of result.expertReports) {
        for (const finding of report.structuredOutput.findings) {
          const decision = result.decisionOutput.decisions.find(d => d.findingId === finding.id);
          const accepted = decision?.action === 'ACCEPT' ? 1 : 0;
          const rejectionReason = decision?.action === 'REJECT' ? decision.reasoning : null;

          this.db.run(
            `INSERT INTO expert_findings (
              id, session_id, persona_id, persona_name, persona_emoji,
              severity, component, issue, mitigation, accepted, rejection_reason,
              duration_ms, model_used
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              finding.id,
              result.sessionId,
              report.personaId,
              report.personaName,
              report.personaEmoji,
              finding.severity,
              finding.component,
              finding.issue,
              finding.mitigation,
              accepted,
              rejectionReason,
              report.durationMs,
              report.modelUsed
            ]
          );
        }

        // Save expert risks
        for (const risk of report.structuredOutput.risks) {
          this.db.run(
            `INSERT INTO expert_risks (
              id, session_id, persona_id, category, probability, impact, description
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              risk.id,
              result.sessionId,
              report.personaId,
              risk.category,
              risk.probability,
              risk.impact,
              risk.description
            ]
          );
        }
      }

      // Save consolidation phase outputs
      this.db.run(
        `INSERT INTO consolidation_phases (session_id, phase_name, phase_output) VALUES (?, 'extraction', ?)`,
        [result.sessionId, JSON.stringify(result.extractionOutput)]
      );

      this.db.run(
        `INSERT INTO consolidation_phases (session_id, phase_name, phase_output) VALUES (?, 'critique', ?)`,
        [result.sessionId, JSON.stringify(result.critiqueOutput)]
      );

      this.db.run(
        `INSERT INTO consolidation_phases (session_id, phase_name, phase_output) VALUES (?, 'decision', ?)`,
        [result.sessionId, JSON.stringify(result.decisionOutput)]
      );

      this.db.run(
        `INSERT INTO consolidation_phases (session_id, phase_name, phase_output) VALUES (?, 'synthesis', ?)`,
        [result.sessionId, JSON.stringify(result.synthesisOutput)]
      );

      // Save final blueprint as assistant message
      this.db.run(
        `INSERT INTO messages (session_id, role, persona_id, content) VALUES (?, 'assistant', 'consolidation', ?)`,
        [result.sessionId, result.finalBlueprint]
      );

      this.save();
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

    const result = this.db.exec(`
      SELECT id, created_at, draft_plan_summary, tech_stack
      FROM sessions ORDER BY created_at DESC LIMIT ${limit}
    `);

    if (result.length === 0) return [];

    const columns = result[0].columns;
    const rows: SessionSummary[] = [];

    for (const values of result[0].values) {
      const row: Record<string, unknown> = {};
      for (let i = 0; i < columns.length; i++) {
        row[columns[i]] = values[i];
      }
      rows.push(row as unknown as SessionSummary);
    }

    return rows;
  }

  /**
   * Get a session's blueprint
   */
  getSessionBlueprint(sessionId: string): string | null {
    if (!this.db) return null;

    const result = this.db.exec(`
      SELECT content FROM messages
      WHERE session_id = '${sessionId.replace(/'/g, "''")}' AND role = 'assistant' AND persona_id = 'consolidation'
      ORDER BY created_at DESC LIMIT 1
    `);

    if (result.length === 0 || result[0].values.length === 0) return null;
    return result[0].values[0][0] as string;
  }

  /**
   * Close database (no-op for sql.js, but we clear the reference)
   */
  close(): void {
    if (this.db) {
      this.save();
      this.db.close();
      this.db = null;
      this.logger.info('Database service closed');
    }
  }

  private pruneOldSessions(): void {
    if (!this.db) return;
    this.db.run(
      `DELETE FROM sessions WHERE id NOT IN (
        SELECT id FROM sessions ORDER BY created_at DESC LIMIT ?
      )`,
      [this.maxHistorySessions]
    );
    this.save();
  }
}