// SPDX-License-Identifier: AGPL-3.0-or-later
// IPC router factory with Zod validation middleware.
// Registers typed handlers for all RPC namespaces and provides centralized
// error handling with automatic validation error conversion.

import { ipcMain } from 'electron';
import { ZodError } from 'zod';
import { GetSettingInput, UpdateSettingInput } from '@shared/contracts/settings';
import { BusinessError, TechnicalError } from '@shared/errors';
import { settingsHandlers } from './handlers/settings';

/**
 * Creates and registers the IPC router for all RPC namespaces.
 * This is the central hub for main ↔ renderer communication.
 *
 * Security Model:
 * - All inputs are validated with Zod schemas before reaching handlers
 * - Handlers never receive raw, unvalidated data from the renderer
 * - All errors are wrapped with machine-readable codes for renderer consumption
 * - The router catches both validation errors (Zod) and handler errors
 *
 * Error Handling Strategy:
 * - ZodError → BusinessError with code 'VALIDATION_ERROR'
 * - BusinessError → Pass through as-is (user-facing error)
 * - TechnicalError → Pass through as-is (internal error)
 * - Unknown errors → TechnicalError with code 'INTERNAL_ERROR'
 *
 * @example
 * // In main process entry point (src/main/index.ts):
 * import { createRPCRouter } from './ipc/router';
 *
 * app.whenReady().then(() => {
 *   createRPCRouter();
 *   createWindow();
 * });
 *
 * @example
 * // In renderer process:
 * const theme = await window.kali.rpc.settings.get('theme');
 * // Router validates input, calls settingsHandlers.get, returns result
 */
export function createRPCRouter(): void {
  /**
   * Settings namespace: settings.get
   * Channel: rpc:settings.get
   *
   * Validates input with GetSettingInput schema, then retrieves setting value.
   *
   * @throws BusinessError with code 'VALIDATION_ERROR' if input invalid
   * @throws TechnicalError with code 'INTERNAL_ERROR' if handler fails
   */
  ipcMain.handle('rpc:settings.get', async (_event, rawInput: unknown) => {
    try {
      // Validate input with Zod BEFORE calling handler
      const input = GetSettingInput.parse(rawInput);

      // Call handler with validated input
      const result = await settingsHandlers.get(input);

      return result;
    } catch (error) {
      // Convert Zod validation errors to BusinessError
      if (error instanceof ZodError) {
        throw new BusinessError(
          `Validation failed: ${error.issues.map((e) => e.message).join(', ')}`,
          'VALIDATION_ERROR',
          { zodErrors: error.issues }
        );
      }

      // Pass through BusinessError and TechnicalError as-is
      if (error instanceof BusinessError || error instanceof TechnicalError) {
        throw error;
      }

      // Wrap unknown errors as TechnicalError
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new TechnicalError(
        `Internal error in settings.get: ${errorMessage}`,
        'INTERNAL_ERROR',
        { originalError: error instanceof Error ? error.stack : String(error) }
      );
    }
  });

  /**
   * Settings namespace: settings.update
   * Channel: rpc:settings.update
   *
   * Validates input with UpdateSettingInput schema, then updates setting value.
   *
   * @throws BusinessError with code 'VALIDATION_ERROR' if input invalid
   * @throws TechnicalError with code 'INTERNAL_ERROR' if handler fails
   */
  ipcMain.handle('rpc:settings.update', async (_event, rawInput: unknown) => {
    try {
      // Validate input with Zod BEFORE calling handler
      const input = UpdateSettingInput.parse(rawInput);

      // Call handler with validated input
      await settingsHandlers.update(input);

      // No return value for update (void)
      return;
    } catch (error) {
      // Convert Zod validation errors to BusinessError
      if (error instanceof ZodError) {
        throw new BusinessError(
          `Validation failed: ${error.issues.map((e) => e.message).join(', ')}`,
          'VALIDATION_ERROR',
          { zodErrors: error.issues }
        );
      }

      // Pass through BusinessError and TechnicalError as-is
      if (error instanceof BusinessError || error instanceof TechnicalError) {
        throw error;
      }

      // Wrap unknown errors as TechnicalError
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new TechnicalError(
        `Internal error in settings.update: ${errorMessage}`,
        'INTERNAL_ERROR',
        { originalError: error instanceof Error ? error.stack : String(error) }
      );
    }
  });
}
