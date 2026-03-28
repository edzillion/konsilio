import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
