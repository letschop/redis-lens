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

export function SetEditor() {
  const { value, loading, addSetMembers, removeSetMembers } = useEditorStore();

  const members = value.type === 'set' ? value.members : [];

  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMember, setNewMember] = useState('');

  const filteredMembers = searchQuery
    ? members.filter((m) => m.toLowerCase().includes(searchQuery.toLowerCase()))
    : members;

  const handleAdd = useCallback(async () => {
    if (!newMember.trim()) return;
    await addSetMembers([newMember.trim()]);
    setNewMember('');
    setShowAddForm(false);
  }, [newMember, addSetMembers]);

  const handleRemove = useCallback(
    async (member: string) => {
      await removeSetMembers([member]);
    },
    [removeSetMembers],
  );

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center gap-2 shrink-0">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search members..."
          className="h-7 text-xs flex-1"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => setShowAddForm(true)}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {members.length} members
        </span>
      </div>

      {showAddForm && (
        <div className="flex items-center gap-2 shrink-0">
          <Input
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
            placeholder="New member value..."
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

      <div className="flex-1 min-h-0 overflow-auto border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Member</TableHead>
              <TableHead className="text-xs w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMembers.map((member) => (
              <TableRow key={member}>
                <TableCell className="py-1 font-mono text-xs break-all">{member}</TableCell>
                <TableCell className="py-1">
                  <button
                    type="button"
                    onClick={() => void handleRemove(member)}
                    disabled={loading}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
            {filteredMembers.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-xs text-muted-foreground py-4">
                  {searchQuery ? 'No matching members' : 'Set is empty'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
