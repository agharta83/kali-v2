// SPDX-License-Identifier: AGPL-3.0-or-later
// Transactional migration runner for Drizzle ORM.
// Executes pending database migrations with automatic rollback on failure.

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type Database from 'better-sqlite3-multiple-ciphers';

/**
 * Run all pending database migrations transactionally.
 *
 * This function executes SQL migration files from the `./drizzle` directory
 * in sequential order. Drizzle ORM handles transaction management automatically:
 * - All migrations run within a single transaction
 * - If any migration fails, the entire transaction is rolled back
 * - Migration journal table tracks which migrations have been applied
 *
 * **Transaction Safety**: Drizzle guarantees that failed migrations leave the
 * database in a consistent state. Partial migrations are never committed.
 *
 * **Migration Execution Order**: Migrations are executed in filename order:
 * - 0000_initial.sql
 * - 0001_add_users.sql
 * - 0002_add_posts.sql
 * - etc.
 *
 * The migration journal table (`__drizzle_migrations`) tracks which migrations
 * have already been applied, preventing duplicate execution.
 *
 * @param sqlite - Raw better-sqlite3 database connection (must be initialized with encryption)
 * @throws Error if any migration fails (transaction is automatically rolled back)
 *
 * @example
 * ```typescript
 * import { initializeDatabase } from './connection';
 * import { runMigrations } from './migrate';
 *
 * // Initialize encrypted database
 * const { sqlite } = initializeDatabase(encryptionKey);
 *
 * try {
 *   // Run all pending migrations
 *   await runMigrations(sqlite);
 *   console.log('Database ready');
 * } catch (error) {
 *   console.error('Migration failed:', error);
 *   // Database remains in pre-migration state due to automatic rollback
 *   process.exit(1);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Application startup sequence
 * app.whenReady().then(async () => {
 *   // 1. Get encryption key from secure storage
 *   const secretStore = new SafeStorageSecretStore();
 *   const encryptionKey = await secretStore.getSecret('kali:db:master');
 *
 *   // 2. Initialize database with encryption
 *   const { sqlite } = initializeDatabase(encryptionKey);
 *
 *   // 3. Run migrations BEFORE any other database operations
 *   await runMigrations(sqlite);
 *
 *   // 4. Application is now ready to use the database
 *   createWindow();
 * });
 * ```
 */
export async function runMigrations(sqlite: Database.Database): Promise<void> {
  // Initialize Drizzle ORM instance for migration execution
  // Uses the encrypted SQLite connection that was already configured
  // with cipher and key pragmas in initializeDatabase()
  const db = drizzle(sqlite);

  try {
    // Execute all pending migrations from ./drizzle directory
    // Drizzle handles:
    // - Transaction wrapping (BEGIN/COMMIT)
    // - Automatic rollback on failure (ROLLBACK)
    // - Migration journal tracking (__drizzle_migrations table)
    // - Sequential execution in filename order
    await migrate(db, { migrationsFolder: './drizzle' });

    // Log success message for debugging and monitoring
    // This confirms all migrations completed successfully
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log('Migrations completed successfully');
    }
  } catch (error) {
    // Migration failure - transaction is automatically rolled back by Drizzle
    // Database remains in consistent state (pre-migration)
    // Log detailed error and re-throw to signal failure to caller

    // eslint-disable-next-line no-console
    console.error('Migration failed:', error);

    // Re-throw error to propagate failure up the call stack
    // Caller should handle this by logging and potentially exiting the application
    throw new Error(
      `Database migration failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
