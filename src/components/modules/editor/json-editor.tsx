// SPDX-License-Identifier: MIT
'use client';

import { useState, useCallback, useRef } from 'react';
import { Save, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useEditorStore } from '@/lib/stores/editor-store';

function prettyPrint(json: string): string {
  try {
    const parsed = JSON.parse(json) as unknown;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return json;
  }
}

export function JsonEditor() {
  const { value, loading, dirty, saveJsonValue, setDirty } = useEditorStore();

  const jsonData = value.type === 'json' ? value.data : null;

  // Track last-seen jsonData to reset local text when store value changes
  const lastJsonRef = useRef<string | null>(null);
  const currentJson = jsonData?.json ?? null;

  // Reset local state when the store provides a new value
  if (currentJson !== lastJsonRef.current) {
    lastJsonRef.current = currentJson;
  }

  const [text, setText] = useState(() => (currentJson ? prettyPrint(currentJson) : ''));
  const [parseError, setParseError] = useState<string | null>(null);

  // Sync text when external value changes (e.g., after save/reload)
  const prevJsonRef = useRef(currentJson);
  if (currentJson !== prevJsonRef.current) {
    prevJsonRef.current = currentJson;
    // This is a render-time state sync, not inside an effect
    const newText = currentJson ? prettyPrint(currentJson) : '';
    if (newText !== text) {
      setText(newText);
      setParseError(null);
    }
  }

  const handleChange = useCallback(
    (newText: string) => {
      setText(newText);
      setDirty(true);
      // Validate JSON
      try {
        JSON.parse(newText);
        setParseError(null);
      } catch (e) {
        setParseError(e instanceof Error ? e.message : 'Invalid JSON');
      }
    },
    [setDirty],
  );

  const handleSave = useCallback(async () => {
    if (parseError) return;
    try {
      // Minify before saving
      const parsed = JSON.parse(text) as unknown;
      const minified = JSON.stringify(parsed);
      await saveJsonValue(minified);
    } catch {
      // If parse fails, save as-is
      await saveJsonValue(text);
    }
  }, [text, parseError, saveJsonValue]);

  const handleReset = useCallback(() => {
    if (!currentJson) return;
    setText(prettyPrint(currentJson));
    setDirty(false);
    setParseError(null);
  }, [currentJson, setDirty]);

  if (!jsonData) return null;

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant={jsonData.isModule ? 'default' : 'secondary'} className="text-xs">
          {jsonData.isModule ? 'RedisJSON' : 'String (JSON)'}
        </Badge>
        {parseError && (
          <span className="text-xs text-destructive truncate flex-1">{parseError}</span>
        )}
        <div className="flex-1" />
        {dirty && (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={handleReset}
              disabled={loading}
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              Reset
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => void handleSave()}
              disabled={loading || !!parseError}
            >
              <Save className="mr-1 h-3 w-3" />
              Save
            </Button>
          </>
        )}
      </div>

      <Textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        className="flex-1 min-h-0 font-mono text-xs resize-none"
        spellCheck={false}
      />
    </div>
  );
}
