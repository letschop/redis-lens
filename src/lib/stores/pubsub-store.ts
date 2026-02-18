// SPDX-License-Identifier: MIT

import { create } from 'zustand';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import * as api from '@/lib/api/commands';
import type { PubSubMessage, ChannelInfo } from '@/lib/api/types';

interface Subscription {
  id: string;
  channels: string[];
  patterns: string[];
  createdAt: number;
}

interface PubSubState {
  subscriptions: Subscription[];
  messages: PubSubMessage[];
  activeChannels: ChannelInfo[];
  isPaused: boolean;
  maxMessages: number;
  channelFilter: string;
  payloadFilter: string;
  isSubscribing: boolean;
  error: string | null;
  unlisten: UnlistenFn | null;
}

interface PubSubActions {
  subscribe: (connectionId: string, channels: string[]) => Promise<string | null>;
  psubscribe: (connectionId: string, patterns: string[]) => Promise<string | null>;
  unsubscribe: (subscriptionId: string) => Promise<void>;
  unsubscribeAll: () => Promise<void>;
  publish: (connectionId: string, channel: string, message: string) => Promise<number | null>;
  loadActiveChannels: (connectionId: string, pattern?: string) => Promise<void>;
  togglePause: () => void;
  clearMessages: () => void;
  setChannelFilter: (filter: string) => void;
  setPayloadFilter: (filter: string) => void;
  startListening: () => Promise<void>;
  stopListening: () => void;
}

type PubSubStore = PubSubState & PubSubActions;

const MAX_MESSAGES = 10_000;

export const usePubSubStore = create<PubSubStore>()((set, get) => ({
  subscriptions: [],
  messages: [],
  activeChannels: [],
  isPaused: false,
  maxMessages: MAX_MESSAGES,
  channelFilter: '',
  payloadFilter: '',
  isSubscribing: false,
  error: null,
  unlisten: null,

  subscribe: async (connectionId, channels) => {
    set({ isSubscribing: true, error: null });
    try {
      const id = await api.pubsubSubscribe(connectionId, channels);
      set((state) => ({
        subscriptions: [
          ...state.subscriptions,
          { id, channels, patterns: [], createdAt: Date.now() },
        ],
        isSubscribing: false,
      }));
      return id;
    } catch (e) {
      set({ isSubscribing: false, error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  },

  psubscribe: async (connectionId, patterns) => {
    set({ isSubscribing: true, error: null });
    try {
      const id = await api.pubsubPsubscribe(connectionId, patterns);
      set((state) => ({
        subscriptions: [
          ...state.subscriptions,
          { id, channels: [], patterns, createdAt: Date.now() },
        ],
        isSubscribing: false,
      }));
      return id;
    } catch (e) {
      set({ isSubscribing: false, error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  },

  unsubscribe: async (subscriptionId) => {
    try {
      await api.pubsubUnsubscribe(subscriptionId);
      set((state) => ({
        subscriptions: state.subscriptions.filter((s) => s.id !== subscriptionId),
      }));
    } catch {
      // Already unsubscribed
    }
  },

  unsubscribeAll: async () => {
    const subs = get().subscriptions;
    for (const sub of subs) {
      try {
        await api.pubsubUnsubscribe(sub.id);
      } catch {
        // Ignore
      }
    }
    set({ subscriptions: [] });
  },

  publish: async (connectionId, channel, message) => {
    try {
      return await api.pubsubPublish(connectionId, channel, message);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  },

  loadActiveChannels: async (connectionId, pattern) => {
    try {
      const channels = await api.pubsubGetActiveChannels(connectionId, pattern);
      set({ activeChannels: channels });
    } catch {
      // Silently ignore
    }
  },

  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),

  clearMessages: () => set({ messages: [] }),

  setChannelFilter: (filter) => set({ channelFilter: filter }),
  setPayloadFilter: (filter) => set({ payloadFilter: filter }),

  startListening: async () => {
    // Stop existing listener if any
    get().stopListening();

    const fn_ = await listen<PubSubMessage>('pubsub:message', (event) => {
      const state = get();
      if (state.isPaused) return;

      const msgs = [...state.messages, event.payload];
      // Trim ring buffer
      const trimmed = msgs.length > state.maxMessages
        ? msgs.slice(msgs.length - state.maxMessages)
        : msgs;
      set({ messages: trimmed });
    });

    set({ unlisten: fn_ });
  },

  stopListening: () => {
    const { unlisten } = get();
    if (unlisten) {
      unlisten();
      set({ unlisten: null });
    }
  },
}));
