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
