# PersonaService Refactoring Proposal

## Overview

This proposal outlines the creation of a `PersonaService` to consolidate persona-related functionality currently spread across `src/personas/index.ts` and follow the established dependency injection (DI) pattern used by other services in the codebase.

## Current State

### Location
- `src/personas/index.ts` - Contains `PersonaFactory` class and utility functions
- `src/personas/expert.ts` - `Expert` class for runtime expert construction
- `src/personas/lead.ts` - `Lead` class for consolidation phase leads
- `src/personas/types.ts` - Type definitions

### Current Implementation

The `PersonaFactory` class is currently instantiated directly within `CouncilService`:

```typescript
// In CouncilService constructor
this.personaFactory = new PersonaFactory(deps.promptService);
```

**Current API surface:**
- `PersonaFactory.createExpert(personaId, model)` - Create single expert
- `PersonaFactory.createExperts(personaIds, model)` - Create multiple experts
- `PersonaFactory.createLead(phase)` - Create lead for consolidation phase
- `getAvailablePersonaIds()` - Get list of available persona IDs
- `createAllPersonas(promptService)` - Create all personas for listing

## Problem Statement

1. **DI Pattern Inconsistency**: `PersonaFactory` is the only service-like component not following the DI pattern
2. **Direct Instantiation**: `CouncilService` creates `PersonaFactory` directly instead of receiving it as a dependency
3. **Testability**: Difficult to mock persona creation in tests
4. **Separation of Concerns**: Persona creation logic is coupled with council orchestration

## Proposed Solution

### Create PersonaService

**Location:** `src/services/persona.service.ts`

**Dependencies:**
- `PromptService` - For loading persona data from markdown files
- `CacheService` - For caching loaded persona data (optional enhancement)
- `Logger` - For consistency with other services

**Public API:**

```typescript
export class PersonaService {
  constructor(
    private readonly deps: {
      promptService: PromptService;
      cacheService?: CacheService;
      logger: Logger;
    }
  ) {}

  /**
   * Create multiple expert personas
   * Used by: CouncilService for expert analysis phase
   */
  createExperts(personaIds: string[], model: string): Persona[]

  /**
   * Create lead persona for consolidation phase
   * Used by: CouncilService for extraction, critique, decision, synthesis phases
   */
  createLead(phase: 'extraction' | 'critique' | 'decision' | 'synthesis'): Persona

  /**
   * Get available persona IDs from prompts directory
   * Used by: CLI for listing available personas
   */
  getAvailablePersonaIds(): string[]
}
```

### API Design Rationale

**Methods Included:**
- `createExperts()` - Primary method used by `CouncilService` to create expert panels
- `createLead()` - Used by `CouncilService` for each consolidation phase
- `getAvailablePersonaIds()` - Used by CLI to list available personas

**Methods Excluded (Internal/Private):**
- `createExpert()` - Redundant with `createExperts()`, can be private implementation detail
- `createAllPersonas()` - Can be replaced by composing `getAvailablePersonaIds()` + `createExperts()`

**Usage Analysis:**
- `createExperts()` - Used in `council.service.ts` (main usage)
- `createLead()` - Used 4x in `council.service.ts` for consolidation phases
- `createAllPersonas()` - Used in `src/index.ts` for listing available personas
- `getAvailablePersonaIds()` - Only used internally by `createAllPersonas()`
- `createExpert()` - Only used internally by `createExperts()`

### Implementation Details

**Internal Structure:**
- Keep `Expert` and `Lead` classes as internal implementation details
- Move `PersonaFactory` logic into the service
- Cache loaded persona data using `CacheService` to avoid repeated file reads
- Handle expert rules and workflow rules loading internally

**Caching Strategy:**
- Cache persona prompt data by persona ID
- Cache consolidation phase prompts by phase name
- Use reasonable TTL (e.g., 5 minutes) since persona files rarely change

### Refactoring Steps

1. **Create PersonaService** (`src/services/persona.service.ts`)
   - Follow existing service patterns (constructor takes config + dependencies)
   - Implement the 3 public methods
   - Add internal caching logic

2. **Update CouncilService** (`src/services/council.service.ts`)
   - Add `personaService` to dependencies
   - Remove direct `PersonaFactory` instantiation
   - Update calls to use `personaService.createExperts()` and `personaService.createLead()`

3. **Update Services Index** (`src/services/index.ts`)
   - Export `PersonaService` class and types

4. **Update DI Container** (`src/container.ts`)
   - Create `PersonaService` instance with proper dependencies
   - Pass `personaService` to `CouncilService` constructor

5. **Update CLI** (`src/index.ts`)
   - Replace `createAllPersonas()` with `personaService.getAvailablePersonaIds()` + `personaService.createExperts()`

6. **Clean Up Personas Index** (`src/personas/index.ts`)
   - Keep type exports
   - Remove `PersonaFactory` class
   - Remove utility functions (move logic to `PersonaService`)

### Benefits

1. **Consistency**: Follows the same DI pattern as other services (`OpenRouterService`, `DatabaseService`, `CacheService`, `PromptService`)
2. **Testability**: Can mock `PersonaService` in tests instead of dealing with factory internals
3. **Separation of Concerns**: Persona creation logic is centralized and decoupled from council orchestration
4. **Performance**: Caching reduces file system reads for frequently accessed persona data
5. **Maintainability**: Single source of truth for persona management
6. **Flexibility**: Easier to extend with additional persona-related functionality

### Error Handling

**Approach:** Minimal error handling consistent with current patterns
- Log warnings for missing persona files (continue with defaults)
- Throw errors for invalid persona IDs (fail fast)
- Cache lookup failures fall back to loading from disk

### Backward Compatibility

**Breaking Changes:**
- `PersonaFactory` class will be removed (internal implementation detail)
- Utility functions (`createAllPersonas`, `getAvailablePersonaIds`) will be removed from `src/personas/index.ts`
- Direct instantiation of `Expert`/`Lead` classes will no longer be supported

**Migration Path:**
- Update all imports to use `PersonaService` from `src/services/index.ts`
- Replace direct calls with service method calls
- Update tests to mock `PersonaService` instead of internal classes

### Questions and Decisions

**Caching:**
- Should we use `CacheService` for persona data caching? **Yes** - leverages existing infrastructure
- What TTL? **5 minutes** - balances performance with flexibility for prompt file changes during development

**API Design:**
- Should we keep `createAllPersonas()`? **No** - redundant with composition of other methods
- Should we keep `createExpert()` public? **No** - internal implementation detail
- Should we keep `getAvailablePersonaIds()`? **Yes** - needed for CLI listing functionality

**Naming:**
- `PersonaService` vs `PersonaFactory`? **PersonaService** - consistency with existing service naming

### Future Enhancements

**Potential additions to PersonaService:**
- Dynamic persona discovery (scan prompts directory instead of hardcoded list)
- Persona validation and schema checking
- Persona composition (combining multiple personas)
- Persona recommendation based on draft plan content

**Not included in this proposal:**
- Consolidation phase logic (properly belongs in `CouncilService`)
- Prompt loading logic (properly belongs in `PromptService`)
- Persona-specific business logic (properly belongs in `Expert`/`Lead` classes)

## Conclusion

This refactoring improves code organization, testability, and maintainability by following established patterns while adding performance benefits through caching. The changes are focused and minimal, affecting only the persona creation infrastructure without touching the core council orchestration logic.