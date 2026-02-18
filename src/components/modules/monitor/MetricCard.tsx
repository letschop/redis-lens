// SPDX-License-Identifier: MIT
'use client';

interface MetricCardProps {
  label: string;
  value: string;
  subtitle?: string;
  trend?: 'up' | 'down' | 'stable';
  status?: 'good' | 'warning' | 'critical';
}

export function MetricCard({ label, value, subtitle, trend, status }: MetricCardProps) {
  const statusColor =
    status === 'critical'
      ? 'text-red-500'
      : status === 'warning'
        ? 'text-yellow-500'
        : 'text-green-500';

  const trendIcon =
    trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '';

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-1">
        <p className={`text-2xl font-bold ${status ? statusColor : ''}`}>{value}</p>
        {trendIcon && (
          <span className={`text-sm ${trend === 'up' ? 'text-green-500' : 'text-red-500'}`}>
            {trendIcon}
          </span>
        )}
      </div>
      {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
