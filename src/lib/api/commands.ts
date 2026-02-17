// SPDX-License-Identifier: MIT

import { invoke } from '@tauri-apps/api/core';
import {
  AppError,
  type ConnectionProfile,
  type ConnectionState,
  type HealthResponse,
  type KeyInfo,
  type KeyNode,
  type ScanResult,
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

// ─── Browser ──────────────────────────────────────────────────

/** Scan keys matching a pattern. Call repeatedly until `finished` is true. */
export async function browserScanKeys(
  connectionId: string,
  cursor: number,
  pattern: string,
  count: number,
): Promise<ScanResult> {
  return tauriInvoke<ScanResult>('browser_scan_keys', {
    connectionId,
    cursor,
    pattern,
    count,
  });
}

/** Build a key tree from a flat list of keys. */
export async function browserBuildTree(
  keys: string[],
  delimiter: string,
): Promise<KeyNode[]> {
  return tauriInvoke<KeyNode[]>('browser_build_tree', { keys, delimiter });
}

/** Get children of a namespace prefix from a key list. */
export async function browserGetChildren(
  keys: string[],
  prefix: string,
  delimiter: string,
  depth: number,
): Promise<KeyNode[]> {
  return tauriInvoke<KeyNode[]>('browser_get_children', { keys, prefix, delimiter, depth });
}

/** Get metadata (type + TTL) for a batch of keys. */
export async function browserGetKeysInfo(
  connectionId: string,
  keys: string[],
): Promise<KeyInfo[]> {
  return tauriInvoke<KeyInfo[]>('browser_get_keys_info', { connectionId, keys });
}

/** Get detailed info for a single key. */
export async function browserGetKeyInfo(
  connectionId: string,
  key: string,
): Promise<KeyInfo> {
  return tauriInvoke<KeyInfo>('browser_get_key_info', { connectionId, key });
}

/** Delete one or more keys using UNLINK. Returns count of deleted keys. */
export async function browserDeleteKeys(
  connectionId: string,
  keys: string[],
): Promise<number> {
  return tauriInvoke<number>('browser_delete_keys', { connectionId, keys });
}

/** Rename a key. Fails if the new name already exists. */
export async function browserRenameKey(
  connectionId: string,
  oldName: string,
  newName: string,
): Promise<void> {
  return tauriInvoke<void>('browser_rename_key', { connectionId, oldName, newName });
}
