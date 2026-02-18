// SPDX-License-Identifier: MIT
'use client';

import { useState, useCallback } from 'react';
import { Plus, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useEditorStore } from '@/lib/stores/editor-store';

export function HllViewer() {
  const { value, loading, addHllElements } = useEditorStore();

  const info = value.type === 'hll' ? value.info : null;

  const [showAddForm, setShowAddForm] = useState(false);
  const [newElement, setNewElement] = useState('');

  const handleAdd = useCallback(async () => {
    const trimmed = newElement.trim();
    if (!trimmed) return;
    // Support comma-separated multiple elements
    const elements = trimmed
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    if (elements.length === 0) return;
    await addHllElements(elements);
    setNewElement('');
    setShowAddForm(false);
  }, [newElement, addHllElements]);

  if (!info) return null;

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant="outline" className="text-xs font-mono">
          HyperLogLog
        </Badge>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => setShowAddForm(true)}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add Elements
        </Button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="flex items-center gap-2 shrink-0">
          <Input
            value={newElement}
            onChange={(e) => setNewElement(e.target.value)}
            placeholder="element1, element2, ..."
            className="h-7 text-xs font-mono flex-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAdd();
              if (e.key === 'Escape') setShowAddForm(false);
            }}
          />
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={loading}
            className="text-green-600 hover:text-green-700 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowAddForm(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="border rounded-md p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Estimated Cardinality</span>
          <span className="font-mono text-sm font-medium tabular-nums">
            {info.cardinality.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Encoding</span>
          <Badge variant="secondary" className="text-xs font-mono">
            {info.encoding}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Memory Usage</span>
          <span className="font-mono text-xs tabular-nums">{formatBytes(info.sizeBytes)}</span>
        </div>
      </div>

      {/* Info */}
      <div className="text-xs text-muted-foreground px-1">
        HyperLogLog is a probabilistic data structure. The cardinality shown is an approximation
        with a standard error of 0.81%. Individual elements cannot be retrieved or listed.
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
