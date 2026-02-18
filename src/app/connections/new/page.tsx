// SPDX-License-Identifier: MIT
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConnectionForm } from '@/components/modules/connection/connection-form';
import { useConnectionStore } from '@/lib/stores/connection-store';

export default function NewConnectionPage() {
  const router = useRouter();
  const { profiles, loaded, loadProfiles, editingProfileId, setEditingProfileId } =
    useConnectionStore();

  useEffect(() => {
    if (!loaded) {
      void loadProfiles();
    }
  }, [loaded, loadProfiles]);

  const editProfile = editingProfileId ? profiles.find((p) => p.id === editingProfileId) : null;
  const isEditing = !!editProfile;

  const handleDone = () => {
    setEditingProfileId(null);
    router.push('/');
  };

  return (
    <main className="container max-w-3xl py-8 px-4 mx-auto">
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={handleDone}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Connections
        </Button>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isEditing ? 'Edit Connection' : 'New Connection'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isEditing
            ? `Modify the settings for \u201c${editProfile.name || 'Unnamed'}\u201d`
            : 'Configure a connection to a Redis server'}
        </p>
      </div>

      <ConnectionForm
        initialProfile={editProfile ?? undefined}
        onSaved={handleDone}
        onCancel={handleDone}
      />
    </main>
  );
}
