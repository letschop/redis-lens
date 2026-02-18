// SPDX-License-Identifier: MIT

'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { open } from '@tauri-apps/plugin-shell';
import { useConnectionStore } from '@/lib/stores/connection-store';

/**
 * Promotional banner for letschop.io.
 * Closeable by the user, but re-appears on app restart or new connection.
 */
export function PromoBanner() {
  const [dismissed, setDismissed] = useState(false);

  // Subscribe to the store and re-show banner when a new connection is established.
  // The subscription callback is allowed to call setState (it's an external system callback).
  useEffect(() => {
    let prevConnected = new Set<string>();

    const unsubscribe = useConnectionStore.subscribe((state) => {
      const currentConnected = new Set(
        Object.entries(state.states)
          .filter(([, s]) => s.status === 'connected')
          .map(([id]) => id),
      );

      for (const id of currentConnected) {
        if (!prevConnected.has(id)) {
          setDismissed(false);
          break;
        }
      }

      prevConnected = currentConnected;
    });

    return unsubscribe;
  }, []);

  const handleOpen = useCallback(() => {
    void open('https://letschop.io');
  }, []);

  if (dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-3 bg-primary px-4 py-2 text-primary-foreground shrink-0">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold">RedisLens</span>
        <span className="opacity-80">is a project by</span>
        <button
          onClick={handleOpen}
          className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
        >
          letschop.io
          <ExternalLink className="h-3 w-3" />
        </button>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="rounded-sm p-0.5 hover:bg-primary-foreground/20 transition-colors"
        aria-label="Dismiss banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
