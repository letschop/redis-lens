// SPDX-License-Identifier: MIT
'use client';

import { Database, Pencil, Plug, PlugZap, Trash2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { ConnectionProfile, ConnectionState } from '@/lib/api/types';

interface ConnectionCardProps {
  profile: ConnectionProfile;
  state?: ConnectionState;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}

function stateLabel(state?: ConnectionState): string {
  if (!state) return 'Disconnected';
  switch (state.status) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting...';
    case 'error':
      return 'Error';
    default:
      return 'Disconnected';
  }
}

function stateBadgeVariant(
  state?: ConnectionState,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (!state) return 'outline';
  switch (state.status) {
    case 'connected':
      return 'default';
    case 'connecting':
      return 'secondary';
    case 'error':
      return 'destructive';
    default:
      return 'outline';
  }
}

export function ConnectionCard({
  profile,
  state,
  onConnect,
  onDisconnect,
  onEdit,
  onDelete,
  onSelect,
}: ConnectionCardProps) {
  const isConnected = state?.status === 'connected';
  const isConnecting = state?.status === 'connecting';

  return (
    <Card
      className="cursor-pointer transition-colors hover:border-primary/50"
      onClick={() => {
        if (isConnected) {
          onSelect(profile.id);
        }
      }}
    >
      <CardContent className="flex items-center gap-4 p-4">
        {/* Icon */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Database className="h-5 w-5 text-muted-foreground" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{profile.name || 'Unnamed'}</span>
            <Badge variant={stateBadgeVariant(state)} className="text-xs">
              {stateLabel(state)}
            </Badge>
            {profile.tls.enabled && (
              <Badge variant="outline" className="text-xs">
                TLS
              </Badge>
            )}
            {profile.readonly && (
              <Badge variant="secondary" className="text-xs">
                Read-only
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">
            {profile.host}:{profile.port}
            {profile.database > 0 ? ` / db${profile.database}` : ''}
          </p>
          {state?.status === 'connected' && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Redis {state.serverInfo.redisVersion} &middot; {state.serverInfo.usedMemoryHuman}{' '}
              &middot; {state.serverInfo.dbSize} keys
            </p>
          )}
          {state?.status === 'error' && (
            <p className="text-xs text-destructive mt-0.5 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {state.message}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {isConnected ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDisconnect(profile.id)}
              title="Disconnect"
            >
              <PlugZap className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onConnect(profile.id)}
              disabled={isConnecting}
              title="Connect"
            >
              <Plug className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(profile.id)}
            disabled={isConnected || isConnecting}
            title="Edit"
          >
            <Pencil className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(profile.id)}
            disabled={isConnected || isConnecting}
            title="Delete"
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
