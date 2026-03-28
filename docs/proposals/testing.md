# Unit Testing Strategy for Konsilio

Based on my analysis of your codebase, here's a modern testing approach optimized for your single-developer context and March 2026 best practices:

## Recommended Testing Stack

**Framework**: **Vitest** (not Jest)
- Native ESM support (critical for your NodeNext module setup)
- 10-20x faster than Jest
- Zero config for TypeScript
- Built-in mocking that's simpler than Jest
- Actively maintained (Jest is in maintenance mode)

**Assertion Library**: Vitest's built-in `expect` (no need for Chai)
**Mocking**: Vitest's built-in `vi.fn()`, `vi.mock()`
**Test Utilities**: `@testing-library` only if you add UI later

## Test Structure

```
src/
  services/
    __tests__/
      council.service.test.ts
      openrouter.service.test.ts
      database.service.test.ts
  __tests__/
    config.test.ts
    container.test.ts
```

## Key Testing Principles (Aligned with .clinerules)

1. **No defensive testing** - Test the happy path and critical failures only
2. **Mock external boundaries** - OpenRouter API, SQLite, file system
3. **Test behavior, not implementation** - Focus on what services do, not how
4. **Keep tests lean** - Single developer doesn't need exhaustive coverage
5. **Test the DI container** - Ensure services wire up correctly

## Notes

* ALWAYS check the implementation of the class to be tested and review the code to ensure the test is appropriate. Take note of the parameter types and design tests with typed asserts that use them. Use types and typed arrays consistently
* ALSO check the related resource and config files and use the values present in those json files as the 'expected' values in tests
* Use test helpers/utils wherever possible, add new helpers where code duplication can be reduced.


## Critical Areas to Test First

### 1. **CouncilService** (Core Business Logic)
- 4-phase pipeline orchestration
- Expert parallel execution with `Promise.allSettled`
- Failure handling (when experts fail)
- Timeout handling
- Structured output parsing

### 2. **OpenRouterService** (External API Boundary)
- Retry logic with exponential backoff
- Timeout handling
- Error parsing (401, 402, 429, etc.)
- Response parsing

### 3. **Config Loading** (Foundation)
- CLI arg parsing (`--api-key`)
- Environment file loading (.env)
- konsilio.json parsing
- Validation logic

### 4. **DatabaseService** (Persistence)
- SQLite operations
- Schema initialization
- Session pruning
- Error handling when DB is disabled

### 5. **Container** (DI Wiring)
- Service creation
- Dependency injection correctness
- Singleton pattern
- Reset functionality for tests

## Mock Strategy

```typescript
// Mock external dependencies
vi.mock('./openrouter.service.js', () => ({
  OpenRouterService: vi.fn().mockImplementation(() => ({
    call: vi.fn().mockResolvedValue('mocked response'),
    checkHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 100 })
  }))
}));

// Mock fs for config tests
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn()
}));
```

## Test Data Strategy

- **Minimal fixtures** - Just enough to test the behavior
- **Inline test data** - Keep it close to tests
- **No complex factories** - Single developer doesn't need them
- **Real persona prompts** - Load actual markdown files for integration tests

## CI/CD Integration

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

## What NOT to Test

- ❌ MCP SDK integration (external dependency)
- ❌ Actual LLM responses (non-deterministic, expensive)
- ❌ Full end-to-end flows (that's integration testing)
- ❌ Every error path (test critical ones only)
- ❌ Type checking (TypeScript already does this)

## Next Steps

1. Install Vitest and configure
2. Set up test infrastructure (mocks, fixtures)
3. Write tests for CouncilService (highest value)
4. Write tests for OpenRouterService (external boundary)
5. Write tests for config/container (foundation)
6. In future other tests will be added with learnings from this process. 