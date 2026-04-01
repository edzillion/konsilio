#!/usr/bin/env node
/**
 * HTTP Server with Dependency Injection
 * 
 * Provides:
 * - /health - Health check for SQLite and OpenRouter connectivity
 * - /analyze - Council analysis endpoint
 * 
 * Uses correlation IDs for request tracing and structured JSON logging.
 */

// ─── Load .env for local development ─────────────────────────────────────────
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { LogWriter, Logger, createLogger } from './logger.js';
import { getServices, type AppServices } from './container.js';
import { config, validateConfig } from './config.js';

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

// ─── HTTP Server ───

export function createHttpServer(services: AppServices, logger: Logger) {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const correlationId = randomUUID();
    const log = logger.withCorrelationId(correlationId);

    log.info('Request received', { method: req.method, url: req.url });

    // Set default headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Correlation-Id', correlationId);

    const url = req.url?.split('?')[0] ?? '/';

    try {
      if (url === '/health' && req.method === 'GET') {
        await handleHealth(req, res, services, log);
      } else if (url === '/analyze' && req.method === 'POST') {
        await handleAnalyze(req, res, services, log);
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not Found', correlationId }));
      }
    } catch (err) {
      log.error('Request failed', { error: err instanceof Error ? err.message : String(err) });
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Internal Server Error', correlationId }));
    }
  });

  return server;
}

// ─── Route Handlers ───

async function handleHealth(
  _req: IncomingMessage,
  res: ServerResponse,
  services: AppServices,
  log: LogWriter
): Promise<void> {
  log.debug('Health check started');

  const [dbHealth, orHealth] = await Promise.all([
    Promise.resolve(services.databaseService.checkHealth()),
    services.openRouterService.checkHealth(),
  ]);

  const allHealthy = dbHealth.status === 'healthy' && orHealth.status === 'healthy';

  const result: HealthCheckResult = {
    database: dbHealth,
    openrouter: orHealth,
  };

  if (allHealthy) {
    res.statusCode = 200;
    log.info('Health check passed', { database: result.database.status, openrouter: result.openrouter.status });
  } else {
    res.statusCode = 503;
    log.warn('Health check failed', { database: result.database.status, openrouter: result.openrouter.status });
  }

  res.end(JSON.stringify({
    status: allHealthy ? 'healthy' : 'unhealthy',
    checks: result,
  }, null, 2));
}

async function handleAnalyze(
  req: IncomingMessage,
  res: ServerResponse,
  services: AppServices,
  log: LogWriter
): Promise<void> {
  const body = await readBody(req);

  let parsed: { draft_plan?: string; tech_stack?: string; context_constraints?: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  if (!parsed.draft_plan?.trim()) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'draft_plan is required and cannot be empty' }));
    return;
  }

  try {
    const result = await services.councilService.run(
      {
        draftPlan: parsed.draft_plan,
        techStack: parsed.tech_stack,
        contextConstraints: parsed.context_constraints,
      }
    );
    
    res.statusCode = 200;
    res.end(JSON.stringify({
      session_id: result.sessionId,
      expert_reports: result.expertReports.map(r => ({
        persona_id: r.personaId,
        persona_name: r.personaName,
        persona_emoji: r.personaEmoji,
        structured_output: r.structuredOutput,
        duration_ms: r.durationMs,
        model_used: r.modelUsed,
      })),
      extraction_output: result.extractionOutput,
      critique_output: result.critiqueOutput,
      decision_output: result.decisionOutput,
      synthesis_output: result.synthesisOutput,
      final_blueprint: result.finalBlueprint,
      consolidation_model: result.consolidationModel,
      total_duration_ms: result.totalDurationMs,
    }, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error('Analysis failed', { error: message });
    res.statusCode = 500;
    res.end(JSON.stringify({ error: message }));
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// ─── Main Entry Point ───

export async function main(): Promise<void> {
  // Validate configuration
  validateConfig();

  // Create logger
  const logger = createLogger(config.logLevel);

  // Get services from container (async due to WASM loading)
  const services = await getServices();

  // Create HTTP server
  const server = createHttpServer(services, logger);

  server.listen(config.port, () => {
    logger.info('Server started', { port: config.port, nodeEnv: config.nodeEnv });
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Shutting down (SIGINT)');
    services.databaseService.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Shutting down (SIGTERM)');
    services.databaseService.close();
    process.exit(0);
  });
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}