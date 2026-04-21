// SPDX-License-Identifier: AGPL-3.0-or-later
// Settings namespace handler for IPC communication.
// Currently returns mock data - persistence will be added in STORY-005.

import type { GetSettingInput, UpdateSettingInput } from '@shared/contracts/settings';

/**
 * Mock settings store.
 * In-memory stub data until database integration in STORY-005.
 */
const mockSettings: Record<string, unknown> = {
  theme: 'dark',
  language: 'en',
  autoSave: true,
  fontSize: 14
};

/**
 * Retrieves a setting value by key.
 * Returns mock data from in-memory store.
 *
 * @param input - Validated GetSettingInput (key must be non-empty)
 * @returns Promise resolving to the setting value or null if not found
 *
 * @example
 * const result = await get({ key: 'theme' });
 * // => 'dark'
 */
async function get(input: GetSettingInput): Promise<unknown> {
  const { key } = input;

  // Return mock value if it exists, otherwise null
  return mockSettings[key] ?? null;
}

/**
 * Updates a setting value.
 * Currently logs the update but does not persist (stub implementation).
 * Actual persistence will be implemented in STORY-005.
 *
 * @param input - Validated UpdateSettingInput (key must be non-empty, value can be any type)
 * @returns Promise resolving when update completes
 *
 * @example
 * await update({ key: 'theme', value: 'light' });
 * // => Promise<void> (logs to console but doesn't persist)
 */
async function update(input: UpdateSettingInput): Promise<void> {
  const { key, value } = input;

  // Update in-memory mock store
  mockSettings[key] = value;

  // Log for debugging (will be removed when real persistence is added)
  // Note: This is intentional logging for stub behavior, not debugging code
  console.log(`[Settings Handler] Updated setting: ${key} =`, value);
}

/**
 * Settings namespace handlers.
 * Exported for registration in the IPC router.
 *
 * Type note: Handlers are strongly typed via their input parameters
 * (GetSettingInput, UpdateSettingInput). The router will validate
 * inputs with Zod before calling these handlers.
 */
export const settingsHandlers = {
  get,
  update
};
