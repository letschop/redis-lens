// SPDX-License-Identifier: MIT
'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
import { KeySearchBar } from '@/components/modules/browser/key-search-bar';
import { KeyTree } from '@/components/modules/browser/key-tree';
import { ScanProgress } from '@/components/modules/browser/scan-progress';
import { KeyDetailPanel } from '@/components/modules/browser/key-detail-panel';

interface Props {
  params: Promise<{ id: string }>;
}

export default function ConnectionDetailClient({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const { profiles, states, loaded, loadProfiles, setActiveConnection } = useConnectionStore();
  const { setConnectionId, loadRootKeys, connectionId } = useBrowserStore();

  useEffect(() => {
    if (!loaded) {
      void loadProfiles();
    }
  }, [loaded, loadProfiles]);

  useEffect(() => {
    setActiveConnection(id);
  }, [id, setActiveConnection]);

  const profile = profiles.find((p) => p.id === id);
  const state = states[id];
  const isConnected = state?.status === 'connected';

  // Initialize browser store when connected
  useEffect(() => {
    if (isConnected && connectionId !== id) {
      setConnectionId(id);
    }
  }, [isConnected, id, connectionId, setConnectionId]);

  // Load root keys once browser store is bound
  useEffect(() => {
    if (isConnected && connectionId === id) {
      void loadRootKeys();
    }
  }, [isConnected, connectionId, id, loadRootKeys]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>
    );
  }

  if (!profile) {
    return (
      <main className="container max-w-3xl py-8 px-4 mx-auto">
        <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="mt-8 text-center text-muted-foreground">Connection not found.</div>
      </main>
    );
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
          <p className="text-xs text-muted-foreground">
            {profile.host}:{profile.port}
          </p>
        </div>

        {/* Navigation tabs */}
        <nav className="flex items-center gap-1 ml-6">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-accent-foreground">
            <HardDrive className="h-3 w-3" />
            Keys
          </span>
          <Link
            href={`/connections/${id}/monitor`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Activity className="h-3 w-3" />
            Monitor
          </Link>
          <Link
            href={`/connections/${id}/cli`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Terminal className="h-3 w-3" />
            CLI
          </Link>
          <Link
            href={`/connections/${id}/pubsub`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Radio className="h-3 w-3" />
            Pub/Sub
          </Link>
        </nav>

        {/* Server info badges */}
        {serverInfo && (
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
      </div>

      {/* Key browser */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel: search + tree + progress */}
        <div className="flex flex-col w-80 border-r shrink-0">
          <KeySearchBar />
          <div className="flex-1 min-h-0">
            <KeyTree />
          </div>
          <ScanProgress />
        </div>

        {/* Right panel: key detail */}
        <div className="flex-1 min-w-0">
          <KeyDetailPanel />
        </div>
      </div>
    </div>
  );
}
