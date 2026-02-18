// SPDX-License-Identifier: MIT
'use client';

import type { ServerInfo } from '@/lib/api/types';

interface ServerInfoPanelProps {
  info: ServerInfo;
}

export function ServerInfoPanel({ info }: ServerInfoPanelProps) {
  const rows = [
    ['Redis Version', info.server.redisVersion],
    ['Mode', info.server.redisMode],
    ['OS', info.server.os],
    ['Port', String(info.server.tcpPort)],
    ['Uptime', formatUptime(info.server.uptimeInSeconds)],
    ['Connected Clients', String(info.clients.connectedClients)],
    ['Blocked Clients', String(info.clients.blockedClients)],
    ['Memory Used', info.memory.usedMemoryHuman],
    ['Memory Peak', info.memory.usedMemoryPeakHuman],
    ['Max Memory', info.memory.maxmemoryHuman || 'No limit'],
    ['Fragmentation Ratio', info.memory.memFragmentationRatio.toFixed(2)],
    ['Role', info.replication.role],
    ['Connected Slaves', String(info.replication.connectedSlaves)],
    ['Total Commands', info.stats.totalCommandsProcessed.toLocaleString()],
    ['Expired Keys', info.stats.expiredKeys.toLocaleString()],
    ['Evicted Keys', info.stats.evictedKeys.toLocaleString()],
  ];

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-b last:border-b-0">
              <td className="py-2 pr-4 font-medium text-muted-foreground">{label}</td>
              <td className="py-2 font-mono">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {info.keyspace.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-sm font-medium">Keyspace</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1">DB</th>
                <th className="py-1">Keys</th>
                <th className="py-1">Expires</th>
                <th className="py-1">Avg TTL</th>
              </tr>
            </thead>
            <tbody>
              {info.keyspace.map((db) => (
                <tr key={db.index} className="border-b last:border-b-0">
                  <td className="py-1 font-mono">db{db.index}</td>
                  <td className="py-1 font-mono">{db.keys.toLocaleString()}</td>
                  <td className="py-1 font-mono">{db.expires.toLocaleString()}</td>
                  <td className="py-1 font-mono">{db.avgTtl}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
