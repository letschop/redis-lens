// SPDX-License-Identifier: MIT
'use client';

import { useEffect } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useEditorStore } from '@/lib/stores/editor-store';
import { useBrowserStore } from '@/lib/stores/browser-store';
import { StringEditor } from './string-editor';
import { HashEditor } from './hash-editor';
import { ListEditor } from './list-editor';
import { SetEditor } from './set-editor';
import { ZSetEditor } from './zset-editor';
import { StreamEditor } from './stream-editor';
import { JsonEditor } from './json-editor';
import { HllViewer } from './hll-viewer';
import { BitmapViewer } from './bitmap-viewer';
import { GeoViewer } from './geo-viewer';
import { TtlEditor } from './ttl-editor';

export function EditorPanel() {
  const { selectedKey, selectedKeyInfo, connectionId } = useBrowserStore();
  const { loadKey, reset, value, loading, error, keyType } = useEditorStore();

  // Load editor value when key selection changes
  useEffect(() => {
    if (selectedKey && selectedKeyInfo && connectionId) {
      const supported = [
        'string', 'hash', 'list', 'set', 'zset', 'stream',
        'ReJSON-RL', 'rejson-rl',
      ];
      if (supported.includes(selectedKeyInfo.keyType)) {
        void loadKey(
          connectionId,
          selectedKey,
          selectedKeyInfo.keyType,
          selectedKeyInfo.length ?? undefined,
        );
      } else {
        reset();
      }
    } else {
      reset();
    }
  }, [selectedKey, selectedKeyInfo, connectionId, loadKey, reset]);

  // No key selected
  if (!selectedKey || !selectedKeyInfo) {
    return null;
  }

  // Unsupported type
  const supported = [
    'string', 'hash', 'list', 'set', 'zset', 'stream',
    'ReJSON-RL', 'rejson-rl',
  ];
  if (!supported.includes(selectedKeyInfo.keyType)) {
    return (
      <div className="px-1 py-2 text-xs text-muted-foreground">
        Editor for &quot;{selectedKeyInfo.keyType}&quot; type is not yet supported.
      </div>
    );
  }

  // Loading
  if (loading && value.type === 'none') {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="ml-2 text-xs text-muted-foreground">Loading value...</span>
      </div>
    );
  }

  // Error
  if (error && value.type === 'none') {
    return (
      <div className="flex items-center gap-2 px-1 py-2 text-xs text-destructive">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span className="break-all">{error}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* TTL editor */}
      <div className="shrink-0">
        <TtlEditor />
      </div>

      {/* Type-specific editor */}
      <div className="flex-1 min-h-0">
        {keyType === 'string' && <StringEditor />}
        {keyType === 'hash' && <HashEditor />}
        {keyType === 'list' && <ListEditor />}
        {keyType === 'set' && <SetEditor />}
        {keyType === 'zset' && <ZSetEditor />}
        {keyType === 'stream' && <StreamEditor />}
        {(keyType === 'ReJSON-RL' || keyType === 'rejson-rl') && <JsonEditor />}
        {value.type === 'hll' && <HllViewer />}
        {value.type === 'bitmap' && <BitmapViewer />}
        {value.type === 'geo' && <GeoViewer />}
        {value.type === 'json' && keyType === 'string' && <JsonEditor />}
      </div>

      {/* Error toast */}
      {error && value.type !== 'none' && (
        <div className="flex items-center gap-2 px-2 py-1.5 bg-destructive/10 text-destructive text-xs rounded shrink-0">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      )}
    </div>
  );
}
