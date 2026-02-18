// SPDX-License-Identifier: MIT
'use client';

import { useEffect, useState } from 'react';
import { useMonitorStore } from '@/lib/stores/monitor-store';
import { Button } from '@/components/ui/button';

interface ClientListTableProps {
  connectionId: string;
}

export function ClientListTable({ connectionId }: ClientListTableProps) {
  const { clientList, loadingClientList, fetchClientList, killClient } = useMonitorStore();
  const [killingId, setKillingId] = useState<number | null>(null);

  useEffect(() => {
    fetchClientList(connectionId);
  }, [connectionId, fetchClientList]);

  const handleKill = async (clientId: number) => {
    setKillingId(clientId);
    await killClient(connectionId, clientId);
    setKillingId(null);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-medium">Connected Clients ({clientList.length})</h4>
        <Button size="sm" variant="outline" onClick={() => fetchClientList(connectionId)}>
          {loadingClientList ? 'Loading...' : 'Refresh'}
        </Button>
      </div>
      {clientList.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {loadingClientList ? 'Loading...' : 'No clients'}
        </p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1 pr-2">ID</th>
                <th className="py-1 pr-2">Address</th>
                <th className="py-1 pr-2">Age</th>
                <th className="py-1 pr-2">Idle</th>
                <th className="py-1 pr-2">DB</th>
                <th className="py-1 pr-2">Cmd</th>
                <th className="py-1 pr-2">Name</th>
                <th className="py-1 pr-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clientList.map((client) => (
                <tr key={client.id} className="border-b last:border-b-0">
                  <td className="py-1 pr-2 font-mono text-xs">{client.id}</td>
                  <td className="py-1 pr-2 font-mono text-xs">{client.addr}</td>
                  <td className="py-1 pr-2 text-xs">{client.age}s</td>
                  <td className="py-1 pr-2 text-xs">{client.idle}s</td>
                  <td className="py-1 pr-2 font-mono text-xs">{client.db}</td>
                  <td className="py-1 pr-2 font-mono text-xs">{client.cmd}</td>
                  <td className="py-1 pr-2 text-xs">{client.name || '-'}</td>
                  <td className="py-1 pr-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-6 px-2 text-xs"
                      onClick={() => handleKill(client.id)}
                      disabled={killingId === client.id}
                    >
                      {killingId === client.id ? '...' : 'Kill'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
