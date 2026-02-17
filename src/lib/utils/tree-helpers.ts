// SPDX-License-Identifier: MIT

import type { FlatTreeNode, KeyNode } from '@/lib/api/types';

/**
 * Flatten a key tree for virtual scrolling.
 *
 * Only includes nodes that are visible based on which folders are expanded.
 * Namespace (folder) nodes that are expanded have their children inlined.
 */
export function flattenTree(
  nodes: KeyNode[],
  expanded: Set<string>,
  childrenMap: Map<string, KeyNode[]>,
): FlatTreeNode[] {
  const result: FlatTreeNode[] = [];

  function walk(nodeList: KeyNode[]) {
    for (const node of nodeList) {
      const isExpanded = expanded.has(node.fullPath);

      result.push({
        id: node.fullPath,
        node,
        expanded: isExpanded,
        visible: true,
        indent: node.depth,
      });

      if (!node.isLeaf && isExpanded) {
        const children = childrenMap.get(node.fullPath);
        if (children) {
          walk(children);
        }
      }
    }
  }

  walk(nodes);
  return result;
}

/**
 * Toggle a path in the expanded set, returning a new Set.
 */
export function toggleExpand(expanded: Set<string>, path: string): Set<string> {
  const next = new Set(expanded);
  if (next.has(path)) {
    next.delete(path);
  } else {
    next.add(path);
  }
  return next;
}

/**
 * Format a TTL value into a human-readable string.
 */
export function formatTtl(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

/**
 * Get a display color for a Redis key type.
 */
export function keyTypeColor(keyType: string): string {
  switch (keyType) {
    case 'string':
      return 'text-green-600 dark:text-green-400';
    case 'hash':
      return 'text-orange-600 dark:text-orange-400';
    case 'list':
      return 'text-blue-600 dark:text-blue-400';
    case 'set':
      return 'text-purple-600 dark:text-purple-400';
    case 'zset':
      return 'text-yellow-600 dark:text-yellow-400';
    case 'stream':
      return 'text-red-600 dark:text-red-400';
    default:
      return 'text-muted-foreground';
  }
}

/**
 * Get a short label for a Redis key type.
 */
export function keyTypeLabel(keyType: string): string {
  switch (keyType) {
    case 'string':
      return 'STR';
    case 'hash':
      return 'HASH';
    case 'list':
      return 'LIST';
    case 'set':
      return 'SET';
    case 'zset':
      return 'ZSET';
    case 'stream':
      return 'STRM';
    default:
      return keyType.toUpperCase().slice(0, 4);
  }
}
