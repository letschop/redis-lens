// SPDX-License-Identifier: MIT
'use client';

import { useRef, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText } from 'lucide-react';
import type { FlatTreeNode } from '@/lib/api/types';
import { useBrowserStore } from '@/lib/stores/browser-store';
import { keyTypeColor, keyTypeLabel } from '@/lib/utils/tree-helpers';

export function KeyTree() {
  const parentRef = useRef<HTMLDivElement>(null);
  const {
    flatNodes,
    selectedKey,
    expandNamespace,
    collapseNamespace,
    selectKey,
    loadMetadata,
    keyInfoCache,
  } = useBrowserStore();

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is safe here
  const virtualizer = useVirtualizer({
    count: flatNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 20,
  });

  // Load metadata for visible leaf keys
  const visibleItems = virtualizer.getVirtualItems();
  useEffect(() => {
    const visibleLeafKeys = visibleItems
      .map((item) => flatNodes[item.index])
      .filter((n): n is FlatTreeNode => n !== undefined && n.node.isLeaf)
      .map((n) => n.node.fullPath)
      .filter((key) => !keyInfoCache.has(key));

    if (visibleLeafKeys.length > 0) {
      void loadMetadata(visibleLeafKeys);
    }
  }, [visibleItems, flatNodes, keyInfoCache, loadMetadata]);

  const handleClick = useCallback(
    (node: FlatTreeNode) => {
      if (node.node.isLeaf) {
        void selectKey(node.node.fullPath);
      } else if (node.expanded) {
        collapseNamespace(node.node.fullPath);
      } else {
        void expandNamespace(node.node.fullPath);
      }
    },
    [selectKey, expandNamespace, collapseNamespace],
  );

  if (flatNodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-4">
        No keys found
      </div>
    );
  }

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const node = flatNodes[virtualRow.index];
          if (!node) return null;

          const cachedInfo = node.node.isLeaf ? keyInfoCache.get(node.node.fullPath) : null;
          const displayType = cachedInfo?.keyType ?? node.node.keyType;

          return (
            <div
              key={node.id}
              data-index={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <button
                type="button"
                className={`flex items-center w-full px-2 py-1 text-left text-sm hover:bg-muted/50 transition-colors ${
                  node.node.fullPath === selectedKey ? 'bg-accent text-accent-foreground' : ''
                }`}
                style={{ paddingLeft: `${node.indent * 16 + 8}px` }}
                onClick={() => handleClick(node)}
              >
                {/* Expand/collapse icon */}
                {!node.node.isLeaf ? (
                  node.expanded ? (
                    <ChevronDown className="mr-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="mr-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )
                ) : (
                  <span className="mr-1 w-3.5" />
                )}

                {/* Icon */}
                {node.node.isLeaf ? (
                  <FileText className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : node.expanded ? (
                  <FolderOpen className="mr-1.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                ) : (
                  <Folder className="mr-1.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                )}

                {/* Name */}
                <span className="truncate">{node.node.name}</span>

                {/* Type badge for leaf keys */}
                {node.node.isLeaf && displayType && (
                  <span
                    className={`ml-auto shrink-0 text-[10px] font-mono ${keyTypeColor(displayType)}`}
                  >
                    {keyTypeLabel(displayType)}
                  </span>
                )}

                {/* Children count for folders */}
                {!node.node.isLeaf && node.node.childrenCount > 0 && (
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground tabular-nums">
                    {node.node.childrenCount}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
