// SPDX-License-Identifier: MIT
'use client';

import { useEffect } from 'react';
import { useMonitorStore } from '@/lib/stores/monitor-store';
import { Button } from '@/components/ui/button';

interface SlowLogTableProps {
  connectionId: string;
}

export function SlowLogTable({ connectionId }: SlowLogTableProps) {
  const { slowLog, loadingSlowLog, fetchSlowLog } = useMonitorStore();

  useEffect(() => {
    fetchSlowLog(connectionId);
  }, [connectionId, fetchSlowLog]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-medium">Slow Log</h4>
        <Button size="sm" variant="outline" onClick={() => fetchSlowLog(connectionId)}>
          {loadingSlowLog ? 'Loading...' : 'Refresh'}
        </Button>
      </div>
      {slowLog.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {loadingSlowLog ? 'Loading...' : 'No slow log entries'}
        </p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1 pr-2">ID</th>
                <th className="py-1 pr-2">Time</th>
                <th className="py-1 pr-2">Duration</th>
                <th className="py-1 pr-2">Command</th>
                <th className="py-1 pr-2">Client</th>
              </tr>
            </thead>
            <tbody>
              {slowLog.map((entry) => (
                <tr key={entry.id} className="border-b last:border-b-0">
                  <td className="py-1 pr-2 font-mono text-xs">{entry.id}</td>
                  <td className="py-1 pr-2 text-xs">
                    {new Date(entry.timestamp * 1000).toLocaleString()}
                  </td>
                  <td className="py-1 pr-2 font-mono text-xs">
                    {(entry.durationUs / 1000).toFixed(1)}ms
                  </td>
                  <td className="max-w-[300px] truncate py-1 pr-2 font-mono text-xs">
                    {entry.command}
                  </td>
                  <td className="py-1 pr-2 text-xs">{entry.clientAddr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
