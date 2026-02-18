// SPDX-License-Identifier: MIT

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  /** Key namespace delimiter (default ':') */
  keyDelimiter: string;
  /** Default SCAN COUNT hint */
  defaultScanCount: number;
  /** Maximum CLI history entries per connection */
  maxCliHistory: number;
  /** Monitor polling interval in seconds */
  monitorInterval: number;
  /** Pub/Sub message buffer size */
  pubsubBufferSize: number;
  /** Whether to confirm dangerous Redis commands */
  confirmDangerousCommands: boolean;
}

interface SettingsActions {
  updateSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  resetDefaults: () => void;
}

type SettingsStore = SettingsState & SettingsActions;

const DEFAULT_SETTINGS: SettingsState = {
  keyDelimiter: ':',
  defaultScanCount: 200,
  maxCliHistory: 500,
  monitorInterval: 2,
  pubsubBufferSize: 10000,
  confirmDangerousCommands: true,
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      updateSetting: (key, value) => {
        set({ [key]: value });
      },

      resetDefaults: () => {
        set(DEFAULT_SETTINGS);
      },
    }),
    {
      name: 'redislens-settings',
      partialize: (state) => ({
        keyDelimiter: state.keyDelimiter,
        defaultScanCount: state.defaultScanCount,
        maxCliHistory: state.maxCliHistory,
        monitorInterval: state.monitorInterval,
        pubsubBufferSize: state.pubsubBufferSize,
        confirmDangerousCommands: state.confirmDangerousCommands,
      }),
    },
  ),
);
