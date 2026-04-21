// SPDX-License-Identifier: AGPL-3.0-or-later
// TypeScript type definitions for the IPC communication layer.
// These types enable full autocomplete for window.kali.rpc and window.kali.events
// in the renderer process while maintaining type safety across the IPC boundary.

/**
 * Settings namespace RPC methods.
 * Provides get/update operations for application settings.
 * Currently returns mock data - persistence will be added in STORY-005.
 */
export interface SettingsRPC {
  /**
   * Retrieves a setting value by key.
   *
   * @param key - The setting key to retrieve (must be non-empty)
   * @returns Promise resolving to the setting value (unknown type)
   * @throws BusinessError with code 'VALIDATION_ERROR' if key is invalid
   * @throws TechnicalError with code 'INTERNAL_ERROR' if handler fails
   *
   * @example
   * const theme = await window.kali.rpc.settings.get('theme');
   * // => 'dark' (mock data)
   */
  get(key: string): Promise<unknown>;

  /**
   * Updates a setting value.
   *
   * @param key - The setting key to update (must be non-empty)
   * @param value - The new value (any type)
   * @returns Promise resolving when update completes
   * @throws BusinessError with code 'VALIDATION_ERROR' if key is invalid
   * @throws TechnicalError with code 'INTERNAL_ERROR' if handler fails
   *
   * @example
   * await window.kali.rpc.settings.update('theme', 'light');
   * // => Promise<void>
   */
  update(key: string, value: unknown): Promise<void>;
}

/**
 * Complete RPC API exposed via window.kali.rpc.
 * This is the top-level namespace container for all RPC methods.
 * Future epics will add additional namespaces (workspaces, vcs, skills, etc.).
 */
export interface KaliRPC {
  /**
   * Settings namespace for application configuration.
   * @see SettingsRPC
   */
  settings: SettingsRPC;
}

/**
 * Event listener callback type.
 * Receives arbitrary arguments from the main process event emission.
 *
 * @param args - Event payload arguments (type safety delegated to caller)
 */
export type EventCallback = (...args: unknown[]) => void;

/**
 * Event emitter for streaming communication from main to renderer.
 * Unlike RPC (request/response), events are one-way push notifications.
 *
 * This infrastructure is wired but not yet used in STORY-003.
 * Future stories will use it for:
 * - File system watching notifications
 * - VCS status updates
 * - Build/task progress streams
 * - Agent execution logs
 */
export interface KaliEvents {
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
  on(channel: string, callback: EventCallback): void;

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
  send(channel: string, ...args: unknown[]): void;
}

/**
 * Complete Kali API exposed to the renderer via contextBridge.
 * This is the root namespace for all main ↔ renderer communication.
 *
 * Security: This API is the ONLY interface between renderer and main process.
 * It is exposed via Electron's contextBridge with contextIsolation=true,
 * ensuring the renderer cannot access Node.js APIs or ipcRenderer directly.
 *
 * @see https://www.electronjs.org/docs/latest/tutorial/context-isolation
 */
export interface KaliAPI {
  /**
   * RPC methods for request/response communication.
   * All methods return Promises and support error handling.
   * @see KaliRPC
   */
  rpc: KaliRPC;

  /**
   * Event streaming for one-way push notifications.
   * Supports main → renderer and renderer → main communication.
   * @see KaliEvents
   */
  events: KaliEvents;
}

/**
 * Global type augmentation for window.kali.
 * This enables TypeScript autocomplete in the renderer process.
 *
 * @example
 * // In renderer code:
 * const theme = await window.kali.rpc.settings.get('theme');
 * // TypeScript knows .rpc.settings.get exists and its signature
 */
declare global {
  interface Window {
    /**
     * Kali IPC API.
     * Exposed by the preload script via contextBridge.exposeInMainWorld.
     * Available in all renderer processes.
     */
    kali: KaliAPI;
  }
}

/**
 * RPC handler function type.
 * Handlers are registered in the main process and invoked via IPC.
 *
 * @template TInput - The validated input type (after Zod parsing)
 * @template TOutput - The return type (will be serialized for IPC)
 *
 * @param input - Validated input from Zod schema
 * @returns Promise resolving to handler output
 * @throws BusinessError for user-facing errors
 * @throws TechnicalError for internal failures
 * @throws ExternalError for third-party API failures
 */
export type RPCHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput
) => Promise<TOutput>;

/**
 * Namespace handler collection.
 * Maps method names to their handler functions.
 *
 * @example
 * const settingsHandlers: NamespaceHandlers = {
 *   get: async (input) => { ... },
 *   update: async (input) => { ... }
 * };
 */
export type NamespaceHandlers = Record<string, RPCHandler>;

/**
 * Complete router configuration.
 * Maps namespace names to their handler collections.
 *
 * @example
 * const router: RPCRouterConfig = {
 *   settings: settingsHandlers,
 *   workspaces: workspacesHandlers, // Future epic
 * };
 */
export type RPCRouterConfig = Record<string, NamespaceHandlers>;
