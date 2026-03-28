# Runtime Persona Architecture v3

**Date:** 2025-03-28  
**Status:** Proposed  
**Dependencies:** Prompt Service v2 implementation

## Problem
Current architecture maintains persona data in two places:
- TypeScript files with metadata (id, name, emoji, focusAreas, domains)
- Markdown files with prompt content (anti-patterns, examples)

This creates maintenance overhead and requires code changes to add new personas.

## Solution
Move ALL persona data to markdown files and construct personas at runtime using only two classes: `Expert` and `Lead`.

## CRITICAL FIRST STEP

**Before any code refactoring, move persona metadata to markdown files:**

```markdown
# src/prompts/personas/security.md

---
id: security
name: Security Architect
emoji: 🔒
focusAreas:
  - Identity & access management
  - Data protection controls
  - Input validation & sanitization
  - Secrets lifecycle management
  - Rate limiting & abuse prevention
domains:
  - security
  - infrastructure
  - compliance
---

## Anti-Patterns
...
```

## Architecture

### Key Design Decision: Remove Examples from Persona Files

**Problem with Examples:**
- Bloat prompt size unnecessarily
- Make the model **copy patterns** instead of understanding principles
- Are redundant when we have format rules

**Solution:**
- Remove `exampleFindings`, `exampleRisks`, `exampleMissingAssumptions`, `exampleDependencies` from persona markdown files
- Create `src/prompts/expert-rules.md` that defines JSON output format (similar to phase prompts)
- Persona files keep only: metadata + anti-patterns + natural language guidance
- Expert class loads expert-rules.md and injects it into all expert prompts

**Benefits:**
- ✅ Leaner prompts (no bloated examples)
- ✅ Less leading (model follows format rules, not patterns)
- ✅ Single format source (change output structure in one place)
- ✅ More authentic (model generates based on understanding, not copying)

### Two Runtime Classes

**Expert Class**
- Constructed at runtime from markdown
- Loads: id, name, emoji, focusAreas, domains, anti-patterns, examples
- Injects: Core Rules + Workflow Rules (if configured)
- Used for: All expert analysis (security, performance, etc.)

**Lead Class**  
- Constructed at runtime for consolidation phases
- Loads: Phase-specific prompts from `src/prompts/consolidation/*.md`
- Injects: Workflow Rules (if configured)
- Used for: Extraction, Critique, Decision, Synthesis phases

### Rule Injection Flow

```
Workflow Rules (workflow-rules.md) → ALL prompts (Expert + Lead)
Core Rules (expert_rules.md) → ONLY Expert prompts  
Consolidation Phases (consolidation/*.md) → ONLY Lead prompts
```

### Directory Structure

```
src/prompts/
├── expert_rules.md
├── workflow-rules.md
├── personas/
│   ├── security.md      # ← Add YAML frontmatter with metadata
│   ├── performance.md   # ← Add YAML frontmatter with metadata
│   └── ...
└── consolidation/
    ├── extraction.md
    ├── critique.md
    └── ...
```

## Implementation Steps

### Phase 1: Migrate Metadata (DONE)
1. Add YAML frontmatter to all `src/prompts/personas/*.md` files
2. Include: id, name, emoji, focusAreas[], domains[]
3. Update `PersonaPromptData` interface to include metadata fields

### Phase 2: Create Runtime Classes
1. Create `src/personas/expert.ts` - Runtime expert construction
2. Create `src/personas/lead.ts` - Runtime lead construction  
3. Simplify `PromptService` to return raw markdown content

### Phase 3: Refactor CouncilService
1. Modify CouncilService to build experts dynamically from config
2. Remove all `src/personas/{security,performance,...}.ts` files
3. Delete `src/personas/shared-prompts.ts`
4. Update `src/container.ts` wiring

### Phase 4: Cleanup
1. Remove `src/constitution.ts` (already done)
2. Remove CORE_QUALITY_RULES from shared-prompts (already done)
3. Verify all 10 personas load correctly

## Benefits
- ✅ Single source of truth: Markdown files only
- ✅ Zero code changes to add new personas
- ✅ Domain experts can edit personas without developers
- ✅ Git-friendly diffs for all persona changes
- ✅ Runtime configurability based on workflow needs

## Migration Checklist
- [x] Add YAML frontmatter to all persona markdown files
- [x] Update `PersonaPromptData` interface
- [ ] Create `Expert` runtime class
- [ ] Create `Lead` runtime class
- [ ] Refactor `CouncilService` for dynamic construction
- [ ] Delete individual persona TypeScript files
- [ ] Remove `shared-prompts.ts`
- [ ] Update container wiring
- [ ] Test all 10 personas load correctly