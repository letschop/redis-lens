// SPDX-License-Identifier: MIT
'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConnectionForm } from '@/components/modules/connection/connection-form';
import { useConnectionStore } from '@/lib/stores/connection-store';

export default function EditConnectionClient() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { profiles, loaded, loadProfiles } = useConnectionStore();

  useEffect(() => {
    if (!loaded) {
      void loadProfiles();
    }
  }, [loaded, loadProfiles]);

  const profile = profiles.find((p) => p.id === params.id);

  if (!loaded) {
    return (
      <main className="container max-w-3xl py-8 px-4 mx-auto">
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Loading...
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="container max-w-3xl py-8 px-4 mx-auto">
        <div className="mb-6">
          <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Connections
          </Button>
        </div>
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Connection not found
        </div>
      </main>
    );
  }

  return (
    <main className="container max-w-3xl py-8 px-4 mx-auto">
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Connections
        </Button>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Edit Connection</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Modify the settings for &ldquo;{profile.name || 'Unnamed'}&rdquo;
        </p>
      </div>

      <ConnectionForm
        initialProfile={profile}
        onSaved={() => router.push('/')}
        onCancel={() => router.push('/')}
      />
    </main>
  );
}
