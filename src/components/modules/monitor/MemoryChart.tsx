// SPDX-License-Identifier: MIT
'use client';

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { StatsSnapshot } from '@/lib/api/types';

interface MemoryChartProps {
  data: StatsSnapshot[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${val.toFixed(1)} ${sizes[i]}`;
}

export function MemoryChart({ data }: MemoryChartProps) {
  const chartData = data.map((s) => ({
    time: new Date(s.timestampMs).toLocaleTimeString(),
    used: s.info.memory.usedMemory,
    rss: s.info.memory.usedMemoryRss,
  }));

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-2 text-sm font-medium">Memory Usage</h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData}>
          <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={formatBytes} />
          <Tooltip formatter={(value: number) => formatBytes(value)} />
          <Area
            type="monotone"
            dataKey="rss"
            stroke="hsl(var(--destructive))"
            fill="hsl(var(--destructive) / 0.1)"
            strokeWidth={1}
            dot={false}
            name="RSS"
          />
          <Area
            type="monotone"
            dataKey="used"
            stroke="hsl(var(--primary))"
            fill="hsl(var(--primary) / 0.1)"
            strokeWidth={2}
            dot={false}
            name="Used"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
