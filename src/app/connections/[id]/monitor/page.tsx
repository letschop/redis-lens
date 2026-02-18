// SPDX-License-Identifier: MIT
'use client';

import { use, useEffect, useState } from 'react';
import { useMonitorStore } from '@/lib/stores/monitor-store';
import { MetricCard } from '@/components/modules/monitor/MetricCard';
import { OpsChart } from '@/components/modules/monitor/OpsChart';
import { MemoryChart } from '@/components/modules/monitor/MemoryChart';
import { ServerInfoPanel } from '@/components/modules/monitor/ServerInfoPanel';
import { SlowLogTable } from '@/components/modules/monitor/SlowLogTable';
import { ClientListTable } from '@/components/modules/monitor/ClientListTable';
import { MemoryAnalysisPanel } from '@/components/modules/monitor/MemoryAnalysisPanel';

type Tab = 'server' | 'slowlog' | 'clients' | 'memory';

export default function MonitorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: connectionId } = use(params);
  const {
    timeSeries,
    latestInfo,
    latestDerived,
    polling,
    startPolling,
    stopPolling,
    reset,
  } = useMonitorStore();

  const [activeTab, setActiveTab] = useState<Tab>('server');

  // Start polling on mount, stop on unmount
  useEffect(() => {
    startPolling(connectionId);
    return () => {
      stopPolling(connectionId);
    };
  }, [connectionId, startPolling, stopPolling]);

  // Reset store when leaving the page entirely
  useEffect(() => {
    return () => {
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional cleanup-only effect
  }, []);

  const totalKeys = latestInfo?.keyspace.reduce((sum, db) => sum + db.keys, 0) ?? 0;

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Monitor Dashboard</h2>
        <div className="flex items-center gap-2 text-sm">
          <span className={`h-2 w-2 rounded-full ${polling ? 'bg-green-500' : 'bg-gray-400'}`} />
          <span className="text-muted-foreground">{polling ? '2s polling' : 'Stopped'}</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          label="Memory"
          value={latestInfo?.memory.usedMemoryHuman ?? '-'}
          subtitle={latestInfo?.memory.maxmemoryHuman ? `/ ${latestInfo.memory.maxmemoryHuman}` : undefined}
          status={
            latestDerived?.memoryUsagePercent
              ? latestDerived.memoryUsagePercent > 90
                ? 'critical'
                : latestDerived.memoryUsagePercent > 70
                  ? 'warning'
                  : 'good'
              : undefined
          }
        />
        <MetricCard
          label="Ops/sec"
          value={latestInfo?.stats.instantaneousOpsPerSec.toLocaleString() ?? '-'}
        />
        <MetricCard
          label="Clients"
          value={String(latestInfo?.clients.connectedClients ?? '-')}
        />
        <MetricCard
          label="Hit Rate"
          value={latestDerived ? `${latestDerived.hitRatePercent.toFixed(1)}%` : '-'}
          status={
            latestDerived
              ? latestDerived.hitRatePercent > 90
                ? 'good'
                : latestDerived.hitRatePercent > 50
                  ? 'warning'
                  : 'critical'
              : undefined
          }
        />
        <MetricCard
          label="Uptime"
          value={latestInfo ? formatUptime(latestInfo.server.uptimeInSeconds) : '-'}
        />
        <MetricCard
          label="Keys"
          value={totalKeys.toLocaleString()}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <OpsChart data={timeSeries} />
        <MemoryChart data={timeSeries} />
      </div>

      {/* Tabbed Content */}
      <div className="flex-1 rounded-lg border bg-card">
        <div className="flex border-b">
          {(['server', 'slowlog', 'clients', 'memory'] as Tab[]).map((tab) => (
            <button
              key={tab}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === tab
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'server'
                ? 'Server Info'
                : tab === 'slowlog'
                  ? 'Slow Log'
                  : tab === 'clients'
                    ? 'Clients'
                    : 'Memory'}
            </button>
          ))}
        </div>
        <div className="p-4">
          {activeTab === 'server' && latestInfo && <ServerInfoPanel info={latestInfo} />}
          {activeTab === 'slowlog' && <SlowLogTable connectionId={connectionId} />}
          {activeTab === 'clients' && <ClientListTable connectionId={connectionId} />}
          {activeTab === 'memory' && <MemoryAnalysisPanel connectionId={connectionId} />}
          {activeTab === 'server' && !latestInfo && (
            <p className="py-8 text-center text-sm text-muted-foreground">Waiting for data...</p>
          )}
        </div>
      </div>
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
