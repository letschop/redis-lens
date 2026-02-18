// SPDX-License-Identifier: MIT

import { create } from 'zustand';
import * as api from '@/lib/api/commands';
import type {
  BitmapInfo,
  GeoMember,
  HashField,
  HllInfo,
  JsonValue,
  ListElement,
  RedisKeyType,
  StreamEntry,
  StreamInfo,
  StringValue,
  TtlInfo,
  ZSetMember,
} from '@/lib/api/types';

/** The value payload varies by key type. */
export type EditorValue =
  | { type: 'string'; data: StringValue }
  | { type: 'hash'; fields: HashField[] }
  | { type: 'list'; elements: ListElement[]; totalLength: number }
  | { type: 'set'; members: string[] }
  | { type: 'zset'; members: ZSetMember[]; totalCount: number }
  | { type: 'stream'; entries: StreamEntry[]; totalLength: number; info: StreamInfo | null }
  | { type: 'json'; data: JsonValue }
  | { type: 'hll'; info: HllInfo }
  | { type: 'bitmap'; info: BitmapInfo }
  | { type: 'geo'; members: GeoMember[] }
  | { type: 'none' };

interface EditorStore {
  /** Connection ID the editor operates on. */
  connectionId: string | null;

  /** Key currently being edited. */
  key: string | null;

  /** Redis type of the current key. */
  keyType: RedisKeyType | null;

  /** Loaded value (type-specific). */
  value: EditorValue;

  /** TTL metadata for the current key. */
  ttl: TtlInfo | null;

  /** Whether a load/save operation is in progress. */
  loading: boolean;

  /** Whether the current value has unsaved changes. */
  dirty: boolean;

  /** Last error encountered. */
  error: string | null;

  // ─── Actions ─────────────────────────────────────────

  /** Load a key's value and TTL. Determines type from KeyInfo. */
  loadKey: (
    connectionId: string,
    key: string,
    keyType: RedisKeyType,
    length?: number,
  ) => Promise<void>;

  /** Reset editor state. */
  reset: () => void;

  // ─── String actions ──────────────────────────────────
  saveStringValue: (value: string, ttl?: number) => Promise<void>;

  // ─── Hash actions ────────────────────────────────────
  saveHashField: (field: string, value: string) => Promise<void>;
  deleteHashFields: (fields: string[]) => Promise<void>;

  // ─── List actions ────────────────────────────────────
  pushListElement: (value: string, head: boolean) => Promise<void>;
  setListElement: (index: number, value: string) => Promise<void>;
  removeListElement: (count: number, value: string) => Promise<void>;

  // ─── Set actions ─────────────────────────────────────
  addSetMembers: (members: string[]) => Promise<void>;
  removeSetMembers: (members: string[]) => Promise<void>;

  // ─── Sorted Set actions ──────────────────────────────
  addZsetMember: (member: string, score: number) => Promise<void>;
  removeZsetMembers: (members: string[]) => Promise<void>;
  incrZsetScore: (member: string, delta: number) => Promise<void>;

  // ─── Stream actions ──────────────────────────────────
  addStreamEntry: (id: string, fields: [string, string][]) => Promise<void>;
  deleteStreamEntries: (ids: string[]) => Promise<void>;

  // ─── JSON actions ────────────────────────────────────
  saveJsonValue: (value: string) => Promise<void>;

  // ─── HLL actions ─────────────────────────────────────
  addHllElements: (elements: string[]) => Promise<void>;

  // ─── Bitmap actions ──────────────────────────────────
  toggleBit: (offset: number, value: number) => Promise<void>;

  // ─── Geo actions ─────────────────────────────────────
  addGeoMember: (longitude: number, latitude: number, member: string) => Promise<void>;
  removeGeoMembers: (members: string[]) => Promise<void>;

  // ─── TTL actions ─────────────────────────────────────
  setTtl: (seconds: number) => Promise<void>;
  persistKey: () => Promise<void>;

  /** Mark value as dirty (has unsaved changes). */
  setDirty: (dirty: boolean) => void;
}

const INITIAL_STATE = {
  connectionId: null,
  key: null,
  keyType: null,
  value: { type: 'none' } as EditorValue,
  ttl: null,
  loading: false,
  dirty: false,
  error: null,
};

/** Large-collection threshold: use SCAN-based loading above this. */
const LARGE_THRESHOLD = 1000;

export const useEditorStore = create<EditorStore>((set, get) => ({
  ...INITIAL_STATE,

  loadKey: async (connectionId, key, keyType, length) => {
    set({ connectionId, key, keyType, loading: true, dirty: false, error: null });

    try {
      // Load value based on type
      let value: EditorValue;

      switch (keyType) {
        case 'string': {
          const data = await api.editorGetStringValue(connectionId, key);
          value = { type: 'string', data };
          break;
        }
        case 'hash': {
          const fields =
            (length ?? 0) > LARGE_THRESHOLD
              ? await loadAllHashFields(connectionId, key)
              : await api.editorGetHashAll(connectionId, key);
          value = { type: 'hash', fields };
          break;
        }
        case 'list': {
          const totalLength = length ?? 0;
          const pageSize = Math.min(totalLength || 500, 500);
          const elements = await api.editorGetListRange(connectionId, key, 0, pageSize - 1);
          value = { type: 'list', elements, totalLength };
          break;
        }
        case 'set': {
          const members =
            (length ?? 0) > LARGE_THRESHOLD
              ? await loadAllSetMembers(connectionId, key)
              : await api.editorGetSetMembers(connectionId, key);
          value = { type: 'set', members };
          break;
        }
        case 'zset': {
          const totalCount = await api.editorZsetCard(connectionId, key);
          const pageSize = Math.min(totalCount || 500, 500);
          const members = await api.editorGetZsetRange(connectionId, key, 0, pageSize - 1);
          value = { type: 'zset', members, totalCount };
          break;
        }
        case 'stream': {
          const result = await api.editorGetStreamRangeRev(connectionId, key, '+', '-', 100);
          let info: StreamInfo | null = null;
          try {
            info = await api.editorGetStreamInfo(connectionId, key);
          } catch {
            // XINFO may fail on older Redis versions
          }
          value = {
            type: 'stream',
            entries: result.entries,
            totalLength: result.totalLength,
            info,
          };
          break;
        }
        default: {
          // Try to detect JSON-like strings, HLL, bitmap, geo based on encoding
          // For now, attempt loading as generic value
          value = await loadSpecialType(connectionId, key, keyType);
        }
      }

      // Load TTL
      const ttl = await api.editorGetTtl(connectionId, key);

      set({ value, ttl, loading: false });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  reset: () => set(INITIAL_STATE),

  // ─── String ──────────────────────────────────────────

  saveStringValue: async (value, ttl) => {
    const { connectionId, key } = get();
    if (!connectionId || !key) return;
    set({ loading: true, error: null });
    try {
      await api.editorSetStringValue(connectionId, key, value, ttl);
      const data = await api.editorGetStringValue(connectionId, key);
      set({ value: { type: 'string', data }, dirty: false, loading: false });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  // ─── Hash ────────────────────────────────────────────

  saveHashField: async (field, value) => {
    const { connectionId, key } = get();
    if (!connectionId || !key) return;
    set({ loading: true, error: null });
    try {
      await api.editorSetHashField(connectionId, key, field, value);
      const fields = await api.editorGetHashAll(connectionId, key);
      set({ value: { type: 'hash', fields }, dirty: false, loading: false });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  deleteHashFields: async (fields) => {
    const { connectionId, key } = get();
    if (!connectionId || !key) return;
    set({ loading: true, error: null });
    try {
      await api.editorDeleteHashFields(connectionId, key, fields);
      const updatedFields = await api.editorGetHashAll(connectionId, key);
      set({ value: { type: 'hash', fields: updatedFields }, loading: false });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  // ─── List ────────────────────────────────────────────

  pushListElement: async (value, head) => {
    const { connectionId, key } = get();
    if (!connectionId || !key) return;
    set({ loading: true, error: null });
    try {
      const newLength = await api.editorPushListElement(connectionId, key, value, head);
      const pageSize = Math.min(newLength, 500);
      const elements = await api.editorGetListRange(connectionId, key, 0, pageSize - 1);
      set({ value: { type: 'list', elements, totalLength: newLength }, loading: false });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  setListElement: async (index, value) => {
    const { connectionId, key } = get();
    if (!connectionId || !key) return;
    set({ loading: true, error: null });
    try {
      await api.editorSetListElement(connectionId, key, index, value);
      const current = get().value;
      const totalLength = current.type === 'list' ? current.totalLength : 500;
      const pageSize = Math.min(totalLength, 500);
      const elements = await api.editorGetListRange(connectionId, key, 0, pageSize - 1);
      set({ value: { type: 'list', elements, totalLength }, dirty: false, loading: false });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  removeListElement: async (count, value) => {
    const { connectionId, key } = get();
    if (!connectionId || !key) return;
    set({ loading: true, error: null });
    try {
      await api.editorRemoveListElement(connectionId, key, count, value);
      const elements = await api.editorGetListRange(connectionId, key, 0, 499);
      set({
        value: { type: 'list', elements, totalLength: elements.length },
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  // ─── Set ─────────────────────────────────────────────

  addSetMembers: async (members) => {
    const { connectionId, key } = get();
    if (!connectionId || !key) return;
    set({ loading: true, error: null });
    try {
      await api.editorAddSetMembers(connectionId, key, members);
      const updatedMembers = await api.editorGetSetMembers(connectionId, key);
      set({ value: { type: 'set', members: updatedMembers }, loading: false });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  removeSetMembers: async (members) => {
    const { connectionId, key } = get();
    if (!connectionId || !key) return;
    set({ loading: true, error: null });
    try {
      await api.editorRemoveSetMembers(connectionId, key, members);
      const updatedMembers = await api.editorGetSetMembers(connectionId, key);
      set({ value: { type: 'set', members: updatedMembers }, loading: false });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  // ─── Sorted Set ──────────────────────────────────────

  addZsetMember: async (member, score) => {
    const { connectionId, key } = get();
    if (!connectionId || !key) return;
    set({ loading: true, error: null });
    try {
      await api.editorAddZsetMember(connectionId, key, member, score);
      const totalCount = await api.editorZsetCard(connectionId, key);
      const pageSize = Math.min(totalCount, 500);
      const members = await api.editorGetZsetRange(connectionId, key, 0, pageSize - 1);
      set({ value: { type: 'zset', members, totalCount }, loading: false });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  removeZsetMembers: async (members) => {
    const { connectionId, key } = get();
    if (!connectionId || !key) return;
    set({ loading: true, error: null });
    try {
      await api.editorRemoveZsetMembers(connectionId, key, members);
      const totalCount = await api.editorZsetCard(connectionId, key);
      const pageSize = Math.min(totalCount, 500);
      const updatedMembers = await api.editorGetZsetRange(connectionId, key, 0, pageSize - 1);
      set({ value: { type: 'zset', members: updatedMembers, totalCount }, loading: false });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  incrZsetScore: async (member, delta) => {
    const { connectionId, key } = get();
    if (!connectionId || !key) return;
    set({ loading: true, error: null });
    try {
      await api.editorIncrZsetScore(connectionId, key, member, delta);
      const totalCount = await api.editorZsetCard(connectionId, key);
      const pageSize = Math.min(totalCount, 500);
      const members = await api.editorGetZsetRange(connectionId, key, 0, pageSize - 1);
      set({ value: { type: 'zset', members, totalCount }, loading: false });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  // ─── Stream ──────────────────────────────────────────

  addStreamEntry: async (id, fields) => {
    const { connectionId, key } = get();
    if (!connectionId || !key) return;
    set({ loading: true, error: null });
    try {
      await api.editorAddStreamEntry(connectionId, key, id, fields);
      const result = await api.editorGetStreamRangeRev(connectionId, key, '+', '-', 100);
      let info: StreamInfo | null = null;
      try {
        info = await api.editorGetStreamInfo(connectionId, key);
      } catch {
        // ignore
      }
      set({
        value: { type: 'stream', entries: result.entries, totalLength: result.totalLength, info },
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  deleteStreamEntries: async (ids) => {
    const { connectionId, key } = get();
    if (!connectionId || !key) return;
    set({ loading: true, error: null });
    try {
      await api.editorDeleteStreamEntries(connectionId, key, ids);
      const result = await api.editorGetStreamRangeRev(connectionId, key, '+', '-', 100);
      const currentValue = get().value;
      const currentInfo = currentValue.type === 'stream' ? currentValue.info : null;
      set({
        value: {
          type: 'stream',
          entries: result.entries,
          totalLength: result.totalLength,
          info: currentInfo,
        },
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  // ─── JSON ────────────────────────────────────────────

  saveJsonValue: async (value) => {
    const { connectionId, key } = get();
    if (!connectionId || !key) return;
    const current = get().value;
    const useModule = current.type === 'json' ? current.data.isModule : false;
    set({ loading: true, error: null });
    try {
      await api.editorSetJsonValue(connectionId, key, '$', value, useModule);
      const data = await api.editorGetJsonValue(connectionId, key, '$');
      set({ value: { type: 'json', data }, dirty: false, loading: false });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  // ─── HLL ─────────────────────────────────────────────

  addHllElements: async (elements) => {
    const { connectionId, key } = get();
    if (!connectionId || !key) return;
    set({ loading: true, error: null });
    try {
      await api.editorAddHllElements(connectionId, key, elements);
      const info = await api.editorGetHllInfo(connectionId, key);
      set({ value: { type: 'hll', info }, loading: false });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  // ─── Bitmap ──────────────────────────────────────────

  toggleBit: async (offset, value) => {
    const { connectionId, key } = get();
    if (!connectionId || !key) return;
    set({ error: null });
    try {
      await api.editorSetBitmapBit(connectionId, key, offset, value);
      // Reload current view
      const current = get().value;
      const byteOffset = current.type === 'bitmap' ? current.info.offset : 0;
      const info = await api.editorGetBitmapInfo(connectionId, key, byteOffset, 128);
      set({ value: { type: 'bitmap', info } });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  // ─── Geo ─────────────────────────────────────────────

  addGeoMember: async (longitude, latitude, member) => {
    const { connectionId, key } = get();
    if (!connectionId || !key) return;
    set({ loading: true, error: null });
    try {
      await api.editorAddGeoMember(connectionId, key, longitude, latitude, member);
      const members = await api.editorGetGeoMembers(connectionId, key);
      set({ value: { type: 'geo', members }, loading: false });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  removeGeoMembers: async (members) => {
    const { connectionId, key } = get();
    if (!connectionId || !key) return;
    set({ loading: true, error: null });
    try {
      await api.editorRemoveGeoMembers(connectionId, key, members);
      const updatedMembers = await api.editorGetGeoMembers(connectionId, key);
      set({ value: { type: 'geo', members: updatedMembers }, loading: false });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  // ─── TTL ─────────────────────────────────────────────

  setTtl: async (seconds) => {
    const { connectionId, key } = get();
    if (!connectionId || !key) return;
    set({ error: null });
    try {
      await api.editorSetTtl(connectionId, key, seconds);
      const ttl = await api.editorGetTtl(connectionId, key);
      set({ ttl });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  persistKey: async () => {
    const { connectionId, key } = get();
    if (!connectionId || !key) return;
    set({ error: null });
    try {
      await api.editorPersistKey(connectionId, key);
      const ttl = await api.editorGetTtl(connectionId, key);
      set({ ttl });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  setDirty: (dirty) => set({ dirty }),
}));

// ─── Helpers for large collections ──────────────────────────────

async function loadAllHashFields(connectionId: string, key: string): Promise<HashField[]> {
  const allFields: HashField[] = [];
  let cursor = 0;
  do {
    const result = await api.editorScanHashFields(connectionId, key, cursor, '*', 500);
    allFields.push(...result.fields);
    cursor = result.cursor;
  } while (cursor !== 0);
  return allFields;
}

async function loadAllSetMembers(connectionId: string, key: string): Promise<string[]> {
  const allMembers: string[] = [];
  let cursor = 0;
  do {
    const result = await api.editorScanSetMembers(connectionId, key, cursor, '*', 500);
    allMembers.push(...result.members);
    cursor = result.cursor;
  } while (cursor !== 0);
  return allMembers;
}

/** Load special types (string-based: json, hll, bitmap, geo). */
async function loadSpecialType(
  connectionId: string,
  key: string,
  keyType: string,
): Promise<EditorValue> {
  // Try to match known special types by their Redis TYPE string
  switch (keyType) {
    case 'ReJSON-RL':
    case 'rejson-rl': {
      // RedisJSON module type
      const data = await api.editorGetJsonValue(connectionId, key, '$');
      return { type: 'json', data };
    }
    default:
      return { type: 'none' };
  }
}
