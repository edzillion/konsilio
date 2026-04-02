# Changelog

## [0.3.0] - Unreleased

### Folder Structure & Build Improvements

- **Runtime data directory**: All runtime artifacts now live under `data/`:
  - `data/db/` — SQLite database files (`konsilio.db`, `.db-shm`, `.db-wal`)
  - `data/personas/` — User-editable persona markdown files
  - `data/prompts/` — Consolidation phase prompts and other templates
- **Build script**: Added `scripts/copy-prompts.mjs` to copy `src/prompts/` → `data/prompts/` during build
- **Prompt resolution**: `PromptService` now prefers `data/prompts/` at runtime, falls back to `src/prompts/` during development
- **Database path**: Updated default from `./data/konsilio.db` to `./data/db/konsilio.db`
- **Schema fix**: Removed hardcoded persona ID enum from `konsilio.schema.json` — persona IDs are now dynamic (supports custom personas)
- **Cleanup**: Removed old `council.db` files (renamed to `konsilio.db`)
- **Schema distribution**: Added `konsilio.schema.json` to npm package exports so consuming projects can reference it via `node_modules/konsilio/konsilio.schema.json`

### Layered Configuration (Config Design v1)

Implement three-tier configuration system: Infrastructure → Profile → Run-time.

#### New Features

- **Per-run persona override**: Override enabled personas per invocation via `personas` parameter
- **Per-run model override**: Override models per persona via `persona_models` parameter (maps personaId → model)
- **Per-run consolidation model override**: Override the lead/consolidation model via `consolidation_model` parameter
- **Per-run token limits**: Override max tokens per run via `max_tokens` parameter (experts/lead)
- **Persona-level model defaults**: New `personaModels` field in `konsilio.json` for semi-static per-persona model defaults

#### 3-Tier Model Resolution

Model selection now follows this priority chain:
1. Per-run override (`persona_models` parameter)
2. Persona-level default (`personaModels` in `konsilio.json`)
3. Global default (`models.experts` in `konsilio.json`)

#### Configuration Changes

- Added `personaModels` field to `konsilio.json` (optional, maps personaId → model)
- Updated `konsilio.schema.json` with comprehensive schema coverage including:
  - `personaModels` with examples
  - `maxTokens` object (experts, lead)
  - `formatter` object (maxRetries)
  - `timeouts.formatterMs`
  - `models.formatter`
  - Full descriptions for all fields

#### API Changes

`consult_council` tool now accepts optional parameters:
- `personas`: string[] - Override enabled personas for this run
- `persona_models`: Record<string, string> - Override model per persona
- `consolidation_model`: string - Override consolidation model
- `max_tokens`: { experts?: number, lead?: number } - Override token limits

#### Backward Compatibility

Fully backward compatible. All new parameters are optional. Existing `konsilio.json` configs continue to work as defaults.

#### Example Usage

```json
{
  "draft_plan": "...",
  "personas": ["security", "devops"],
  "persona_models": { "security": "openai/gpt-4o" },
  "consolidation_model": "anthropic/claude-sonnet-4"
}
```

This runs only security and devops personas; security uses gpt-4o, devops uses the config default; consolidation uses claude-sonnet-4.