// SPDX-License-Identifier: MIT
'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useConsoleStore } from '@/lib/stores/console-store';
import { CommandInput } from './CommandInput';
import { CommandOutput } from './CommandOutput';

interface CliConsoleProps {
  connectionId: string;
}

export function CliConsole({ connectionId }: CliConsoleProps) {
  const histories = useConsoleStore((s) => s.histories);
  const clearHistory = useConsoleStore((s) => s.clearHistory);
  const execute = useConsoleStore((s) => s.execute);
  const scrollRef = useRef<HTMLDivElement>(null);

  const history = histories[connectionId] ?? [];

  // Auto-scroll to bottom when new results arrive
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [history.length]);

  const handleForceExecute = useCallback(
    (command: string) => {
      void execute(connectionId, command, true);
    },
    [connectionId, execute],
  );

  return (
    <div className="flex h-full flex-col rounded-lg border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h3 className="text-sm font-medium">CLI Console</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => clearHistory(connectionId)}
          disabled={history.length === 0}
        >
          Clear
        </Button>
      </div>

      {/* Scrollable output area */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-2">
        {history.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="font-mono text-sm text-muted-foreground">Type a Redis command...</p>
          </div>
        ) : (
          history.map((response, idx) => (
            <CommandOutput
              key={`${response.command}-${idx}`}
              response={response}
              onForceExecute={handleForceExecute}
            />
          ))
        )}
      </div>

      {/* Command input (fixed at bottom) */}
      <CommandInput connectionId={connectionId} />
    </div>
  );
}
