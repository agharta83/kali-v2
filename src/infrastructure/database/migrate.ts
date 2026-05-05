// SPDX-License-Identifier: AGPL-3.0-or-later
// Transactional migration runner for Drizzle ORM.
// Executes pending database migrations with automatic rollback on failure.

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

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
 * @param db - Drizzle ORM instance (already initialized with the encrypted connection)
 * @throws Error if any migration fails (transaction is automatically rolled back)
 */
export async function runMigrations(db: BetterSQLite3Database): Promise<void> {
  try {
    await migrate(db, { migrationsFolder: './drizzle' });

    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log('Migrations completed successfully');
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Migration failed:', error);

    throw new Error(
      `Database migration failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
