// SPDX-License-Identifier: MIT

/**
 * Structured error from the Rust backend.
 * Mirrors the AppError enum defined in src-tauri/src/utils/errors.rs.
 */
export class AppError extends Error {
  constructor(
    public readonly kind: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }

  get isConnectionError(): boolean {
    return this.kind === 'Connection';
  }

  get isNotFound(): boolean {
    return this.kind === 'NotFound';
  }

  get isPermissionDenied(): boolean {
    return this.kind === 'PermissionDenied';
  }

  get isValidationError(): boolean {
    return this.kind === 'InvalidInput';
  }

  get isTimeout(): boolean {
    return this.kind === 'Timeout';
  }
}

/** Health check response from the Rust backend. */
export interface HealthResponse {
  status: string;
  version: string;
}

/** Parameters for testing a Redis connection. */
export interface ConnectionTestParams {
  host: string;
  port: number;
  password?: string;
  tls: boolean;
}

/** Result of a Redis connection test. */
export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
}
