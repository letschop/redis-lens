// SPDX-License-Identifier: MIT
'use client';

import { useState, useCallback } from 'react';
import { Plus, Trash2, Check, X, ChevronDown, ChevronRight, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useEditorStore } from '@/lib/stores/editor-store';

export function StreamEditor() {
  const { value, loading, addStreamEntry, deleteStreamEntries } = useEditorStore();

  const entries = value.type === 'stream' ? value.entries : [];
  const totalLength = value.type === 'stream' ? value.totalLength : 0;
  const info = value.type === 'stream' ? value.info : null;

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFields, setNewFields] = useState<[string, string][]>([['', '']]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleAdd = useCallback(async () => {
    const validFields = newFields.filter(([k, v]) => k.trim() && v.trim()) as [string, string][];
    if (validFields.length === 0) return;
    await addStreamEntry('*', validFields);
    setNewFields([['', '']]);
    setShowAddForm(false);
  }, [newFields, addStreamEntry]);

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteStreamEntries([id]);
    },
    [deleteStreamEntries],
  );

  const updateField = useCallback((index: number, col: 0 | 1, value: string) => {
    setNewFields((prev) => {
      const next = [...prev];
      const pair = [...next[index]!] as [string, string];
      pair[col] = value;
      next[index] = pair;
      return next;
    });
  }, []);

  const addFieldRow = useCallback(() => {
    setNewFields((prev) => [...prev, ['', '']]);
  }, []);

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant="outline" className="text-xs font-mono tabular-nums">
          {totalLength} entries
        </Badge>
        {info && info.groups.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            <Users className="mr-1 h-3 w-3" />
            {info.groups.length} groups
          </Badge>
        )}
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => setShowAddForm(true)}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add Entry
        </Button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="border rounded-md p-2 flex flex-col gap-2 shrink-0">
          <div className="text-xs text-muted-foreground font-medium">New Entry (ID: auto)</div>
          {newFields.map(([k, v], i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={k}
                onChange={(e) => updateField(i, 0, e.target.value)}
                placeholder="Field..."
                className="h-7 text-xs font-mono flex-1"
                autoFocus={i === 0}
              />
              <Input
                value={v}
                onChange={(e) => updateField(i, 1, e.target.value)}
                placeholder="Value..."
                className="h-7 text-xs font-mono flex-1"
              />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={addFieldRow}>
              + Field
            </Button>
            <div className="flex-1" />
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
        </div>
      )}

      {/* Consumer Groups */}
      {info && info.groups.length > 0 && (
        <div className="border rounded-md p-2 text-xs shrink-0">
          <div className="font-medium text-muted-foreground mb-1">Consumer Groups</div>
          {info.groups.map((g) => (
            <div key={g.name} className="flex items-center gap-3 py-0.5">
              <span className="font-mono">{g.name}</span>
              <span className="text-muted-foreground">{g.consumers} consumers</span>
              <span className="text-muted-foreground">{g.pending} pending</span>
            </div>
          ))}
        </div>
      )}

      {/* Entries timeline */}
      <div className="flex-1 min-h-0 overflow-auto space-y-1">
        {entries.map((entry) => {
          const expanded = expandedIds.has(entry.id);
          return (
            <div key={entry.id} className="border rounded-md">
              <div
                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-muted/50"
                onClick={() => toggleExpand(entry.id)}
              >
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
                  {entry.id}
                </span>
                <span className="text-xs text-muted-foreground">{entry.fields.length} fields</span>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete(entry.id);
                  }}
                  disabled={loading}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {expanded && (
                <div className="border-t px-2 py-1 bg-muted/30">
                  {entry.fields.map(([k, v], i) => (
                    <div key={i} className="flex gap-2 py-0.5 text-xs">
                      <span className="font-mono font-medium text-muted-foreground min-w-[80px]">
                        {k}
                      </span>
                      <span className="font-mono break-all">{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {entries.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-4">Stream is empty</div>
        )}
      </div>
    </div>
  );
}
