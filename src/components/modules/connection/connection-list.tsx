// SPDX-License-Identifier: MIT
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConnectionStore } from '@/lib/stores/connection-store';
import { ConnectionCard } from './connection-card';

export function ConnectionList() {
  const router = useRouter();
  const {
    profiles,
    states,
    loaded,
    loadProfiles,
    connect,
    disconnect,
    removeProfile,
    setActiveConnection,
  } = useConnectionStore();

  useEffect(() => {
    if (!loaded) {
      void loadProfiles();
    }
  }, [loaded, loadProfiles]);

  const handleConnect = async (id: string) => {
    try {
      await connect(id);
    } catch {
      // Error shown in card state badge
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await disconnect(id);
    } catch {
      // Error shown in card
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await removeProfile(id);
    } catch {
      // Error handling TBD
    }
  };

  const handleSelect = (id: string) => {
    setActiveConnection(id);
    router.push(`/connections/${id}`);
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading connections...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Connections</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {profiles.length === 0
              ? 'No saved connections yet'
              : `${profiles.length} saved connection${profiles.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <Button onClick={() => router.push('/connections/new')}>
          <Plus className="mr-2 h-4 w-4" />
          New Connection
        </Button>
      </div>

      {/* Connection Cards */}
      {profiles.length > 0 ? (
        <div className="space-y-3">
          {profiles.map((profile) => (
            <ConnectionCard
              key={profile.id}
              profile={profile}
              state={states[profile.id]}
              onConnect={(id) => void handleConnect(id)}
              onDisconnect={(id) => void handleDisconnect(id)}
              onDelete={(id) => void handleDelete(id)}
              onSelect={handleSelect}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Database className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">No connections</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Create your first connection to start browsing Redis keys, editing values, and
            monitoring your server.
          </p>
          <Button className="mt-6" onClick={() => router.push('/connections/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Add Connection
          </Button>
        </div>
      )}
    </div>
  );
}
