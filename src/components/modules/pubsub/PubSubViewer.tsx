// SPDX-License-Identifier: MIT
'use client';

import { useEffect, useMemo } from 'react';
import { usePubSubStore } from '@/lib/stores/pubsub-store';
import { SubscriptionForm } from '@/components/modules/pubsub/SubscriptionForm';
import { PublishForm } from '@/components/modules/pubsub/PublishForm';
import { MessageList } from '@/components/modules/pubsub/MessageList';
import { MessageFilter } from '@/components/modules/pubsub/MessageFilter';

interface PubSubViewerProps {
  connectionId: string;
}

export function PubSubViewer({ connectionId }: PubSubViewerProps) {
  const messages = usePubSubStore((s) => s.messages);
  const channelFilter = usePubSubStore((s) => s.channelFilter);
  const payloadFilter = usePubSubStore((s) => s.payloadFilter);
  const subscriptions = usePubSubStore((s) => s.subscriptions);
  const startListening = usePubSubStore((s) => s.startListening);
  const stopListening = usePubSubStore((s) => s.stopListening);
  const unsubscribeAll = usePubSubStore((s) => s.unsubscribeAll);
  const clearMessages = usePubSubStore((s) => s.clearMessages);

  // Start Tauri event listener on mount, clean up on unmount
  useEffect(() => {
    void startListening();
    return () => {
      stopListening();
    };
  }, [startListening, stopListening]);

  // Unsubscribe all and clear messages when leaving
  useEffect(() => {
    return () => {
      void unsubscribeAll();
      clearMessages();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional cleanup-only effect
  }, []);

  // Apply client-side filters
  const filteredMessages = useMemo(() => {
    let filtered = messages;

    if (channelFilter) {
      const lower = channelFilter.toLowerCase();
      filtered = filtered.filter((m) => m.channel.toLowerCase().includes(lower));
    }

    if (payloadFilter) {
      const lower = payloadFilter.toLowerCase();
      filtered = filtered.filter((m) => m.payload.toLowerCase().includes(lower));
    }

    return filtered;
  }, [messages, channelFilter, payloadFilter]);

  const hasSubscriptions = subscriptions.length > 0;

  return (
    <div className="flex h-full gap-4">
      {/* Left sidebar: subscription + publish forms + filters */}
      <div className="flex w-72 shrink-0 flex-col gap-4 overflow-auto border-r pr-4">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Subscribe</h3>
          <SubscriptionForm connectionId={connectionId} />
        </div>

        <div className="border-t pt-3">
          <h3 className="mb-2 text-sm font-semibold">Publish</h3>
          <PublishForm connectionId={connectionId} />
        </div>

        <div className="border-t pt-3">
          <h3 className="mb-2 text-sm font-semibold">Filters</h3>
          <MessageFilter
            connectionId={connectionId}
            filteredCount={filteredMessages.length}
            totalCount={messages.length}
          />
        </div>
      </div>

      {/* Right: message feed */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Messages</h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={`h-2 w-2 rounded-full ${hasSubscriptions ? 'bg-green-500' : 'bg-gray-400'}`}
            />
            <span>{hasSubscriptions ? 'Listening' : 'No subscriptions'}</span>
          </div>
        </div>
        <div className="flex-1 overflow-hidden rounded-lg border bg-card">
          <MessageList messages={filteredMessages} />
        </div>
      </div>
    </div>
  );
}
