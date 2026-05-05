// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit tests for error hierarchy

import { describe, it, expect } from 'vitest';
import {
  BaseError,
  BusinessError,
  TechnicalError,
  ExternalError,
} from '../../../src/shared/errors';

describe('Error Hierarchy', () => {
  describe('BusinessError', () => {
    it('should create error with message and code', () => {
      const error = new BusinessError('Invalid input', 'VALIDATION_ERROR');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(BusinessError);
      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.name).toBe('BusinessError');
      expect(error.metadata).toBeUndefined();
    });

    it('should create error with metadata', () => {
      const metadata = { field: 'email', value: 'invalid@' };
      const error = new BusinessError('Invalid email', 'INVALID_EMAIL', metadata);

      expect(error.message).toBe('Invalid email');
      expect(error.code).toBe('INVALID_EMAIL');
      expect(error.metadata).toEqual(metadata);
      expect(error.name).toBe('BusinessError');
    });

    it('should capture stack trace', () => {
      const error = new BusinessError('Test error', 'TEST_ERROR');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('BusinessError');
    });

    it('should handle complex metadata objects', () => {
      const metadata = {
        field: 'password',
        requirements: ['min 8 chars', 'uppercase', 'number'],
        attemptCount: 3,
      };
      const error = new BusinessError('Password requirements not met', 'WEAK_PASSWORD', metadata);

      expect(error.metadata).toEqual(metadata);
      expect(error.metadata?.field).toBe('password');
      expect(Array.isArray(error.metadata?.requirements)).toBe(true);
    });

    it('should preserve metadata value', () => {
      const metadata = { userId: 123 };
      const error = new BusinessError('User error', 'USER_ERROR', metadata);

      expect(error.metadata).toEqual({ userId: 123 });
    });

    it('should preserve code value', () => {
      const error = new BusinessError('Test', 'TEST_CODE');

      expect(error.code).toBe('TEST_CODE');
    });
  });

  describe('TechnicalError', () => {
    it('should create error with message and code', () => {
      const error = new TechnicalError('Database connection failed', 'DB_ERROR');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(TechnicalError);
      expect(error.message).toBe('Database connection failed');
      expect(error.code).toBe('DB_ERROR');
      expect(error.name).toBe('TechnicalError');
      expect(error.metadata).toBeUndefined();
    });

    it('should create error with metadata', () => {
      const metadata = {
        host: 'localhost',
        port: 5432,
        database: 'app_db',
        error: 'ECONNREFUSED',
      };
      const error = new TechnicalError('Connection refused', 'DB_CONNECTION_ERROR', metadata);

      expect(error.message).toBe('Connection refused');
      expect(error.code).toBe('DB_CONNECTION_ERROR');
      expect(error.metadata).toEqual(metadata);
    });

    it('should capture stack trace', () => {
      const error = new TechnicalError('Internal error', 'INTERNAL_ERROR');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('TechnicalError');
    });

    it('should handle filesystem error metadata', () => {
      const metadata = {
        path: '/var/app/data/file.txt',
        operation: 'read',
        errno: -2,
        syscall: 'open',
      };
      const error = new TechnicalError('File not found', 'FS_ERROR', metadata);

      expect(error.metadata).toEqual(metadata);
      expect(error.code).toBe('FS_ERROR');
    });
  });

  describe('ExternalError', () => {
    it('should create error with message and code', () => {
      const error = new ExternalError('GitHub API rate limit exceeded', 'GITHUB_API_ERROR');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(ExternalError);
      expect(error.message).toBe('GitHub API rate limit exceeded');
      expect(error.code).toBe('GITHUB_API_ERROR');
      expect(error.name).toBe('ExternalError');
      expect(error.metadata).toBeUndefined();
    });

    it('should create error with metadata', () => {
      const metadata = {
        service: 'GitHub',
        endpoint: '/api/v3/repos',
        statusCode: 403,
        rateLimitReset: 1640000000,
      };
      const error = new ExternalError('Rate limit exceeded', 'GITHUB_RATE_LIMIT', metadata);

      expect(error.message).toBe('Rate limit exceeded');
      expect(error.code).toBe('GITHUB_RATE_LIMIT');
      expect(error.metadata).toEqual(metadata);
    });

    it('should capture stack trace', () => {
      const error = new ExternalError('Service timeout', 'VCS_TIMEOUT');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ExternalError');
    });

    it('should handle API error response metadata', () => {
      const metadata = {
        service: 'VCS Provider',
        statusCode: 500,
        response: {
          error: 'Internal Server Error',
          message: 'Service temporarily unavailable',
        },
        retryAfter: 60,
      };
      const error = new ExternalError('VCS service error', 'VCS_ERROR', metadata);

      expect(error.metadata).toEqual(metadata);
      expect(error.metadata?.statusCode).toBe(500);
    });
  });

  describe('Error Hierarchy Relationships', () => {
    it('should maintain correct inheritance chain for BusinessError', () => {
      const error = new BusinessError('Test', 'TEST');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof BaseError).toBe(true);
      expect(error instanceof BusinessError).toBe(true);
      expect(error instanceof TechnicalError).toBe(false);
      expect(error instanceof ExternalError).toBe(false);
    });

    it('should maintain correct inheritance chain for TechnicalError', () => {
      const error = new TechnicalError('Test', 'TEST');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof BaseError).toBe(true);
      expect(error instanceof TechnicalError).toBe(true);
      expect(error instanceof BusinessError).toBe(false);
      expect(error instanceof ExternalError).toBe(false);
    });

    it('should maintain correct inheritance chain for ExternalError', () => {
      const error = new ExternalError('Test', 'TEST');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof BaseError).toBe(true);
      expect(error instanceof ExternalError).toBe(true);
      expect(error instanceof BusinessError).toBe(false);
      expect(error instanceof TechnicalError).toBe(false);
    });

    it('should allow type discrimination by error class', () => {
      const errors: BaseError[] = [
        new BusinessError('Business', 'BIZ'),
        new TechnicalError('Technical', 'TECH'),
        new ExternalError('External', 'EXT'),
      ];

      const businessErrors = errors.filter((e) => e instanceof BusinessError);
      const technicalErrors = errors.filter((e) => e instanceof TechnicalError);
      const externalErrors = errors.filter((e) => e instanceof ExternalError);

      expect(businessErrors).toHaveLength(1);
      expect(technicalErrors).toHaveLength(1);
      expect(externalErrors).toHaveLength(1);
    });
  });

  describe('Error Serialization Compatibility', () => {
    it('should support JSON serialization for BusinessError', () => {
      const error = new BusinessError('Test error', 'TEST_ERROR', { field: 'test' });
      const serialized = JSON.stringify({
        name: error.name,
        message: error.message,
        code: error.code,
        metadata: error.metadata,
      });
      const parsed = JSON.parse(serialized);

      expect(parsed.name).toBe('BusinessError');
      expect(parsed.message).toBe('Test error');
      expect(parsed.code).toBe('TEST_ERROR');
      expect(parsed.metadata).toEqual({ field: 'test' });
    });

    it('should support JSON serialization for TechnicalError', () => {
      const error = new TechnicalError('DB error', 'DB_ERROR', { host: 'localhost' });
      const serialized = JSON.stringify({
        name: error.name,
        message: error.message,
        code: error.code,
        metadata: error.metadata,
      });
      const parsed = JSON.parse(serialized);

      expect(parsed.name).toBe('TechnicalError');
      expect(parsed.code).toBe('DB_ERROR');
    });

    it('should support JSON serialization for ExternalError', () => {
      const error = new ExternalError('API error', 'API_ERROR', { statusCode: 500 });
      const serialized = JSON.stringify({
        name: error.name,
        message: error.message,
        code: error.code,
        metadata: error.metadata,
      });
      const parsed = JSON.parse(serialized);

      expect(parsed.name).toBe('ExternalError');
      expect(parsed.code).toBe('API_ERROR');
    });

    it('should handle errors without metadata in JSON serialization', () => {
      const error = new BusinessError('Simple error', 'SIMPLE');
      const serialized = JSON.stringify({
        name: error.name,
        message: error.message,
        code: error.code,
        metadata: error.metadata,
      });
      const parsed = JSON.parse(serialized);

      expect(parsed.metadata).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string message', () => {
      const error = new BusinessError('', 'EMPTY_MESSAGE');

      expect(error.message).toBe('');
      expect(error.code).toBe('EMPTY_MESSAGE');
    });

    it('should handle empty metadata object', () => {
      const error = new TechnicalError('Test', 'TEST', {});

      expect(error.metadata).toEqual({});
    });

    it('should handle nested metadata objects', () => {
      const metadata = {
        request: {
          method: 'POST',
          url: '/api/test',
          headers: { 'Content-Type': 'application/json' },
        },
        response: {
          status: 400,
          body: { error: 'Invalid request' },
        },
      };
      const error = new ExternalError('Request failed', 'REQUEST_FAILED', metadata);

      expect(error.metadata).toEqual(metadata);
      expect(error.metadata?.request).toBeDefined();
      expect(error.metadata?.response).toBeDefined();
    });

    it('should handle metadata with null values', () => {
      const metadata = { value: null, optional: undefined };
      const error = new BusinessError('Test', 'TEST', metadata);

      expect(error.metadata).toEqual(metadata);
      expect(error.metadata?.value).toBeNull();
      expect(error.metadata?.optional).toBeUndefined();
    });

    it('should handle very long error messages', () => {
      const longMessage = 'Error: ' + 'x'.repeat(1000);
      const error = new TechnicalError(longMessage, 'LONG_MESSAGE');

      expect(error.message).toBe(longMessage);
      expect(error.message.length).toBeGreaterThan(1000);
    });
  });
});
