import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    clearMocks: true,
    mockReset: true,
    pool: 'forks',
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
