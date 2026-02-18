// SPDX-License-Identifier: MIT
'use client';

import { useCallback, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { useEditorStore } from '@/lib/stores/editor-store';

export function BitmapViewer() {
  const { value, loading, toggleBit } = useEditorStore();

  const info = value.type === 'bitmap' ? value.info : null;

  // Group flat bits array into rows of 8 (one byte each)
  const byteRows = useMemo(() => {
    if (!info) return [];
    const rows: number[][] = [];
    for (let i = 0; i < info.bits.length; i += 8) {
      rows.push(info.bits.slice(i, i + 8));
    }
    return rows;
  }, [info]);

  const handleToggle = useCallback(
    (byteIdx: number, bitIdx: number) => {
      if (!info || loading) return;
      const flatIndex = byteIdx * 8 + bitIdx;
      const absoluteOffset = info.offset * 8 + flatIndex;
      const currentBit = info.bits[flatIndex] ?? 0;
      void toggleBit(absoluteOffset, currentBit === 1 ? 0 : 1);
    },
    [info, loading, toggleBit],
  );

  if (!info) return null;

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <Badge variant="outline" className="text-xs font-mono">
          Bitmap
        </Badge>
        <Badge variant="secondary" className="text-xs font-mono tabular-nums">
          {info.bitCount} bits set
        </Badge>
        <Badge variant="secondary" className="text-xs font-mono tabular-nums">
          {info.byteLength} bytes
        </Badge>
      </div>

      {/* Bit grid */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="font-mono text-xs">
          {/* Column headers */}
          <div className="flex items-center gap-0 mb-1 sticky top-0 bg-background">
            <span className="w-16 text-muted-foreground text-right pr-2 shrink-0">Offset</span>
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} className="w-6 text-center text-muted-foreground shrink-0">
                {i}
              </span>
            ))}
          </div>

          {/* Rows — one per byte */}
          {byteRows.map((byteBits, byteIdx) => {
            const byteOffset = info.offset + byteIdx;
            return (
              <div key={byteOffset} className="flex items-center gap-0">
                <span className="w-16 text-muted-foreground text-right pr-2 shrink-0 tabular-nums">
                  {byteOffset * 8}
                </span>
                {byteBits.map((bit, bitIdx) => (
                  <button
                    key={bitIdx}
                    type="button"
                    onClick={() => handleToggle(byteIdx, bitIdx)}
                    disabled={loading}
                    className={`w-6 h-6 text-center rounded-sm transition-colors disabled:opacity-50 ${
                      bit === 1
                        ? 'bg-primary text-primary-foreground font-bold'
                        : 'bg-muted/30 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {bit}
                  </button>
                ))}
              </div>
            );
          })}

          {byteRows.length === 0 && (
            <div className="text-center text-muted-foreground py-4">Bitmap is empty</div>
          )}
        </div>
      </div>
    </div>
  );
}
