#!/usr/bin/env node
/**
 * HTTP Server with Dependency Injection Composition Root
 * 
 * Provides:
 * - /health - Health check for SQLite and OpenRouter connectivity
 * - /analyze - Council analysis endpoint
 * 
 * Uses correlation IDs for request tracing and structured JSON logging.
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { LogWriter, Logger, createLogger } from './logger.js';
import { SQLiteGateway, OpenRouterGateway, type HealthCheckResult } from './gateway.js';
import { CacheService } from './cache.js';
import { CouncilOrchestrator, type CouncilParams, type CouncilOptions } from './orchestrator.js';
import { expertPersonas, leadArchitect } from './personas/index.js';
import { SCHEMA } from './db/schema.js';
import { config, validateConfig } from './config.js';

// ─── Composition Root ───

interface AppDeps {
  config: typeof config;
  logger: Logger;
  sqliteGateway: SQLiteGateway;
  openRouterGateway: OpenRouterGateway;
  cacheService: CacheService;
  orchestrator: CouncilOrchestrator;
}

function composeDependencies(): AppDeps {
  // Validate configuration
  validateConfig();

  // Logger
  const logger = createLogger(config.logLevel);

  // SQLite Gateway
  const sqliteGateway = new SQLiteGateway(config.databasePath, logger);
  sqliteGateway.initialize(SCHEMA);

  // OpenRouter Gateway
  const openRouterGateway = new OpenRouterGateway(
    config.openrouterApiKey,
    config.openrouterBaseUrl,
    logger
  );

  // Cache Service (uses cacheTtlSeconds from config, converted to milliseconds)
  const cacheService = new CacheService(config.cacheTtlSeconds * 1000);

  // Council Orchestrator
  const orchestrator = new CouncilOrchestrator({
    logger,
    sqliteGateway,
    openRouterGateway,
    cacheService,
    expertPersonas,
    leadPersona: leadArchitect,
    config: {
      enabledPersonaIds: config.enabledPersonas,
      models: config.models,
      timeouts: config.timeouts,
      maxDraftPlanLength: config.maxDraftPlanLength,
    },
  });

  return { config, logger, sqliteGateway, openRouterGateway, cacheService, orchestrator };
}

// ─── HTTP Server ───

export function createHttpServer(deps: AppDeps) {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const correlationId = randomUUID();
    const log = deps.logger.withCorrelationId(correlationId);

    log.info('Request received', { method: req.method, url: req.url });

    // Set default headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Correlation-Id', correlationId);

    const url = req.url?.split('?')[0] ?? '/';

    try {
      if (url === '/health' && req.method === 'GET') {
        await handleHealth(req, res, deps, log);
      } else if (url === '/analyze' && req.method === 'POST') {
        await handleAnalyze(req, res, deps, log);
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
  deps: AppDeps,
  log: LogWriter
): Promise<void> {
  log.debug('Health check started');

  const [dbHealth, orHealth] = await Promise.all([
    Promise.resolve(deps.sqliteGateway.checkHealth()),
    deps.openRouterGateway.checkHealth(),
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
  deps: AppDeps,
  log: LogWriter
): Promise<void> {
  const body = await readBody(req);

  let parsed: { draft_plan?: string; tech_stack?: string; context_constraints?: string; debate_mode?: boolean };
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

  const params: CouncilParams = {
    draftPlan: parsed.draft_plan,
    techStack: parsed.tech_stack,
    contextConstraints: parsed.context_constraints,
  };

  const options: CouncilOptions = {
    debateMode: parsed.debate_mode ?? false,
  };

  try {
    const result = await deps.orchestrator.run(params, options);
    res.statusCode = 200;
    res.end(JSON.stringify({
      session_id: result.sessionId,
      expert_reports: result.expertReports.map(r => ({
        persona_id: r.personaId,
        persona_name: r.personaName,
        persona_emoji: r.personaEmoji,
        content: r.content,
        duration_ms: r.durationMs,
        model_used: r.modelUsed,
      })),
      debate_reports: result.debateReports?.map(r => ({
        persona_id: r.personaId,
        persona_name: r.personaName,
        persona_emoji: r.personaEmoji,
        content: r.content,
        duration_ms: r.durationMs,
        model_used: r.modelUsed,
      })),
      final_blueprint: result.finalBlueprint,
      lead_model: result.leadModel,
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

export function main(): void {
  const deps = composeDependencies();
  const server = createHttpServer(deps);

  server.listen(deps.config.port, () => {
    deps.logger.info('Server started', { port: deps.config.port, nodeEnv: deps.config.nodeEnv });
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    deps.logger.info('Shutting down (SIGINT)');
    deps.sqliteGateway.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    deps.logger.info('Shutting down (SIGTERM)');
    deps.sqliteGateway.close();
    process.exit(0);
  });
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
