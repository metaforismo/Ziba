// Electron main entry. Owns the BrowserWindow lifecycle and delegates all
// IPC wiring to `./ipc`.
//
// Security posture (matches Electron's recommended defaults):
//   - contextIsolation: true   (preload runs in its own world)
//   - nodeIntegration:  false  (renderer cannot require())
//   - sandbox:          false  (preload needs `electron` module access)
//
// The dev/prod fork is detected via `ELECTRON_RENDERER_URL` -- Vite (the
// renderer build tool, owned by Agent C) sets this when running its dev
// server; in a packaged build it's unset and we fall back to the bundled
// HTML on disk.

import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpcHandlers, unregisterIpcHandlers } from './ipc/index.js';
import { teardownVault } from './ipc/vault.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  // Resolve preload relative to the compiled main.js. After Agent C's
  // build configures it, `preload.js` will sit alongside `main.js` in the
  // `dist-electron/` (or similar) output dir.
  const preload = path.join(__dirname, 'preload.js');

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Show only after the renderer says it's ready -- avoids the flash of
  // unstyled / blank window during the initial paint.
  win.once('ready-to-show', () => {
    win.show();
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  registerIpcHandlers(win);

  win.on('closed', () => {
    // The window is gone -- tear down anything that was tied to its
    // webContents (watcher, DB) so we don't leak handles.
    void teardownVault();
    unregisterIpcHandlers();
    if (mainWindow === win) mainWindow = null;
  });

  return win;
}

app.whenReady().then(() => {
  mainWindow = createWindow();

  app.on('activate', () => {
    // macOS: clicking the dock icon with no windows open re-creates one.
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Standard cross-platform behaviour: quit on Linux/Windows; stay alive
  // on macOS so the user can re-open from the dock.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Best-effort cleanup -- if a vault is still open, close its DB / watcher
  // before the process exits.
  void teardownVault();
});
