// SPDX-License-Identifier: MIT
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConsoleStore } from '@/lib/stores/console-store';
import type { ExecuteResponse } from '@/lib/api/types';

interface CommandInputProps {
  connectionId: string;
}

export function CommandInput({ connectionId }: CommandInputProps) {
  const [input, setInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const histories = useConsoleStore((s) => s.histories);
  const suggestions = useConsoleStore((s) => s.suggestions);
  const isExecuting = useConsoleStore((s) => s.isExecuting);
  const execute = useConsoleStore((s) => s.execute);
  const loadSuggestions = useConsoleStore((s) => s.loadSuggestions);
  const clearSuggestions = useConsoleStore((s) => s.clearSuggestions);

  // Extract unique command strings from history for arrow-key navigation
  const commandHistory = useRef<string[]>([]);
  useEffect(() => {
    const entries = histories[connectionId] ?? [];
    const cmds: string[] = [];
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry && !cmds.includes(entry.command)) {
        cmds.push(entry.command);
      }
    }
    commandHistory.current = cmds;
  }, [histories, connectionId]);

  const handleInputChange = useCallback(
    (value: string) => {
      setInput(value);
      setHistoryIndex(-1);

      // Debounce suggestion loading
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      const firstWord = value.trim().split(/\s+/)[0] ?? '';
      if (firstWord.length > 0 && !value.includes(' ')) {
        debounceRef.current = setTimeout(() => {
          void loadSuggestions(firstWord);
          setShowSuggestions(true);
          setSelectedSuggestion(0);
        }, 150);
      } else {
        clearSuggestions();
        setShowSuggestions(false);
      }
    },
    [loadSuggestions, clearSuggestions],
  );

  const handleExecute = useCallback(
    async (command: string, force = false): Promise<ExecuteResponse | null> => {
      if (!command.trim()) return null;
      const result = await execute(connectionId, command.trim(), force);
      setInput('');
      setHistoryIndex(-1);
      clearSuggestions();
      setShowSuggestions(false);
      return result;
    },
    [connectionId, execute, clearSuggestions],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Enter: execute command
      if (e.key === 'Enter' && !isExecuting) {
        e.preventDefault();
        void handleExecute(input);
        return;
      }

      // ArrowUp: navigate history backward
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (showSuggestions && suggestions.length > 0) {
          setSelectedSuggestion((prev) => Math.max(0, prev - 1));
          return;
        }
        const cmds = commandHistory.current;
        if (cmds.length === 0) return;
        const nextIdx = Math.min(historyIndex + 1, cmds.length - 1);
        const cmd = cmds[nextIdx];
        if (cmd === undefined) return;
        setHistoryIndex(nextIdx);
        setInput(cmd);
        return;
      }

      // ArrowDown: navigate history forward
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (showSuggestions && suggestions.length > 0) {
          setSelectedSuggestion((prev) => Math.min(suggestions.length - 1, prev + 1));
          return;
        }
        const cmds = commandHistory.current;
        if (historyIndex <= 0) {
          setHistoryIndex(-1);
          setInput('');
          return;
        }
        const nextIdx = historyIndex - 1;
        const cmd = cmds[nextIdx];
        if (cmd === undefined) return;
        setHistoryIndex(nextIdx);
        setInput(cmd);
        return;
      }

      // Tab: accept selected suggestion
      if (e.key === 'Tab' && showSuggestions && suggestions.length > 0) {
        e.preventDefault();
        const suggestion = suggestions[selectedSuggestion];
        if (suggestion) {
          setInput(suggestion.command + ' ');
          clearSuggestions();
          setShowSuggestions(false);
        }
        return;
      }

      // Escape: close suggestions
      if (e.key === 'Escape') {
        e.preventDefault();
        clearSuggestions();
        setShowSuggestions(false);
      }
    },
    [
      input,
      isExecuting,
      historyIndex,
      showSuggestions,
      suggestions,
      selectedSuggestion,
      handleExecute,
      clearSuggestions,
    ],
  );

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="relative">
      {/* Autocomplete dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute bottom-full left-0 z-10 mb-1 w-full max-w-lg rounded-md border border-border bg-popover shadow-md">
          <div className="max-h-48 overflow-auto p-1">
            {suggestions.map((suggestion, idx) => (
              <button
                key={suggestion.command}
                className={`flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left text-sm ${
                  idx === selectedSuggestion ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setInput(suggestion.command + ' ');
                  clearSuggestions();
                  setShowSuggestions(false);
                  inputRef.current?.focus();
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium">{suggestion.command}</span>
                  <span className="text-xs text-muted-foreground">{suggestion.group}</span>
                </div>
                <span className="text-xs text-muted-foreground">{suggestion.syntax}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-center gap-2 border-t border-border bg-background px-3 py-2">
        <span className="shrink-0 font-mono text-sm text-muted-foreground">&gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a Redis command..."
          disabled={isExecuting}
          className="flex-1 bg-transparent font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
          spellCheck={false}
          autoComplete="off"
        />
        {isExecuting && (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        )}
      </div>
    </div>
  );
}
