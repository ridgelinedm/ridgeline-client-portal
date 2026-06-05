"use client";

import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";

export type SparkPoint = { date: string; value: number };

// Minimal trend sparkline for the all-clients grid cards — no axes, grid, or
// tooltip, just the shape. First (and so far only) recharts usage in the app.
export function Sparkline({
  data,
  color = "#6366f1",
  height = 44,
}: {
  data: SparkPoint[];
  color?: string;
  height?: number;
}) {
  if (!data || data.length === 0) {
    return (
      <div
        style={{ height }}
        className="flex w-full items-center justify-center text-[10px] text-zinc-300 dark:text-zinc-700"
      >
        no data
      </div>
    );
  }

  // SVG gradient ids must be valid; key off the hex so same-color charts share
  // an identical (harmless) def.
  const gradId = `spark-${color.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradId})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
