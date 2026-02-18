// SPDX-License-Identifier: MIT
'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { StatsSnapshot } from '@/lib/api/types';

interface OpsChartProps {
  data: StatsSnapshot[];
}

export function OpsChart({ data }: OpsChartProps) {
  const chartData = data.map((s) => ({
    time: new Date(s.timestampMs).toLocaleTimeString(),
    opsPerSec: s.info.stats.instantaneousOpsPerSec,
  }));

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-2 text-sm font-medium">Operations / sec</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData}>
          <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="opsPerSec"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
