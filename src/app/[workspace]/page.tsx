import { notFound } from "next/navigation";
import Link from "next/link";
import { format, parseISO, subDays } from "date-fns";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type HealthRow = {
  date: string;
  clicks_30d: number;
  impressions_30d: number;
  sessions_30d: number;
  conversions_30d: number;
  avg_position_30d: number;
  clicks_prev_30d: number;
  impressions_prev_30d: number;
  sessions_prev_30d: number;
  conversions_prev_30d: number;
  avg_position_prev_30d: number;
  domain_rating: number;
  refdomains: number;
  org_traffic: number;
  health_score: number;
};

type QueryDailyRow = {
  query: string;
  date: string;
  clicks: number;
};

type AhrefsPageRow = {
  page: string;
  traffic: number;
  keywords: number;
  top_keyword: string | null;
  top_keyword_position: number | null;
};

function delta(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 1;
  return (curr - prev) / prev;
}

function fmtPct(n: number) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}

function healthColor(score: number) {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function deltaColor(delta: number, invert = false) {
  const isGood = invert ? delta < 0 : delta > 0;
  const isBad = invert ? delta > 0 : delta < 0;
  if (delta === 0) return "text-zinc-400";
  if (isGood) return "text-emerald-600 dark:text-emerald-400";
  if (isBad) return "text-red-600 dark:text-red-400";
  return "text-zinc-400";
}

export default async function WorkspaceDashboard(props: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await props.params;
  const supabase = await createClient();

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!workspace) notFound();

  const today = format(new Date(), "yyyy-MM-dd");
  const start30 = format(subDays(parseISO(today), 29), "yyyy-MM-dd");
  const endPrior = format(subDays(parseISO(start30), 1), "yyyy-MM-dd");
  const startPrior = format(subDays(parseISO(endPrior), 29), "yyyy-MM-dd");

  const [
    { data: healthRows },
    { data: currQueries },
    { data: priorQueries },
    { data: topPages },
  ] = await Promise.all([
    supabase
      .from("workspace_health_daily")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("date", { ascending: false })
      .limit(1),
    supabase
      .from("gsc_query_daily")
      .select("query, clicks")
      .eq("workspace_id", workspace.id)
      .gte("date", start30)
      .lte("date", today)
      .range(0, 49999),
    supabase
      .from("gsc_query_daily")
      .select("query, clicks")
      .eq("workspace_id", workspace.id)
      .gte("date", startPrior)
      .lte("date", endPrior)
      .range(0, 49999),
    supabase
      .from("ahrefs_top_pages")
      .select("page, traffic, keywords, top_keyword, top_keyword_position")
      .eq("workspace_id", workspace.id)
      .order("snapshot_date", { ascending: false })
      .order("traffic", { ascending: false })
      .limit(10),
  ]);

  const health = (healthRows?.[0] as HealthRow | undefined) ?? null;

  const sumByQuery = (rows: Array<{ query: string; clicks: number }>) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.query, (m.get(r.query) ?? 0) + r.clicks);
    return m;
  };
  const curr = sumByQuery((currQueries ?? []) as QueryDailyRow[]);
  const prior = sumByQuery((priorQueries ?? []) as QueryDailyRow[]);
  const allQueries = new Set([...curr.keys(), ...prior.keys()]);
  const movers = [...allQueries].map((q) => {
    const c = curr.get(q) ?? 0;
    const p = prior.get(q) ?? 0;
    return { query: q, current: c, prior: p, change: c - p };
  });
  const winners = [...movers]
    .filter((m) => m.change > 0)
    .sort((a, b) => b.change - a.change)
    .slice(0, 5);
  const losers = [...movers]
    .filter((m) => m.change < 0)
    .sort((a, b) => a.change - b.change)
    .slice(0, 5);

  const pages = (topPages ?? []) as AhrefsPageRow[];

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {workspace.name}
          </h1>
          <p className="text-sm text-zinc-500">
            Last 30 days · {start30} → {today}
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link
            href={`/${slug}/explore/queries`}
            className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Queries →
          </Link>
          <Link
            href={`/${slug}/explore/pages`}
            className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Pages →
          </Link>
        </nav>
      </header>

      {!health ? (
        <p className="mt-10 text-sm text-zinc-500">
          No health snapshot yet — the next cron run will populate this.
        </p>
      ) : (
        <>
          <section className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-white p-6 md:row-span-2 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Health Score
              </div>
              <div
                className={`mt-2 text-7xl font-semibold tabular-nums ${healthColor(health.health_score)}`}
              >
                {health.health_score}
              </div>
              <div className="mt-1 text-xs text-zinc-400">out of 100</div>
              <p className="mt-6 text-xs text-zinc-500">
                Weighted blend of 30-day click trend, impression trend,
                position trend, and conversion trend vs. the prior 30 days.
              </p>
            </div>
            <Stat
              label="Clicks"
              value={health.clicks_30d}
              prev={health.clicks_prev_30d}
            />
            <Stat
              label="Impressions"
              value={health.impressions_30d}
              prev={health.impressions_prev_30d}
            />
            <Stat
              label="Sessions"
              value={health.sessions_30d}
              prev={health.sessions_prev_30d}
            />
            <Stat
              label="Conversions"
              value={health.conversions_30d}
              prev={health.conversions_prev_30d}
            />
          </section>

          <section className="mt-4 grid gap-4 md:grid-cols-3">
            <Stat
              label="Avg position"
              value={health.avg_position_30d}
              prev={health.avg_position_prev_30d}
              fmt={(n) => n.toFixed(1)}
              invertDelta
            />
            <Stat
              label="Domain rating"
              value={health.domain_rating}
              fmt={(n) => n.toFixed(0)}
            />
            <Stat
              label="Referring domains"
              value={health.refdomains}
              fmt={(n) => n.toLocaleString()}
            />
          </section>

          <section className="mt-8 grid gap-4 md:grid-cols-2">
            <MoverList
              title="Top winners"
              subtitle="Biggest click gains this period"
              rows={winners}
              empty="No upward movers yet."
            />
            <MoverList
              title="Top losers"
              subtitle="Biggest click drops this period"
              rows={losers}
              empty="No downward movers yet."
            />
          </section>

          <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-medium text-zinc-500">
              Top pages by organic traffic (Ahrefs)
            </h2>
            {pages.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">
                No Ahrefs page data yet.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
                {pages.slice(0, 5).map((p) => (
                  <li key={p.page} className="flex items-center gap-3 py-2 text-sm">
                    <span className="flex-1 truncate" title={p.page}>
                      {p.page}
                    </span>
                    <span className="text-zinc-500">
                      {p.keywords.toLocaleString()} kw
                    </span>
                    <span className="w-24 text-right tabular-nums">
                      {p.traffic.toLocaleString()} / mo
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  prev,
  fmt = (n) => n.toLocaleString(),
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
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{fmt(value)}</div>
      {d !== undefined && (
        <div className={`mt-1 text-xs ${deltaColor(d, invertDelta)}`}>
          {fmtPct(d)} vs. prior 30 days
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
  rows: Array<{ query: string; current: number; prior: number; change: number }>;
  empty: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="text-xs text-zinc-500">{subtitle}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((r) => {
            const isUp = r.change > 0;
            return (
              <li key={r.query} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1 truncate" title={r.query}>
                  {r.query}
                </span>
                <span className="text-zinc-400 tabular-nums">
                  {r.prior.toLocaleString()} → {r.current.toLocaleString()}
                </span>
                <span
                  className={`w-16 text-right tabular-nums ${
                    isUp ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {isUp ? "+" : ""}
                  {r.change.toLocaleString()}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
