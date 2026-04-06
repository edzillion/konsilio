import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Default Personas ───

const DEFAULT_PERSONAS = ["devops", "security", "performance"] as const;

// ─── Type Definitions ───

export type LogLevel = "debug" | "info" | "warn" | "error";
export type NodeEnv = "development" | "production" | "test";

/**
 * TimeoutOrUnlimited - Use a positive number for a timeout, or 'unlimited' for no timeout.
 * Only the string 'unlimited' means no timeout. The value 0 is NOT treated as unlimited.
 */
export type TimeoutOrUnlimited = number | 'unlimited';

/**
 * MaxTokensOrUnlimited - Use a positive number for a token limit, or 'unlimited' for no limit.
 * Only the string 'unlimited' means no limit. The value 0 is NOT treated as unlimited.
 */
export type MaxTokensOrUnlimited = number | 'unlimited';

/**
 * Resolve a timeout value to milliseconds. Returns 0 to mean "no timeout" (no AbortController timer).
 * - 'unlimited' -> 0 (no timeout)
 * - positive number -> that value in ms
 * - 0, negative, or any other value -> falls back to default
 */
export function resolveTimeout(value: TimeoutOrUnlimited, defaultMs: number): number {
  if (value === 'unlimited') return 0;
  if (typeof value === 'number' && value > 0) return value;
  return defaultMs;
}

/**
 * Resolve a maxTokens value. Returns 0 to mean "no limit" (omit from request).
 * - 'unlimited' -> 0 (no limit)
 * - positive number -> that value
 * - 0, negative, or any other value -> falls back to default
 */
export function resolveMaxTokens(value: MaxTokensOrUnlimited, defaultTokens: number): number {
  if (value === 'unlimited') return 0;
  if (typeof value === 'number' && value > 0) return value;
  return defaultTokens;
}

// ─── CLI Args Parsing ───

// Parse CLI args: --api-key=xxx
function parseCliArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--api-key=")) {
      args.OPENROUTER_API_KEY = arg.slice("--api-key=".length);
    }
  }
  return args;
}

const cliArgs = parseCliArgs();

// Priority: CLI args > process.env > fallback
function env(key: string, fallback?: string): string | undefined {
  return cliArgs[key] ?? process.env[key] ?? fallback;
}

// ─── Validators ───

function parseLogLevel(value: string | undefined): LogLevel {
  const validLevels: LogLevel[] = ["debug", "info", "warn", "error"];
  const level = (value ?? "info").toLowerCase() as LogLevel;
  return validLevels.includes(level) ? level : "info";
}

function parseNodeEnv(value: string | undefined): NodeEnv {
  const validEnvs: NodeEnv[] = ["development", "production", "test"];
  const envValue = (value ?? "development").toLowerCase() as NodeEnv;
  return validEnvs.includes(envValue) ? envValue : "development";
}

function parsePositiveInt(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

// ─── Konsilio Config File ───

interface KonsilioConfig {
  personas?: {
    enabled: string[];
  };
  models?: {
    experts?: string;
    lead?: string;
    formatter?: string;
  };
  personaModels?: Record<string, string>;
  timeouts?: {
    expertMs?: TimeoutOrUnlimited;
    leadMs?: TimeoutOrUnlimited;
    formatterMs?: TimeoutOrUnlimited;
  };
  maxTokens?: {
    experts?: MaxTokensOrUnlimited;
    lead?: MaxTokensOrUnlimited;
  };
  maxDraftPlanLength?: number;
  maxHistorySessions?: number;
  databasePath?: string;
  cacheTtlSeconds?: number;
  formatter?: {
    maxRetries?: number;
  };
}

function loadKonsilioConfig(): KonsilioConfig {
  // Search order: project root first, then package directory
  // This allows consuming projects to override package defaults
  const candidates = [
    resolve(process.cwd(), "konsilio.json"),      // Project root (consuming project)
    resolve(__dirname, "..", "konsilio.json"),    // Package directory (defaults)
  ];
  
  for (const configPath of candidates) {
    if (!existsSync(configPath)) continue;
    try {
      const content = readFileSync(configPath, "utf-8");
      return JSON.parse(content);
    } catch {
      // Invalid JSON, continue to next candidate
    }
  }
  return {};
}

const konsilioConfig = loadKonsilioConfig();

// ─── Exported Config ───

export const config = {
  // Server Configuration
  port: parsePositiveInt(env("PORT"), 3000),

  // API Configuration
  openrouterApiKey: env("OPENROUTER_API_KEY") ?? "",
  openrouterBaseUrl: "https://openrouter.ai/api/v1",

  // Environment & Logging
  nodeEnv: parseNodeEnv(env("NODE_ENV")),
  logLevel: parseLogLevel(env("LOG_LEVEL")),
  isProduction: parseNodeEnv(env("NODE_ENV")) === "production",
  isDevelopment: parseNodeEnv(env("NODE_ENV")) === "development",

  // Enabled persona IDs from config file (defaults to devops, security, performance if not specified)
  enabledPersonas: konsilioConfig.personas?.enabled ?? [...DEFAULT_PERSONAS],

  // Model Configuration
  models: {
    experts: konsilioConfig.models?.experts ?? "google/gemini-2.5-flash-lite",
    lead: konsilioConfig.models?.lead ?? "google/gemini-2.5-pro",
    formatter: konsilioConfig.models?.formatter ?? "openai/gpt-4o-mini",
  },

  // Persona-level model defaults (personaId -> model)
  personaModels: konsilioConfig.personaModels ?? {},

  // Timeout Configuration (resolved to numeric ms, 0 = no timeout)
  timeouts: {
    expertMs: resolveTimeout(konsilioConfig.timeouts?.expertMs ?? 90_000, 90_000),
    leadMs: resolveTimeout(konsilioConfig.timeouts?.leadMs ?? 120_000, 120_000),
    formatterMs: resolveTimeout(konsilioConfig.timeouts?.formatterMs ?? 30_000, 30_000),
  },

  // Formatter retries
  formatterMaxRetries: konsilioConfig.formatter?.maxRetries ?? 3,

  // Token limits (resolved to numeric, 0 = no limit / omit from request)
  maxTokens: {
    experts: resolveMaxTokens(konsilioConfig.maxTokens?.experts ?? 4096, 4096),
    lead: resolveMaxTokens(konsilioConfig.maxTokens?.lead ?? 16384, 16384),
  },

  // Limits
  maxDraftPlanLength: konsilioConfig.maxDraftPlanLength ?? 12000,
  maxHistorySessions: konsilioConfig.maxHistorySessions ?? 10,
  maxParallelExperts: 4,

  // Database & Caching
  databasePath: konsilioConfig.databasePath ?? "./data/konsilio.db",
  cacheTtlSeconds: konsilioConfig.cacheTtlSeconds ?? 3600,
} as const;

// ─── Validation ───

/**
 * Validates that required configuration is present.
 * Throws an error if required config is missing.
 */
export function validateConfig(): void {
  if (!config.openrouterApiKey) {
    throw new Error(
      "Missing OPENROUTER_API_KEY. Set it via OPENROUTER_API_KEY environment variable.\n" +
      "Get your key at https://openrouter.ai/keys"
    );
  }

  if (!config.enabledPersonas || config.enabledPersonas.length === 0) {
    throw new Error(
      "Missing enabled personas in konsilio.json. " +
      "Add a 'personas.enabled' array with valid persona IDs. " +
      "Available: security, performance, ux-dx, devops, typescript, graph-dba, node-fullstack, dev-tooling, distributed-systems, test-architect"
    );
  }
}