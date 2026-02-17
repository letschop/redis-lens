// SPDX-License-Identifier: MIT

import { invoke } from '@tauri-apps/api/core';
import {
  AppError,
  type ConnectionTestParams,
  type ConnectionTestResult,
  type HealthResponse,
} from './types';

/**
 * Type-safe wrapper around Tauri's invoke.
 * Translates Rust AppError serialization into typed frontend errors.
 */
async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'kind' in error) {
      const appError = error as { kind: string; message: string };
      throw new AppError(appError.kind, appError.message);
    }
    throw new AppError('Unknown', String(error));
  }
}

/** Verify the IPC bridge is working. */
export async function healthCheck(): Promise<HealthResponse> {
  return tauriInvoke<HealthResponse>('health_check');
}

/** Test a Redis connection without persisting it. */
export async function connectionTest(params: ConnectionTestParams): Promise<ConnectionTestResult> {
  return tauriInvoke<ConnectionTestResult>('connection_test', { params });
}
