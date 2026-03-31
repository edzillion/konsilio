/**
 * Dependency Injection Container
 * 
 * Composition root that wires up all services with their dependencies.
 * This is the single place where all dependencies are created and connected.
 */

import { logger } from './logger.js';
import { config, validateConfig } from './config.js';
import { SCHEMA } from './db/schema.js';
import { OpenRouterService } from './services/openrouter.service.js';
import { DatabaseService } from './services/database.service.js';
import { CacheService } from './services/cache.service.js';
import { PromptService } from './services/prompt.service.js';
import { PersonaService } from './services/persona.service.js';
import { CouncilService, type CouncilConfig } from './services/council.service.js';
import { FormatterService, type FormatterConfig } from './services/formatter.service.js';

export interface AppServices {
  openRouterService: OpenRouterService;
  databaseService: DatabaseService;
  cacheService: CacheService;
  promptService: PromptService;
  personaService: PersonaService;
  councilService: CouncilService;
}

/**
 * Create and wire up all application services
 */
export function createServices(): AppServices {
  // Validate configuration before creating services
  validateConfig();

  // Create OpenRouter service
  const openRouterService = new OpenRouterService(
    {
      apiKey: config.openrouterApiKey,
      baseUrl: config.openrouterBaseUrl,
    },
    logger,
  );

  // Create Database service
  const databaseService = new DatabaseService(
    {
      dbPath: config.databasePath,
      maxHistorySessions: config.maxHistorySessions,
    },
    logger,
    SCHEMA,
  );

  // Create Cache service
  const cacheService = new CacheService(config.cacheTtlSeconds * 1000);

  // Create Prompt service
  const promptService = new PromptService(undefined, logger);

  // Create Persona service
  const personaService = new PersonaService({
    promptService,
    cacheService,
    logger,
  });

  // Create Council service with all dependencies
  // Note: validateConfig() ensures enabledPersonas is defined
  const councilConfig: CouncilConfig = {
    enabledPersonaIds: config.enabledPersonas!,
    models: config.models,
    timeouts: config.timeouts,
    maxDraftPlanLength: config.maxDraftPlanLength,
    formatterMaxRetries: config.formatterMaxRetries,
  };

  // Create Formatter service
  const formatterConfig: FormatterConfig = {
    model: config.models.formatter,
    timeoutMs: config.timeouts.formatterMs,
    maxRetries: config.formatterMaxRetries,
  };

  const formatterService = new FormatterService({
    openRouterService,
    logger,
    config: formatterConfig,
  });

  const councilService = new CouncilService({
    logger,
    openRouterService,
    databaseService,
    cacheService,
    promptService,
    personaService,
    formatterService,
    config: councilConfig,
  });

  return {
    openRouterService,
    databaseService,
    cacheService,
    promptService,
    personaService,
    councilService,
  };
}

/**
 * Singleton services instance (lazy initialized)
 */
let _services: AppServices | null = null;

/**
 * Get the singleton services instance
 */
export function getServices(): AppServices {
  if (!_services) {
    _services = createServices();
  }
  return _services;
}

/**
 * Reset services (useful for testing)
 */
export function resetServices(): void {
  _services = null;
}