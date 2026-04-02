# Zod End-to-End: Proposal for Schema-First Types in Konsilio

## Executive Summary

We should replace all hand-written TypeScript interfaces in `src/personas/types.ts` with Zod schemas, and use those schemas as the single source of truth for: TypeScript types (via `z.infer`), runtime validation, and OpenAI `response_format` JSON schema generation. This is the prerequisite for the two-stage consulting improvement, and it eliminates an entire class of bugs where the TypeScript type, the runtime validator, and the JSON schema passed to the model can silently diverge.

---

## Current State

Zod `4.3.6` is already in `package.json` but **is not imported anywhere in the source**. All types are plain TypeScript interfaces in `src/personas/types.ts`. Runtime validation is done manually:

```typescript
// council.service.ts - current approach
const structuredOutput: StructuredExpertOutput = JSON.parse(jsonContent);
if (!structuredOutput.personaId || !Array.isArray(structuredOutput.findings)) {
  throw new Error('Invalid structured output: missing personaId or findings array');
}
```

This is fragile: the type assertion is a lie (TypeScript trusts `JSON.parse`), and the manual check only catches the most obvious structural failures. A model returning `severity: "SEVERE"` instead of `"HIGH"` would silently pass through.

The consolidation phases (extraction, critique, decision) have the same pattern — `JSON.parse(this.cleanJsonOutput(rawOutput))` cast directly to the phase output type with no validation at all.

---

## Zod v4: What's New and Why It Matters

Zod v4 (released 2025) has two major additions directly relevant to us:

### 1. `z.toJSONSchema()` — Built-in JSON Schema Generation

```typescript
import { z } from 'zod';

const FindingSchema = z.object({
  id: z.string(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  component: z.string(),
  issue: z.string(),
  mitigation: z.string()
});

// Produces valid JSON Schema Draft 2020-12
const jsonSchema = z.toJSONSchema(FindingSchema, { reused: 'inline' });
```

**Verified output** (from live testing against our installed `4.3.6`):
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "severity": { "type": "string", "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
    "component": { "type": "string" },
    "issue": { "type": "string" },
    "mitigation": { "type": "string" }
  },
  "required": ["id", "severity", "component", "issue", "mitigation"],
  "additionalProperties": false
}
```

This is exactly what OpenAI's `response_format` needs. Strip the `$schema` key and pass it directly.

### 2. Performance Improvements

Zod v4 is ~2-3x faster than v3 for parsing. For our use case (validating LLM responses) this is irrelevant, but it's a free win.

### 3. Better Error Messages

```json
{
  "code": "invalid_value",
  "values": ["CRITICAL", "HIGH", "MEDIUM", "LOW"],
  "path": ["findings", 0, "severity"],
  "message": "Invalid option: expected one of \"CRITICAL\"|\"HIGH\"|\"MEDIUM\"|\"LOW\""
}
```

Structured, path-aware errors make debugging LLM output failures much easier.

---

## Zod Full vs Zod Mini: Which to Use

This is the key question. Here's the definitive breakdown from live inspection of the installed package:

| Aspect | `zod` (full / "classic") | `zod/mini` |
|--------|--------------------------|------------|
| Import | `import { z } from 'zod'` | `import * as z from 'zod/mini'` |
| Schemas dir size | 44.5 KB (`classic/schemas.js`) | 29.0 KB (`mini/schemas.js`) |
| Total dir size | 283 KB (classic) + 727 KB (core) | 152 KB (mini) + 727 KB (core) |
| `toJSONSchema` | ✅ (from shared core) | ✅ (from shared core) |
| `z.string().min(3)` | ✅ chained methods | ❌ use `z.check(z.minLength(3))` |
| `z.string().email()` | ✅ | ✅ (via `z.email()` check) |
| `z.string().regex()` | ✅ | ❌ use `z.check(z.regex(...))` |
| `ZodError` class | ✅ | ❌ (uses core error types) |
| `z.infer<>` | ✅ | ✅ |
| `safeParse` | ✅ | ✅ |
| `fromJSONSchema` | ✅ | ❌ |
| Bundle size saving | baseline | ~45% smaller (classic layer only) |

**Key insight**: Both `zod` and `zod/mini` share the same `core` (727 KB). The size difference is only in the "classic" vs "mini" schema layer on top. Since this is a **Node.js server** (not a browser bundle), the size difference is completely irrelevant.

**The real difference** is the API style:
- **Full zod**: fluent chained API — `z.string().min(3).email()` 
- **Zod mini**: functional API — `z.check(z.minLength(3), z.email())(z.string())`

Mini was designed for **frontend bundle size** where tree-shaking matters. For a Node.js server application, mini offers no benefit and a worse developer experience.

### Verdict: Use `import { z } from 'zod'` (full v4)

The full API is cleaner, has `ZodError` for `instanceof` checks, has `fromJSONSchema` (useful for future tooling), and the bundle size argument simply doesn't apply to us.

---

## The OpenAI `response_format` Integration

OpenAI's structured output feature requires:

```typescript
{
  type: 'json_schema',
  json_schema: {
    name: string,        // identifier for the schema
    strict: true,        // enforce strict adherence
    schema: JSONSchema   // the actual JSON Schema object
  }
}
```

With Zod v4, generating this is trivial:

```typescript
import { z } from 'zod';

const ExpertOutputSchema = z.object({ /* ... */ });

function toResponseFormat(schema: z.ZodType, name: string) {
  const { $schema, ...jsonSchema } = z.toJSONSchema(schema, { reused: 'inline' });
  return {
    type: 'json_schema' as const,
    json_schema: { name, strict: true, schema: jsonSchema }
  };
}

// Usage in OpenRouter call:
const responseFormat = toResponseFormat(ExpertOutputSchema, 'expert_output');
```

**Verified**: The output from `z.toJSONSchema` with `reused: 'inline'` produces clean, flat JSON Schema with `additionalProperties: false` on all objects — exactly what OpenAI's strict mode requires.

**OpenRouter compatibility**: OpenRouter proxies OpenAI's API and passes `response_format` through to the underlying model. This works for any model that supports it (OpenAI models, some others). For models that don't support it (like Gemini via OpenRouter), the field is ignored and we fall back to prompt-based JSON extraction — which is the current behavior anyway.

---

## Proposed Implementation

### Step 1: Replace `types.ts` with Zod Schemas

`src/personas/types.ts` becomes `src/personas/schemas.ts`:

```typescript
import { z } from 'zod';

// ─── Expert Output Schemas ───

export const StructuredFindingSchema = z.object({
  id: z.string(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  component: z.string(),
  issue: z.string(),
  mitigation: z.string()
});

export const StructuredRiskSchema = z.object({
  id: z.string(),
  category: z.enum(['security', 'performance', 'operational', 'ux', 'technical-debt']),
  probability: z.enum(['high', 'medium', 'low']),
  impact: z.enum(['high', 'medium', 'low']),
  description: z.string()
});

export const StructuredExpertOutputSchema = z.object({
  personaId: z.string(),
  findings: z.array(StructuredFindingSchema),
  risks: z.array(StructuredRiskSchema),
  missingAssumptions: z.array(z.string()),
  dependencies: z.array(z.string())
});

// ─── Consolidation Phase Schemas ───

export const ExtractedClaimSchema = z.object({ /* ... */ });
export const ExtractionPhaseOutputSchema = z.object({ /* ... */ });
// ... etc for all phase outputs

// ─── Inferred Types (replaces all interfaces) ───

export type StructuredFinding = z.infer<typeof StructuredFindingSchema>;
export type StructuredRisk = z.infer<typeof StructuredRiskSchema>;
export type StructuredExpertOutput = z.infer<typeof StructuredExpertOutputSchema>;
export type ExtractionPhaseOutput = z.infer<typeof ExtractionPhaseOutputSchema>;
// ... etc
```

The `Persona`, `ExpertReport`, and `CouncilResult` types that don't come from LLM output can stay as plain interfaces — no need to Zod-ify everything, only the LLM-facing boundaries.

### Step 2: Replace Manual Parsing with Schema Validation

In `council.service.ts`, replace:

```typescript
// Before
const structuredOutput: StructuredExpertOutput = JSON.parse(jsonContent);
if (!structuredOutput.personaId || !Array.isArray(structuredOutput.findings)) {
  throw new Error('Invalid structured output');
}
```

With:

```typescript
// After
const structuredOutput = StructuredExpertOutputSchema.parse(JSON.parse(jsonContent));
// TypeScript now knows the exact type, and runtime validation is complete
```

And for consolidation phases:

```typescript
// Before
const output: ExtractionPhaseOutput = JSON.parse(this.cleanJsonOutput(rawOutput));

// After
const output = ExtractionPhaseOutputSchema.parse(JSON.parse(this.cleanJsonOutput(rawOutput)));
```

### Step 3: Add `response_format` to `OpenRouterService`

Extend `OpenRouterCallOptions`:

```typescript
export interface OpenRouterCallOptions {
  model: string;
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  responseFormat?: {           // NEW
    type: 'json_schema';
    json_schema: {
      name: string;
      strict: boolean;
      schema: Record<string, unknown>;
    };
  };
}
```

And in the `fetch` body:

```typescript
body: JSON.stringify({
  model: opts.model,
  messages: opts.messages,
  max_tokens: opts.maxTokens ?? 4096,
  temperature: opts.temperature ?? 0.3,
  ...(opts.responseFormat && { response_format: opts.responseFormat }),
}),
```

### Step 4: Add a Schema-to-ResponseFormat Helper

A small utility in `src/schemas.ts` (or inline in the service):

```typescript
import { z } from 'zod';

export function toResponseFormat(schema: z.ZodType, name: string) {
  const { $schema, ...jsonSchema } = z.toJSONSchema(schema, { reused: 'inline' });
  return {
    type: 'json_schema' as const,
    json_schema: { name, strict: true, schema: jsonSchema }
  };
}
```

---

## Relationship to the Two-Stage Consulting Proposal

This Zod end-to-end work is the **prerequisite** for the two-stage consulting improvement. Here's why:

The two-stage proposal says: experts write prose → a dedicated formatter (using `response_format`) converts it to structured JSON. For that formatter to work reliably, we need:

1. **Zod schemas** to generate the `response_format` JSON schema automatically (no hand-maintaining two representations)
2. **Zod parsing** to validate the formatter's output before it enters the pipeline
3. **`z.infer` types** so the rest of the pipeline is fully typed from the schema

Without this foundation, the formatter would need a hand-written JSON schema (which can drift from the TypeScript types) and manual validation (which is what we have now and is the problem).

**Recommended order**:
1. ✅ This proposal: Zod end-to-end (schemas → types → validation → JSON schema generation)
2. Then: Two-stage consulting (prose experts + formatter using `response_format`)

---

## What Changes, What Doesn't

**Changes:**
- `src/personas/types.ts` → `src/personas/schemas.ts` (schemas + inferred types)
- `src/services/council.service.ts` — replace `JSON.parse` + manual checks with `Schema.parse()`
- `src/services/openrouter.service.ts` — add optional `responseFormat` to call options
- New utility: `toResponseFormat()` helper

**Doesn't change:**
- `Persona` interface (not LLM output, stays as plain interface)
- `ExpertReport`, `CouncilResult` (orchestration types, not LLM output)
- All prompt files, persona markdown files
- `config.ts`, `container.ts`, `server.ts`
- Test infrastructure

---

## Migration Notes

### The Zod v3 → v4 Issue (from the GitHub thread)

The linked issue (`zod/issues/2807`) was about the `z.infer` type for discriminated unions in v3 being broken in certain edge cases. **This is not relevant to us** — we're starting fresh on v4 with no v3 code to migrate. The issue is closed and resolved in v4.

### Import Path

With Zod 4.3.6 installed, the correct import is simply:

```typescript
import { z } from 'zod';  // Gets v4 full (classic API)
```

The package exports `zod` → v4 classic by default. No path aliases needed.

### `additionalProperties: false` — A Note

`z.toJSONSchema` automatically adds `"additionalProperties": false` to all `z.object()` schemas. This is required for OpenAI's `strict: true` mode. It also means the model **cannot** add extra fields — which is exactly what we want for reliable parsing.

---

## Summary

| | Before | After |
|---|---|---|
| Type source | Hand-written interfaces | `z.infer<typeof Schema>` |
| Runtime validation | Manual property checks | `Schema.parse()` |
| JSON schema for `response_format` | Hand-written (or none) | `z.toJSONSchema(Schema)` |
| Validation errors | Generic `Error` | Structured `ZodError` with paths |
| Type/schema drift | Possible | Impossible (single source) |
| Lines of code | More (interfaces + validators) | Less (schemas only) |

The implementation is small (one file rewrite, two service modifications, one new utility) and the payoff is large: a single source of truth that eliminates an entire class of type/schema drift bugs and directly enables the `response_format` structured output feature needed for the two-stage consulting improvement.
