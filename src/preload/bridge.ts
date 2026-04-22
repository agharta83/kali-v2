// SPDX-License-Identifier: AGPL-3.0-or-later
// Preload bridge exposing typed IPC API to renderer via contextBridge.
// This is the ONLY interface between renderer and main process - the renderer
// cannot access Node.js APIs or ipcRenderer directly due to contextIsolation=true.
//
// Security rationale:
// - contextBridge creates a secure proxy between main and renderer worlds
// - Only specific typed methods are exposed (no raw ipcRenderer access)
// - All communication goes through validated IPC channels
// - Renderer cannot execute arbitrary Node.js code or access filesystem
//
// @see https://www.electronjs.org/docs/latest/tutorial/context-isolation

import { contextBridge, ipcRenderer } from 'electron';
import type { KaliAPI } from '@shared/types/ipc';

/**
 * Expose the Kali API to the renderer process via window.kali.
 *
 * This API provides:
 * - window.kali.rpc: Request/response RPC methods organized by namespace
 * - window.kali.events: One-way event streaming (main ↔ renderer)
 *
 * All methods are type-safe and validated at the IPC boundary with Zod.
 */
const kaliAPI: KaliAPI = {
  /**
   * RPC namespace for request/response communication.
   * All methods return Promises and support error handling.
   */
  rpc: {
    /**
     * Settings namespace for application configuration.
     * Currently returns mock data - persistence will be added in STORY-005.
     */
    settings: {
      /**
       * Retrieve a setting value by key.
       *
       * @param key - The setting key to retrieve (must be non-empty)
       * @returns Promise resolving to the setting value
       * @throws BusinessError with code 'VALIDATION_ERROR' if key is invalid
       * @throws TechnicalError with code 'INTERNAL_ERROR' if handler fails
       *
       * @example
       * const theme = await window.kali.rpc.settings.get('theme');
       * // => 'dark' (mock data)
       */
      get: (key: string): Promise<unknown> => {
        return ipcRenderer.invoke('rpc:settings.get', { key });
      },

      /**
       * Update a setting value.
       *
       * @param key - The setting key to update (must be non-empty)
       * @param value - The new value (any type)
       * @returns Promise resolving when update completes
       * @throws BusinessError with code 'VALIDATION_ERROR' if key is invalid
       * @throws TechnicalError with code 'INTERNAL_ERROR' if handler fails
       *
       * @example
       * await window.kali.rpc.settings.update('theme', 'light');
       */
      update: (key: string, value: unknown): Promise<void> => {
        return ipcRenderer.invoke('rpc:settings.update', { key, value });
      },
    },
  },

  /**
   * Event streaming for one-way push notifications.
   * Unlike RPC (request/response), events are fire-and-forget.
   *
   * Infrastructure is wired but not yet used in STORY-003.
   * Future stories will use it for file watching, VCS updates, build progress, etc.
   */
  events: {
    /**
     * Subscribe to an event channel.
     *
     * IMPORTANT: Callers must remove listeners when components unmount
     * to prevent memory leaks. Future iterations will provide removeListener.
     *
     * @param channel - Event channel name (e.g., 'vcs:status', 'build:progress')
     * @param callback - Function invoked when event is emitted
     *
     * @example
     * window.kali.events.on('build:progress', (percent: number) => {
     *   console.log(`Build progress: ${percent}%`);
     * });
     */
    on: (channel: string, callback: (...args: unknown[]) => void): void => {
      // Strip the IPC event object, only pass arguments to callback
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    },

    /**
     * Send an event from renderer to main.
     * This is fire-and-forget (no response expected).
     *
     * For request/response semantics, use window.kali.rpc instead.
     *
     * @param channel - Event channel name
     * @param args - Event payload arguments
     *
     * @example
     * window.kali.events.send('telemetry:click', 'button-id', { meta: 'data' });
     */
    send: (channel: string, ...args: unknown[]): void => {
      ipcRenderer.send(channel, ...args);
    },
  },
};

/**
 * Expose the API to the renderer's window object.
 *
 * Security: This uses Electron's contextBridge which creates a secure
 * proxy between the isolated worlds. The renderer can ONLY access what
 * we explicitly expose here - it cannot access ipcRenderer, require(),
 * or any Node.js APIs directly.
 */
contextBridge.exposeInMainWorld('kali', kaliAPI);
