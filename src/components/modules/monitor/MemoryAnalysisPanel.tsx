// SPDX-License-Identifier: MIT
'use client';

import { useEffect } from 'react';
import { useMonitorStore } from '@/lib/stores/monitor-store';
import { Button } from '@/components/ui/button';

interface MemoryAnalysisPanelProps {
  connectionId: string;
}

export function MemoryAnalysisPanel({ connectionId }: MemoryAnalysisPanelProps) {
  const { memoryStats, loadingMemory, fetchMemoryStats } = useMonitorStore();

  useEffect(() => {
    fetchMemoryStats(connectionId);
  }, [connectionId, fetchMemoryStats]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-medium">Memory Analysis</h4>
        <Button size="sm" variant="outline" onClick={() => fetchMemoryStats(connectionId)}>
          {loadingMemory ? 'Loading...' : 'Refresh'}
        </Button>
      </div>
      {!memoryStats ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {loadingMemory ? 'Loading...' : 'No memory data'}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/50 p-3">
            <h5 className="mb-1 text-xs font-medium">MEMORY DOCTOR</h5>
            <p className="whitespace-pre-wrap font-mono text-xs">{memoryStats.doctorAdvice}</p>
          </div>
          <div>
            <h5 className="mb-2 text-xs font-medium">MEMORY STATS</h5>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(memoryStats.stats).map(([key, value]) => (
                    <tr key={key} className="border-b last:border-b-0">
                      <td className="py-1 pr-4 font-mono text-xs text-muted-foreground">{key}</td>
                      <td className="py-1 font-mono text-xs">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
