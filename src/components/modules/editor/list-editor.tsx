// SPDX-License-Identifier: MIT
'use client';

import { useState, useCallback } from 'react';
import { Plus, Trash2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useEditorStore } from '@/lib/stores/editor-store';

export function ListEditor() {
  const { value, loading, pushListElement, setListElement, removeListElement } = useEditorStore();

  const elements = value.type === 'list' ? value.elements : [];
  const totalLength = value.type === 'list' ? value.totalLength : 0;

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [addingValue, setAddingValue] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addToHead, setAddToHead] = useState(false);

  const handleStartEdit = useCallback((index: number, currentValue: string) => {
    setEditingIndex(index);
    setEditValue(currentValue);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (editingIndex === null) return;
    await setListElement(editingIndex, editValue);
    setEditingIndex(null);
  }, [editingIndex, editValue, setListElement]);

  const handleCancelEdit = useCallback(() => {
    setEditingIndex(null);
  }, []);

  const handlePush = useCallback(
    async (head: boolean) => {
      if (!addingValue.trim()) return;
      await pushListElement(addingValue, head);
      setAddingValue('');
      setShowAddForm(false);
    },
    [addingValue, pushListElement],
  );

  const handleRemove = useCallback(
    async (val: string) => {
      await removeListElement(1, val);
    },
    [removeListElement],
  );

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => {
            setShowAddForm(true);
            setAddToHead(true);
          }}
        >
          <Plus className="mr-1 h-3 w-3" />
          Head
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => {
            setShowAddForm(true);
            setAddToHead(false);
          }}
        >
          <Plus className="mr-1 h-3 w-3" />
          Tail
        </Button>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {totalLength} elements
        </span>
      </div>

      {showAddForm && (
        <div className="flex items-center gap-2 shrink-0">
          <Input
            value={addingValue}
            onChange={(e) => setAddingValue(e.target.value)}
            placeholder={`Push to ${addToHead ? 'head' : 'tail'}...`}
            className="h-7 text-xs font-mono flex-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handlePush(addToHead);
              if (e.key === 'Escape') setShowAddForm(false);
            }}
          />
          <button
            type="button"
            onClick={() => void handlePush(addToHead)}
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

      <div className="flex-1 min-h-0 overflow-auto border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-16">Index</TableHead>
              <TableHead className="text-xs">Value</TableHead>
              <TableHead className="text-xs w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {elements.map((el) => (
              <TableRow key={el.index}>
                <TableCell className="py-1 font-mono text-xs text-muted-foreground tabular-nums">
                  {el.index}
                </TableCell>
                <TableCell className="py-1 font-mono text-xs">
                  {editingIndex === el.index ? (
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="h-6 text-xs font-mono"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleSaveEdit();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                    />
                  ) : (
                    <span
                      className="cursor-pointer hover:bg-muted px-1 rounded break-all block"
                      onClick={() => handleStartEdit(el.index, el.value)}
                      title="Click to edit"
                    >
                      {el.value || <span className="text-muted-foreground italic">(empty)</span>}
                    </span>
                  )}
                </TableCell>
                <TableCell className="py-1">
                  <div className="flex gap-1">
                    {editingIndex === el.index ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleSaveEdit()}
                          disabled={loading}
                          className="text-green-600 hover:text-green-700 disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleRemove(el.value)}
                        disabled={loading}
                        className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                        title="Remove first occurrence"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {elements.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-4">
                  List is empty
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {totalLength > elements.length && (
        <p className="text-xs text-muted-foreground shrink-0">
          Showing {elements.length} of {totalLength} elements
        </p>
      )}
    </div>
  );
}
