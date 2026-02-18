// SPDX-License-Identifier: MIT
'use client';

import { useState, useCallback } from 'react';
import { usePubSubStore } from '@/lib/stores/pubsub-store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface SubscriptionFormProps {
  connectionId: string;
}

export function SubscriptionForm({ connectionId }: SubscriptionFormProps) {
  const [channelInput, setChannelInput] = useState('');

  const subscriptions = usePubSubStore((s) => s.subscriptions);
  const isSubscribing = usePubSubStore((s) => s.isSubscribing);
  const error = usePubSubStore((s) => s.error);
  const subscribe = usePubSubStore((s) => s.subscribe);
  const psubscribe = usePubSubStore((s) => s.psubscribe);
  const unsubscribe = usePubSubStore((s) => s.unsubscribe);

  const parseChannels = useCallback((): string[] => {
    return channelInput
      .split(',')
      .map((ch) => ch.trim())
      .filter((ch) => ch.length > 0);
  }, [channelInput]);

  const handleSubscribe = useCallback(async () => {
    const channels = parseChannels();
    if (channels.length === 0) return;

    const id = await subscribe(connectionId, channels);
    if (id) {
      setChannelInput('');
    }
  }, [connectionId, parseChannels, subscribe]);

  const handlePsubscribe = useCallback(async () => {
    const patterns = parseChannels();
    if (patterns.length === 0) return;

    const id = await psubscribe(connectionId, patterns);
    if (id) {
      setChannelInput('');
    }
  }, [connectionId, parseChannels, psubscribe]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSubscribe();
      }
    },
    [handleSubscribe],
  );

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Channels (comma-separated)
        </label>
        <Input
          value={channelInput}
          onChange={(e) => setChannelInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="notifications, user:*, order:events"
          disabled={isSubscribing}
        />
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => void handleSubscribe()}
          disabled={isSubscribing || parseChannels().length === 0}
        >
          {isSubscribing ? 'Subscribing...' : 'Subscribe'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void handlePsubscribe()}
          disabled={isSubscribing || parseChannels().length === 0}
        >
          {isSubscribing ? 'Subscribing...' : 'PSubscribe'}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {subscriptions.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Active Subscriptions</label>
          <div className="flex flex-wrap gap-1.5">
            {subscriptions.map((sub) => {
              const labels =
                sub.channels.length > 0 ? sub.channels : sub.patterns.map((p) => `p:${p}`);
              return labels.map((label) => (
                <Badge key={`${sub.id}-${label}`} variant="secondary" className="gap-1 pr-1">
                  <span className="font-mono text-[11px]">{label}</span>
                  <button
                    className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                    onClick={() => void unsubscribe(sub.id)}
                    aria-label={`Unsubscribe from ${label}`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </Badge>
              ));
            })}
          </div>
        </div>
      )}
    </div>
  );
}
