# Code Coverage with Vitest — Implementation Plan

## Current State
- `@vitest/coverage-v8` v4.1.2 is already installed
- `test:coverage` script exists in package.json (`vitest run --coverage`)
- `vitest.config.ts` has no coverage configuration block

## Proposal

### 1. Add coverage config to `vitest.config.ts`
```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'lcov'],
  include: ['src/**/*.ts'],
  exclude: [
    'src/**/*.test.ts',
    'src/__mocks__/**',
    'src/index.ts',      // CLI entry point (hard to test)
    'src/server.ts',     // Server entry point (hard to test)
  ],
  thresholds: {
    lines: 80,
    branches: 70,
    functions: 80,
    statements: 80,
  },
}
```

### 2. Add `coverage/` to `.gitignore`
Prevent generated `lcov.info` and coverage reports from being committed.

### 3. (Optional) CI integration
Add a coverage check step to any CI pipeline:
```bash
npm run test:coverage
```

### 4. HTML reporter (optional, for local dev)
Add `'html'` to the `reporter` array for a browsable coverage report.

## Effort
~10 minutes. One config block + one .gitignore entry.