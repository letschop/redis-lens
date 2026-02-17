// SPDX-License-Identifier: MIT
'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConnectionForm } from '@/components/modules/connection/connection-form';

export default function NewConnectionPage() {
  const router = useRouter();

  return (
    <main className="container max-w-3xl py-8 px-4 mx-auto">
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Connections
        </Button>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">New Connection</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure a connection to a Redis server
        </p>
      </div>

      <ConnectionForm onSaved={() => router.push('/')} onCancel={() => router.push('/')} />
    </main>
  );
}
