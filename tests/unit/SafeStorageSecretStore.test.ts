// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit tests for SafeStorageSecretStore

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { SafeStorageSecretStore } from '../../src/infrastructure/secrets/SafeStorageSecretStore';
import * as fs from 'fs';
import * as path from 'path';

// Mock electron modules
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(),
    encryptString: vi.fn(),
    decryptString: vi.fn(),
  },
  app: {
    getPath: vi.fn(),
  },
}));

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

// Import mocked modules
import { safeStorage, app } from 'electron';

describe('SafeStorageSecretStore', () => {
  const mockUserDataPath = '/mock/userData';
  const mockStorePath = path.join(mockUserDataPath, '.secrets');

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    (app.getPath as Mock).mockReturnValue(mockUserDataPath);
    (safeStorage.isEncryptionAvailable as Mock).mockReturnValue(true);
    (fs.existsSync as Mock).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create secrets directory if it does not exist', () => {
      (fs.existsSync as Mock).mockReturnValue(false);

      new SafeStorageSecretStore();

      expect(app.getPath).toHaveBeenCalledWith('userData');
      expect(fs.existsSync).toHaveBeenCalledWith(mockStorePath);
      expect(fs.mkdirSync).toHaveBeenCalledWith(mockStorePath, {
        recursive: true,
        mode: 0o700,
      });
    });

    it('should not create secrets directory if it already exists', () => {
      (fs.existsSync as Mock).mockReturnValue(true);

      new SafeStorageSecretStore();

      expect(fs.existsSync).toHaveBeenCalledWith(mockStorePath);
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should use correct userData path', () => {
      new SafeStorageSecretStore();

      expect(app.getPath).toHaveBeenCalledWith('userData');
    });

    it('should create .secrets subdirectory in userData', () => {
      new SafeStorageSecretStore();

      const expectedPath = path.join(mockUserDataPath, '.secrets');
      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
    });
  });

  describe('setSecret', () => {
    let store: SafeStorageSecretStore;

    beforeEach(() => {
      (fs.existsSync as Mock).mockReturnValue(true); // Directory exists
      store = new SafeStorageSecretStore();
    });

    it('should encrypt and store a secret', async () => {
      const encryptedBuffer = Buffer.from('encrypted-data');
      (safeStorage.encryptString as Mock).mockReturnValue(encryptedBuffer);

      await store.setSecret('test-key', 'secret-value');

      expect(safeStorage.isEncryptionAvailable).toHaveBeenCalled();
      expect(safeStorage.encryptString).toHaveBeenCalledWith('secret-value');
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockStorePath, 'test-key.enc'),
        encryptedBuffer,
        { mode: 0o600 }
      );
    });

    it('should throw error if encryption is not available', async () => {
      (safeStorage.isEncryptionAvailable as Mock).mockReturnValue(false);

      await expect(store.setSecret('test-key', 'value')).rejects.toThrow(
        'Encryption is not available on this system. On Linux, ensure libsecret-1-dev is installed.'
      );

      expect(safeStorage.encryptString).not.toHaveBeenCalled();
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should sanitize key with special characters', async () => {
      const encryptedBuffer = Buffer.from('encrypted');
      (safeStorage.encryptString as Mock).mockReturnValue(encryptedBuffer);

      await store.setSecret('kali:db:master', 'value');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockStorePath, 'kali_db_master.enc'),
        encryptedBuffer,
        { mode: 0o600 }
      );
    });

    it('should overwrite existing secret', async () => {
      const encryptedBuffer = Buffer.from('new-encrypted');
      (safeStorage.encryptString as Mock).mockReturnValue(encryptedBuffer);

      await store.setSecret('existing-key', 'new-value');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockStorePath, 'existing-key.enc'),
        encryptedBuffer,
        { mode: 0o600 }
      );
    });

    it('should handle empty string value', async () => {
      const encryptedBuffer = Buffer.from('encrypted-empty');
      (safeStorage.encryptString as Mock).mockReturnValue(encryptedBuffer);

      await store.setSecret('key', '');

      expect(safeStorage.encryptString).toHaveBeenCalledWith('');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should handle long secret values', async () => {
      const longValue = 'x'.repeat(10000);
      const encryptedBuffer = Buffer.from('encrypted-long');
      (safeStorage.encryptString as Mock).mockReturnValue(encryptedBuffer);

      await store.setSecret('key', longValue);

      expect(safeStorage.encryptString).toHaveBeenCalledWith(longValue);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should set file permissions to 0o600 (owner read/write only)', async () => {
      const encryptedBuffer = Buffer.from('encrypted');
      (safeStorage.encryptString as Mock).mockReturnValue(encryptedBuffer);

      await store.setSecret('key', 'value');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        encryptedBuffer,
        { mode: 0o600 }
      );
    });
  });

  describe('getSecret', () => {
    let store: SafeStorageSecretStore;

    beforeEach(() => {
      (fs.existsSync as Mock).mockReturnValue(true); // Directory exists
      store = new SafeStorageSecretStore();
      vi.clearAllMocks(); // Clear constructor calls
    });

    it('should decrypt and return a secret', async () => {
      const encryptedBuffer = Buffer.from('encrypted-data');
      (fs.existsSync as Mock).mockReturnValue(true); // Secret file exists
      (fs.readFileSync as Mock).mockReturnValue(encryptedBuffer);
      (safeStorage.decryptString as Mock).mockReturnValue('decrypted-value');

      const result = await store.getSecret('test-key');

      expect(fs.existsSync).toHaveBeenCalledWith(
        path.join(mockStorePath, 'test-key.enc')
      );
      expect(fs.readFileSync).toHaveBeenCalledWith(
        path.join(mockStorePath, 'test-key.enc')
      );
      expect(safeStorage.decryptString).toHaveBeenCalledWith(encryptedBuffer);
      expect(result).toBe('decrypted-value');
    });

    it('should return null if secret does not exist', async () => {
      (fs.existsSync as Mock).mockReturnValue(false);

      const result = await store.getSecret('nonexistent-key');

      expect(fs.existsSync).toHaveBeenCalled();
      expect(fs.readFileSync).not.toHaveBeenCalled();
      expect(safeStorage.decryptString).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should throw error if decryption fails', async () => {
      const encryptedBuffer = Buffer.from('corrupted-data');
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.readFileSync as Mock).mockReturnValue(encryptedBuffer);
      (safeStorage.decryptString as Mock).mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      await expect(store.getSecret('test-key')).rejects.toThrow(
        "Failed to decrypt secret 'test-key': Decryption failed"
      );

      expect(fs.readFileSync).toHaveBeenCalled();
      expect(safeStorage.decryptString).toHaveBeenCalled();
    });

    it('should sanitize key when checking existence', async () => {
      (fs.existsSync as Mock).mockReturnValue(false);

      await store.getSecret('kali:db:master');

      expect(fs.existsSync).toHaveBeenCalledWith(
        path.join(mockStorePath, 'kali_db_master.enc')
      );
    });

    it('should handle empty string value', async () => {
      const encryptedBuffer = Buffer.from('encrypted-empty');
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.readFileSync as Mock).mockReturnValue(encryptedBuffer);
      (safeStorage.decryptString as Mock).mockReturnValue('');

      const result = await store.getSecret('key');

      expect(result).toBe('');
    });

    it('should throw error with key name on decryption failure', async () => {
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.readFileSync as Mock).mockReturnValue(Buffer.from('data'));
      (safeStorage.decryptString as Mock).mockImplementation(() => {
        throw new Error('Invalid data');
      });

      await expect(store.getSecret('my-key')).rejects.toThrow(
        "Failed to decrypt secret 'my-key'"
      );
    });

    it('should handle non-Error exceptions during decryption', async () => {
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.readFileSync as Mock).mockReturnValue(Buffer.from('data'));
      (safeStorage.decryptString as Mock).mockImplementation(() => {
        throw 'string error';
      });

      await expect(store.getSecret('key')).rejects.toThrow(
        "Failed to decrypt secret 'key': string error"
      );
    });
  });

  describe('deleteSecret', () => {
    let store: SafeStorageSecretStore;

    beforeEach(() => {
      (fs.existsSync as Mock).mockReturnValue(true); // Directory exists
      store = new SafeStorageSecretStore();
      vi.clearAllMocks(); // Clear constructor calls
    });

    it('should delete existing secret file', async () => {
      (fs.existsSync as Mock).mockReturnValue(true); // Secret file exists

      await store.deleteSecret('test-key');

      expect(fs.existsSync).toHaveBeenCalledWith(
        path.join(mockStorePath, 'test-key.enc')
      );
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        path.join(mockStorePath, 'test-key.enc')
      );
    });

    it('should not throw error if secret does not exist', async () => {
      (fs.existsSync as Mock).mockReturnValue(false);

      await expect(store.deleteSecret('nonexistent-key')).resolves.toBeUndefined();

      expect(fs.existsSync).toHaveBeenCalled();
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('should sanitize key when deleting', async () => {
      (fs.existsSync as Mock).mockReturnValue(true);

      await store.deleteSecret('kali:db:master');

      expect(fs.existsSync).toHaveBeenCalledWith(
        path.join(mockStorePath, 'kali_db_master.enc')
      );
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        path.join(mockStorePath, 'kali_db_master.enc')
      );
    });

    it('should be idempotent (deleting twice does not throw)', async () => {
      (fs.existsSync as Mock).mockReturnValueOnce(true).mockReturnValueOnce(false);

      await store.deleteSecret('key');
      await store.deleteSecret('key');

      expect(fs.unlinkSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('hasSecret', () => {
    let store: SafeStorageSecretStore;

    beforeEach(() => {
      (fs.existsSync as Mock).mockReturnValue(true); // Directory exists
      store = new SafeStorageSecretStore();
      vi.clearAllMocks(); // Clear constructor calls
    });

    it('should return true if secret exists', async () => {
      (fs.existsSync as Mock).mockReturnValue(true);

      const result = await store.hasSecret('test-key');

      expect(fs.existsSync).toHaveBeenCalledWith(
        path.join(mockStorePath, 'test-key.enc')
      );
      expect(result).toBe(true);
    });

    it('should return false if secret does not exist', async () => {
      (fs.existsSync as Mock).mockReturnValue(false);

      const result = await store.hasSecret('nonexistent-key');

      expect(fs.existsSync).toHaveBeenCalledWith(
        path.join(mockStorePath, 'nonexistent-key.enc')
      );
      expect(result).toBe(false);
    });

    it('should sanitize key when checking existence', async () => {
      (fs.existsSync as Mock).mockReturnValue(true);

      await store.hasSecret('kali:db:master');

      expect(fs.existsSync).toHaveBeenCalledWith(
        path.join(mockStorePath, 'kali_db_master.enc')
      );
    });

    it('should not read or decrypt the file', async () => {
      (fs.existsSync as Mock).mockReturnValue(true);

      await store.hasSecret('key');

      expect(fs.readFileSync).not.toHaveBeenCalled();
      expect(safeStorage.decryptString).not.toHaveBeenCalled();
    });
  });

  describe('Key Sanitization', () => {
    let store: SafeStorageSecretStore;

    beforeEach(() => {
      (fs.existsSync as Mock).mockReturnValue(true);
      store = new SafeStorageSecretStore();
      vi.clearAllMocks();
      (safeStorage.encryptString as Mock).mockReturnValue(Buffer.from('encrypted'));
    });

    it('should replace colons with underscores', async () => {
      await store.setSecret('kali:db:master', 'value');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockStorePath, 'kali_db_master.enc'),
        expect.any(Buffer),
        expect.any(Object)
      );
    });

    it('should replace slashes with underscores', async () => {
      await store.setSecret('path/to/secret', 'value');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockStorePath, 'path_to_secret.enc'),
        expect.any(Buffer),
        expect.any(Object)
      );
    });

    it('should replace dots with underscores', async () => {
      await store.setSecret('config.api.key', 'value');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockStorePath, 'config_api_key.enc'),
        expect.any(Buffer),
        expect.any(Object)
      );
    });

    it('should preserve alphanumeric characters', async () => {
      await store.setSecret('Key123ABC', 'value');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockStorePath, 'Key123ABC.enc'),
        expect.any(Buffer),
        expect.any(Object)
      );
    });

    it('should preserve hyphens', async () => {
      await store.setSecret('my-secret-key', 'value');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockStorePath, 'my-secret-key.enc'),
        expect.any(Buffer),
        expect.any(Object)
      );
    });

    it('should preserve underscores', async () => {
      await store.setSecret('my_secret_key', 'value');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockStorePath, 'my_secret_key.enc'),
        expect.any(Buffer),
        expect.any(Object)
      );
    });

    it('should replace spaces with underscores', async () => {
      await store.setSecret('my secret key', 'value');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockStorePath, 'my_secret_key.enc'),
        expect.any(Buffer),
        expect.any(Object)
      );
    });

    it('should replace special characters with underscores', async () => {
      await store.setSecret('key!@#$%^&*()', 'value');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockStorePath, 'key__________.enc'),
        expect.any(Buffer),
        expect.any(Object)
      );
    });

    it('should handle unicode characters', async () => {
      await store.setSecret('clé-日本語-🚀', 'value');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockStorePath, 'cl_-___-__.enc'),
        expect.any(Buffer),
        expect.any(Object)
      );
    });

    it('should add .enc extension', async () => {
      await store.setSecret('simple', 'value');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.enc'),
        expect.any(Buffer),
        expect.any(Object)
      );
    });
  });

  describe('Integration Scenarios', () => {
    let store: SafeStorageSecretStore;

    beforeEach(() => {
      (fs.existsSync as Mock).mockReturnValue(true);
      store = new SafeStorageSecretStore();
      vi.clearAllMocks();
    });

    it('should store and retrieve a secret', async () => {
      const encryptedBuffer = Buffer.from('encrypted-data');
      (safeStorage.encryptString as Mock).mockReturnValue(encryptedBuffer);
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.readFileSync as Mock).mockReturnValue(encryptedBuffer);
      (safeStorage.decryptString as Mock).mockReturnValue('my-secret-value');

      await store.setSecret('key', 'my-secret-value');
      const result = await store.getSecret('key');

      expect(result).toBe('my-secret-value');
    });

    it('should overwrite existing secret', async () => {
      const firstEncrypted = Buffer.from('first-encrypted');
      const secondEncrypted = Buffer.from('second-encrypted');

      (safeStorage.encryptString as Mock).mockReturnValueOnce(firstEncrypted);
      await store.setSecret('key', 'first-value');

      (safeStorage.encryptString as Mock).mockReturnValueOnce(secondEncrypted);
      await store.setSecret('key', 'second-value');

      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
      expect(fs.writeFileSync).toHaveBeenLastCalledWith(
        path.join(mockStorePath, 'key.enc'),
        secondEncrypted,
        { mode: 0o600 }
      );
    });

    it('should delete and confirm secret is gone', async () => {
      (fs.existsSync as Mock).mockReturnValueOnce(true);
      await store.deleteSecret('key');

      (fs.existsSync as Mock).mockReturnValueOnce(false);
      const exists = await store.hasSecret('key');

      expect(exists).toBe(false);
    });

    it('should handle check-set-get-delete lifecycle', async () => {
      // Check - should not exist
      (fs.existsSync as Mock).mockReturnValueOnce(false);
      const existsBefore = await store.hasSecret('lifecycle-key');
      expect(existsBefore).toBe(false);

      // Set
      const encryptedBuffer = Buffer.from('encrypted');
      (safeStorage.encryptString as Mock).mockReturnValue(encryptedBuffer);
      await store.setSecret('lifecycle-key', 'value');

      // Check - should exist now
      (fs.existsSync as Mock).mockReturnValueOnce(true);
      const existsAfterSet = await store.hasSecret('lifecycle-key');
      expect(existsAfterSet).toBe(true);

      // Get
      (fs.existsSync as Mock).mockReturnValueOnce(true);
      (fs.readFileSync as Mock).mockReturnValue(encryptedBuffer);
      (safeStorage.decryptString as Mock).mockReturnValue('value');
      const retrieved = await store.getSecret('lifecycle-key');
      expect(retrieved).toBe('value');

      // Delete
      (fs.existsSync as Mock).mockReturnValueOnce(true);
      await store.deleteSecret('lifecycle-key');

      // Check - should not exist
      (fs.existsSync as Mock).mockReturnValueOnce(false);
      const existsAfterDelete = await store.hasSecret('lifecycle-key');
      expect(existsAfterDelete).toBe(false);
    });
  });

  describe('SecretStore Interface Compliance', () => {
    let store: SafeStorageSecretStore;

    beforeEach(() => {
      (fs.existsSync as Mock).mockReturnValue(true);
      store = new SafeStorageSecretStore();
    });

    it('should implement setSecret method', () => {
      expect(store.setSecret).toBeDefined();
      expect(typeof store.setSecret).toBe('function');
    });

    it('should implement getSecret method', () => {
      expect(store.getSecret).toBeDefined();
      expect(typeof store.getSecret).toBe('function');
    });

    it('should implement deleteSecret method', () => {
      expect(store.deleteSecret).toBeDefined();
      expect(typeof store.deleteSecret).toBe('function');
    });

    it('should implement hasSecret method', () => {
      expect(store.hasSecret).toBeDefined();
      expect(typeof store.hasSecret).toBe('function');
    });

    it('should return Promise from setSecret', async () => {
      (safeStorage.encryptString as Mock).mockReturnValue(Buffer.from('encrypted'));
      const result = store.setSecret('key', 'value');
      expect(result).toBeInstanceOf(Promise);
      await result;
    });

    it('should return Promise from getSecret', () => {
      (fs.existsSync as Mock).mockReturnValue(false);
      const result = store.getSecret('key');
      expect(result).toBeInstanceOf(Promise);
    });

    it('should return Promise from deleteSecret', () => {
      (fs.existsSync as Mock).mockReturnValue(false);
      const result = store.deleteSecret('key');
      expect(result).toBeInstanceOf(Promise);
    });

    it('should return Promise from hasSecret', () => {
      (fs.existsSync as Mock).mockReturnValue(false);
      const result = store.hasSecret('key');
      expect(result).toBeInstanceOf(Promise);
    });
  });
});
