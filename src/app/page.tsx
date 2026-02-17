// SPDX-License-Identifier: MIT

'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface HealthStatus {
  status: string;
  version: string;
  bridge: 'connected' | 'disconnected' | 'checking';
}

export default function HomePage() {
  const [health, setHealth] = useState<HealthStatus>({
    status: 'unknown',
    version: '',
    bridge: 'checking',
  });

  useEffect(() => {
    async function checkHealth() {
      try {
        const { healthCheck } = await import('@/lib/api/commands');
        const result = await healthCheck();
        setHealth({
          status: result.status,
          version: result.version,
          bridge: 'connected',
        });
      } catch {
        // Expected when running outside Tauri (e.g., in browser dev mode)
        setHealth((prev) => ({ ...prev, bridge: 'disconnected' }));
      }
    }

    checkHealth();
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground text-2xl font-bold">
            R
          </div>
          <h1 className="text-4xl font-bold tracking-tight">RedisLens</h1>
        </div>
        <p className="text-muted-foreground text-lg">
          The Definitive Open-Source Redis GUI
        </p>
      </div>

      <div className="flex flex-col items-center gap-2 rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'h-2.5 w-2.5 rounded-full',
              health.bridge === 'connected' && 'bg-green-500',
              health.bridge === 'disconnected' && 'bg-yellow-500',
              health.bridge === 'checking' && 'bg-muted-foreground animate-pulse',
            )}
          />
          <span className="text-sm font-medium">
            IPC Bridge:{' '}
            {health.bridge === 'connected'
              ? `Connected (v${health.version})`
              : health.bridge === 'checking'
                ? 'Checking...'
                : 'Not available (running in browser)'}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {health.bridge === 'connected'
            ? 'Tauri backend is running. Ready to connect to Redis.'
            : 'Run via `cargo tauri dev` to enable the Rust backend.'}
        </p>
      </div>

      <p className="text-sm text-muted-foreground max-w-md text-center">
        Phase 1 Foundation complete. Connection management UI coming in Phase 2.
      </p>
    </main>
  );
}
