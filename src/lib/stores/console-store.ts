// SPDX-License-Identifier: MIT

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as api from '@/lib/api/commands';
import type { ExecuteResponse, CommandSuggestion } from '@/lib/api/types';

interface ConsoleState {
  // Per-connection history (persisted)
  histories: Record<string, ExecuteResponse[]>;
  // Suggestions cache
  suggestions: CommandSuggestion[];
  suggestionsPrefix: string;
  // Loading
  isExecuting: boolean;
  error: string | null;
}

interface ConsoleActions {
  execute: (connectionId: string, command: string, force?: boolean) => Promise<ExecuteResponse | null>;
  loadSuggestions: (prefix: string) => Promise<void>;
  clearSuggestions: () => void;
  clearHistory: (connectionId: string) => void;
}

type ConsoleStore = ConsoleState & ConsoleActions;

const MAX_HISTORY = 500;

export const useConsoleStore = create<ConsoleStore>()(
  persist(
    (set, _get) => ({
      histories: {},
      suggestions: [],
      suggestionsPrefix: '',
      isExecuting: false,
      error: null,

      execute: async (connectionId, command, force = false) => {
        set({ isExecuting: true, error: null });
        try {
          const response = await api.cliExecute(connectionId, command, force);
          set((state) => {
            const history = [...(state.histories[connectionId] ?? []), response];
            // Trim to max history
            const trimmed = history.length > MAX_HISTORY
              ? history.slice(history.length - MAX_HISTORY)
              : history;
            return {
              histories: { ...state.histories, [connectionId]: trimmed },
              isExecuting: false,
            };
          });
          return response;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          set({ isExecuting: false, error: msg });
          return null;
        }
      },

      loadSuggestions: async (prefix) => {
        if (prefix.length < 1) {
          set({ suggestions: [], suggestionsPrefix: '' });
          return;
        }
        try {
          const results = await api.cliGetCommandSuggestions(prefix);
          set({ suggestions: results, suggestionsPrefix: prefix });
        } catch {
          // Silently ignore suggestion errors
        }
      },

      clearSuggestions: () => set({ suggestions: [], suggestionsPrefix: '' }),

      clearHistory: (connectionId) =>
        set((state) => ({
          histories: { ...state.histories, [connectionId]: [] },
        })),
    }),
    {
      name: 'redis-lens-console',
      partialize: (state) => ({ histories: state.histories }),
    },
  ),
);
