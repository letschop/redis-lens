// SPDX-License-Identifier: MIT
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Command } from 'cmdk';
import {
  HardDrive,
  Plus,
  Settings,
  Sun,
  Moon,
  Monitor,
  Terminal,
  Activity,
  Radio,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useConnectionStore } from '@/lib/stores/connection-store';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { setTheme } = useTheme();
  const profiles = useConnectionStore((s) => s.profiles);
  const states = useConnectionStore((s) => s.states);

  // Ctrl+K / Cmd+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const runAction = useCallback((fn: () => void) => {
    fn();
    setOpen(false);
  }, []);

  const connectedProfiles = profiles.filter((p) => states[p.id]?.status === 'connected');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 shadow-lg max-w-md">
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2 [&_[cmdk-input]]:h-10">
          <Command.Input
            placeholder="Type a command or search..."
            className="flex h-10 w-full rounded-md border-0 bg-transparent py-3 px-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Command.List className="max-h-[300px] overflow-y-auto p-1">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            {/* Navigation */}
            <Command.Group heading="Navigation">
              <Command.Item
                onSelect={() => runAction(() => router.push('/'))}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer aria-selected:bg-accent"
              >
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                Connections
              </Command.Item>
              <Command.Item
                onSelect={() => runAction(() => router.push('/connections/new'))}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer aria-selected:bg-accent"
              >
                <Plus className="h-4 w-4 text-muted-foreground" />
                New Connection
              </Command.Item>
              <Command.Item
                onSelect={() => runAction(() => router.push('/settings'))}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer aria-selected:bg-accent"
              >
                <Settings className="h-4 w-4 text-muted-foreground" />
                Settings
              </Command.Item>
            </Command.Group>

            {/* Active connections */}
            {connectedProfiles.length > 0 && (
              <Command.Group heading="Active Connections">
                {connectedProfiles.map((p) => (
                  <Command.Group key={p.id} heading={p.name}>
                    <Command.Item
                      onSelect={() => runAction(() => router.push(`/connections/${p.id}`))}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer aria-selected:bg-accent"
                    >
                      <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                      {p.name} &mdash; Keys
                    </Command.Item>
                    <Command.Item
                      onSelect={() => runAction(() => router.push(`/connections/${p.id}/monitor`))}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer aria-selected:bg-accent"
                    >
                      <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                      {p.name} &mdash; Monitor
                    </Command.Item>
                    <Command.Item
                      onSelect={() => runAction(() => router.push(`/connections/${p.id}/cli`))}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer aria-selected:bg-accent"
                    >
                      <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
                      {p.name} &mdash; CLI
                    </Command.Item>
                    <Command.Item
                      onSelect={() => runAction(() => router.push(`/connections/${p.id}/pubsub`))}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer aria-selected:bg-accent"
                    >
                      <Radio className="h-3.5 w-3.5 text-muted-foreground" />
                      {p.name} &mdash; Pub/Sub
                    </Command.Item>
                  </Command.Group>
                ))}
              </Command.Group>
            )}

            {/* Theme */}
            <Command.Group heading="Theme">
              <Command.Item
                onSelect={() => runAction(() => setTheme('light'))}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer aria-selected:bg-accent"
              >
                <Sun className="h-4 w-4 text-muted-foreground" />
                Light Theme
              </Command.Item>
              <Command.Item
                onSelect={() => runAction(() => setTheme('dark'))}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer aria-selected:bg-accent"
              >
                <Moon className="h-4 w-4 text-muted-foreground" />
                Dark Theme
              </Command.Item>
              <Command.Item
                onSelect={() => runAction(() => setTheme('system'))}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer aria-selected:bg-accent"
              >
                <Monitor className="h-4 w-4 text-muted-foreground" />
                System Theme
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
