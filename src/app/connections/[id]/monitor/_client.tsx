// SPDX-License-Identifier: MIT
'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Database, HardDrive, Activity, Terminal, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConnectionStore } from '@/lib/stores/connection-store';
import { useMonitorStore } from '@/lib/stores/monitor-store';
import { MetricCard } from '@/components/modules/monitor/MetricCard';
import { OpsChart } from '@/components/modules/monitor/OpsChart';
import { MemoryChart } from '@/components/modules/monitor/MemoryChart';
import { ServerInfoPanel } from '@/components/modules/monitor/ServerInfoPanel';
import { SlowLogTable } from '@/components/modules/monitor/SlowLogTable';
import { ClientListTable } from '@/components/modules/monitor/ClientListTable';
import { MemoryAnalysisPanel } from '@/components/modules/monitor/MemoryAnalysisPanel';

type Tab = 'server' | 'slowlog' | 'clients' | 'memory';

export default function MonitorClient({ params }: { params: Promise<{ id: string }> }) {
  const { id: connectionId } = use(params);
  const { timeSeries, latestInfo, latestDerived, polling, startPolling, stopPolling, reset } =
    useMonitorStore();

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

  const router = useRouter();
  const { profiles } = useConnectionStore();
  const profile = profiles.find((p) => p.id === connectionId);
  const totalKeys = latestInfo?.keyspace.reduce((sum, db) => sum + db.keys, 0) ?? 0;

  return (
    <div className="flex h-screen flex-col">
      {/* Navigation header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => router.push('/')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground">
          <Database className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold truncate">{profile?.name ?? 'Connection'}</h1>
          <p className="text-xs text-muted-foreground">
            {profile ? `${profile.host}:${profile.port}` : connectionId}
          </p>
        </div>

        <nav className="flex items-center gap-1 ml-6">
          <Link
            href={`/connections/${connectionId}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <HardDrive className="h-3 w-3" />
            Keys
          </Link>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-accent-foreground">
            <Activity className="h-3 w-3" />
            Monitor
          </span>
          <Link
            href={`/connections/${connectionId}/cli`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Terminal className="h-3 w-3" />
            CLI
          </Link>
          <Link
            href={`/connections/${connectionId}/pubsub`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Radio className="h-3 w-3" />
            Pub/Sub
          </Link>
        </nav>

        <div className="flex items-center gap-2 text-sm ml-auto">
          <span className={`h-2 w-2 rounded-full ${polling ? 'bg-green-500' : 'bg-gray-400'}`} />
          <span className="text-muted-foreground">{polling ? '2s polling' : 'Stopped'}</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard
            label="Memory"
            value={latestInfo?.memory.usedMemoryHuman ?? '-'}
            subtitle={
              latestInfo?.memory.maxmemoryHuman
                ? `/ ${latestInfo.memory.maxmemoryHuman}`
                : undefined
            }
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
          <MetricCard label="Clients" value={String(latestInfo?.clients.connectedClients ?? '-')} />
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
          <MetricCard label="Keys" value={totalKeys.toLocaleString()} />
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
