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

export function HashEditor() {
  const { value, loading, saveHashField, deleteHashFields } = useEditorStore();

  const fields = value.type === 'hash' ? value.fields : [];

  const [searchQuery, setSearchQuery] = useState('');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [addingField, setAddingField] = useState(false);
  const [newField, setNewField] = useState('');
  const [newValue, setNewValue] = useState('');

  const filteredFields = searchQuery
    ? fields.filter(
        (f) =>
          f.field.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.value.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : fields;

  const handleStartEdit = useCallback((field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (editingField === null) return;
    await saveHashField(editingField, editValue);
    setEditingField(null);
  }, [editingField, editValue, saveHashField]);

  const handleCancelEdit = useCallback(() => {
    setEditingField(null);
  }, []);

  const handleDelete = useCallback(
    async (field: string) => {
      await deleteHashFields([field]);
    },
    [deleteHashFields],
  );

  const handleAddField = useCallback(async () => {
    if (!newField.trim()) return;
    await saveHashField(newField.trim(), newValue);
    setNewField('');
    setNewValue('');
    setAddingField(false);
  }, [newField, newValue, saveHashField]);

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center gap-2 shrink-0">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search fields..."
          className="h-7 text-xs flex-1"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => setAddingField(true)}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {fields.length} fields
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-1/3">Field</TableHead>
              <TableHead className="text-xs">Value</TableHead>
              <TableHead className="text-xs w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {addingField && (
              <TableRow>
                <TableCell className="py-1">
                  <Input
                    value={newField}
                    onChange={(e) => setNewField(e.target.value)}
                    placeholder="Field name"
                    className="h-6 text-xs font-mono"
                    autoFocus
                  />
                </TableCell>
                <TableCell className="py-1">
                  <Input
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder="Value"
                    className="h-6 text-xs font-mono"
                  />
                </TableCell>
                <TableCell className="py-1">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => void handleAddField()}
                      disabled={loading}
                      className="text-green-600 hover:text-green-700 disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingField(false)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {filteredFields.map((f) => (
              <TableRow key={f.field}>
                <TableCell className="py-1 font-mono text-xs break-all">
                  {f.field}
                </TableCell>
                <TableCell className="py-1 font-mono text-xs">
                  {editingField === f.field ? (
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
                      onClick={() => handleStartEdit(f.field, f.value)}
                      title="Click to edit"
                    >
                      {f.value || <span className="text-muted-foreground italic">(empty)</span>}
                    </span>
                  )}
                </TableCell>
                <TableCell className="py-1">
                  <div className="flex gap-1">
                    {editingField === f.field ? (
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
                        onClick={() => void handleDelete(f.field)}
                        disabled={loading}
                        className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filteredFields.length === 0 && !addingField && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-4">
                  {searchQuery ? 'No matching fields' : 'No fields'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
