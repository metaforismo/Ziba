import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Prefer explicit imports of `describe`/`it`/`expect` over implicit globals.
    globals: false,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts', 'src/**/__tests__/**'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
});
