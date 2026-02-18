// SPDX-License-Identifier: MIT
'use client';

import { Button } from '@/components/ui/button';
import type { CommandResult, ExecuteResponse } from '@/lib/api/types';

interface CommandOutputProps {
  response: ExecuteResponse;
  onForceExecute?: (command: string) => void;
}

const DANGEROUS_PREFIX = 'DANGEROUS:';

function isDangerousWarning(result: CommandResult): boolean {
  return result.type === 'error' && result.data.startsWith(DANGEROUS_PREFIX);
}

function getDangerousMessage(result: CommandResult): string {
  if (result.type === 'error' && result.data.startsWith(DANGEROUS_PREFIX)) {
    return result.data
      .slice(DANGEROUS_PREFIX.length)
      .replace(/\s*—\s*Re-send.*$/, '')
      .trim();
  }
  return '';
}

function ResultValue({ result, indent = 0 }: { result: CommandResult; indent?: number }) {
  const padding = indent > 0 ? `${indent * 16}px` : undefined;

  switch (result.type) {
    case 'ok':
      return (
        <span style={{ paddingLeft: padding }} className="text-green-500">
          {result.data}
        </span>
      );
    case 'integer':
      return (
        <span style={{ paddingLeft: padding }} className="text-cyan-500">
          (integer) {result.data}
        </span>
      );
    case 'bulkString':
      return (
        <span style={{ paddingLeft: padding }} className="text-green-500">
          &quot;{result.data}&quot;
        </span>
      );
    case 'nil':
      return (
        <span style={{ paddingLeft: padding }} className="italic text-muted-foreground">
          (nil)
        </span>
      );
    case 'error':
      return (
        <span style={{ paddingLeft: padding }} className="font-bold text-red-500">
          (error) {result.data}
        </span>
      );
    case 'array':
      return (
        <div style={{ paddingLeft: padding }}>
          {result.data.length === 0 ? (
            <span className="italic text-muted-foreground">(empty array)</span>
          ) : (
            result.data.map((item, idx) => (
              <div key={idx} className="flex gap-1">
                <span className="shrink-0 text-muted-foreground">{idx + 1})</span>
                <ResultValue result={item} indent={0} />
              </div>
            ))
          )}
        </div>
      );
    default:
      return null;
  }
}

export function CommandOutput({ response, onForceExecute }: CommandOutputProps) {
  const dangerousWarning = isDangerousWarning(response.result);
  const warningMessage = dangerousWarning ? getDangerousMessage(response.result) : '';

  return (
    <div className="border-b border-border/40 py-2 font-mono text-sm last:border-b-0">
      {/* Command prompt */}
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 text-muted-foreground">&gt;</span>
        <span className="text-foreground">{response.command}</span>
      </div>

      {/* Result */}
      <div className="mt-1 pl-4">
        {dangerousWarning ? (
          <div className="my-1 flex flex-col gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-yellow-500">Warning</span>
              <span className="text-sm text-yellow-400">{warningMessage}</span>
            </div>
            {onForceExecute && (
              <Button
                variant="destructive"
                size="sm"
                className="w-fit"
                onClick={() => onForceExecute(response.command)}
              >
                Run Anyway
              </Button>
            )}
          </div>
        ) : (
          <ResultValue result={response.result} />
        )}
      </div>

      {/* Duration */}
      {!dangerousWarning && response.durationMs > 0 && (
        <div className="mt-0.5 pl-4 text-xs text-muted-foreground">
          {response.durationMs.toFixed(2)}ms
        </div>
      )}
    </div>
  );
}
