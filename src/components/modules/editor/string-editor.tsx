// SPDX-License-Identifier: MIT
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Save, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEditorStore } from '@/lib/stores/editor-store';

type DisplayMode = 'text' | 'json';

function detectDisplayMode(value: string): DisplayMode {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON
    }
  }
  return 'text';
}

function formatJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export function StringEditor() {
  const { value, loading, saveStringValue, setDirty, dirty } = useEditorStore();

  const stringData = value.type === 'string' ? value.data : null;
  const rawText = stringData?.text ?? (stringData?.base64 ? atob(stringData.base64) : '');

  const [editText, setEditText] = useState(rawText);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('text');

  useEffect(() => {
    setEditText(rawText);
    setDisplayMode(detectDisplayMode(rawText));
  }, [rawText]);

  const handleChange = useCallback(
    (newText: string) => {
      setEditText(newText);
      setDirty(newText !== rawText);
    },
    [rawText, setDirty],
  );

  const handleSave = useCallback(async () => {
    await saveStringValue(editText);
  }, [editText, saveStringValue]);

  const handleDiscard = useCallback(() => {
    setEditText(rawText);
    setDirty(false);
  }, [rawText, setDirty]);

  const displayValue =
    displayMode === 'json' && !dirty ? formatJson(editText) : editText;

  if (!stringData) return null;

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center gap-2 shrink-0">
        <Tabs
          value={displayMode}
          onValueChange={(v) => setDisplayMode(v as DisplayMode)}
        >
          <TabsList className="h-7">
            <TabsTrigger value="text" className="text-xs px-2 h-6">
              Text
            </TabsTrigger>
            <TabsTrigger value="json" className="text-xs px-2 h-6">
              JSON
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {stringData.sizeBytes.toLocaleString()} bytes
          {stringData.isBinary && ' (binary)'}
        </span>
      </div>

      <Textarea
        value={displayValue}
        onChange={(e) => handleChange(e.target.value)}
        readOnly={stringData.isBinary}
        className="flex-1 font-mono text-xs resize-none min-h-0"
        placeholder="(empty string)"
      />

      {dirty && (
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" onClick={() => void handleSave()} disabled={loading}>
            <Save className="mr-1.5 h-3 w-3" />
            {loading ? 'Saving...' : 'Save'}
          </Button>
          <Button size="sm" variant="outline" onClick={handleDiscard}>
            <RotateCcw className="mr-1.5 h-3 w-3" />
            Discard
          </Button>
        </div>
      )}
    </div>
  );
}
