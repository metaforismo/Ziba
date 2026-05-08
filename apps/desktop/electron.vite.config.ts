import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// electron-vite default convention is `src/main`, `src/preload`, `src/renderer`.
// We deliberately diverge: main + preload live in `electron/`, the renderer
// lives at the app root with `src/` for components and `index.html` at the
// root. We therefore configure all three sections explicitly.
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
    plugins: [react()],
  },
});
