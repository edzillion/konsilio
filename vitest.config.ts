import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    clearMocks: true,
    mockReset: true,
    pool: 'forks',
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/__mocks__/**',
        'src/index.ts',
        'src/server.ts',
        // Category 2: Not worth testing - thin wrappers, re-exports, or integration-heavy code
        'src/logger.ts',           // Thin wrapper around pino (already well-tested library)
        'src/cli/history.ts',      // Standalone CLI entry point requiring integration testing
        'src/db/schema.ts',        // Just a SQL string constant, no logic
        'src/personas/index.ts',   // Re-exports only, no logic
        'src/services/index.ts',   // Re-exports only, no logic
        'src/services/database.service.ts', // Complex WASM-based SQLite, heavily integration-dependent
      ],
      thresholds: {
        lines: 40,
        branches: 35,
        functions: 35,
        statements: 40,
      },
    },
  },
});
