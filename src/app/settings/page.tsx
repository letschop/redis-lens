// SPDX-License-Identifier: MIT
'use client';

import { useTheme } from 'next-themes';
import Link from 'next/link';
import { ArrowLeft, RotateCcw, Sun, Moon, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSettingsStore } from '@/lib/stores/settings-store';

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const {
    keyDelimiter,
    defaultScanCount,
    maxCliHistory,
    monitorInterval,
    pubsubBufferSize,
    confirmDangerousCommands,
    updateSetting,
    resetDefaults,
  } = useSettingsStore();

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0">
        <Link href="/">
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-sm font-semibold">Settings</h1>
        <div className="ml-auto">
          <Button variant="ghost" size="sm" onClick={resetDefaults}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Reset Defaults
          </Button>
        </div>
      </div>

      {/* Settings content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-lg space-y-8">
          {/* Appearance */}
          <section>
            <h2 className="text-sm font-semibold mb-4">Appearance</h2>
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">Theme</Label>
              <div className="flex gap-2">
                {(
                  [
                    { value: 'light', icon: Sun, label: 'Light' },
                    { value: 'dark', icon: Moon, label: 'Dark' },
                    { value: 'system', icon: Monitor, label: 'System' },
                  ] as const
                ).map(({ value, icon: Icon, label }) => (
                  <Button
                    key={value}
                    variant={theme === value ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={() => setTheme(value)}
                  >
                    <Icon className="h-3.5 w-3.5 mr-1.5" />
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </section>

          {/* Key Browser */}
          <section>
            <h2 className="text-sm font-semibold mb-4">Key Browser</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="delimiter" className="text-xs text-muted-foreground">
                    Key Delimiter
                  </Label>
                  <Input
                    id="delimiter"
                    value={keyDelimiter}
                    onChange={(e) => updateSetting('keyDelimiter', e.target.value || ':')}
                    className="h-8 text-sm font-mono"
                    maxLength={5}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="scanCount" className="text-xs text-muted-foreground">
                    SCAN Count Hint
                  </Label>
                  <Input
                    id="scanCount"
                    type="number"
                    value={defaultScanCount}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (v > 0 && v <= 10000) updateSetting('defaultScanCount', v);
                    }}
                    className="h-8 text-sm"
                    min={10}
                    max={10000}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* CLI Console */}
          <section>
            <h2 className="text-sm font-semibold mb-4">CLI Console</h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="cliHistory" className="text-xs text-muted-foreground">
                  Max Command History (per connection)
                </Label>
                <Input
                  id="cliHistory"
                  type="number"
                  value={maxCliHistory}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (v > 0 && v <= 10000) updateSetting('maxCliHistory', v);
                  }}
                  className="h-8 text-sm"
                  min={50}
                  max={10000}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Confirm Dangerous Commands
                  </Label>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">
                    FLUSHALL, FLUSHDB, SHUTDOWN, etc.
                  </p>
                </div>
                <Button
                  variant={confirmDangerousCommands ? 'default' : 'outline'}
                  size="sm"
                  onClick={() =>
                    updateSetting('confirmDangerousCommands', !confirmDangerousCommands)
                  }
                >
                  {confirmDangerousCommands ? 'On' : 'Off'}
                </Button>
              </div>
            </div>
          </section>

          {/* Monitoring */}
          <section>
            <h2 className="text-sm font-semibold mb-4">Monitoring</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="pollInterval" className="text-xs text-muted-foreground">
                  Poll Interval (seconds)
                </Label>
                <Input
                  id="pollInterval"
                  type="number"
                  value={monitorInterval}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (v >= 1 && v <= 60) updateSetting('monitorInterval', v);
                  }}
                  className="h-8 text-sm"
                  min={1}
                  max={60}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pubsubBuffer" className="text-xs text-muted-foreground">
                  Pub/Sub Buffer Size
                </Label>
                <Input
                  id="pubsubBuffer"
                  type="number"
                  value={pubsubBufferSize}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (v >= 100 && v <= 100000) updateSetting('pubsubBufferSize', v);
                  }}
                  className="h-8 text-sm"
                  min={100}
                  max={100000}
                />
              </div>
            </div>
          </section>

          {/* About */}
          <section>
            <h2 className="text-sm font-semibold mb-4">About</h2>
            <div className="rounded-md border p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Version</span>
                <span className="font-mono">0.1.0</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">License</span>
                <span>MIT</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Runtime</span>
                <span>Tauri 2.x + Next.js 15</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
