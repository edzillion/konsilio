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

// ─── Environment File Loading ───

function loadEnvFile(): Record<string, string> {
  // Search: cwd first, then script parent dir
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(__dirname, "..", ".env"),
  ];
  
  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue;
    const content = readFileSync(envPath, "utf-8");
    const vars: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      let value = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes (single or double)
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      vars[trimmed.slice(0, eqIdx).trim()] = value;
    }
    return vars;
  }
  return {};
}

const fileEnv = loadEnvFile();

// Priority: CLI args > process.env > .env file > fallback
function env(key: string, fallback?: string): string | undefined {
  return cliArgs[key] ?? process.env[key] ?? fileEnv[key] ?? fallback;
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
  };
  timeouts?: {
    expertMs?: number;
    leadMs?: number;
  };
  maxDraftPlanLength?: number;
  maxHistorySessions?: number;
  databasePath?: string;
}

function loadKonsilioConfig(): KonsilioConfig {
  const candidates = [
    resolve(process.cwd(), "konsilio.json"),
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
  enabledPersonas: konsilioConfig.personas?.enabled ?? ["securityArchitect", "performanceEngineer", "uxDxDesigner", "devopsEngineer"],

  // Model Configuration
  models: {
    experts: env("EXPERT_MODEL") ?? konsilioConfig.models?.experts ?? "google/gemini-2.5-flash-lite",
    lead: env("LEAD_MODEL") ?? konsilioConfig.models?.lead ?? "google/gemini-2.5-pro",
  },

  // Timeout Configuration
  timeouts: {
    expertMs: konsilioConfig.timeouts?.expertMs ?? 90_000,
    leadMs: konsilioConfig.timeouts?.leadMs ?? 120_000,
  },

  // Limits
  maxDraftPlanLength: konsilioConfig.maxDraftPlanLength ?? parsePositiveInt(env("DRAFT_PLAN_MAX_LENGTH"), 12000),
  maxHistorySessions: konsilioConfig.maxHistorySessions ?? parsePositiveInt(env("MAX_HISTORY_SESSIONS"), 10),
  maxParallelExperts: 4,

  // Database & Caching
  databasePath: konsilioConfig.databasePath ?? env("DATABASE_PATH", "./data/konsilio.db") ?? "./data/konsilio.db",
  cacheTtlSeconds: parsePositiveInt(env("CACHE_TTL_SECONDS"), 3600),
} as const;

// ─── Validation ───

/**
 * Validates that required configuration is present.
 * Throws an error if OPENROUTER_API_KEY is not set.
 */
export function validateConfig(): void {
  if (!config.openrouterApiKey) {
    throw new Error(
      "Missing OPENROUTER_API_KEY. Set it in your .env file or via OPENROUTER_API_KEY environment variable.\n" +
      "Get your key at https://openrouter.ai/keys"
    );
  }
}
