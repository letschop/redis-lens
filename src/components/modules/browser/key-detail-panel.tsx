// SPDX-License-Identifier: MIT
'use client';

import { Trash2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useBrowserStore } from '@/lib/stores/browser-store';
import { EditorPanel } from '@/components/modules/editor/editor-panel';
import { formatTtl, keyTypeColor, keyTypeLabel } from '@/lib/utils/tree-helpers';

export function KeyDetailPanel() {
  const { selectedKey, selectedKeyInfo, deleteKeys } = useBrowserStore();

  if (!selectedKey) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Select a key to view details
      </div>
    );
  }

  const handleDelete = async () => {
    if (!selectedKey) return;
    await deleteKeys([selectedKey]);
  };

  const handleCopyKey = () => {
    void navigator.clipboard.writeText(selectedKey);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Key header — fixed */}
      <div className="shrink-0 p-4 space-y-4">
        {/* Key Name */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-medium text-muted-foreground">Key</h3>
            <button
              type="button"
              onClick={handleCopyKey}
              className="text-muted-foreground hover:text-foreground"
              title="Copy key name"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
          <p className="text-sm font-mono break-all">{selectedKey}</p>
        </div>

        <Separator />

        {/* Key Metadata */}
        {selectedKeyInfo ? (
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-xs font-medium text-muted-foreground">Type</CardTitle>
              </CardHeader>
              <CardContent className="pb-3 px-3">
                <Badge
                  variant="outline"
                  className={`text-xs font-mono ${keyTypeColor(selectedKeyInfo.keyType)}`}
                >
                  {keyTypeLabel(selectedKeyInfo.keyType)}
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-xs font-medium text-muted-foreground">TTL</CardTitle>
              </CardHeader>
              <CardContent className="pb-3 px-3">
                <span className="text-sm font-mono">
                  {selectedKeyInfo.ttl.type === 'persistent' && 'No expiry'}
                  {selectedKeyInfo.ttl.type === 'seconds' && formatTtl(selectedKeyInfo.ttl.value)}
                  {selectedKeyInfo.ttl.type === 'missing' && 'Key missing'}
                </span>
              </CardContent>
            </Card>

            {selectedKeyInfo.encoding && (
              <Card>
                <CardHeader className="pb-1 pt-3 px-3">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Encoding
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-3 px-3">
                  <span className="text-sm font-mono">{selectedKeyInfo.encoding}</span>
                </CardContent>
              </Card>
            )}

            {selectedKeyInfo.length !== undefined && selectedKeyInfo.length !== null && (
              <Card>
                <CardHeader className="pb-1 pt-3 px-3">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    {selectedKeyInfo.keyType === 'string' ? 'Size' : 'Elements'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-3 px-3">
                  <span className="text-sm font-mono tabular-nums">
                    {selectedKeyInfo.length.toLocaleString()}
                    {selectedKeyInfo.keyType === 'string' && ' bytes'}
                  </span>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center py-4">
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs text-destructive hover:text-destructive"
            onClick={() => void handleDelete()}
          >
            <Trash2 className="mr-1.5 h-3 w-3" />
            Delete
          </Button>
        </div>

        <Separator />
      </div>

      {/* Value editor — fills remaining space */}
      <div className="flex-1 min-h-0 px-4 pb-4 overflow-auto">
        <EditorPanel />
      </div>
    </div>
  );
}
