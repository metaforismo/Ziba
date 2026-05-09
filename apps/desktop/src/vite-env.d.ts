/// <reference types="vite/client" />

// Importing the shared IPC module hoists the `declare global { Window }`
// augmentation so `window.ziba` is typed across the renderer.
import '../shared/ipc';
