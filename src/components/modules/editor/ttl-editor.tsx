// SPDX-License-Identifier: MIT
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Clock, Infinity as InfinityIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useEditorStore } from '@/lib/stores/editor-store';
import { formatTtl } from '@/lib/utils/tree-helpers';

/**
 * Countdown badge that decrements every second.
 * Uses `key` prop to remount with a fresh initial value when the server TTL
 * changes, avoiding any setState-in-effect patterns.
 */
function TtlCountdown({ seconds }: { seconds: number }) {
  const [countdown, setCountdown] = useState(seconds);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [seconds]);

  return (
    <Badge
      variant={countdown < 60 ? 'destructive' : 'outline'}
      className="text-xs font-mono tabular-nums"
    >
      TTL: {formatTtl(countdown)}
    </Badge>
  );
}

export function TtlEditor() {
  const { ttl, loading, setTtl, persistKey } = useEditorStore();

  const [editing, setEditing] = useState(false);
  const [inputSeconds, setInputSeconds] = useState('');

  const serverSeconds = ttl && !ttl.isPersistent && !ttl.isMissing ? ttl.seconds : 0;

  const handleSetTtl = useCallback(async () => {
    const secs = parseInt(inputSeconds, 10);
    if (isNaN(secs) || secs <= 0) return;
    await setTtl(secs);
    setEditing(false);
    setInputSeconds('');
  }, [inputSeconds, setTtl]);

  const handlePersist = useCallback(async () => {
    await persistKey();
  }, [persistKey]);

  if (!ttl) return null;

  const isPersistent = ttl.isPersistent;
  const isMissing = ttl.isMissing;

  return (
    <div className="flex items-center gap-2">
      <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

      {isMissing ? (
        <Badge variant="outline" className="text-xs text-muted-foreground">
          Key missing
        </Badge>
      ) : isPersistent ? (
        <Badge variant="secondary" className="text-xs">
          No expiry
        </Badge>
      ) : (
        <TtlCountdown key={serverSeconds} seconds={serverSeconds} />
      )}

      {editing ? (
        <div className="flex items-center gap-1">
          <Input
            value={inputSeconds}
            onChange={(e) => setInputSeconds(e.target.value)}
            placeholder="seconds"
            className="h-6 w-20 text-xs"
            type="number"
            min={1}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSetTtl();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-xs px-2"
            onClick={() => void handleSetTtl()}
            disabled={loading}
          >
            Set
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs px-2"
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs px-2"
            onClick={() => setEditing(true)}
          >
            Set TTL
          </Button>
          {!isPersistent && !isMissing && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs px-2"
              onClick={() => void handlePersist()}
              disabled={loading}
              title="Remove TTL — make key persistent"
            >
              <InfinityIcon className="mr-1 h-3 w-3" />
              Persist
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
