// SPDX-License-Identifier: MIT
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Database,
  Server,
  HardDrive,
  Users,
  MemoryStick,
  Terminal,
  Radio,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useConnectionStore } from '@/lib/stores/connection-store';
import { useBrowserStore } from '@/lib/stores/browser-store';
import { useMonitorStore } from '@/lib/stores/monitor-store';
import { KeySearchBar } from '@/components/modules/browser/key-search-bar';
import { KeyTree } from '@/components/modules/browser/key-tree';
import { ScanProgress } from '@/components/modules/browser/scan-progress';
import { KeyDetailPanel } from '@/components/modules/browser/key-detail-panel';
import { CliConsole } from '@/components/modules/cli/CliConsole';
import { PubSubViewer } from '@/components/modules/pubsub/PubSubViewer';
import { MetricCard } from '@/components/modules/monitor/MetricCard';
import { OpsChart } from '@/components/modules/monitor/OpsChart';
import { MemoryChart } from '@/components/modules/monitor/MemoryChart';
import { ServerInfoPanel } from '@/components/modules/monitor/ServerInfoPanel';
import { SlowLogTable } from '@/components/modules/monitor/SlowLogTable';
import { ClientListTable } from '@/components/modules/monitor/ClientListTable';
import { MemoryAnalysisPanel } from '@/components/modules/monitor/MemoryAnalysisPanel';
import { maskHost } from '@/lib/utils';

type WorkspaceTab = 'keys' | 'monitor' | 'cli' | 'pubsub';
type MonitorSubTab = 'server' | 'slowlog' | 'clients' | 'memory';

const VALID_TABS = new Set<string>(['keys', 'monitor', 'cli', 'pubsub']);

function WorkspaceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(
    initialTab && VALID_TABS.has(initialTab) ? (initialTab as WorkspaceTab) : 'keys',
  );
  const { profiles, states, loaded, loadProfiles, activeConnectionId } = useConnectionStore();
  const { setConnectionId, loadRootKeys, connectionId: browserConnectionId } = useBrowserStore();
  const { timeSeries, latestInfo, latestDerived, polling, startPolling, stopPolling, reset } =
    useMonitorStore();
  const [monitorSubTab, setMonitorSubTab] = useState<MonitorSubTab>('server');

  // Load profiles on mount
  useEffect(() => {
    if (!loaded) {
      void loadProfiles();
    }
  }, [loaded, loadProfiles]);

  const connectionId = activeConnectionId;
  const profile = connectionId ? profiles.find((p) => p.id === connectionId) : null;
  const state = connectionId ? states[connectionId] : undefined;
  const isConnected = state?.status === 'connected';

  // Initialize browser store when connected
  useEffect(() => {
    if (isConnected && connectionId && browserConnectionId !== connectionId) {
      setConnectionId(connectionId);
    }
  }, [isConnected, connectionId, browserConnectionId, setConnectionId]);

  // Load root keys once browser store is bound
  useEffect(() => {
    if (isConnected && connectionId && browserConnectionId === connectionId) {
      void loadRootKeys();
    }
  }, [isConnected, browserConnectionId, connectionId, loadRootKeys]);

  // Start/stop monitor polling when monitor tab is active
  useEffect(() => {
    if (activeTab === 'monitor' && isConnected && connectionId) {
      startPolling(connectionId);
      return () => {
        stopPolling(connectionId);
      };
    }
  }, [activeTab, isConnected, connectionId, startPolling, stopPolling]);

  // Reset monitor store when leaving monitor tab
  useEffect(() => {
    if (activeTab !== 'monitor') {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when tab changes away from monitor
  }, [activeTab]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>
    );
  }

  if (!connectionId || !profile) {
    router.push('/');
    return null;
  }

  if (!isConnected) {
    return (
      <main className="container max-w-4xl py-8 px-4 mx-auto">
        <div className="mb-6">
          <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Connections
          </Button>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {state?.status === 'error' ? (
                <span className="text-destructive">Connection error: {state.message}</span>
              ) : (
                'Not connected. Click Connect on the connection card to connect.'
              )}
            </p>
            <Badge variant="outline" className="mt-2">
              {state?.status ?? 'disconnected'}
            </Badge>
          </CardContent>
        </Card>
      </main>
    );
  }

  const serverInfo = state.status === 'connected' ? state.serverInfo : null;
  const totalKeys = latestInfo?.keyspace.reduce((sum, db) => sum + db.keys, 0) ?? 0;

  const tabClass = (tab: WorkspaceTab) =>
    tab === activeTab
      ? 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-accent-foreground'
      : 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer';

  return (
    <div className="flex flex-col h-screen">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => router.push('/')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground">
          <Database className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold truncate">{profile.name}</h1>
          <p className="text-xs text-muted-foreground">{maskHost(profile.host)}</p>
        </div>

        {/* Navigation tabs */}
        <nav className="flex items-center gap-1 ml-6">
          <button className={tabClass('keys')} onClick={() => setActiveTab('keys')}>
            <HardDrive className="h-3 w-3" />
            Keys
          </button>
          <button className={tabClass('monitor')} onClick={() => setActiveTab('monitor')}>
            <Activity className="h-3 w-3" />
            Monitor
          </button>
          <button className={tabClass('cli')} onClick={() => setActiveTab('cli')}>
            <Terminal className="h-3 w-3" />
            CLI
          </button>
          <button className={tabClass('pubsub')} onClick={() => setActiveTab('pubsub')}>
            <Radio className="h-3 w-3" />
            Pub/Sub
          </button>
        </nav>

        {/* Server info badges */}
        {serverInfo && activeTab === 'keys' && (
          <div className="flex items-center gap-3 ml-auto text-xs text-muted-foreground">
            <span className="flex items-center gap-1" title="Redis version">
              <Server className="h-3 w-3" />
              {serverInfo.redisVersion}
            </span>
            <span className="flex items-center gap-1 tabular-nums" title="Total keys">
              <HardDrive className="h-3 w-3" />
              {serverInfo.dbSize.toLocaleString()}
            </span>
            <span className="flex items-center gap-1" title="Memory usage">
              <MemoryStick className="h-3 w-3" />
              {serverInfo.usedMemoryHuman}
            </span>
            <span className="flex items-center gap-1 tabular-nums" title="Connected clients">
              <Users className="h-3 w-3" />
              {serverInfo.connectedClients}
            </span>
          </div>
        )}

        {/* Monitor polling indicator */}
        {activeTab === 'monitor' && (
          <div className="flex items-center gap-2 text-sm ml-auto">
            <span className={`h-2 w-2 rounded-full ${polling ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span className="text-muted-foreground">{polling ? '2s polling' : 'Stopped'}</span>
          </div>
        )}
      </div>

      {/* Tab content */}
      {activeTab === 'keys' && (
        <div className="flex flex-1 min-h-0">
          <div className="flex flex-col w-80 border-r shrink-0">
            <KeySearchBar />
            <div className="flex-1 min-h-0">
              <KeyTree />
            </div>
            <ScanProgress />
          </div>
          <div className="flex-1 min-w-0">
            <KeyDetailPanel />
          </div>
        </div>
      )}

      {activeTab === 'monitor' && (
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
              {(['server', 'slowlog', 'clients', 'memory'] as MonitorSubTab[]).map((tab) => (
                <button
                  key={tab}
                  className={`px-4 py-2 text-sm font-medium ${
                    monitorSubTab === tab
                      ? 'border-b-2 border-primary text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setMonitorSubTab(tab)}
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
              {monitorSubTab === 'server' && latestInfo && <ServerInfoPanel info={latestInfo} />}
              {monitorSubTab === 'slowlog' && <SlowLogTable connectionId={connectionId} />}
              {monitorSubTab === 'clients' && <ClientListTable connectionId={connectionId} />}
              {monitorSubTab === 'memory' && <MemoryAnalysisPanel connectionId={connectionId} />}
              {monitorSubTab === 'server' && !latestInfo && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Waiting for data...
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'cli' && (
        <div className="flex-1 min-h-0 p-4">
          <CliConsole connectionId={connectionId} />
        </div>
      )}

      {activeTab === 'pubsub' && (
        <div className="flex-1 min-h-0 overflow-hidden p-4">
          <PubSubViewer connectionId={connectionId} />
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

export default function WorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Loading...
        </div>
      }
    >
      <WorkspaceContent />
    </Suspense>
  );
}
