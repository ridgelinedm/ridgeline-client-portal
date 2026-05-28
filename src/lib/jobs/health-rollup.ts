import { format, subDays } from "date-fns";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// Recompute the workspace_health_daily row for one date. Compares the
// 30-day window ending on `endDate` against the prior 30-day window for
// clicks, impressions, sessions, conversions, and avg. position. Health
// score 0-100 is a weighted blend (clicks heaviest).
//
// Reads from metric_snapshots (daily totals) for GSC/GA4 and from
// ahrefs_domain_daily (latest snapshot at or before endDate) for DR/refdomains.
export async function computeHealthRollup(
  supabase: AdminClient,
  workspaceId: string,
  endDate: string,
) {
  const end = endDate;
  const start30 = isoDaysAgo(endDate, 29);
  const endPrior = isoDaysAgo(start30, 1);
  const startPrior = isoDaysAgo(endPrior, 29);

  const fetchRange = async (s: string, e: string) => {
    const { data } = await supabase
      .from("metric_snapshots")
      .select("source, metric_date, metric_key, metric_value")
      .eq("workspace_id", workspaceId)
      .gte("metric_date", s)
      .lte("metric_date", e)
      .is("dimensions", null);
    return (data ?? []) as Array<{
      source: string;
      metric_date: string;
      metric_key: string;
      metric_value: number;
    }>;
  };

  const [curr, prior, { data: ahrefsLatestRows }] = await Promise.all([
    fetchRange(start30, end),
    fetchRange(startPrior, endPrior),
    supabase
      .from("ahrefs_domain_daily")
      .select("domain_rating,refdomains,org_traffic")
      .eq("workspace_id", workspaceId)
      .lte("date", end)
      .order("date", { ascending: false })
      .limit(1),
  ]);

  const ahrefs = (ahrefsLatestRows?.[0] as
    | { domain_rating: number; refdomains: number; org_traffic: number }
    | undefined) ?? { domain_rating: 0, refdomains: 0, org_traffic: 0 };

  const sumKey = (
    rows: Array<{ source: string; metric_key: string; metric_value: number }>,
    source: string,
    key: string,
  ) =>
    rows
      .filter((r) => r.source === source && r.metric_key === key)
      .reduce((acc, r) => acc + Number(r.metric_value), 0);

  const avgKey = (
    rows: Array<{ source: string; metric_key: string; metric_value: number }>,
    source: string,
    key: string,
  ) => {
    const m = rows.filter(
      (r) => r.source === source && r.metric_key === key,
    );
    if (m.length === 0) return 0;
    return m.reduce((acc, r) => acc + Number(r.metric_value), 0) / m.length;
  };

  const clicks30 = sumKey(curr, "gsc", "clicks");
  const impressions30 = sumKey(curr, "gsc", "impressions");
  const sessions30 = sumKey(curr, "ga4", "sessions");
  const conversions30 = sumKey(curr, "ga4", "conversions");
  const avgPos30 = avgKey(curr, "gsc", "position");

  const clicksPrev = sumKey(prior, "gsc", "clicks");
  const impressionsPrev = sumKey(prior, "gsc", "impressions");
  const sessionsPrev = sumKey(prior, "ga4", "sessions");
  const conversionsPrev = sumKey(prior, "ga4", "conversions");
  const avgPosPrev = avgKey(prior, "gsc", "position");

  // Map a delta % to 0-100. -50% or worse → 0, 0% → 50, +50% or better → 100.
  // Position score is inverted (lower is better).
  const deltaOf = (c: number, p: number) =>
    p === 0 ? (c === 0 ? 0 : 1) : (c - p) / p;
  const score = (delta: number) => {
    if (!Number.isFinite(delta)) return 50;
    const clamped = Math.max(-0.5, Math.min(0.5, delta));
    return Math.round((clamped + 0.5) * 100);
  };

  const clicksScore = score(deltaOf(clicks30, clicksPrev));
  const impressionsScore = score(deltaOf(impressions30, impressionsPrev));
  const positionScore = score(-deltaOf(avgPos30, avgPosPrev));
  const conversionsScore = score(deltaOf(conversions30, conversionsPrev));

  const healthScore = Math.round(
    0.4 * clicksScore +
      0.2 * impressionsScore +
      0.2 * positionScore +
      0.2 * conversionsScore,
  );

  await supabase.from("workspace_health_daily").upsert(
    {
      workspace_id: workspaceId,
      date: end,
      clicks_30d: clicks30,
      impressions_30d: impressions30,
      sessions_30d: sessions30,
      conversions_30d: conversions30,
      avg_position_30d: avgPos30,
      clicks_prev_30d: clicksPrev,
      impressions_prev_30d: impressionsPrev,
      sessions_prev_30d: sessionsPrev,
      conversions_prev_30d: conversionsPrev,
      avg_position_prev_30d: avgPosPrev,
      domain_rating: ahrefs.domain_rating,
      refdomains: ahrefs.refdomains,
      org_traffic: ahrefs.org_traffic,
      health_score: healthScore,
    },
    { onConflict: "workspace_id,date" },
  );
}

function isoDaysAgo(iso: string, days: number): string {
  return format(subDays(new Date(iso), days), "yyyy-MM-dd");
}
