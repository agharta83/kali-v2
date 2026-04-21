// SPDX-License-Identifier: AGPL-3.0-or-later
// Error hierarchy for cross-process error handling in IPC communication.
// All errors include machine-readable codes and optional metadata for context.

/**
 * Base error class for all application errors.
 * Provides structured error handling with codes and metadata for IPC serialization.
 *
 * @abstract
 * @extends Error
 */
export abstract class BaseError extends Error {
  /**
   * Creates a new BaseError instance.
   *
   * @param message - Human-readable error message
   * @param code - Machine-readable error code for programmatic handling
   * @param metadata - Optional contextual data (e.g., field names, IDs, validation details)
   */
  constructor(
    message: string,
    public readonly code: string,
    public readonly metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    // Capture stack trace in Node.js environments (main/preload)
    // In browser contexts (renderer), this is a no-op
    if (typeof (Error as typeof Error & { captureStackTrace?: unknown }).captureStackTrace === 'function') {
      (Error as typeof Error & { captureStackTrace: (target: object, constructor: Function) => void }).captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Business logic errors for user-facing issues.
 * Examples: invalid input, business rule violations, authorization failures.
 *
 * These errors are expected to be shown to users with localized messages
 * based on the error code.
 *
 * @extends BaseError
 */
export class BusinessError extends BaseError {
  /**
   * Creates a new BusinessError instance.
   *
   * @param message - Human-readable error message
   * @param code - Machine-readable error code (e.g., 'VALIDATION_ERROR', 'INVALID_KEY')
   * @param metadata - Optional contextual data for debugging and error reporting
   */
  constructor(message: string, code: string, metadata?: Record<string, unknown>) {
    super(message, code, metadata);
  }
}

/**
 * Technical infrastructure errors for internal failures.
 * Examples: database errors, filesystem errors, memory issues, network failures.
 *
 * These errors indicate system-level problems that should be logged and monitored,
 * but may not be actionable by end users.
 *
 * @extends BaseError
 */
export class TechnicalError extends BaseError {
  /**
   * Creates a new TechnicalError instance.
   *
   * @param message - Human-readable error message
   * @param code - Machine-readable error code (e.g., 'DB_ERROR', 'FS_ERROR', 'INTERNAL_ERROR')
   * @param metadata - Optional contextual data for debugging and error reporting
   */
  constructor(message: string, code: string, metadata?: Record<string, unknown>) {
    super(message, code, metadata);
  }
}

/**
 * External service errors for third-party API failures.
 * Examples: GitHub API errors, VCS provider failures, external service timeouts.
 *
 * These errors indicate problems with external dependencies and help distinguish
 * between internal issues and third-party service degradation.
 *
 * @extends BaseError
 */
export class ExternalError extends BaseError {
  /**
   * Creates a new ExternalError instance.
   *
   * @param message - Human-readable error message
   * @param code - Machine-readable error code (e.g., 'GITHUB_API_ERROR', 'VCS_TIMEOUT')
   * @param metadata - Optional contextual data (e.g., API response, HTTP status, service name)
   */
  constructor(message: string, code: string, metadata?: Record<string, unknown>) {
    super(message, code, metadata);
  }
}
