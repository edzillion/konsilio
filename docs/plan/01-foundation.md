# Phase 1: Project Foundation

## Step 1.1: Initialize Project

```bash
mkdir konsilio && cd konsilio
npm init -y
```

Edit `package.json`:
```json
{
  "name": "konsilio",
  "version": "0.1.0",
  "type": "module",
  "main": "build/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node build/index.js",
    "typecheck": "tsc --noEmit"
  },
  "license": "MIT"
}
```

## Step 1.2: Install Dependencies

```bash
npm install @modelcontextprotocol/sdk zod
npm install -D typescript @types/node
```

> **Note**: No `dotenv`, `axios`, or `nanoid`. See CONTRIBUTIONS_R2.md C3, H1, M1.  
> `better-sqlite3` is installed later in Phase 7.

## Step 1.3: TypeScript Config

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "build"]
}
```

## Step 1.4: Directory Structure

```bash
mkdir -p src/personas src/db
mkdir -p data
```

## Step 1.5: Environment Config

Create `.env.example`:
```env
# Required
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Optional model overrides
EXPERT_MODEL=google/gemini-2.5-flash-lite
LEAD_MODEL=google/gemini-2.5-pro
DEBATE_MODEL=google/gemini-2.5-flash-lite

# Optional
DATABASE_PATH=./data/council.db
DRAFT_PLAN_MAX_LENGTH=12000
MAX_HISTORY_SESSIONS=10
```

Create `.gitignore`:
```
node_modules/
build/
data/
.env
*.log
```

## Step 1.6: Config Module

Create `src/config.ts`:
```typescript
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
      vars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
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

export const config = {
  openrouterApiKey: env("OPENROUTER_API_KEY") ?? "",
  openrouterBaseUrl: "https://openrouter.ai/api/v1",

  models: {
    experts: env("EXPERT_MODEL", "google/gemini-2.5-flash-lite"),
    lead: env("LEAD_MODEL", "google/gemini-2.5-pro"),
    debate: env("DEBATE_MODEL", "google/gemini-2.5-flash-lite"),
  },

  timeouts: {
    expertMs: 90_000,
    leadMs: 120_000,
    debateMs: 60_000,
  },

  maxDraftPlanLength: parseInt(env("DRAFT_PLAN_MAX_LENGTH", "12000") ?? "12000", 10),
  maxHistorySessions: parseInt(env("MAX_HISTORY_SESSIONS", "10") ?? "10", 10),
  maxParallelExperts: 4,
  databasePath: env("DATABASE_PATH", "./data/council.db"),
} as const;
```

## Verification

```bash
npx tsc --noEmit   # Should compile clean
```
