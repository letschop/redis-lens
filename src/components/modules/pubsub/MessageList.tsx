// SPDX-License-Identifier: MIT
'use client';

import { useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import type { PubSubMessage } from '@/lib/api/types';

interface MessageListProps {
  messages: PubSubMessage[];
}

function formatTimestamp(timestampMs: number): string {
  const date = new Date(timestampMs);
  const time = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${time}.${ms}`;
}

export function MessageList({ messages }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Track whether user is scrolled to bottom
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 40;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  };

  // Auto-scroll to bottom when new messages arrive (only if already at bottom)
  useEffect(() => {
    const el = scrollRef.current;
    if (el && isAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  // Reversed display: newest first
  const reversed = [...messages].reverse();

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">
          No messages yet. Subscribe to a channel to start receiving messages.
        </p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-auto">
      <div className="space-y-0.5 p-2">
        {reversed.map((msg, idx) => (
          <div
            key={`${msg.timestampMs}-${msg.channel}-${idx}`}
            className="flex items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50"
          >
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {formatTimestamp(msg.timestampMs)}
            </span>
            <Badge variant="outline" className="shrink-0 font-mono text-[11px]">
              {msg.channel}
            </Badge>
            {msg.pattern && (
              <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
                {msg.pattern}
              </Badge>
            )}
            <span className="min-w-0 break-all font-mono text-xs">{msg.payload}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
