// SPDX-License-Identifier: AGPL-3.0-or-later
// Zod schemas for settings namespace RPC methods.
// These schemas validate all inputs/outputs at the IPC boundary for type safety.

import { z } from 'zod';

/**
 * Input schema for settings.get RPC method.
 * Validates that a setting key is provided and non-empty.
 *
 * @example
 * const input = GetSettingInput.parse({ key: 'theme' });
 * // => { key: 'theme' }
 *
 * GetSettingInput.parse({ key: '' });
 * // => throws ZodError (key must be at least 1 character)
 */
export const GetSettingInput = z.object({
  key: z.string().min(1, 'Setting key must not be empty')
});

/**
 * TypeScript type inferred from GetSettingInput schema.
 * Use this for type annotations in handlers and preload bridge.
 */
export type GetSettingInput = z.infer<typeof GetSettingInput>;

/**
 * Input schema for settings.update RPC method.
 * Validates that a setting key is provided and non-empty.
 * The value can be any type (unknown) - validation of specific setting types
 * happens in the business logic layer, not at the IPC boundary.
 *
 * @example
 * const input = UpdateSettingInput.parse({ key: 'theme', value: 'dark' });
 * // => { key: 'theme', value: 'dark' }
 *
 * UpdateSettingInput.parse({ key: '', value: 'dark' });
 * // => throws ZodError (key must be at least 1 character)
 */
export const UpdateSettingInput = z.object({
  key: z.string().min(1, 'Setting key must not be empty'),
  value: z.unknown()
});

/**
 * TypeScript type inferred from UpdateSettingInput schema.
 * Use this for type annotations in handlers and preload bridge.
 */
export type UpdateSettingInput = z.infer<typeof UpdateSettingInput>;
