// SPDX-License-Identifier: MIT
'use client';

import { useState, useCallback } from 'react';
import { Plus, Trash2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useEditorStore } from '@/lib/stores/editor-store';

export function GeoViewer() {
  const { value, loading, addGeoMember, removeGeoMembers } = useEditorStore();

  const members = value.type === 'geo' ? value.members : [];

  const [showAddForm, setShowAddForm] = useState(false);
  const [newMember, setNewMember] = useState('');
  const [newLon, setNewLon] = useState('');
  const [newLat, setNewLat] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const handleAdd = useCallback(async () => {
    if (!newMember.trim()) return;
    const lon = parseFloat(newLon);
    const lat = parseFloat(newLat);
    if (isNaN(lon) || isNaN(lat)) return;
    if (lon < -180 || lon > 180 || lat < -85.05 || lat > 85.05) return;
    await addGeoMember(lon, lat, newMember.trim());
    setNewMember('');
    setNewLon('');
    setNewLat('');
    setShowAddForm(false);
  }, [newMember, newLon, newLat, addGeoMember]);

  const handleRemove = useCallback(
    async (member: string) => {
      await removeGeoMembers([member]);
    },
    [removeGeoMembers],
  );

  const filtered = searchQuery
    ? members.filter((m) => m.member.toLowerCase().includes(searchQuery.toLowerCase()))
    : members;

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
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
        <Badge variant="outline" className="text-xs font-mono tabular-nums">
          {members.length} members
        </Badge>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="flex items-center gap-2 shrink-0">
          <Input
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
            placeholder="Member..."
            className="h-7 text-xs font-mono flex-1"
            autoFocus
          />
          <Input
            value={newLon}
            onChange={(e) => setNewLon(e.target.value)}
            placeholder="Longitude"
            className="h-7 text-xs font-mono w-28"
            type="number"
            step="any"
          />
          <Input
            value={newLat}
            onChange={(e) => setNewLat(e.target.value)}
            placeholder="Latitude"
            className="h-7 text-xs font-mono w-28"
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

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Member</TableHead>
              <TableHead className="text-xs w-32">Longitude</TableHead>
              <TableHead className="text-xs w-32">Latitude</TableHead>
              <TableHead className="text-xs w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((m) => (
              <TableRow key={m.member}>
                <TableCell className="py-1 font-mono text-xs break-all">{m.member}</TableCell>
                <TableCell className="py-1 font-mono text-xs tabular-nums">
                  {m.longitude.toFixed(6)}
                </TableCell>
                <TableCell className="py-1 font-mono text-xs tabular-nums">
                  {m.latitude.toFixed(6)}
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
                <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-4">
                  {searchQuery ? 'No matching members' : 'No geospatial members'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
