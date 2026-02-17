// SPDX-License-Identifier: MIT
'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBrowserStore } from '@/lib/stores/browser-store';

export function ScanProgress() {
  const { allKeys, scanComplete, loading, totalEstimate, loadMore } = useBrowserStore();

  const percentage =
    totalEstimate > 0 ? Math.min(100, Math.round((allKeys.length / totalEstimate) * 100)) : 0;

  if (allKeys.length === 0 && !loading) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-t text-xs text-muted-foreground">
      {loading && <Loader2 className="h-3 w-3 animate-spin" />}
      <span className="tabular-nums">
        {allKeys.length.toLocaleString()} keys loaded
        {totalEstimate > 0 && !scanComplete && (
          <> of ~{totalEstimate.toLocaleString()} ({percentage}%)</>
        )}
        {scanComplete && <> (complete)</>}
      </span>
      {!scanComplete && !loading && (
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={() => void loadMore()}
        >
          Load more
        </Button>
      )}
    </div>
  );
}
