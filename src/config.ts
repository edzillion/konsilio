import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Type Definitions ───

export type LogLevel = "debug" | "info" | "warn" | "error";
export type NodeEnv = "development" | "production" | "test";

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
  timeouts?: {
    expertMs?: number;
    leadMs?: number;
    formatterMs?: number;
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
  // Resolve relative to this file's location (works in both src/ and build/)
  const candidates = [
    resolve(__dirname, "..", "konsilio.json"),
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

  // Enabled persona IDs from config file (defaults to all if not specified)
  enabledPersonas: konsilioConfig.personas?.enabled,

  // Model Configuration
  models: {
    experts: konsilioConfig.models?.experts ?? "google/gemini-2.5-flash-lite",
    lead: konsilioConfig.models?.lead ?? "google/gemini-2.5-pro",
    formatter: konsilioConfig.models?.formatter ?? "openai/gpt-4o-mini",
  },

  // Timeout Configuration
  timeouts: {
    expertMs: konsilioConfig.timeouts?.expertMs ?? 90_000,
    leadMs: konsilioConfig.timeouts?.leadMs ?? 120_000,
    formatterMs: konsilioConfig.timeouts?.formatterMs ?? 30_000,
  },

  // Formatter retries
  formatterMaxRetries: konsilioConfig.formatter?.maxRetries ?? 3,

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