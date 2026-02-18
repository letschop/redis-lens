// SPDX-License-Identifier: MIT
'use client';

import { useState, useCallback } from 'react';
import { Plus, Trash2, Check, X, ArrowUpDown } from 'lucide-react';
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

type SortField = 'member' | 'score';
type SortDir = 'asc' | 'desc';

export function ZSetEditor() {
  const { value, loading, addZsetMember, removeZsetMembers, incrZsetScore } = useEditorStore();

  const members = value.type === 'zset' ? value.members : [];
  const totalCount = value.type === 'zset' ? value.totalCount : 0;

  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMember, setNewMember] = useState('');
  const [newScore, setNewScore] = useState('0');

  const toggleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir('asc');
      return field;
    });
  }, []);

  const sorted = [...members].sort((a, b) => {
    const cmp = sortField === 'score' ? a.score - b.score : a.member.localeCompare(b.member);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const filtered = searchQuery
    ? sorted.filter((m) => m.member.toLowerCase().includes(searchQuery.toLowerCase()))
    : sorted;

  const handleAdd = useCallback(async () => {
    if (!newMember.trim()) return;
    const score = parseFloat(newScore);
    if (isNaN(score)) return;
    await addZsetMember(newMember.trim(), score);
    setNewMember('');
    setNewScore('0');
    setShowAddForm(false);
  }, [newMember, newScore, addZsetMember]);

  const handleRemove = useCallback(
    async (member: string) => {
      await removeZsetMembers([member]);
    },
    [removeZsetMembers],
  );

  const handleIncr = useCallback(
    async (member: string, delta: number) => {
      await incrZsetScore(member, delta);
    },
    [incrZsetScore],
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
          {totalCount} members
        </span>
      </div>

      {showAddForm && (
        <div className="flex items-center gap-2 shrink-0">
          <Input
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
            placeholder="Member..."
            className="h-7 text-xs font-mono flex-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAdd();
              if (e.key === 'Escape') setShowAddForm(false);
            }}
          />
          <Input
            value={newScore}
            onChange={(e) => setNewScore(e.target.value)}
            placeholder="Score"
            className="h-7 text-xs font-mono w-24"
            type="number"
            step="any"
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
              <TableHead
                className="text-xs cursor-pointer select-none"
                onClick={() => toggleSort('member')}
              >
                <span className="flex items-center gap-1">
                  Member
                  {sortField === 'member' && <ArrowUpDown className="h-3 w-3" />}
                </span>
              </TableHead>
              <TableHead
                className="text-xs w-32 cursor-pointer select-none"
                onClick={() => toggleSort('score')}
              >
                <span className="flex items-center gap-1">
                  Score
                  {sortField === 'score' && <ArrowUpDown className="h-3 w-3" />}
                </span>
              </TableHead>
              <TableHead className="text-xs w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((m) => (
              <TableRow key={m.member}>
                <TableCell className="py-1 font-mono text-xs break-all">{m.member}</TableCell>
                <TableCell className="py-1 font-mono text-xs tabular-nums">
                  <button
                    type="button"
                    onClick={() => void handleIncr(m.member, -1)}
                    disabled={loading}
                    className="px-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    -
                  </button>
                  <span className="px-1">{m.score}</span>
                  <button
                    type="button"
                    onClick={() => void handleIncr(m.member, 1)}
                    disabled={loading}
                    className="px-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    +
                  </button>
                </TableCell>
                <TableCell className="py-1">
                  <button
                    type="button"
                    onClick={() => void handleRemove(m.member)}
                    disabled={loading}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-4">
                  {searchQuery ? 'No matching members' : 'Sorted set is empty'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
