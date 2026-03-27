import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

// ─── Konsilio Config File ───

interface KonsilioConfig {
  personas?: {
    enabled: string[];
  };
  models?: {
    experts?: string;
    lead?: string;
    debate?: string;
  };
  timeouts?: {
    expertMs?: number;
    leadMs?: number;
    debateMs?: number;
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
  openrouterApiKey: env("OPENROUTER_API_KEY") ?? "",
  openrouterBaseUrl: "https://openrouter.ai/api/v1",

  // Enabled persona IDs from config file (defaults to all if not specified)
  enabledPersonas: konsilioConfig.personas?.enabled ?? ["security", "performance", "ux-dx", "devops"],

  models: {
    experts: env("EXPERT_MODEL") ?? konsilioConfig.models?.experts ?? "google/gemini-2.5-flash-lite",
    lead: env("LEAD_MODEL") ?? konsilioConfig.models?.lead ?? "google/gemini-2.5-pro",
    debate: env("DEBATE_MODEL") ?? konsilioConfig.models?.debate ?? "google/gemini-2.5-flash-lite",
  },

  timeouts: {
    expertMs: konsilioConfig.timeouts?.expertMs ?? 90_000,
    leadMs: konsilioConfig.timeouts?.leadMs ?? 120_000,
    debateMs: konsilioConfig.timeouts?.debateMs ?? 60_000,
  },

  maxDraftPlanLength: konsilioConfig.maxDraftPlanLength ?? parseInt(env("DRAFT_PLAN_MAX_LENGTH", "12000") ?? "12000", 10),
  maxHistorySessions: konsilioConfig.maxHistorySessions ?? parseInt(env("MAX_HISTORY_SESSIONS", "10") ?? "10", 10),
  maxParallelExperts: 4,
  databasePath: konsilioConfig.databasePath ?? env("DATABASE_PATH", "./data/council.db") ?? "./data/council.db",
} as const;