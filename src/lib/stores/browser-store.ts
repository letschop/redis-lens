// SPDX-License-Identifier: MIT

import { create } from 'zustand';
import * as api from '@/lib/api/commands';
import type { FlatTreeNode, KeyInfo, KeyNode } from '@/lib/api/types';
import { flattenTree, toggleExpand } from '@/lib/utils/tree-helpers';

interface BrowserStore {
  /** The connection ID this browser is bound to. */
  connectionId: string | null;

  /** Root-level tree nodes. */
  tree: KeyNode[];

  /** Children keyed by parent full path. */
  childrenMap: Map<string, KeyNode[]>;

  /** Set of expanded folder paths. */
  expanded: Set<string>;

  /** Flattened tree for virtual scrolling. */
  flatNodes: FlatTreeNode[];

  /** Currently selected key (full path). */
  selectedKey: string | null;

  /** Detailed info for the selected key. */
  selectedKeyInfo: KeyInfo | null;

  /** All keys accumulated from SCAN. */
  allKeys: string[];

  /** Whether a SCAN is currently in progress. */
  loading: boolean;

  /** Current SCAN cursor (0 = start/finished). */
  scanCursor: number;

  /** Whether the full scan has completed. */
  scanComplete: boolean;

  /** SCAN filter pattern. */
  pattern: string;

  /** Key delimiter for tree building. */
  delimiter: string;

  /** Total keys estimate from DBSIZE. */
  totalEstimate: number;

  /** Metadata cache for visible keys. */
  keyInfoCache: Map<string, KeyInfo>;

  // ─── Actions ─────────────────────────────────────────

  /** Set the connection ID and reset state. */
  setConnectionId: (id: string) => void;

  /** Start scanning keys from the beginning. */
  loadRootKeys: () => Promise<void>;

  /** Continue scanning from the current cursor. */
  loadMore: () => Promise<void>;

  /** Expand a namespace folder (loads children if needed). */
  expandNamespace: (path: string) => Promise<void>;

  /** Collapse a namespace folder. */
  collapseNamespace: (path: string) => void;

  /** Select a key and load its detailed info. */
  selectKey: (key: string | null) => Promise<void>;

  /** Update the filter pattern and re-scan. */
  setPattern: (pattern: string) => void;

  /** Delete keys and refresh the tree. */
  deleteKeys: (keys: string[]) => Promise<number>;

  /** Refresh the entire key browser. */
  refresh: () => Promise<void>;

  /** Load metadata for a batch of keys (viewport-aware). */
  loadMetadata: (keys: string[]) => Promise<void>;
}

export const useBrowserStore = create<BrowserStore>()((set, get) => ({
  connectionId: null,
  tree: [],
  childrenMap: new Map(),
  expanded: new Set(),
  flatNodes: [],
  selectedKey: null,
  selectedKeyInfo: null,
  allKeys: [],
  loading: false,
  scanCursor: 0,
  scanComplete: false,
  pattern: '*',
  delimiter: ':',
  totalEstimate: 0,
  keyInfoCache: new Map(),

  setConnectionId: (id) => {
    set({
      connectionId: id,
      tree: [],
      childrenMap: new Map(),
      expanded: new Set(),
      flatNodes: [],
      selectedKey: null,
      selectedKeyInfo: null,
      allKeys: [],
      scanCursor: 0,
      scanComplete: false,
      totalEstimate: 0,
      keyInfoCache: new Map(),
    });
  },

  loadRootKeys: async () => {
    const { connectionId, pattern, delimiter } = get();
    if (!connectionId) return;

    set({ loading: true, allKeys: [], scanCursor: 0, scanComplete: false });
    try {
      const result = await api.browserScanKeys(connectionId, 0, pattern, 500);

      // Deduplicate
      const uniqueKeys = [...new Set(result.keys)];

      // Build tree on the Rust side
      const tree = await api.browserBuildTree(uniqueKeys, delimiter);

      set({
        tree,
        allKeys: uniqueKeys,
        scanCursor: result.cursor,
        scanComplete: result.finished,
        totalEstimate: result.totalEstimate,
        flatNodes: flattenTree(tree, get().expanded, get().childrenMap),
      });
    } finally {
      set({ loading: false });
    }
  },

  loadMore: async () => {
    const { connectionId, scanCursor, scanComplete, pattern, delimiter, allKeys } = get();
    if (!connectionId || scanComplete) return;

    set({ loading: true });
    try {
      const result = await api.browserScanKeys(connectionId, scanCursor, pattern, 1000);

      // Deduplicate against existing keys
      const existingSet = new Set(allKeys);
      const newKeys = result.keys.filter((k) => !existingSet.has(k));
      const combinedKeys = [...allKeys, ...newKeys];

      // Rebuild tree with all accumulated keys
      const tree = await api.browserBuildTree(combinedKeys, delimiter);

      set({
        tree,
        allKeys: combinedKeys,
        scanCursor: result.cursor,
        scanComplete: result.finished,
        totalEstimate: result.totalEstimate,
        flatNodes: flattenTree(tree, get().expanded, get().childrenMap),
      });
    } finally {
      set({ loading: false });
    }
  },

  expandNamespace: async (path) => {
    const { expanded, tree, childrenMap, allKeys, delimiter } = get();
    const newExpanded = toggleExpand(expanded, path);
    set({ expanded: newExpanded });

    // Check if children are already loaded
    if (childrenMap.has(path)) {
      set({ flatNodes: flattenTree(tree, newExpanded, childrenMap) });
      return;
    }

    // Compute children from already-scanned keys
    const depth = path.split(delimiter).length;
    const children = await api.browserGetChildren(allKeys, path, delimiter, depth);

    const newChildrenMap = new Map(childrenMap);
    newChildrenMap.set(path, children);

    set({
      childrenMap: newChildrenMap,
      flatNodes: flattenTree(tree, newExpanded, newChildrenMap),
    });
  },

  collapseNamespace: (path) => {
    const { expanded, tree, childrenMap } = get();
    const newExpanded = toggleExpand(expanded, path);
    set({
      expanded: newExpanded,
      flatNodes: flattenTree(tree, newExpanded, childrenMap),
    });
  },

  selectKey: async (key) => {
    if (!key) {
      set({ selectedKey: null, selectedKeyInfo: null });
      return;
    }

    const { connectionId } = get();
    if (!connectionId) return;

    set({ selectedKey: key, selectedKeyInfo: null });
    try {
      const info = await api.browserGetKeyInfo(connectionId, key);
      set({ selectedKeyInfo: info });
    } catch {
      // Key may have been deleted
      set({ selectedKeyInfo: null });
    }
  },

  setPattern: (pattern) => {
    set({ pattern: pattern || '*' });
    void get().refresh();
  },

  deleteKeys: async (keys) => {
    const { connectionId } = get();
    if (!connectionId || keys.length === 0) return 0;

    const count = await api.browserDeleteKeys(connectionId, keys);

    // Remove from local state
    const { allKeys } = get();
    const deletedSet = new Set(keys);
    const remainingKeys = allKeys.filter((k) => !deletedSet.has(k));
    set({ allKeys: remainingKeys });

    // If the selected key was deleted, deselect
    const { selectedKey } = get();
    if (selectedKey && deletedSet.has(selectedKey)) {
      set({ selectedKey: null, selectedKeyInfo: null });
    }

    // Refresh tree
    void get().refresh();
    return count;
  },

  refresh: async () => {
    const { connectionId } = get();
    if (!connectionId) return;

    set({
      tree: [],
      childrenMap: new Map(),
      flatNodes: [],
      allKeys: [],
      scanCursor: 0,
      scanComplete: false,
      keyInfoCache: new Map(),
    });
    await get().loadRootKeys();
  },

  loadMetadata: async (keys) => {
    const { connectionId, keyInfoCache } = get();
    if (!connectionId || keys.length === 0) return;

    // Filter out keys that are already cached
    const uncachedKeys = keys.filter((k) => !keyInfoCache.has(k));
    if (uncachedKeys.length === 0) return;

    try {
      const infos = await api.browserGetKeysInfo(connectionId, uncachedKeys);
      const newCache = new Map(keyInfoCache);
      for (const info of infos) {
        newCache.set(info.key, info);
      }
      set({ keyInfoCache: newCache });
    } catch {
      // Non-critical — metadata loading failures are silent
    }
  },
}));
