import { format, parseISO, subDays } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";

export type HealthRow = {
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

export type Mover = {
  query: string;
  current: number;
  prior: number;
  change: number;
};

export type TopPage = {
  page: string;
  traffic: number;
  keywords: number;
  top_keyword: string | null;
  top_keyword_position: number | null;
};

// Everything the v1 client-dashboard widgets need, loaded once and passed down.
export type DashboardData = {
  rangeStart: string;
  rangeEnd: string;
  health: HealthRow | null;
  series: { date: string; value: number }[];
  winners: Mover[];
  losers: Mover[];
  topQueries: { query: string; clicks: number; impressions: number }[];
  topPages: TopPage[];
};

// Load the dashboard data bundle for one workspace using the already-scoped
// Supabase client (service-role for agency admins, RLS for clients).
export async function loadDashboardData(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<DashboardData> {
  const today = format(new Date(), "yyyy-MM-dd");
  const start30 = format(subDays(parseISO(today), 29), "yyyy-MM-dd");
  const endPrior = format(subDays(parseISO(start30), 1), "yyyy-MM-dd");
  const startPrior = format(subDays(parseISO(endPrior), 29), "yyyy-MM-dd");
  const start90 = format(subDays(parseISO(today), 89), "yyyy-MM-dd");

  const [
    { data: healthRows },
    { data: seriesRows },
    { data: currRows },
    { data: priorRows },
    { data: pageRows },
  ] = await Promise.all([
    supabase
      .from("workspace_health_daily")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("date", { ascending: false })
      .limit(1),
    supabase
      .from("workspace_daily_series")
      .select("date, clicks")
      .eq("workspace_id", workspaceId)
      .gte("date", start90)
      .order("date", { ascending: true })
      .limit(400),
    supabase
      .from("gsc_query_daily")
      .select("query, clicks, impressions")
      .eq("workspace_id", workspaceId)
      .gte("date", start30)
      .lte("date", today)
      .range(0, 49999),
    supabase
      .from("gsc_query_daily")
      .select("query, clicks")
      .eq("workspace_id", workspaceId)
      .gte("date", startPrior)
      .lte("date", endPrior)
      .range(0, 49999),
    supabase
      .from("ahrefs_top_pages")
      .select("page, traffic, keywords, top_keyword, top_keyword_position")
      .eq("workspace_id", workspaceId)
      .order("snapshot_date", { ascending: false })
      .order("traffic", { ascending: false })
      .limit(10),
  ]);

  const health = (healthRows?.[0] as HealthRow | undefined) ?? null;
  const series = ((seriesRows ?? []) as { date: string; clicks: number }[]).map(
    (r) => ({ date: r.date, value: r.clicks }),
  );

  const curr = currRows as Array<{
    query: string;
    clicks: number;
    impressions: number;
  }> | null;
  const prior = priorRows as Array<{ query: string; clicks: number }> | null;

  const sumClicks = (rows: Array<{ query: string; clicks: number }>) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.query, (m.get(r.query) ?? 0) + r.clicks);
    return m;
  };
  const currMap = sumClicks(curr ?? []);
  const priorMap = sumClicks(prior ?? []);
  const allQueries = new Set([...currMap.keys(), ...priorMap.keys()]);
  const movers: Mover[] = [...allQueries].map((q) => {
    const c = currMap.get(q) ?? 0;
    const p = priorMap.get(q) ?? 0;
    return { query: q, current: c, prior: p, change: c - p };
  });
  const winners = movers
    .filter((m) => m.change > 0)
    .sort((a, b) => b.change - a.change)
    .slice(0, 5);
  const losers = movers
    .filter((m) => m.change < 0)
    .sort((a, b) => a.change - b.change)
    .slice(0, 5);

  const byQuery = new Map<string, { clicks: number; impressions: number }>();
  for (const r of curr ?? []) {
    const e = byQuery.get(r.query) ?? { clicks: 0, impressions: 0 };
    e.clicks += r.clicks;
    e.impressions += r.impressions;
    byQuery.set(r.query, e);
  }
  const topQueries = [...byQuery.entries()]
    .map(([query, e]) => ({ query, ...e }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10);

  return {
    rangeStart: start30,
    rangeEnd: today,
    health,
    series,
    winners,
    losers,
    topQueries,
    topPages: (pageRows ?? []) as TopPage[],
  };
}
