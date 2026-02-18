// SPDX-License-Identifier: MIT
'use client';

import { useState, useCallback } from 'react';
import { usePubSubStore } from '@/lib/stores/pubsub-store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface PublishFormProps {
  connectionId: string;
}

export function PublishForm({ connectionId }: PublishFormProps) {
  const [channel, setChannel] = useState('');
  const [message, setMessage] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [lastResult, setLastResult] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const publish = usePubSubStore((s) => s.publish);

  const handlePublish = useCallback(async () => {
    if (!channel.trim() || !message.trim()) return;

    setPublishing(true);
    setLastResult(null);
    setError(null);

    const result = await publish(connectionId, channel.trim(), message);
    setPublishing(false);

    if (result !== null) {
      setLastResult(result);
      setMessage('');
    } else {
      setError('Failed to publish message');
    }
  }, [connectionId, channel, message, publish]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void handlePublish();
      }
    },
    [handlePublish],
  );

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Channel</label>
        <Input
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          placeholder="notifications"
          disabled={publishing}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Message</label>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message payload..."
          rows={3}
          disabled={publishing}
          className="resize-none font-mono text-xs"
        />
        <p className="text-[10px] text-muted-foreground">Ctrl+Enter to publish</p>
      </div>

      <Button
        size="sm"
        onClick={() => void handlePublish()}
        disabled={publishing || !channel.trim() || !message.trim()}
      >
        {publishing ? 'Publishing...' : 'Publish'}
      </Button>

      {lastResult !== null && (
        <p className="text-xs text-muted-foreground">
          Delivered to {lastResult} subscriber{lastResult !== 1 ? 's' : ''}
        </p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
