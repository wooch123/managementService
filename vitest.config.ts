import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Next.js aliases the bare `server-only` import via its own bundler config; vitest
      // runs outside that, so it needs an explicit no-op stub to resolve the same import.
      'server-only': path.resolve(__dirname, './tests/unit/stubs/server-only.ts'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.spec.ts'],
    passWithNoTests: true,
  },
});
