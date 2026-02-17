// SPDX-License-Identifier: MIT

import { create } from 'zustand';
import * as api from '@/lib/api/commands';
import type {
  HashField,
  ListElement,
  RedisKeyType,
  StringValue,
  TtlInfo,
} from '@/lib/api/types';

/** The value payload varies by key type. */
export type EditorValue =
  | { type: 'string'; data: StringValue }
  | { type: 'hash'; fields: HashField[] }
  | { type: 'list'; elements: ListElement[]; totalLength: number }
  | { type: 'set'; members: string[] }
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
  loadKey: (connectionId: string, key: string, keyType: RedisKeyType, length?: number) => Promise<void>;

  /** Reset editor state. */
  reset: () => void;

  // ─── String actions ──────────────────────────────────

  /** Save a string value. */
  saveStringValue: (value: string, ttl?: number) => Promise<void>;

  // ─── Hash actions ────────────────────────────────────

  /** Set a single hash field. */
  saveHashField: (field: string, value: string) => Promise<void>;

  /** Delete hash fields. */
  deleteHashFields: (fields: string[]) => Promise<void>;

  // ─── List actions ────────────────────────────────────

  /** Push an element to head or tail. */
  pushListElement: (value: string, head: boolean) => Promise<void>;

  /** Update a list element at a specific index. */
  setListElement: (index: number, value: string) => Promise<void>;

  /** Remove list elements by value. */
  removeListElement: (count: number, value: string) => Promise<void>;

  // ─── Set actions ─────────────────────────────────────

  /** Add members to a set. */
  addSetMembers: (members: string[]) => Promise<void>;

  /** Remove members from a set. */
  removeSetMembers: (members: string[]) => Promise<void>;

  // ─── TTL actions ─────────────────────────────────────

  /** Set TTL on the current key. */
  setTtl: (seconds: number) => Promise<void>;

  /** Remove TTL (make key persistent). */
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
          // Load first page (up to 500 elements)
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
        default:
          value = { type: 'none' };
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
      // Reload to confirm
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
      // Reload all fields
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
      // Reload visible page
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
      // Reload
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
