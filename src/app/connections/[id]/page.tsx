// SPDX-License-Identifier: MIT
'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useConnectionStore } from '@/lib/stores/connection-store';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ConnectionDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { profiles, states, loaded, loadProfiles, setActiveConnection } = useConnectionStore();

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

  const isConnected = state?.status === 'connected';

  return (
    <main className="container max-w-4xl py-8 px-4 mx-auto">
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Connections
        </Button>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Database className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{profile.name}</h1>
          <p className="text-sm text-muted-foreground">
            {profile.host}:{profile.port}
          </p>
        </div>
      </div>

      {isConnected && state.status === 'connected' ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Version</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{state.serverInfo.redisVersion}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Keys</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{state.serverInfo.dbSize.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Memory</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{state.serverInfo.usedMemoryHuman}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Clients</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{state.serverInfo.connectedClients}</p>
            </CardContent>
          </Card>
        </div>
      ) : (
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
      )}

      <p className="text-sm text-muted-foreground mt-8 text-center">
        Key browser and data editors will be added in Phase 3.
      </p>
    </main>
  );
}
