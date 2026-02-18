// SPDX-License-Identifier: MIT

import { invoke } from '@tauri-apps/api/core';
import {
  AppError,
  type BitmapInfo,
  type ConnectionProfile,
  type ConnectionState,
  type GeoMember,
  type HashField,
  type HashScanResult,
  type HealthResponse,
  type HllInfo,
  type JsonValue,
  type KeyInfo,
  type KeyNode,
  type ListElement,
  type ScanResult,
  type ServerInfoSummary,
  type SetScanResult,
  type StreamInfo,
  type StreamRangeResult,
  type StringValue,
  type TtlInfo,
  type ZSetMember,
  type ZSetScanResult,
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

// ─── Editor — String ────────────────────────────────────────────

/** Get a string value (auto-detects binary content). */
export async function editorGetStringValue(
  connectionId: string,
  key: string,
): Promise<StringValue> {
  return tauriInvoke<StringValue>('editor_get_string_value', { connectionId, key });
}

/** Set a string value, optionally with a TTL in seconds. */
export async function editorSetStringValue(
  connectionId: string,
  key: string,
  value: string,
  ttl?: number,
): Promise<void> {
  return tauriInvoke<void>('editor_set_string_value', { connectionId, key, value, ttl });
}

/** Get a substring of a string value (for large strings). */
export async function editorGetStringRange(
  connectionId: string,
  key: string,
  start: number,
  end: number,
): Promise<string> {
  return tauriInvoke<string>('editor_get_string_range', { connectionId, key, start, end });
}

// ─── Editor — Hash ──────────────────────────────────────────────

/** Get all fields of a hash (suitable for small hashes). */
export async function editorGetHashAll(
  connectionId: string,
  key: string,
): Promise<HashField[]> {
  return tauriInvoke<HashField[]>('editor_get_hash_all', { connectionId, key });
}

/** Paginate hash fields with HSCAN. */
export async function editorScanHashFields(
  connectionId: string,
  key: string,
  cursor: number,
  pattern: string,
  count: number,
): Promise<HashScanResult> {
  return tauriInvoke<HashScanResult>('editor_scan_hash_fields', {
    connectionId,
    key,
    cursor,
    pattern,
    count,
  });
}

/** Set a single hash field. Returns true if the field was created (not updated). */
export async function editorSetHashField(
  connectionId: string,
  key: string,
  field: string,
  value: string,
): Promise<boolean> {
  return tauriInvoke<boolean>('editor_set_hash_field', { connectionId, key, field, value });
}

/** Delete one or more hash fields. Returns count of deleted fields. */
export async function editorDeleteHashFields(
  connectionId: string,
  key: string,
  fields: string[],
): Promise<number> {
  return tauriInvoke<number>('editor_delete_hash_fields', { connectionId, key, fields });
}

// ─── Editor — List ──────────────────────────────────────────────

/** Get a range of list elements. */
export async function editorGetListRange(
  connectionId: string,
  key: string,
  start: number,
  stop: number,
): Promise<ListElement[]> {
  return tauriInvoke<ListElement[]>('editor_get_list_range', { connectionId, key, start, stop });
}

/** Push an element to the head or tail of a list. Returns new list length. */
export async function editorPushListElement(
  connectionId: string,
  key: string,
  value: string,
  head: boolean,
): Promise<number> {
  return tauriInvoke<number>('editor_push_list_element', { connectionId, key, value, head });
}

/** Set a list element at a specific index. */
export async function editorSetListElement(
  connectionId: string,
  key: string,
  index: number,
  value: string,
): Promise<void> {
  return tauriInvoke<void>('editor_set_list_element', { connectionId, key, index, value });
}

/** Remove list elements by value. Returns count of removed elements. */
export async function editorRemoveListElement(
  connectionId: string,
  key: string,
  count: number,
  value: string,
): Promise<number> {
  return tauriInvoke<number>('editor_remove_list_element', { connectionId, key, count, value });
}

// ─── Editor — Set ───────────────────────────────────────────────

/** Get all members of a set (for small sets). */
export async function editorGetSetMembers(
  connectionId: string,
  key: string,
): Promise<string[]> {
  return tauriInvoke<string[]>('editor_get_set_members', { connectionId, key });
}

/** Scan set members using SSCAN (for large sets). */
export async function editorScanSetMembers(
  connectionId: string,
  key: string,
  cursor: number,
  pattern: string,
  count: number,
): Promise<SetScanResult> {
  return tauriInvoke<SetScanResult>('editor_scan_set_members', {
    connectionId,
    key,
    cursor,
    pattern,
    count,
  });
}

/** Add one or more members to a set. Returns count of newly added members. */
export async function editorAddSetMembers(
  connectionId: string,
  key: string,
  members: string[],
): Promise<number> {
  return tauriInvoke<number>('editor_add_set_members', { connectionId, key, members });
}

/** Remove one or more members from a set. Returns count of removed members. */
export async function editorRemoveSetMembers(
  connectionId: string,
  key: string,
  members: string[],
): Promise<number> {
  return tauriInvoke<number>('editor_remove_set_members', { connectionId, key, members });
}

// ─── Editor — Sorted Set ────────────────────────────────────────

/** Get sorted set members by rank range, with scores. */
export async function editorGetZsetRange(
  connectionId: string,
  key: string,
  start: number,
  stop: number,
): Promise<ZSetMember[]> {
  return tauriInvoke<ZSetMember[]>('editor_get_zset_range', { connectionId, key, start, stop });
}

/** Scan sorted set members with ZSCAN. */
export async function editorScanZsetMembers(
  connectionId: string,
  key: string,
  cursor: number,
  pattern: string,
  count: number,
): Promise<ZSetScanResult> {
  return tauriInvoke<ZSetScanResult>('editor_scan_zset_members', {
    connectionId,
    key,
    cursor,
    pattern,
    count,
  });
}

/** Add or update a sorted set member. Returns count of new members added. */
export async function editorAddZsetMember(
  connectionId: string,
  key: string,
  member: string,
  score: number,
): Promise<number> {
  return tauriInvoke<number>('editor_add_zset_member', { connectionId, key, member, score });
}

/** Remove members from a sorted set. Returns count of removed. */
export async function editorRemoveZsetMembers(
  connectionId: string,
  key: string,
  members: string[],
): Promise<number> {
  return tauriInvoke<number>('editor_remove_zset_members', { connectionId, key, members });
}

/** Increment a member's score. Returns the new score. */
export async function editorIncrZsetScore(
  connectionId: string,
  key: string,
  member: string,
  delta: number,
): Promise<number> {
  return tauriInvoke<number>('editor_incr_zset_score', { connectionId, key, member, delta });
}

/** Get sorted set cardinality. */
export async function editorZsetCard(
  connectionId: string,
  key: string,
): Promise<number> {
  return tauriInvoke<number>('editor_zset_card', { connectionId, key });
}

// ─── Editor — Stream ────────────────────────────────────────────

/** Get a range of stream entries (oldest first). */
export async function editorGetStreamRange(
  connectionId: string,
  key: string,
  start: string,
  end: string,
  count: number,
): Promise<StreamRangeResult> {
  return tauriInvoke<StreamRangeResult>('editor_get_stream_range', {
    connectionId,
    key,
    start,
    end,
    count,
  });
}

/** Get stream entries in reverse (newest first). */
export async function editorGetStreamRangeRev(
  connectionId: string,
  key: string,
  end: string,
  start: string,
  count: number,
): Promise<StreamRangeResult> {
  return tauriInvoke<StreamRangeResult>('editor_get_stream_range_rev', {
    connectionId,
    key,
    end,
    start,
    count,
  });
}

/** Add a stream entry. Returns the entry ID. */
export async function editorAddStreamEntry(
  connectionId: string,
  key: string,
  id: string,
  fields: [string, string][],
): Promise<string> {
  return tauriInvoke<string>('editor_add_stream_entry', { connectionId, key, id, fields });
}

/** Delete stream entries by ID. */
export async function editorDeleteStreamEntries(
  connectionId: string,
  key: string,
  ids: string[],
): Promise<number> {
  return tauriInvoke<number>('editor_delete_stream_entries', { connectionId, key, ids });
}

/** Get stream info including consumer groups. */
export async function editorGetStreamInfo(
  connectionId: string,
  key: string,
): Promise<StreamInfo> {
  return tauriInvoke<StreamInfo>('editor_get_stream_info', { connectionId, key });
}

// ─── Editor — JSON ──────────────────────────────────────────────

/** Get a JSON value (tries RedisJSON module first). */
export async function editorGetJsonValue(
  connectionId: string,
  key: string,
  path: string,
): Promise<JsonValue> {
  return tauriInvoke<JsonValue>('editor_get_json_value', { connectionId, key, path });
}

/** Set a JSON value. */
export async function editorSetJsonValue(
  connectionId: string,
  key: string,
  path: string,
  value: string,
  useModule: boolean,
): Promise<void> {
  return tauriInvoke<void>('editor_set_json_value', {
    connectionId,
    key,
    path,
    value,
    useModule,
  });
}

// ─── Editor — HyperLogLog ──────────────────────────────────────

/** Get HyperLogLog info. */
export async function editorGetHllInfo(
  connectionId: string,
  key: string,
): Promise<HllInfo> {
  return tauriInvoke<HllInfo>('editor_get_hll_info', { connectionId, key });
}

/** Add elements to a HyperLogLog. Returns true if cardinality changed. */
export async function editorAddHllElements(
  connectionId: string,
  key: string,
  elements: string[],
): Promise<boolean> {
  return tauriInvoke<boolean>('editor_add_hll_elements', { connectionId, key, elements });
}

// ─── Editor — Bitmap ────────────────────────────────────────────

/** Get bitmap info and a range of bits. */
export async function editorGetBitmapInfo(
  connectionId: string,
  key: string,
  byteOffset: number,
  byteCount: number,
): Promise<BitmapInfo> {
  return tauriInvoke<BitmapInfo>('editor_get_bitmap_info', {
    connectionId,
    key,
    byteOffset,
    byteCount,
  });
}

/** Set a single bit. Returns the old bit value. */
export async function editorSetBitmapBit(
  connectionId: string,
  key: string,
  offset: number,
  value: number,
): Promise<number> {
  return tauriInvoke<number>('editor_set_bitmap_bit', { connectionId, key, offset, value });
}

// ─── Editor — Geospatial ───────────────────────────────────────

/** Get all geospatial members with coordinates. */
export async function editorGetGeoMembers(
  connectionId: string,
  key: string,
): Promise<GeoMember[]> {
  return tauriInvoke<GeoMember[]>('editor_get_geo_members', { connectionId, key });
}

/** Add a geospatial member. */
export async function editorAddGeoMember(
  connectionId: string,
  key: string,
  longitude: number,
  latitude: number,
  member: string,
): Promise<number> {
  return tauriInvoke<number>('editor_add_geo_member', {
    connectionId,
    key,
    longitude,
    latitude,
    member,
  });
}

/** Get distance between two members. */
export async function editorGeoDistance(
  connectionId: string,
  key: string,
  member1: string,
  member2: string,
  unit: string,
): Promise<number | null> {
  return tauriInvoke<number | null>('editor_geo_distance', {
    connectionId,
    key,
    member1,
    member2,
    unit,
  });
}

/** Remove geospatial members. */
export async function editorRemoveGeoMembers(
  connectionId: string,
  key: string,
  members: string[],
): Promise<number> {
  return tauriInvoke<number>('editor_remove_geo_members', { connectionId, key, members });
}

// ─── Editor — TTL ───────────────────────────────────────────────

/** Get TTL information for a key. */
export async function editorGetTtl(
  connectionId: string,
  key: string,
): Promise<TtlInfo> {
  return tauriInvoke<TtlInfo>('editor_get_ttl', { connectionId, key });
}

/** Set TTL on a key (in seconds). Returns true if the timeout was set. */
export async function editorSetTtl(
  connectionId: string,
  key: string,
  seconds: number,
): Promise<boolean> {
  return tauriInvoke<boolean>('editor_set_ttl', { connectionId, key, seconds });
}

/** Remove TTL from a key (make it persistent). Returns true if TTL was removed. */
export async function editorPersistKey(
  connectionId: string,
  key: string,
): Promise<boolean> {
  return tauriInvoke<boolean>('editor_persist_key', { connectionId, key });
}
