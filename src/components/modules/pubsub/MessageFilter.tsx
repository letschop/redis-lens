// SPDX-License-Identifier: MIT
'use client';

import { usePubSubStore } from '@/lib/stores/pubsub-store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface MessageFilterProps {
  connectionId: string;
  filteredCount: number;
  totalCount: number;
}

export function MessageFilter({
  connectionId: _connectionId,
  filteredCount,
  totalCount,
}: MessageFilterProps) {
  const channelFilter = usePubSubStore((s) => s.channelFilter);
  const payloadFilter = usePubSubStore((s) => s.payloadFilter);
  const isPaused = usePubSubStore((s) => s.isPaused);
  const setChannelFilter = usePubSubStore((s) => s.setChannelFilter);
  const setPayloadFilter = usePubSubStore((s) => s.setPayloadFilter);
  const togglePause = usePubSubStore((s) => s.togglePause);
  const clearMessages = usePubSubStore((s) => s.clearMessages);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Channel Filter</label>
        <Input
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          placeholder="Filter by channel name..."
          className="h-8 text-xs"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Payload Filter</label>
        <Input
          value={payloadFilter}
          onChange={(e) => setPayloadFilter(e.target.value)}
          placeholder="Filter by payload content..."
          className="h-8 text-xs"
        />
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={isPaused ? 'default' : 'outline'}
          onClick={togglePause}
          className="flex-1"
        >
          {isPaused ? 'Resume' : 'Pause'}
        </Button>
        <Button size="sm" variant="outline" onClick={clearMessages} className="flex-1">
          Clear
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        {filteredCount === totalCount ? (
          <span>
            {totalCount} message{totalCount !== 1 ? 's' : ''}
          </span>
        ) : (
          <span>
            {filteredCount} of {totalCount} message{totalCount !== 1 ? 's' : ''}
          </span>
        )}
        {isPaused && (
          <span className="ml-2 font-medium text-yellow-600 dark:text-yellow-400">Paused</span>
        )}
      </div>
    </div>
  );
}
