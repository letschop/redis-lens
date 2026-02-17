// SPDX-License-Identifier: MIT

import { create } from 'zustand';
import * as api from '@/lib/api/commands';
import type { ConnectionProfile, ConnectionState, ServerInfoSummary } from '@/lib/api/types';

interface ConnectionStore {
  /** All saved connection profiles. */
  profiles: ConnectionProfile[];

  /** Connection state per profile ID. */
  states: Record<string, ConnectionState>;

  /** Currently active (selected) connection ID. */
  activeConnectionId: string | null;

  /** Whether the initial load has completed. */
  loaded: boolean;

  // ─── Actions ─────────────────────────────────────────

  /** Load all profiles from the backend. */
  loadProfiles: () => Promise<void>;

  /** Save a new or updated profile. */
  saveProfile: (profile: ConnectionProfile) => Promise<ConnectionProfile>;

  /** Remove a profile by ID. */
  removeProfile: (id: string) => Promise<void>;

  /** Test a connection (does not persist). */
  testConnection: (profile: ConnectionProfile) => Promise<ServerInfoSummary>;

  /** Connect to a saved profile. */
  connect: (id: string) => Promise<void>;

  /** Disconnect from a profile. */
  disconnect: (id: string) => Promise<void>;

  /** Set the active connection. */
  setActiveConnection: (id: string | null) => void;

  /** Update a connection's state (used by event listeners). */
  updateState: (id: string, state: ConnectionState) => void;
}

export const useConnectionStore = create<ConnectionStore>()((set, _get) => ({
  profiles: [],
  states: {},
  activeConnectionId: null,
  loaded: false,

  loadProfiles: async () => {
    const profiles = await api.connectionList();
    set({ profiles, loaded: true });
  },

  saveProfile: async (profile) => {
    const saved = await api.connectionSave(profile);
    set((s) => {
      const existing = s.profiles.findIndex((p) => p.id === saved.id);
      const profiles =
        existing >= 0
          ? s.profiles.map((p) => (p.id === saved.id ? saved : p))
          : [...s.profiles, saved];
      return { profiles };
    });
    return saved;
  },

  removeProfile: async (id) => {
    await api.connectionDelete(id);
    set((s) => ({
      profiles: s.profiles.filter((p) => p.id !== id),
      activeConnectionId: s.activeConnectionId === id ? null : s.activeConnectionId,
    }));
  },

  testConnection: async (profile) => {
    return api.connectionTest(profile);
  },

  connect: async (id) => {
    set((s) => ({
      states: { ...s.states, [id]: { status: 'connecting' } },
    }));
    try {
      const serverInfo = await api.connectionConnect(id);
      set((s) => ({
        states: { ...s.states, [id]: { status: 'connected', serverInfo } },
        activeConnectionId: id,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set((s) => ({
        states: { ...s.states, [id]: { status: 'error', message, retryCount: 0 } },
      }));
      throw err;
    }
  },

  disconnect: async (id) => {
    await api.connectionDisconnect(id);
    set((s) => ({
      states: { ...s.states, [id]: { status: 'disconnected' } },
      activeConnectionId: s.activeConnectionId === id ? null : s.activeConnectionId,
    }));
  },

  setActiveConnection: (id) => set({ activeConnectionId: id }),

  updateState: (id, state) =>
    set((s) => ({
      states: { ...s.states, [id]: state },
    })),
}));
