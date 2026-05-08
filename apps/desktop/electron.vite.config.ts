import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

// electron-vite default convention is `src/main`, `src/preload`, `src/renderer`.
// We deliberately diverge: main + preload live in `electron/`, the renderer
// lives at the app root with `src/` for components and `index.html` at the
// root. We therefore configure all three sections explicitly.

/**
 * In dev, Vite injects React Refresh as inline `<script type="module">`
 * blocks at the top of the served HTML. Our production CSP forbids inline
 * scripts (`script-src 'self'`), so without a transform the dev server
 * loads the page but React never mounts → blank white window.
 *
 * This plugin rewrites the CSP meta tag at serve time only:
 *   - relaxes `script-src` to include `'unsafe-inline'` and `'unsafe-eval'`
 *     (Vite + React Refresh need both)
 *   - widens `connect-src` to allow Vite's HMR WebSocket
 *
 * Production builds skip this transform entirely, so the strict CSP in
 * `index.html` is shipped as-is.
 */
function devCspRelaxPlugin(): Plugin {
  return {
    name: 'synapsium:dev-csp-relax',
    apply: 'serve', // dev only; production builds keep the strict CSP
    transformIndexHtml(html) {
      return html.replace(
        /<meta http-equiv="Content-Security-Policy"[^>]*\/>/,
        `<meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws: http: data: blob:; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self';" />`,
      );
    },
  };
}

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      lib: {
        entry: resolve(__dirname, 'electron/main.ts'),
      },
      rollupOptions: {
        output: {
          entryFileNames: '[name].js',
        },
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared'),
      },
    },
    plugins: [
      // Externalizes anything in `dependencies` of package.json so native /
      // node-only modules aren't bundled. This is critical for better-sqlite3
      // (native), chokidar (uses fs/path), and electron itself.
      externalizeDepsPlugin({
        exclude: [],
      }),
    ],
  },
  preload: {
    build: {
      outDir: 'out/preload',
      lib: {
        entry: resolve(__dirname, 'electron/preload.ts'),
      },
      rollupOptions: {
        output: {
          entryFileNames: '[name].js',
        },
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared'),
      },
    },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    // Vite root is the app directory itself — that's where index.html lives.
    root: __dirname,
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'shared'),
      },
    },
    server: {
      port: 5173,
    },
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
        },
      },
    },
    plugins: [react(), devCspRelaxPlugin()],
  },
});
