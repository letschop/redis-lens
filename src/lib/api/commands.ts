// SPDX-License-Identifier: MIT

import { invoke } from '@tauri-apps/api/core';
import {
  AppError,
  type ConnectionProfile,
  type ConnectionState,
  type HealthResponse,
  type ServerInfoSummary,
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

// ─── Health ────────────────────────────────────────────────────

/** Verify the IPC bridge is working. */
export async function healthCheck(): Promise<HealthResponse> {
  return tauriInvoke<HealthResponse>('health_check');
}

// ─── Connection Management ─────────────────────────────────────

/** Test a Redis connection without persisting it. */
export async function connectionTest(profile: ConnectionProfile): Promise<ServerInfoSummary> {
  return tauriInvoke<ServerInfoSummary>('connection_test', { profile });
}

/** Parse a Redis URI and return a partial profile. */
export async function connectionParseUri(uri: string): Promise<ConnectionProfile> {
  return tauriInvoke<ConnectionProfile>('connection_parse_uri', { uri });
}

/** Save or update a connection profile. */
export async function connectionSave(profile: ConnectionProfile): Promise<ConnectionProfile> {
  return tauriInvoke<ConnectionProfile>('connection_save', { profile });
}

/** List all saved connection profiles. */
export async function connectionList(): Promise<ConnectionProfile[]> {
  return tauriInvoke<ConnectionProfile[]>('connection_list');
}

/** Delete a connection profile by ID. */
export async function connectionDelete(id: string): Promise<void> {
  return tauriInvoke<void>('connection_delete', { id });
}

/** Connect to a Redis server using a saved profile ID. */
export async function connectionConnect(id: string): Promise<ServerInfoSummary> {
  return tauriInvoke<ServerInfoSummary>('connection_connect', { id });
}

/** Disconnect from a Redis server. */
export async function connectionDisconnect(id: string): Promise<void> {
  return tauriInvoke<void>('connection_disconnect', { id });
}

/** Get the connection state for a profile. */
export async function connectionState(id: string): Promise<ConnectionState> {
  return tauriInvoke<ConnectionState>('connection_state', { id });
}
