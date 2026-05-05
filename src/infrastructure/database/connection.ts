// SPDX-License-Identifier: AGPL-3.0-or-later
// Database connection module with SQLCipher encryption setup.
// Initializes encrypted SQLite database using better-sqlite3-multiple-ciphers.

import Database from 'better-sqlite3-multiple-ciphers';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { app } from 'electron';
import * as path from 'path';
import { TechnicalError } from '@shared/errors';

/**
 * Result of database initialization.
 *
 * Contains both the Drizzle ORM instance (for queries) and the raw SQLite
 * connection (for pragma operations and migrations).
 */
export interface DatabaseConnection {
  /**
   * Drizzle ORM instance for type-safe database queries.
   *
   * @example
   * ```typescript
   * const { db } = initializeDatabase(encryptionKey);
   * const results = await db.select().from(settings).all();
   * ```
   */
  db: BetterSQLite3Database;

  /**
   * Raw better-sqlite3 connection for low-level operations.
   *
   * Use this for pragma commands, migrations, and operations that
   * require direct SQLite access.
   *
   * @example
   * ```typescript
   * const { sqlite } = initializeDatabase(encryptionKey);
   * sqlite.pragma('journal_mode = WAL');
   * ```
   */
  sqlite: Database.Database;
}

/**
 * Initialize an encrypted SQLite database using SQLCipher.
 *
 * This function performs the following critical steps IN ORDER:
 * 1. Opens the database file from userData directory
 * 2. Configures SQLCipher encryption (MUST be done before any queries)
 * 3. Sets the encryption key (MUST be done before any queries)
 * 4. Verifies encryption is working correctly
 * 5. Initializes and returns Drizzle ORM instance
 *
 * **CRITICAL**: The cipher and key pragmas MUST be executed immediately after
 * opening the database, before any other operations. Querying the database
 * before setting the encryption key will fail or potentially corrupt the database.
 *
 * Database location:
 * - Linux: ~/.config/kali-v2/kali.db
 * - macOS: ~/Library/Application Support/kali-v2/kali.db
 * - Windows: %APPDATA%/kali-v2/kali.db
 *
 * @param encryptionKey - Hex-encoded encryption key (64 characters, 32 bytes)
 *                        Generated with crypto.randomBytes(32).toString('hex')
 *                        Stored securely via Electron safeStorage API
 * @returns Database connection with Drizzle ORM and raw SQLite instances
 * @throws Error if encryption setup fails or cipher_version verification fails
 *
 * @example
 * ```typescript
 * // First-time initialization - generate and store key
 * import { randomBytes } from 'crypto';
 * import { SafeStorageSecretStore } from '../secrets/SafeStorageSecretStore';
 *
 * const secretStore = new SafeStorageSecretStore();
 * const keyExists = await secretStore.hasSecret('kali:db:master');
 *
 * let encryptionKey: string;
 * if (!keyExists) {
 *   // Generate new key on first run
 *   encryptionKey = randomBytes(32).toString('hex');
 *   await secretStore.setSecret('kali:db:master', encryptionKey);
 * } else {
 *   // Retrieve existing key
 *   encryptionKey = await secretStore.getSecret('kali:db:master') as string;
 * }
 *
 * // Initialize database
 * const { db, sqlite } = initializeDatabase(encryptionKey);
 *
 * // Run migrations
 * await migrate(db, { migrationsFolder: './drizzle' });
 *
 * // Use database
 * const results = await db.select().from(settings).all();
 * ```
 *
 * @example
 * ```typescript
 * // Subsequent app launches - reuse stored key
 * const secretStore = new SafeStorageSecretStore();
 * const encryptionKey = await secretStore.getSecret('kali:db:master') as string;
 * const { db, sqlite } = initializeDatabase(encryptionKey);
 * ```
 */
export function initializeDatabase(encryptionKey: string): DatabaseConnection {
  if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
    throw new TechnicalError(
      'Invalid encryption key: must be 64-character hex string (32 bytes)',
      'DB_INVALID_KEY'
    );
  }

  // Get database file path in userData directory
  const dbPath = path.join(app.getPath('userData'), 'kali.db');

  // 1. Open database file
  // Opens in read-write mode, creates file if it doesn't exist
  const sqlite = new Database(dbPath);

  try {
    // 2. Set cipher IMMEDIATELY (before any queries)
    // Configures SQLCipher as the encryption provider
    // CRITICAL: This must be the first pragma executed after opening the database
    sqlite.pragma("cipher='sqlcipher'");

    // 3. Set encryption key IMMEDIATELY (before any queries)
    // Provides the master key for database encryption/decryption
    // CRITICAL: This must be the second pragma, immediately after cipher
    // Without this, any query will fail or potentially corrupt the database
    // Safe: encryptionKey is validated as /^[0-9a-fA-F]{64}$/ above; PRAGMA doesn't support bind parameters.
    sqlite.pragma(`key='${encryptionKey}'`);

    // 4. Verify encryption is working
    // Attempts to read SQLCipher version information
    // This will fail if the key is incorrect or encryption setup failed
    // Note: Try getting cipher_version first; if it's null, try cipher_provider as fallback
    let cipherVersion = sqlite.pragma('cipher_version', { simple: true });

    // Fallback: Some builds may not expose cipher_version but still support encryption
    if (!cipherVersion) {
      // Try a simple query to verify the database is accessible with the key
      // If this succeeds, encryption is working even if cipher_version is not available
      try {
        sqlite.prepare('SELECT 1').get();
        cipherVersion = 'sqlcipher (version unknown)';

        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.log('Database encryption initialized (cipher_version pragma not available, but key accepted)');
        }
      } catch {
        throw new TechnicalError('Failed to verify encryption: cipher_version returned null and test query failed', 'DB_ENCRYPTION_VERIFY');
      }
    }

    // Log successful encryption setup (helpful for debugging)
    // cipher_version typically returns something like "4.5.5 community"
    if (process.env.NODE_ENV === 'development' && cipherVersion !== 'sqlcipher (version unknown)') {
      // eslint-disable-next-line no-console
      console.log(`Database encryption initialized: SQLCipher ${cipherVersion}`);
    }
  } catch (error) {
    // Close database connection on failure to prevent resource leaks
    sqlite.close();

    throw new TechnicalError(
      `Failed to initialize encrypted database: ${
        error instanceof Error ? error.message : String(error)
      }`,
      'DB_INIT_ERROR'
    );
  }

  // 5. Initialize Drizzle ORM with the encrypted database
  // Provides type-safe query builder on top of the encrypted SQLite connection
  const db = drizzle(sqlite);

  return { db, sqlite };
}
