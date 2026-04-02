# Config Design v1: Layered Configuration

## Problem

Current configuration is static — loaded once from `konsilio.json` at startup. All tool invocations use the same personas and models. Users cannot customize behavior per-run without editing the config file and restarting.

## Design Principle: Three Tiers

| Tier | Scope | Examples | Change Frequency |
|------|-------|----------|-----------------|
| **Infrastructure** | Deployment | API keys, DB path, log level | Once |
| **Profile** | Project defaults | Default personas, default models | Occasionally |
| **Run-time** | Per invocation | Override personas, override models | Every call |

## Key Distinction: Personas vs Models

- **Persona**: A bundle of rules, prompts, system instructions, and focus areas that defines *how* an expert thinks
- **Model**: The OpenRouter model endpoint that *runs* the persona

A persona can have a model assigned at the persona level. If set, it overrides the config default. If unset, the config default is used.

## Proposal

### 1. Per-Run Overrides on `consult_council`

Add optional parameters to the tool:

```typescript
{
  draft_plan: z.string(),
  tech_stack: z.string().optional(),
  context_constraints: z.string().optional(),
  // NEW:
  personas: z.array(z.string()).optional(),     // Override konsilio.json enabled personas
  persona_models: z.record(z.string(), z.string()).optional(),  // personaId -> model override
  consolidation_model: z.string().optional(),   // Override lead/consolidation model
}
```

Example usage:
```json
{
  "draft_plan": "...",
  "personas": ["security", "devops"],
  "persona_models": { "security": "openai/gpt-4o" },
  "consolidation_model": "anthropic/claude-sonnet-4"
}
```

This means: run only security and devops personas; security uses gpt-4o, devops uses the config default; consolidation uses claude-sonnet-4.

### 2. Config Merge Logic

In `CouncilService.run()`, the effective config becomes:

```
effectivePersonas = runParams.personas ?? config.enabledPersonas
effectiveExpertModel(personaId) = runParams.persona_models[personaId] ?? config.models.experts
effectiveConsolidationModel = runParams.consolidation_model ?? config.models.lead
```

### 3. Model Validation: Defer to API

- No local model ID whitelist (models change too frequently)
- If the API returns an error, surface it clearly in the tool response
- Error format: `❌ Model error: "<model-id>" returned <status> - <message>. Check https://openrouter.ai/models for valid IDs.`

### 4. JSON Schema Enhancement

Update `konsilio.schema.json` to cover all config fields. VS Code provides autocomplete and validation for free via the `$schema` reference already in `konsilio.json`.

### 5. VS Code Settings UI: Deferred

A full VS Code extension with settings UI is possible future work but not in scope. The JSON schema + IntelliSense approach provides 80% of the UX benefit with near-zero maintenance.

### 1. Per-Run Token Limits

Add `max_tokens` as an optional per-run override:

```typescript
max_tokens: z.object({
  experts: z.number().optional(),
  lead: z.number().optional(),
}).optional(),
```

### 2. Persona-Level Model Defaults in `konsilio.json`

Add `personaModels` to `konsilio.json` for semi-static per-persona model defaults:

```json
{
  "models": { "experts": "google/gemini-2.5-flash-lite" },
  "personaModels": { "security": "openai/gpt-4o", "performance": "anthropic/claude-sonnet-4" }
}
```

### 3. Timeout Override: Not Implemented

MCP servers cannot control the host's (Cline's) timeout. Users must configure Cline's timeout manually. Document this requirement.

### 4. Named Profiles: Deferred

Out of scope for v1.

## 3-Tier Model Resolution

```
per-run persona_models[personaId] 
  → konsilio.json personaModels[personaId] 
    → konsilio.json models.experts (global default)
```

## Changes Required

| File | Change |
|------|--------|
| `src/index.ts` | Add `personas`, `persona_models`, `consolidation_model`, `max_tokens` params to `consult_council` |
| `src/config.ts` | Add `personaModels` to `KonsilioConfig` interface and exported config |
| `src/services/council.service.ts` | Accept per-persona model overrides; implement 3-tier model resolution; accept per-run maxTokens override |
| `src/services/persona.service.ts` | No change needed — `createExperts` already accepts per-persona model |
| `konsilio.json` | Add `personaModels` field (optional) |
| `konsilio.schema.json` | Add `personaModels`, `maxTokens`, and other missing fields |

## Backward Compatibility

Fully backward compatible. Existing `konsilio.json` configs continue to work as defaults. Run-time params are purely additive.
