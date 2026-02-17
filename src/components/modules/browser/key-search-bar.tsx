// SPDX-License-Identifier: MIT
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Search, X, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useBrowserStore } from '@/lib/stores/browser-store';

export function KeySearchBar() {
  const { pattern, setPattern, refresh, loading } = useBrowserStore();
  const [localValue, setLocalValue] = useState(pattern);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local value when pattern changes externally
  useEffect(() => {
    setLocalValue(pattern);
  }, [pattern]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setLocalValue(value);

      // Debounce pattern changes by 300ms
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        setPattern(value || '*');
      }, 300);
    },
    [setPattern],
  );

  const handleClear = useCallback(() => {
    setLocalValue('*');
    setPattern('*');
  }, [setPattern]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }
        setPattern(localValue || '*');
      }
      if (e.key === 'Escape') {
        handleClear();
      }
    },
    [localValue, setPattern, handleClear],
  );

  return (
    <div className="flex items-center gap-2 p-2 border-b">
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={localValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Filter keys (glob pattern)..."
          className="h-8 text-sm pl-8 pr-8"
        />
        {localValue !== '*' && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => void refresh()}
        disabled={loading}
        title="Refresh"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  );
}
