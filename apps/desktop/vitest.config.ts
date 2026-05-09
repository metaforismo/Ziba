import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Vitest config for the renderer side of the desktop app.
//
// We deliberately diverge from `electron.vite.config.ts` (which only
// orchestrates the Electron build) and stand up an isolated jsdom test
// environment. The renderer code under test is plain React / Zustand /
// IPC-wrapper logic, so we only need:
//   - the React plugin so JSX/TSX gets transformed
//   - the same path aliases the renderer ships with (`@/*`, `@shared/*`)
//   - jsdom so `window`, `localStorage`, and timers work natively
//   - a setup file that installs a default `window.synapsium` before
//     each test (per-test mocks are layered via `installMockIpc`)
//
// Globals are off to mirror `packages/core` — every test imports
// `describe`/`it`/`expect`/`vi` explicitly. Cleaner stack traces, fewer
// surprises in the editor's go-to-definition.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'shared'),
    },
  },
  test: {
    globals: false,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: { provider: 'v8' },
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
