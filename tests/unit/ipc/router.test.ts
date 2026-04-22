// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit tests for IPC router validation and error handling

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ipcMain } from 'electron';
import { ZodError } from 'zod';
import { BusinessError, TechnicalError } from '../../../src/shared/errors';
import { createRPCRouter } from '../../../src/main/ipc/router';
import { settingsHandlers } from '../../../src/main/ipc/handlers/settings';

// Mock electron's ipcMain
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

// Mock settings handlers
vi.mock('../../../src/main/ipc/handlers/settings', () => ({
  settingsHandlers: {
    get: vi.fn(),
    update: vi.fn(),
  },
}));

describe('IPC Router', () => {
  let handlersMap: Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Capture all registered handlers
    handlersMap = new Map();
    (ipcMain.handle as Mock).mockImplementation((channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) => {
      handlersMap.set(channel, handler);
    });

    // Create router (registers all handlers)
    createRPCRouter();
  });

  describe('Router Registration', () => {
    it('should register settings.get handler', () => {
      expect(ipcMain.handle).toHaveBeenCalledWith('rpc:settings.get', expect.any(Function));
    });

    it('should register settings.update handler', () => {
      expect(ipcMain.handle).toHaveBeenCalledWith('rpc:settings.update', expect.any(Function));
    });

    it('should register exactly 2 handlers', () => {
      expect(ipcMain.handle).toHaveBeenCalledTimes(2);
    });
  });

  describe('settings.get', () => {
    let getHandler: (event: unknown, ...args: unknown[]) => Promise<unknown>;

    beforeEach(() => {
      const handler = handlersMap.get('rpc:settings.get');
      if (!handler) {
        throw new Error('settings.get handler not registered');
      }
      getHandler = handler;
    });

    describe('Successful Validation and Execution', () => {
      it('should validate valid input and call handler', async () => {
        const mockResult = 'dark';
        (settingsHandlers.get as Mock).mockResolvedValue(mockResult);

        const result = await getHandler({}, { key: 'theme' });

        expect(settingsHandlers.get).toHaveBeenCalledWith({ key: 'theme' });
        expect(result).toBe(mockResult);
      });

      it('should pass validated input to handler', async () => {
        (settingsHandlers.get as Mock).mockResolvedValue('en');

        await getHandler({}, { key: 'language' });

        expect(settingsHandlers.get).toHaveBeenCalledWith({ key: 'language' });
      });

      it('should return handler result', async () => {
        const mockResult = { theme: 'dark', nested: { value: 42 } };
        (settingsHandlers.get as Mock).mockResolvedValue(mockResult);

        const result = await getHandler({}, { key: 'complex' });

        expect(result).toEqual(mockResult);
      });

      it('should handle null return value from handler', async () => {
        (settingsHandlers.get as Mock).mockResolvedValue(null);

        const result = await getHandler({}, { key: 'nonexistent' });

        expect(result).toBeNull();
      });
    });

    describe('Zod Validation Failures', () => {
      it('should throw BusinessError with VALIDATION_ERROR for empty key', async () => {
        await expect(getHandler({}, { key: '' })).rejects.toThrow(BusinessError);

        try {
          await getHandler({}, { key: '' });
        } catch (error) {
          expect(error).toBeInstanceOf(BusinessError);
          expect((error as BusinessError).code).toBe('VALIDATION_ERROR');
          expect((error as BusinessError).message).toContain('Validation failed');
          expect((error as BusinessError).metadata?.zodErrors).toBeDefined();
        }
      });

      it('should throw BusinessError with VALIDATION_ERROR for missing key', async () => {
        await expect(getHandler({}, {})).rejects.toThrow(BusinessError);

        try {
          await getHandler({}, {});
        } catch (error) {
          expect(error).toBeInstanceOf(BusinessError);
          expect((error as BusinessError).code).toBe('VALIDATION_ERROR');
          expect((error as BusinessError).message).toContain('Validation failed');
        }
      });

      it('should throw BusinessError with VALIDATION_ERROR for null input', async () => {
        await expect(getHandler({}, null)).rejects.toThrow(BusinessError);

        try {
          await getHandler({}, null);
        } catch (error) {
          expect(error).toBeInstanceOf(BusinessError);
          expect((error as BusinessError).code).toBe('VALIDATION_ERROR');
        }
      });

      it('should throw BusinessError with VALIDATION_ERROR for non-string key', async () => {
        await expect(getHandler({}, { key: 123 })).rejects.toThrow(BusinessError);

        try {
          await getHandler({}, { key: 123 });
        } catch (error) {
          expect(error).toBeInstanceOf(BusinessError);
          expect((error as BusinessError).code).toBe('VALIDATION_ERROR');
        }
      });

      it('should include Zod error details in metadata', async () => {
        try {
          await getHandler({}, { key: '' });
        } catch (error) {
          expect(error).toBeInstanceOf(BusinessError);
          const businessError = error as BusinessError;
          expect(businessError.metadata?.zodErrors).toBeDefined();
          expect(Array.isArray(businessError.metadata?.zodErrors)).toBe(true);
        }
      });
    });

    describe('Handler Error Propagation', () => {
      it('should pass through BusinessError from handler', async () => {
        const businessError = new BusinessError('Setting not found', 'SETTING_NOT_FOUND', { key: 'unknown' });
        (settingsHandlers.get as Mock).mockRejectedValue(businessError);

        await expect(getHandler({}, { key: 'unknown' })).rejects.toThrow(businessError);

        try {
          await getHandler({}, { key: 'unknown' });
        } catch (error) {
          expect(error).toBe(businessError);
          expect((error as BusinessError).code).toBe('SETTING_NOT_FOUND');
          expect((error as BusinessError).metadata).toEqual({ key: 'unknown' });
        }
      });

      it('should pass through TechnicalError from handler', async () => {
        const technicalError = new TechnicalError('Database error', 'DB_ERROR', { operation: 'read' });
        (settingsHandlers.get as Mock).mockRejectedValue(technicalError);

        await expect(getHandler({}, { key: 'theme' })).rejects.toThrow(technicalError);

        try {
          await getHandler({}, { key: 'theme' });
        } catch (error) {
          expect(error).toBe(technicalError);
          expect((error as TechnicalError).code).toBe('DB_ERROR');
          expect((error as TechnicalError).metadata).toEqual({ operation: 'read' });
        }
      });

      it('should wrap unknown Error as TechnicalError with INTERNAL_ERROR', async () => {
        const unknownError = new Error('Unexpected error');
        (settingsHandlers.get as Mock).mockRejectedValue(unknownError);

        await expect(getHandler({}, { key: 'theme' })).rejects.toThrow(TechnicalError);

        try {
          await getHandler({}, { key: 'theme' });
        } catch (error) {
          expect(error).toBeInstanceOf(TechnicalError);
          expect((error as TechnicalError).code).toBe('INTERNAL_ERROR');
          expect((error as TechnicalError).message).toContain('Internal error in settings.get');
          expect((error as TechnicalError).message).toContain('Unexpected error');
          expect((error as TechnicalError).metadata?.originalError).toBeDefined();
        }
      });

      it('should wrap non-Error thrown value as TechnicalError', async () => {
        (settingsHandlers.get as Mock).mockRejectedValue('string error');

        await expect(getHandler({}, { key: 'theme' })).rejects.toThrow(TechnicalError);

        try {
          await getHandler({}, { key: 'theme' });
        } catch (error) {
          expect(error).toBeInstanceOf(TechnicalError);
          expect((error as TechnicalError).code).toBe('INTERNAL_ERROR');
          expect((error as TechnicalError).message).toContain('Internal error in settings.get');
          expect((error as TechnicalError).metadata?.originalError).toBe('string error');
        }
      });

      it('should include stack trace in metadata when wrapping Error', async () => {
        const errorWithStack = new Error('Error with stack');
        (settingsHandlers.get as Mock).mockRejectedValue(errorWithStack);

        try {
          await getHandler({}, { key: 'theme' });
        } catch (error) {
          expect(error).toBeInstanceOf(TechnicalError);
          const technicalError = error as TechnicalError;
          expect(technicalError.metadata?.originalError).toBeDefined();
          expect(typeof technicalError.metadata?.originalError).toBe('string');
          expect(technicalError.metadata?.originalError).toContain('Error with stack');
        }
      });
    });
  });

  describe('settings.update', () => {
    let updateHandler: (event: unknown, ...args: unknown[]) => Promise<unknown>;

    beforeEach(() => {
      const handler = handlersMap.get('rpc:settings.update');
      if (!handler) {
        throw new Error('settings.update handler not registered');
      }
      updateHandler = handler;
    });

    describe('Successful Validation and Execution', () => {
      it('should validate valid input and call handler', async () => {
        (settingsHandlers.update as Mock).mockResolvedValue(undefined);

        const result = await updateHandler({}, { key: 'theme', value: 'light' });

        expect(settingsHandlers.update).toHaveBeenCalledWith({ key: 'theme', value: 'light' });
        expect(result).toBeUndefined();
      });

      it('should pass validated input to handler', async () => {
        (settingsHandlers.update as Mock).mockResolvedValue(undefined);

        await updateHandler({}, { key: 'fontSize', value: 16 });

        expect(settingsHandlers.update).toHaveBeenCalledWith({ key: 'fontSize', value: 16 });
      });

      it('should handle complex value types', async () => {
        const complexValue = { nested: { data: [1, 2, 3] }, flag: true };
        (settingsHandlers.update as Mock).mockResolvedValue(undefined);

        await updateHandler({}, { key: 'complex', value: complexValue });

        expect(settingsHandlers.update).toHaveBeenCalledWith({ key: 'complex', value: complexValue });
      });

      it('should handle null value', async () => {
        (settingsHandlers.update as Mock).mockResolvedValue(undefined);

        await updateHandler({}, { key: 'setting', value: null });

        expect(settingsHandlers.update).toHaveBeenCalledWith({ key: 'setting', value: null });
      });

      it('should handle undefined value', async () => {
        (settingsHandlers.update as Mock).mockResolvedValue(undefined);

        await updateHandler({}, { key: 'setting', value: undefined });

        expect(settingsHandlers.update).toHaveBeenCalledWith({ key: 'setting', value: undefined });
      });

      it('should return void (undefined)', async () => {
        (settingsHandlers.update as Mock).mockResolvedValue(undefined);

        const result = await updateHandler({}, { key: 'theme', value: 'dark' });

        expect(result).toBeUndefined();
      });
    });

    describe('Zod Validation Failures', () => {
      it('should throw BusinessError with VALIDATION_ERROR for empty key', async () => {
        await expect(updateHandler({}, { key: '', value: 'test' })).rejects.toThrow(BusinessError);

        try {
          await updateHandler({}, { key: '', value: 'test' });
        } catch (error) {
          expect(error).toBeInstanceOf(BusinessError);
          expect((error as BusinessError).code).toBe('VALIDATION_ERROR');
          expect((error as BusinessError).message).toContain('Validation failed');
          expect((error as BusinessError).metadata?.zodErrors).toBeDefined();
        }
      });

      it('should throw BusinessError with VALIDATION_ERROR for missing key', async () => {
        await expect(updateHandler({}, { value: 'test' })).rejects.toThrow(BusinessError);

        try {
          await updateHandler({}, { value: 'test' });
        } catch (error) {
          expect(error).toBeInstanceOf(BusinessError);
          expect((error as BusinessError).code).toBe('VALIDATION_ERROR');
        }
      });

      it('should throw BusinessError with VALIDATION_ERROR for missing value', async () => {
        await expect(updateHandler({}, { key: 'theme' })).rejects.toThrow(BusinessError);

        try {
          await updateHandler({}, { key: 'theme' });
        } catch (error) {
          expect(error).toBeInstanceOf(BusinessError);
          expect((error as BusinessError).code).toBe('VALIDATION_ERROR');
        }
      });

      it('should throw BusinessError with VALIDATION_ERROR for non-string key', async () => {
        await expect(updateHandler({}, { key: 123, value: 'test' })).rejects.toThrow(BusinessError);

        try {
          await updateHandler({}, { key: 123, value: 'test' });
        } catch (error) {
          expect(error).toBeInstanceOf(BusinessError);
          expect((error as BusinessError).code).toBe('VALIDATION_ERROR');
        }
      });

      it('should throw BusinessError with VALIDATION_ERROR for null input', async () => {
        await expect(updateHandler({}, null)).rejects.toThrow(BusinessError);

        try {
          await updateHandler({}, null);
        } catch (error) {
          expect(error).toBeInstanceOf(BusinessError);
          expect((error as BusinessError).code).toBe('VALIDATION_ERROR');
        }
      });

      it('should include Zod error details in metadata', async () => {
        try {
          await updateHandler({}, { key: '', value: 'test' });
        } catch (error) {
          expect(error).toBeInstanceOf(BusinessError);
          const businessError = error as BusinessError;
          expect(businessError.metadata?.zodErrors).toBeDefined();
          expect(Array.isArray(businessError.metadata?.zodErrors)).toBe(true);
        }
      });
    });

    describe('Handler Error Propagation', () => {
      it('should pass through BusinessError from handler', async () => {
        const businessError = new BusinessError('Invalid setting value', 'INVALID_VALUE', { key: 'theme' });
        (settingsHandlers.update as Mock).mockRejectedValue(businessError);

        await expect(updateHandler({}, { key: 'theme', value: 'invalid' })).rejects.toThrow(businessError);

        try {
          await updateHandler({}, { key: 'theme', value: 'invalid' });
        } catch (error) {
          expect(error).toBe(businessError);
          expect((error as BusinessError).code).toBe('INVALID_VALUE');
          expect((error as BusinessError).metadata).toEqual({ key: 'theme' });
        }
      });

      it('should pass through TechnicalError from handler', async () => {
        const technicalError = new TechnicalError('Database write error', 'DB_WRITE_ERROR', { operation: 'update' });
        (settingsHandlers.update as Mock).mockRejectedValue(technicalError);

        await expect(updateHandler({}, { key: 'theme', value: 'dark' })).rejects.toThrow(technicalError);

        try {
          await updateHandler({}, { key: 'theme', value: 'dark' });
        } catch (error) {
          expect(error).toBe(technicalError);
          expect((error as TechnicalError).code).toBe('DB_WRITE_ERROR');
          expect((error as TechnicalError).metadata).toEqual({ operation: 'update' });
        }
      });

      it('should wrap unknown Error as TechnicalError with INTERNAL_ERROR', async () => {
        const unknownError = new Error('Unexpected update error');
        (settingsHandlers.update as Mock).mockRejectedValue(unknownError);

        await expect(updateHandler({}, { key: 'theme', value: 'dark' })).rejects.toThrow(TechnicalError);

        try {
          await updateHandler({}, { key: 'theme', value: 'dark' });
        } catch (error) {
          expect(error).toBeInstanceOf(TechnicalError);
          expect((error as TechnicalError).code).toBe('INTERNAL_ERROR');
          expect((error as TechnicalError).message).toContain('Internal error in settings.update');
          expect((error as TechnicalError).message).toContain('Unexpected update error');
          expect((error as TechnicalError).metadata?.originalError).toBeDefined();
        }
      });

      it('should wrap non-Error thrown value as TechnicalError', async () => {
        (settingsHandlers.update as Mock).mockRejectedValue({ code: 'CUSTOM_ERROR' });

        await expect(updateHandler({}, { key: 'theme', value: 'dark' })).rejects.toThrow(TechnicalError);

        try {
          await updateHandler({}, { key: 'theme', value: 'dark' });
        } catch (error) {
          expect(error).toBeInstanceOf(TechnicalError);
          expect((error as TechnicalError).code).toBe('INTERNAL_ERROR');
          expect((error as TechnicalError).message).toContain('Internal error in settings.update');
          expect((error as TechnicalError).metadata?.originalError).toBeDefined();
        }
      });

      it('should include stack trace in metadata when wrapping Error', async () => {
        const errorWithStack = new Error('Update error with stack');
        (settingsHandlers.update as Mock).mockRejectedValue(errorWithStack);

        try {
          await updateHandler({}, { key: 'theme', value: 'dark' });
        } catch (error) {
          expect(error).toBeInstanceOf(TechnicalError);
          const technicalError = error as TechnicalError;
          expect(technicalError.metadata?.originalError).toBeDefined();
          expect(typeof technicalError.metadata?.originalError).toBe('string');
          expect(technicalError.metadata?.originalError).toContain('Update error with stack');
        }
      });
    });
  });

  describe('Error Message Formatting', () => {
    let getHandler: (event: unknown, ...args: unknown[]) => Promise<unknown>;

    beforeEach(() => {
      const handler = handlersMap.get('rpc:settings.get');
      if (!handler) {
        throw new Error('settings.get handler not registered');
      }
      getHandler = handler;
    });

    it('should format multiple Zod validation errors in message', async () => {
      // Create an input that will trigger multiple validation errors
      try {
        await getHandler({}, { key: '', extraField: 'not allowed' });
      } catch (error) {
        expect(error).toBeInstanceOf(BusinessError);
        expect((error as BusinessError).message).toContain('Validation failed');
        // Message should contain comma-separated error messages
        expect((error as BusinessError).message).toMatch(/,/);
      }
    });

    it('should preserve error message when wrapping unknown errors', async () => {
      const customError = new Error('Very specific error message');
      (settingsHandlers.get as Mock).mockRejectedValue(customError);

      try {
        await getHandler({}, { key: 'test' });
      } catch (error) {
        expect((error as TechnicalError).message).toContain('Very specific error message');
        expect((error as TechnicalError).message).toContain('Internal error in settings.get');
      }
    });
  });

  describe('Edge Cases', () => {
    let getHandler: (event: unknown, ...args: unknown[]) => Promise<unknown>;
    let updateHandler: (event: unknown, ...args: unknown[]) => Promise<unknown>;

    beforeEach(() => {
      const get = handlersMap.get('rpc:settings.get');
      const update = handlersMap.get('rpc:settings.update');
      if (!get || !update) {
        throw new Error('Handlers not registered');
      }
      getHandler = get;
      updateHandler = update;
    });

    it('should handle handler returning Promise.resolve explicitly', async () => {
      (settingsHandlers.get as Mock).mockReturnValue(Promise.resolve('value'));

      const result = await getHandler({}, { key: 'test' });

      expect(result).toBe('value');
    });

    it('should handle handler returning Promise.reject explicitly', async () => {
      const error = new BusinessError('Rejected', 'REJECTED');
      (settingsHandlers.get as Mock).mockReturnValue(Promise.reject(error));

      await expect(getHandler({}, { key: 'test' })).rejects.toThrow(error);
    });

    it('should handle very long key validation', async () => {
      const longKey = 'x'.repeat(10000);
      (settingsHandlers.get as Mock).mockResolvedValue('value');

      const result = await getHandler({}, { key: longKey });

      expect(settingsHandlers.get).toHaveBeenCalledWith({ key: longKey });
      expect(result).toBe('value');
    });

    it('should handle special characters in key', async () => {
      const specialKey = 'key-with-special-chars_123.@#$';
      (settingsHandlers.get as Mock).mockResolvedValue('value');

      const result = await getHandler({}, { key: specialKey });

      expect(settingsHandlers.get).toHaveBeenCalledWith({ key: specialKey });
      expect(result).toBe('value');
    });

    it('should handle unicode characters in key', async () => {
      const unicodeKey = 'clé-日本語-🚀';
      (settingsHandlers.get as Mock).mockResolvedValue('value');

      const result = await getHandler({}, { key: unicodeKey });

      expect(settingsHandlers.get).toHaveBeenCalledWith({ key: unicodeKey });
      expect(result).toBe('value');
    });

    it('should handle circular reference in update value', async () => {
      (settingsHandlers.update as Mock).mockResolvedValue(undefined);
      const circular: { ref?: unknown } = {};
      circular.ref = circular;

      await updateHandler({}, { key: 'test', value: circular });

      expect(settingsHandlers.update).toHaveBeenCalled();
    });
  });
});
