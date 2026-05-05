// SPDX-License-Identifier: AGPL-3.0-or-later
// Integration tests for database initialization, encryption, and migrations

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initializeDatabase } from '../../src/infrastructure/database/connection';
import { runMigrations } from '../../src/infrastructure/database/migrate';
import { settings } from '../../src/infrastructure/database/schema';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { eq } from 'drizzle-orm';

// Mock electron's app module to use temporary directory for tests
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') {
        // Use system temp directory for test databases
        return path.join(os.tmpdir(), 'kali-v2-test-' + Date.now());
      }
      return '';
    }),
  },
}));

describe('Database Integration Tests', () => {
  let testDbPath: string;
  let testUserDataPath: string;
  let encryptionKey: string;

  beforeEach(() => {
    // Generate a unique encryption key for each test
    encryptionKey = randomBytes(32).toString('hex');

    // Get the mocked userData path
    const { app } = require('electron');
    testUserDataPath = app.getPath('userData');
    testDbPath = path.join(testUserDataPath, 'kali.db');

    // Ensure test directory exists
    if (!fs.existsSync(testUserDataPath)) {
      fs.mkdirSync(testUserDataPath, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test database and directory
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
      if (fs.existsSync(testUserDataPath)) {
        fs.rmSync(testUserDataPath, { recursive: true, force: true });
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Cleanup warning:', error);
    }
  });

  describe('Database Initialization', () => {
    it('should create database file on initialization', () => {
      expect(fs.existsSync(testDbPath)).toBe(false);

      const { sqlite } = initializeDatabase(encryptionKey);

      expect(fs.existsSync(testDbPath)).toBe(true);
      expect(fs.statSync(testDbPath).isFile()).toBe(true);

      sqlite.close();
    });

    it('should initialize database with encryption', () => {
      const { sqlite } = initializeDatabase(encryptionKey);

      // Verify database connection is open and functional
      const result = sqlite.prepare('SELECT 1 as test').get() as { test: number };
      expect(result.test).toBe(1);

      sqlite.close();
    });

    it('should throw error with invalid encryption key (wrong length)', () => {
      const invalidKey = 'tooshort';

      expect(() => initializeDatabase(invalidKey)).toThrow(
        'Invalid encryption key: must be 64-character hex string (32 bytes)'
      );
    });

    it('should throw error with empty encryption key', () => {
      expect(() => initializeDatabase('')).toThrow(
        'Invalid encryption key: must be 64-character hex string (32 bytes)'
      );
    });

    it('should throw error with non-hex 64-character key', () => {
      const nonHexKey = 'g'.repeat(64);
      expect(() => initializeDatabase(nonHexKey)).toThrow(
        'Invalid encryption key: must be 64-character hex string (32 bytes)'
      );
    });

    it('should return both db and sqlite instances', () => {
      const connection = initializeDatabase(encryptionKey);

      expect(connection).toHaveProperty('db');
      expect(connection).toHaveProperty('sqlite');
      expect(connection.db).toBeDefined();
      expect(connection.sqlite).toBeDefined();

      connection.sqlite.close();
    });

    it('should fail to open database with wrong encryption key', () => {
      // Initialize database with first key
      const { sqlite: sqlite1 } = initializeDatabase(encryptionKey);
      sqlite1.close();

      // Try to open with different key
      const wrongKey = randomBytes(32).toString('hex');

      // This should fail when trying to verify encryption
      // Note: The error might occur during initialization or on first query
      expect(() => {
        const { sqlite: sqlite2 } = initializeDatabase(wrongKey);
        // Try to query to force decryption
        try {
          sqlite2.prepare('SELECT 1').get();
          sqlite2.close();
        } catch (error) {
          sqlite2.close();
          throw error;
        }
      }).toThrow();
    });

    it('should reopen existing database with correct key', () => {
      // Create and close database
      const { sqlite: sqlite1 } = initializeDatabase(encryptionKey);
      sqlite1.close();

      // Reopen with same key - should succeed
      const { sqlite: sqlite2 } = initializeDatabase(encryptionKey);
      const result = sqlite2.prepare('SELECT 1 as test').get() as { test: number };
      expect(result.test).toBe(1);

      sqlite2.close();
    });
  });

  describe('Database Encryption', () => {
    it('should create encrypted database file (binary content)', () => {
      const { sqlite } = initializeDatabase(encryptionKey);
      sqlite.close();

      // Read first 16 bytes of database file
      const fileBuffer = fs.readFileSync(testDbPath);
      const headerBytes = fileBuffer.slice(0, 16);

      // SQLite unencrypted header starts with "SQLite format 3\0"
      // Encrypted database should NOT have this plaintext header
      const unencryptedHeader = Buffer.from('SQLite format 3\0');
      const isPlaintext = headerBytes.equals(unencryptedHeader);

      expect(isPlaintext).toBe(false);
    });

    it('should not contain plaintext "SQLite" string in header', () => {
      const { sqlite } = initializeDatabase(encryptionKey);
      sqlite.close();

      // Read first 100 bytes and check for plaintext "SQLite" string
      const fileBuffer = fs.readFileSync(testDbPath);
      const headerString = fileBuffer.slice(0, 100).toString('utf-8', 0, 100);

      // Encrypted database should not contain readable "SQLite" text
      expect(headerString).not.toContain('SQLite');
    });

    it('should contain binary garbage (not readable text)', () => {
      const { sqlite } = initializeDatabase(encryptionKey);
      sqlite.close();

      // Read first 100 bytes
      const fileBuffer = fs.readFileSync(testDbPath);
      const header = fileBuffer.slice(0, 100);

      // Count printable ASCII characters (should be low for encrypted data)
      let printableCount = 0;
      for (const byte of header) {
        if (byte >= 32 && byte <= 126) {
          printableCount++;
        }
      }

      // Encrypted data should have low percentage of printable characters
      // (typically less than 30% for binary data)
      const printablePercent = (printableCount / 100) * 100;
      expect(printablePercent).toBeLessThan(30);
    });
  });

  describe('Migration Execution', () => {
    it('should run migrations successfully', async () => {
      const { db, sqlite } = initializeDatabase(encryptionKey);

      await expect(runMigrations(db)).resolves.toBeUndefined();

      sqlite.close();
    });

    it('should create settings table after migration', async () => {
      const { db, sqlite } = initializeDatabase(encryptionKey);
      await runMigrations(db);

      // Check if settings table exists
      const tableInfo = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='settings'"
        )
        .get() as { name: string } | undefined;

      expect(tableInfo).toBeDefined();
      expect(tableInfo?.name).toBe('settings');

      sqlite.close();
    });

    it('should create settings table with correct schema', async () => {
      const { db, sqlite } = initializeDatabase(encryptionKey);
      await runMigrations(db);

      // Get table schema
      const columns = sqlite.prepare('PRAGMA table_info(settings)').all() as Array<{
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }>;

      expect(columns).toHaveLength(3);

      // Check 'key' column
      const keyColumn = columns.find((col) => col.name === 'key');
      expect(keyColumn).toBeDefined();
      expect(keyColumn?.type.toLowerCase()).toBe('text');
      expect(keyColumn?.notnull).toBe(1);
      expect(keyColumn?.pk).toBe(1); // Primary key

      // Check 'value_json' column
      const valueColumn = columns.find((col) => col.name === 'value_json');
      expect(valueColumn).toBeDefined();
      expect(valueColumn?.type.toLowerCase()).toBe('text');
      expect(valueColumn?.notnull).toBe(1);

      // Check 'updated_at' column
      const updatedAtColumn = columns.find((col) => col.name === 'updated_at');
      expect(updatedAtColumn).toBeDefined();
      expect(updatedAtColumn?.type.toLowerCase()).toBe('integer');
      expect(updatedAtColumn?.notnull).toBe(1);

      sqlite.close();
    });

    it('should create migration journal table', async () => {
      const { db, sqlite } = initializeDatabase(encryptionKey);
      await runMigrations(db);

      // Check if __drizzle_migrations table exists
      const tableInfo = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'"
        )
        .get() as { name: string } | undefined;

      expect(tableInfo).toBeDefined();
      expect(tableInfo?.name).toBe('__drizzle_migrations');

      sqlite.close();
    });

    it('should record migration in journal', async () => {
      const { db, sqlite } = initializeDatabase(encryptionKey);
      await runMigrations(db);

      // Query migration journal
      const migrations = sqlite
        .prepare('SELECT * FROM __drizzle_migrations')
        .all() as Array<{
        id: number;
        hash: string;
        created_at: number;
      }>;

      expect(migrations.length).toBeGreaterThan(0);
      expect(migrations[0]).toHaveProperty('hash');
      expect(migrations[0]).toHaveProperty('created_at');

      sqlite.close();
    });

    it('should not run same migration twice (idempotent)', async () => {
      const { db, sqlite } = initializeDatabase(encryptionKey);

      // Run migrations first time
      await runMigrations(db);

      // Get migration count
      const firstCount = sqlite
        .prepare('SELECT COUNT(*) as count FROM __drizzle_migrations')
        .get() as { count: number };

      // Run migrations again
      await runMigrations(db);

      // Migration count should be the same
      const secondCount = sqlite
        .prepare('SELECT COUNT(*) as count FROM __drizzle_migrations')
        .get() as { count: number };

      expect(secondCount.count).toBe(firstCount.count);

      sqlite.close();
    });
  });

  describe('Settings Table Operations', () => {
    let db: any;
    let sqlite: any;

    beforeEach(async () => {
      const connection = initializeDatabase(encryptionKey);
      db = connection.db;
      sqlite = connection.sqlite;
      await runMigrations(db);
    });

    afterEach(() => {
      if (sqlite && !sqlite.open) {
        sqlite.close();
      }
    });

    it('should insert a setting', async () => {
      const newSetting = {
        key: 'test-key',
        value_json: JSON.stringify({ value: 'test' }),
        updated_at: Date.now(),
      };

      await db.insert(settings).values(newSetting);

      const result = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'test-key'))
        .get();

      expect(result).toBeDefined();
      expect(result.key).toBe('test-key');
      expect(result.value_json).toBe(newSetting.value_json);
    });

    it('should select a setting', async () => {
      // Insert test data
      const testData = {
        key: 'theme',
        value_json: JSON.stringify({ mode: 'dark' }),
        updated_at: Date.now(),
      };
      await db.insert(settings).values(testData);

      // Select it back
      const result = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'theme'))
        .get();

      expect(result).toBeDefined();
      expect(result.key).toBe('theme');
      expect(JSON.parse(result.value_json)).toEqual({ mode: 'dark' });
    });

    it('should update a setting', async () => {
      // Insert initial data
      const initial = {
        key: 'counter',
        value_json: JSON.stringify({ count: 0 }),
        updated_at: Date.now(),
      };
      await db.insert(settings).values(initial);

      // Update it
      const newTimestamp = Date.now();
      await db
        .update(settings)
        .set({
          value_json: JSON.stringify({ count: 1 }),
          updated_at: newTimestamp,
        })
        .where(eq(settings.key, 'counter'));

      // Verify update
      const result = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'counter'))
        .get();

      expect(JSON.parse(result.value_json)).toEqual({ count: 1 });
      expect(result.updated_at).toBe(newTimestamp);
    });

    it('should delete a setting', async () => {
      // Insert test data
      await db.insert(settings).values({
        key: 'temp',
        value_json: JSON.stringify({ value: 'temporary' }),
        updated_at: Date.now(),
      });

      // Verify it exists
      let result = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'temp'))
        .get();
      expect(result).toBeDefined();

      // Delete it
      await db.delete(settings).where(eq(settings.key, 'temp'));

      // Verify it's gone
      result = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'temp'))
        .get();
      expect(result).toBeUndefined();
    });

    it('should handle multiple settings', async () => {
      // Insert multiple settings
      const settingsData = [
        {
          key: 'setting1',
          value_json: JSON.stringify({ value: 1 }),
          updated_at: Date.now(),
        },
        {
          key: 'setting2',
          value_json: JSON.stringify({ value: 2 }),
          updated_at: Date.now(),
        },
        {
          key: 'setting3',
          value_json: JSON.stringify({ value: 3 }),
          updated_at: Date.now(),
        },
      ];

      for (const setting of settingsData) {
        await db.insert(settings).values(setting);
      }

      // Query all settings
      const allSettings = await db.select().from(settings).all();

      expect(allSettings).toHaveLength(3);
      expect(allSettings.map((s: any) => s.key)).toEqual([
        'setting1',
        'setting2',
        'setting3',
      ]);
    });

    it('should enforce primary key constraint', async () => {
      const setting = {
        key: 'duplicate-key',
        value_json: JSON.stringify({ value: 'first' }),
        updated_at: Date.now(),
      };

      // Insert first time - should succeed
      await db.insert(settings).values(setting);

      // Try to insert with same key - should fail
      await expect(
        db.insert(settings).values({
          key: 'duplicate-key',
          value_json: JSON.stringify({ value: 'second' }),
          updated_at: Date.now(),
        })
      ).rejects.toThrow();
    });

    it('should persist data across reopens (with correct key)', async () => {
      // Insert data
      await db.insert(settings).values({
        key: 'persistent',
        value_json: JSON.stringify({ value: 'should-persist' }),
        updated_at: Date.now(),
      });

      // Close database
      sqlite.close();

      // Reopen with same key
      const connection2 = initializeDatabase(encryptionKey);
      const db2 = connection2.db;
      const sqlite2 = connection2.sqlite;

      // Data should still be there
      const result = await db2
        .select()
        .from(settings)
        .where(eq(settings.key, 'persistent'))
        .get();

      expect(result).toBeDefined();
      expect(JSON.parse(result.value_json)).toEqual({
        value: 'should-persist',
      });

      sqlite2.close();
    });
  });

  describe('End-to-End Workflow', () => {
    it('should complete full initialization and CRUD workflow', async () => {
      // 1. Initialize database
      const { db, sqlite } = initializeDatabase(encryptionKey);
      expect(fs.existsSync(testDbPath)).toBe(true);

      // 2. Run migrations
      await runMigrations(db);

      // 3. Verify table exists
      const tableInfo = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='settings'"
        )
        .get();
      expect(tableInfo).toBeDefined();

      // 4. Perform CRUD operations
      // Create
      await db.insert(settings).values({
        key: 'e2e-test',
        value_json: JSON.stringify({ step: 'create' }),
        updated_at: Date.now(),
      });

      // Read
      let result = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'e2e-test'))
        .get();
      expect(result).toBeDefined();
      expect(JSON.parse(result.value_json)).toEqual({ step: 'create' });

      // Update
      await db
        .update(settings)
        .set({
          value_json: JSON.stringify({ step: 'update' }),
          updated_at: Date.now(),
        })
        .where(eq(settings.key, 'e2e-test'));

      result = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'e2e-test'))
        .get();
      expect(JSON.parse(result.value_json)).toEqual({ step: 'update' });

      // Delete
      await db.delete(settings).where(eq(settings.key, 'e2e-test'));

      result = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'e2e-test'))
        .get();
      expect(result).toBeUndefined();

      // 5. Verify encryption
      sqlite.close();
      const fileBuffer = fs.readFileSync(testDbPath);
      const header = fileBuffer.slice(0, 16).toString('utf-8');
      expect(header).not.toContain('SQLite');

      // Test complete
    });
  });
});
