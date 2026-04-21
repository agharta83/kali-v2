// SPDX-License-Identifier: AGPL-3.0-or-later
// Electron preload bridge — exposes typed RPC to the renderer.
// TODO: STORY-003 — IPC router typé + preload bridge.

import { contextBridge } from 'electron';

// Minimal preload setup for sandbox mode.
// Exposes a placeholder API to the renderer context.
// Will be expanded in STORY-003 with typed IPC router.
contextBridge.exposeInMainWorld('electron', {
  // Placeholder - actual API will be implemented in STORY-003
});
