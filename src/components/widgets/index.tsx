import type { ReactNode } from "react";
import { Sparkline } from "@/components/charts/Sparkline";
import {
  delta,
  fmtPct,
  fmtNum,
  compact,
  healthColor,
  deltaColor,
} from "@/lib/format";
import type { WidgetType } from "@/lib/widgets/types";
import type { DashboardData, Mover } from "@/lib/widgets/data";

// Render a widget by type. Each widget renders its own card(s); the page wraps
// it in a column-span container. `color` is the workspace's primary colour.
export function renderWidget(
  type: WidgetType,
  data: DashboardData,
  color: string,
): ReactNode {
  switch (type) {
    case "health-score":
      return <HealthScore data={data} />;
    case "kpi-grid":
      return <KpiGrid data={data} />;
    case "traffic-trend":
      return <TrafficTrend data={data} color={color} />;
    case "top-movers":
      return <TopMovers data={data} />;
    case "top-queries":
      return <TopQueries data={data} />;
    case "top-pages":
      return <TopPages data={data} />;
    case "gbp-block":
      return <GbpBlock />;
    default:
      return null;
  }
}

// ─── Widgets ──────────────────────────────────────────────────────────────────

function HealthScore({ data }: { data: DashboardData }) {
  if (!data.health) return <Card>{emptyText("No health snapshot yet.")}</Card>;
  const s = data.health.health_score;
  return (
    <Card className="flex h-full flex-col">
      <Label>Health Score</Label>
      <div
        className={`mt-2 text-6xl font-semibold tabular-nums ${healthColor(s)}`}
      >
        {s}
      </div>
      <div className="mt-1 text-xs text-zinc-400">out of 100</div>
      <p className="mt-auto pt-6 text-xs text-zinc-500">
        Weighted blend of 30-day click, impression, position, and conversion
        trends vs. the prior 30 days.
      </p>
    </Card>
  );
}

function KpiGrid({ data }: { data: DashboardData }) {
  const h = data.health;
  if (!h) return <Card>{emptyText("No metrics yet.")}</Card>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Clicks" value={h.clicks_30d} prev={h.clicks_prev_30d} />
      <Stat
        label="Impressions"
        value={h.impressions_30d}
        prev={h.impressions_prev_30d}
      />
      <Stat label="Sessions" value={h.sessions_30d} prev={h.sessions_prev_30d} />
      <Stat
        label="Conversions"
        value={h.conversions_30d}
        prev={h.conversions_prev_30d}
      />
      <Stat
        label="Avg position"
        value={h.avg_position_30d}
        prev={h.avg_position_prev_30d}
        fmt={(n) => n.toFixed(1)}
        invertDelta
      />
      <Stat
        label="Domain rating"
        value={h.domain_rating}
        fmt={(n) => n.toFixed(0)}
      />
      <Stat label="Referring domains" value={h.refdomains} />
      <Stat label="Org. traffic" value={h.org_traffic} />
    </div>
  );
}

function TrafficTrend({ data, color }: { data: DashboardData; color: string }) {
  return (
    <Card>
      <Label>Traffic trend · clicks/day (90d)</Label>
      <div className="mt-3">
        {data.series.length === 0 ? (
          emptyText("No trend data yet.")
        ) : (
          <Sparkline data={data.series} color={color} height={150} />
        )}
      </div>
    </Card>
  );
}

function TopMovers({ data }: { data: DashboardData }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <MoverList
        title="Top winners"
        subtitle="Biggest click gains this period"
        rows={data.winners}
        empty="No upward movers yet."
      />
      <MoverList
        title="Top losers"
        subtitle="Biggest click drops this period"
        rows={data.losers}
        empty="No downward movers yet."
      />
    </div>
  );
}

function TopQueries({ data }: { data: DashboardData }) {
  return (
    <Card>
      <Label>Top queries</Label>
      {data.topQueries.length === 0 ? (
        <div className="mt-3">{emptyText("No query data yet.")}</div>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
          {data.topQueries.map((q) => (
            <li
              key={q.query}
              className="flex items-center gap-3 py-2 text-sm"
            >
              <span className="flex-1 truncate" title={q.query}>
                {q.query}
              </span>
              <span className="text-zinc-400 tabular-nums">
                {compact(q.impressions)} impr
              </span>
              <span className="w-16 text-right font-medium tabular-nums">
                {fmtNum(q.clicks)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TopPages({ data }: { data: DashboardData }) {
  return (
    <Card>
      <Label>Top pages by organic traffic (Ahrefs)</Label>
      {data.topPages.length === 0 ? (
        <div className="mt-3">{emptyText("No Ahrefs page data yet.")}</div>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
          {data.topPages.slice(0, 8).map((p) => (
            <li key={p.page} className="flex items-center gap-3 py-2 text-sm">
              <span className="flex-1 truncate" title={p.page}>
                {p.page}
              </span>
              <span className="text-zinc-500">
                {fmtNum(p.keywords)} kw
              </span>
              <span className="w-24 text-right tabular-nums">
                {fmtNum(p.traffic)} / mo
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function GbpBlock() {
  return (
    <Card>
      <Label>Google Business Profile</Label>
      <p className="mt-3 text-sm text-zinc-500">
        Local performance (profile views, calls, direction requests) will appear
        here once Business Profile API access is approved.
      </p>
    </Card>
  );
}

// ─── Shared building blocks ───────────────────────────────────────────────────

function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 ${className}`}
    >
      {children}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
      {children}
    </div>
  );
}

function emptyText(text: string) {
  return <p className="text-sm text-zinc-500">{text}</p>;
}

function Stat({
  label,
  value,
  prev,
  fmt = fmtNum,
  invertDelta = false,
}: {
  label: string;
  value: number;
  prev?: number;
  fmt?: (n: number) => string;
  invertDelta?: boolean;
}) {
  const d = prev !== undefined ? delta(value, prev) : undefined;
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{fmt(value)}</div>
      {d !== undefined && (
        <div className={`mt-1 text-xs ${deltaColor(d, invertDelta)}`}>
          {fmtPct(d)} vs. prior 30d
        </div>
      )}
    </div>
  );
}

function MoverList({
  title,
  subtitle,
  rows,
  empty,
}: {
  title: string;
  subtitle: string;
  rows: Mover[];
  empty: string;
}) {
  return (
    <Card>
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="text-xs text-zinc-500">{subtitle}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((r) => {
            const isUp = r.change > 0;
            return (
              <li
                key={r.query}
                className="flex items-center gap-3 py-2 text-sm"
              >
                <span className="flex-1 truncate" title={r.query}>
                  {r.query}
                </span>
                <span className="text-zinc-400 tabular-nums">
                  {fmtNum(r.prior)} → {fmtNum(r.current)}
                </span>
                <span
                  className={`w-16 text-right tabular-nums ${
                    isUp ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {isUp ? "+" : ""}
                  {fmtNum(r.change)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
