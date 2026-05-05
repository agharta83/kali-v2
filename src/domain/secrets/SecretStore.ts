// SPDX-License-Identifier: AGPL-3.0-or-later
// Domain interface for secure secret storage.
// This abstraction separates secret storage concerns from implementation details,
// allowing different storage backends (OS keychain, encrypted files, etc.).

/**
 * Interface for securely storing and retrieving secrets.
 *
 * Implementations must ensure that:
 * - Secrets are encrypted at rest
 * - Encryption keys are stored securely (e.g., OS keychain)
 * - Secret retrieval is protected by OS-level security mechanisms
 *
 * Domain layer interface - must not depend on any infrastructure implementations.
 *
 * @example
 * ```typescript
 * const store: SecretStore = new SafeStorageSecretStore();
 *
 * // Store a database encryption key
 * await store.setSecret('kali:db:master', 'a1b2c3d4...');
 *
 * // Retrieve it later
 * const key = await store.getSecret('kali:db:master');
 * // => 'a1b2c3d4...'
 *
 * // Check if secret exists
 * const exists = await store.hasSecret('kali:db:master');
 * // => true
 *
 * // Delete when no longer needed
 * await store.deleteSecret('kali:db:master');
 * ```
 */
export interface SecretStore {
  /**
   * Store a secret value securely.
   *
   * The secret is encrypted before persistence. If a secret with the same key
   * already exists, it will be overwritten.
   *
   * @param key - Unique identifier for the secret (e.g., 'kali:db:master')
   * @param value - Secret value to store (will be encrypted)
   * @throws Error if encryption is not available on the system
   *
   * @example
   * ```typescript
   * await store.setSecret('api:token', 'sk-1234567890');
   * ```
   */
  setSecret(key: string, value: string): Promise<void>;

  /**
   * Retrieve a secret value.
   *
   * The secret is decrypted before being returned. Returns null if the secret
   * does not exist.
   *
   * @param key - Unique identifier for the secret
   * @returns The decrypted secret value, or null if not found
   * @throws Error if decryption fails (e.g., corrupted data)
   *
   * @example
   * ```typescript
   * const token = await store.getSecret('api:token');
   * if (token) {
   *   console.log('Token found:', token);
   * } else {
   *   console.log('Token not found');
   * }
   * ```
   */
  getSecret(key: string): Promise<string | null>;

  /**
   * Delete a secret value.
   *
   * Permanently removes the encrypted secret from storage. This operation is
   * idempotent - deleting a non-existent secret does not throw an error.
   *
   * @param key - Unique identifier for the secret
   *
   * @example
   * ```typescript
   * await store.deleteSecret('api:token');
   * // Secret is now permanently deleted
   * ```
   */
  deleteSecret(key: string): Promise<void>;

  /**
   * Check if a secret exists.
   *
   * Does not decrypt or retrieve the secret value, only checks for existence.
   *
   * @param key - Unique identifier for the secret
   * @returns true if the secret exists, false otherwise
   *
   * @example
   * ```typescript
   * if (await store.hasSecret('kali:db:master')) {
   *   const key = await store.getSecret('kali:db:master');
   *   // Use existing key
   * } else {
   *   // Generate new key
   *   const newKey = generateEncryptionKey();
   *   await store.setSecret('kali:db:master', newKey);
   * }
   * ```
   */
  hasSecret(key: string): Promise<boolean>;
}
