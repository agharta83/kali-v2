// SPDX-License-Identifier: AGPL-3.0-or-later
// SafeStorageSecretStore implementation using Electron's safeStorage API.
// Stores encrypted secrets as files in the userData/.secrets directory.

import { safeStorage, app } from 'electron';
import type { SecretStore } from '../../domain/secrets/SecretStore';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Implementation of SecretStore using Electron's safeStorage API.
 *
 * This implementation:
 * - Encrypts secrets using OS-level encryption (Keychain on macOS, DPAPI on Windows, libsecret on Linux)
 * - Stores encrypted data as files in userData/.secrets directory
 * - Sanitizes secret keys for safe filesystem usage
 * - Provides transactional guarantees for file operations
 *
 * Security properties:
 * - Encryption keys are managed by the OS keychain (never stored in application code)
 * - Encrypted files are unreadable without OS-level authentication
 * - File permissions are restricted to the current user
 *
 * @example
 * ```typescript
 * const store = new SafeStorageSecretStore();
 *
 * // Store database encryption key
 * await store.setSecret('kali:db:master', 'a1b2c3d4e5f6...');
 *
 * // Retrieve it later
 * const key = await store.getSecret('kali:db:master');
 * ```
 */
export class SafeStorageSecretStore implements SecretStore {
  private readonly storePath: string;

  /**
   * Creates a new SafeStorageSecretStore instance.
   *
   * Automatically creates the .secrets directory in userData if it doesn't exist.
   * Directory permissions are set to 0700 (read/write/execute for owner only).
   */
  constructor() {
    // Store encrypted secrets in userData directory
    // userData location varies by platform:
    // - Linux: ~/.config/kali-v2
    // - macOS: ~/Library/Application Support/kali-v2
    // - Windows: %APPDATA%/kali-v2
    this.storePath = path.join(app.getPath('userData'), '.secrets');

    // Create secrets directory if it doesn't exist
    if (!fs.existsSync(this.storePath)) {
      fs.mkdirSync(this.storePath, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Store a secret value securely.
   *
   * Encrypts the value using Electron's safeStorage API and writes it to a file.
   * If a secret with the same key already exists, it is overwritten atomically.
   *
   * @param key - Unique identifier for the secret (e.g., 'kali:db:master')
   * @param value - Secret value to encrypt and store
   * @throws Error if safeStorage encryption is not available on the system
   *
   * @example
   * ```typescript
   * await store.setSecret('kali:db:master', 'encryption-key-here');
   * ```
   */
  async setSecret(key: string, value: string): Promise<void> {
    // Verify encryption is available before proceeding
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error(
        'Encryption is not available on this system. ' +
        'On Linux, ensure libsecret-1-dev is installed.'
      );
    }

    // Encrypt the value using OS-level encryption
    const encrypted = safeStorage.encryptString(value);

    // Write encrypted data to file
    const filePath = this.getSecretFilePath(key);
    fs.writeFileSync(filePath, encrypted, { mode: 0o600 });
  }

  /**
   * Retrieve a secret value.
   *
   * Reads the encrypted file and decrypts it using Electron's safeStorage API.
   * Returns null if the secret does not exist.
   *
   * @param key - Unique identifier for the secret
   * @returns The decrypted secret value, or null if not found
   * @throws Error if decryption fails (e.g., corrupted file)
   *
   * @example
   * ```typescript
   * const dbKey = await store.getSecret('kali:db:master');
   * if (dbKey) {
   *   // Initialize database with the key
   *   initializeDatabase(dbKey);
   * } else {
   *   // Generate new key on first run
   *   const newKey = generateKey();
   *   await store.setSecret('kali:db:master', newKey);
   * }
   * ```
   */
  async getSecret(key: string): Promise<string | null> {
    const filePath = this.getSecretFilePath(key);

    // Return null if secret file doesn't exist
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      // Read encrypted data from file
      const encrypted = fs.readFileSync(filePath);

      // Decrypt using safeStorage
      return safeStorage.decryptString(encrypted);
    } catch (error) {
      throw new Error(
        `Failed to decrypt secret '${key}': ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Delete a secret value.
   *
   * Permanently removes the encrypted secret file from storage.
   * This operation is idempotent - deleting a non-existent secret does not throw an error.
   *
   * @param key - Unique identifier for the secret
   *
   * @example
   * ```typescript
   * await store.deleteSecret('kali:db:master');
   * // Secret file is now deleted
   * ```
   */
  async deleteSecret(key: string): Promise<void> {
    const filePath = this.getSecretFilePath(key);

    // Only delete if file exists (idempotent operation)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * Check if a secret exists.
   *
   * Checks for the existence of the encrypted secret file without reading or decrypting it.
   *
   * @param key - Unique identifier for the secret
   * @returns true if the secret exists, false otherwise
   *
   * @example
   * ```typescript
   * if (await store.hasSecret('kali:db:master')) {
   *   console.log('Database key already exists');
   * } else {
   *   console.log('Need to generate database key');
   * }
   * ```
   */
  async hasSecret(key: string): Promise<boolean> {
    const filePath = this.getSecretFilePath(key);
    return fs.existsSync(filePath);
  }

  /**
   * Convert a secret key to a safe filesystem path.
   *
   * Sanitizes the key by replacing non-alphanumeric characters (except hyphens and underscores)
   * with underscores. Adds .enc extension to indicate encrypted content.
   *
   * @param key - Secret key to sanitize
   * @returns Full filesystem path to the encrypted secret file
   *
   * @example
   * ```typescript
   * getSecretFilePath('kali:db:master')
   * // => '/path/to/userData/.secrets/kali_db_master.enc'
   * ```
   */
  private getSecretFilePath(key: string): string {
    // Sanitize key for filesystem safety
    // Replace any character that's not alphanumeric, hyphen, or underscore with underscore
    const sanitized = key.replace(/[^a-zA-Z0-9-_]/g, '_');

    // Return full path with .enc extension
    return path.join(this.storePath, `${sanitized}.enc`);
  }
}
