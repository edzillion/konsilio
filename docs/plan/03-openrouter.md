# Phase 3: OpenRouter Gateway

## Step 3.1: Create OpenRouter Client

Create `src/openrouter.ts`:
```typescript
import { config } from "./config.js";

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenRouterChoice {
  message: { content: string };
}

interface OpenRouterResponse {
  choices: OpenRouterChoice[];
  error?: { message: string; code: number };
}

export interface CallOptions {
  model: string;
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes("429") || msg.includes("503") || msg.includes("rate");
  }
  return false;
}

export async function callOpenRouter(opts: CallOptions): Promise<string> {
  const apiKey = config.openrouterApiKey;
  if (!apiKey) {
    throw new Error(
      "Missing OPENROUTER_API_KEY. Set it in your .env or Cline MCP config.\n" +
      "Get your key at https://openrouter.ai/keys"
    );
  }

  const maxRetries = 3;
  const baseDelay = 1000;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 90_000);

    try {
      const res = await fetch(`${config.openrouterBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/konsilio",
          "X-Title": "Council MCP",
        },
        body: JSON.stringify({
          model: opts.model,
          messages: opts.messages,
          max_tokens: opts.maxTokens ?? 4096,
          temperature: opts.temperature ?? 0.3,
        }),
        signal: controller.signal,
      });

      if (res.status === 401) {
        throw new Error("Unauthorized: Invalid OpenRouter API key.");
      }
      if (res.status === 402) {
        throw new Error("No credits remaining on OpenRouter. Top up at https://openrouter.ai/credits");
      }
      if (res.status === 429) {
        if (attempt < maxRetries - 1) {
          await delay(baseDelay * Math.pow(2, attempt));
          continue;
        }
        throw new Error("Rate limited by OpenRouter. Wait and try again.");
      }

      const data = (await res.json()) as OpenRouterResponse;

      if (data.error) {
        throw new Error(`OpenRouter error: ${data.error.message}`);
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Empty response from OpenRouter.");
      }

      return content;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(
          `Request timeout (>${(opts.timeoutMs ?? 90_000) / 1000}s). Try simplifying your plan.`
        );
      }
      if (isRetryable(err) && attempt < maxRetries - 1) {
        await delay(baseDelay * Math.pow(2, attempt));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeout);  // Always clean up — see CONTRIBUTIONS_R2.md M4
    }
  }

  throw new Error("Max retries exceeded.");
}
```

### Key fixes vs previous plan
- `clearTimeout` in `finally` block (not just success path) — M4
- Default `maxTokens: 4096` (was 2048, too low) — M3
- No `axios` — uses native `fetch` — H1

## Step 3.2: Verify

Build and add a temporary test in `src/index.ts`:
```typescript
import { callOpenRouter } from "./openrouter.js";
import { config } from "./config.js";

server.tool("test_openrouter", "Test OpenRouter connection.", {}, async () => {
  try {
    const result = await callOpenRouter({
      model: config.models.experts!,
      messages: [{ role: "user", content: "Say 'hello' in one word." }],
      maxTokens: 10,
    });
    return { content: [{ type: "text" as const, text: `✅ OpenRouter: ${result}` }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { content: [{ type: "text" as const, text: `❌ ${msg}` }], isError: true };
  }
});
```

Build, restart Cline, call `test_openrouter`. Remove the test tool after verification.
