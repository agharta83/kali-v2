// SPDX-License-Identifier: AGPL-3.0-or-later
// Drizzle ORM schema definitions for the encrypted SQLite database.
// Defines all database tables, columns, and indexes for Kali-v2.

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Settings table for storing application configuration as key-value pairs.
 *
 * All values are stored as JSON strings to support complex data types.
 * The updated_at timestamp tracks when each setting was last modified.
 *
 * This table is encrypted at rest using SQLCipher. All data is protected
 * by a master encryption key stored securely via Electron's safeStorage API.
 *
 * @example
 * ```typescript
 * // Insert a setting
 * await db.insert(settings).values({
 *   key: 'theme',
 *   value_json: JSON.stringify({ mode: 'dark', accent: 'blue' }),
 *   updated_at: Date.now()
 * });
 *
 * // Query a setting
 * const result = await db.select()
 *   .from(settings)
 *   .where(eq(settings.key, 'theme'))
 *   .get();
 *
 * if (result) {
 *   const value = JSON.parse(result.value_json);
 *   console.log('Theme:', value);
 * }
 * ```
 */
export const settings = sqliteTable('settings', {
  /**
   * Unique identifier for the setting.
   * Acts as the primary key for the table.
   *
   * @example 'theme', 'user.preferences', 'app.version'
   */
  key: text('key').primaryKey().notNull(),

  /**
   * JSON-encoded value of the setting.
   * Supports any serializable JavaScript value (objects, arrays, primitives).
   *
   * @example
   * - Simple value: '"dark"' (JSON string)
   * - Complex object: '{"mode":"dark","accent":"blue"}'
   * - Array: '["en","fr","de"]'
   */
  value_json: text('value_json').notNull(),

  /**
   * Unix timestamp (milliseconds) of the last update to this setting.
   * Updated automatically on insert or update operations.
   *
   * @example 1714521600000 (represents 2024-05-01 00:00:00 UTC)
   */
  updated_at: integer('updated_at').notNull(),
});

/**
 * TypeScript type inferred from the settings table schema.
 * Use this for type annotations when querying or inserting settings.
 *
 * @example
 * ```typescript
 * const newSetting: typeof settings.$inferInsert = {
 *   key: 'language',
 *   value_json: JSON.stringify('en'),
 *   updated_at: Date.now()
 * };
 * ```
 */
export type Setting = typeof settings.$inferSelect;

/**
 * TypeScript type for inserting new settings.
 * All fields are required as per the schema definition.
 *
 * @example
 * ```typescript
 * const insertData: typeof settings.$inferInsert = {
 *   key: 'notifications',
 *   value_json: JSON.stringify({ enabled: true }),
 *   updated_at: Date.now()
 * };
 * ```
 */
export type NewSetting = typeof settings.$inferInsert;
