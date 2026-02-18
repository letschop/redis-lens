// SPDX-License-Identifier: MIT

import { create } from 'zustand';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import * as api from '@/lib/api/commands';
import type {
  StatsSnapshot,
  SlowLogEntry,
  MonitorClientInfo,
  MemoryStats,
  ServerInfo,
  DerivedMetrics,
} from '@/lib/api/types';

const MAX_TIME_SERIES = 300; // 10 minutes at 2s interval

interface MonitorStore {
  /** Sliding window of stats snapshots for charts. */
  timeSeries: StatsSnapshot[];

  /** Most recent server info. */
  latestInfo: ServerInfo | null;

  /** Most recent derived metrics. */
  latestDerived: DerivedMetrics | null;

  /** Whether polling is active. */
  polling: boolean;

  /** Slow log entries (fetched on demand). */
  slowLog: SlowLogEntry[];

  /** Connected clients (fetched on demand). */
  clientList: MonitorClientInfo[];

  /** Memory analysis (fetched on demand). */
  memoryStats: MemoryStats | null;

  /** Loading states for on-demand tabs. */
  loadingSlowLog: boolean;
  loadingClientList: boolean;
  loadingMemory: boolean;

  /** Error message if any. */
  error: string | null;

  /** Tauri event unlisten handle. */
  _unlisten: UnlistenFn | null;

  // Actions
  startPolling: (connectionId: string, intervalMs?: number) => Promise<void>;
  stopPolling: (connectionId: string) => Promise<void>;
  appendSnapshot: (snapshot: StatsSnapshot) => void;
  fetchSlowLog: (connectionId: string, count?: number) => Promise<void>;
  fetchClientList: (connectionId: string) => Promise<void>;
  killClient: (connectionId: string, clientId: number) => Promise<void>;
  fetchMemoryStats: (connectionId: string) => Promise<void>;
  reset: () => void;
}

const initialState = {
  timeSeries: [] as StatsSnapshot[],
  latestInfo: null as ServerInfo | null,
  latestDerived: null as DerivedMetrics | null,
  polling: false,
  slowLog: [] as SlowLogEntry[],
  clientList: [] as MonitorClientInfo[],
  memoryStats: null as MemoryStats | null,
  loadingSlowLog: false,
  loadingClientList: false,
  loadingMemory: false,
  error: null as string | null,
  _unlisten: null as UnlistenFn | null,
};

export const useMonitorStore = create<MonitorStore>((set, get) => ({
  ...initialState,

  startPolling: async (connectionId, intervalMs = 2000) => {
    // Clean up any existing listener
    const existing = get()._unlisten;
    if (existing) {
      existing();
    }

    try {
      // Subscribe to Tauri events BEFORE starting the poller
      const unlisten = await listen<StatsSnapshot>('monitor:stats', (event) => {
        get().appendSnapshot(event.payload);
      });

      set({ _unlisten: unlisten, polling: true, error: null });

      await api.monitorStartPolling(connectionId, intervalMs);
    } catch (e) {
      set({ error: String(e), polling: false });
    }
  },

  stopPolling: async (connectionId) => {
    try {
      await api.monitorStopPolling(connectionId);
    } catch {
      // Best-effort stop
    }

    const unlisten = get()._unlisten;
    if (unlisten) {
      unlisten();
    }

    set({ polling: false, _unlisten: null });
  },

  appendSnapshot: (snapshot) => {
    set((state) => {
      const next = [...state.timeSeries, snapshot];
      // Ring buffer: keep only the last MAX_TIME_SERIES entries
      const trimmed = next.length > MAX_TIME_SERIES ? next.slice(-MAX_TIME_SERIES) : next;
      return {
        timeSeries: trimmed,
        latestInfo: snapshot.info,
        latestDerived: snapshot.derived,
      };
    });
  },

  fetchSlowLog: async (connectionId, count = 50) => {
    set({ loadingSlowLog: true });
    try {
      const entries = await api.monitorSlowLog(connectionId, count);
      set({ slowLog: entries, loadingSlowLog: false });
    } catch (e) {
      set({ error: String(e), loadingSlowLog: false });
    }
  },

  fetchClientList: async (connectionId) => {
    set({ loadingClientList: true });
    try {
      const clients = await api.monitorClientList(connectionId);
      set({ clientList: clients, loadingClientList: false });
    } catch (e) {
      set({ error: String(e), loadingClientList: false });
    }
  },

  killClient: async (connectionId, clientId) => {
    try {
      await api.monitorKillClient(connectionId, clientId);
      // Refresh client list after kill
      const clients = await api.monitorClientList(connectionId);
      set({ clientList: clients });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  fetchMemoryStats: async (connectionId) => {
    set({ loadingMemory: true });
    try {
      const stats = await api.monitorMemoryStats(connectionId);
      set({ memoryStats: stats, loadingMemory: false });
    } catch (e) {
      set({ error: String(e), loadingMemory: false });
    }
  },

  reset: () => {
    const unlisten = get()._unlisten;
    if (unlisten) {
      unlisten();
    }
    set({ ...initialState });
  },
}));
