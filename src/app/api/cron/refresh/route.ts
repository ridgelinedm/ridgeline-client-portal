import { NextResponse } from "next/server";
import { format, subDays } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchGscDaily,
  fetchGscByQuery,
  fetchGscByPage,
  fetchGscByQueryPage,
  fetchGscByDevice,
  fetchGscByCountry,
} from "@/lib/connectors/gsc";
import {
  fetchGa4Daily,
  fetchGa4ByPage,
  fetchGa4BySource,
  fetchGa4ByDevice,
} from "@/lib/connectors/ga4";
import {
  fetchAhrefsDomainSnapshot,
  fetchAhrefsOrganicKeywords,
  fetchAhrefsTopPages,
} from "@/lib/connectors/ahrefs";
import type { MetricSource } from "@/lib/types";

export const maxDuration = 60;

type ResultRow = {
  workspace: string;
  source: string;
  rows: number;
  error?: string;
};

// Vercel Cron hits this nightly. Protected by a shared secret so randos can't.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: workspaces, error } = await supabase
    .from("workspaces")
    .select("*");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const today = format(new Date(), "yyyy-MM-dd");
  // GSC has a ~2-3 day lag; 7 days is a safe rolling window to backfill.
  const startDate = format(subDays(new Date(), 7), "yyyy-MM-dd");

  const results: ResultRow[] = [];

  for (const ws of workspaces ?? []) {
    if (ws.gsc_property) {
      // Legacy: top-line daily aggregates feed the overview dashboard until the
      // Phase 3 health-rollup table lands.
      await track(results, ws.slug, "gsc", async () => {
        const rows = await fetchGscDaily(ws.gsc_property, startDate, today);
        await upsertLegacyMetricSnapshots(supabase, ws.id, "gsc", rows, [
          "clicks",
          "impressions",
          "ctr",
          "position",
        ]);
        return rows.length;
      });

      // Phase 1: dimensional fact tables feed the explorer.
      await track(results, ws.slug, "gsc_query", async () => {
        const rows = await fetchGscByQuery(ws.gsc_property, startDate, today);
        await upsertWithWorkspace(
          supabase,
          "gsc_query_daily",
          ws.id,
          rows,
          "workspace_id,date,query",
        );
        return rows.length;
      });

      await track(results, ws.slug, "gsc_page", async () => {
        const rows = await fetchGscByPage(ws.gsc_property, startDate, today);
        await upsertWithWorkspace(
          supabase,
          "gsc_page_daily",
          ws.id,
          rows,
          "workspace_id,date,page",
        );
        return rows.length;
      });

      await track(results, ws.slug, "gsc_query_page", async () => {
        const rows = await fetchGscByQueryPage(
          ws.gsc_property,
          startDate,
          today,
        );
        await upsertWithWorkspace(
          supabase,
          "gsc_query_page_daily",
          ws.id,
          rows,
          "workspace_id,date,query,page",
        );
        return rows.length;
      });

      await track(results, ws.slug, "gsc_device", async () => {
        const rows = await fetchGscByDevice(ws.gsc_property, startDate, today);
        await upsertWithWorkspace(
          supabase,
          "gsc_device_daily",
          ws.id,
          rows,
          "workspace_id,date,device",
        );
        return rows.length;
      });

      await track(results, ws.slug, "gsc_country", async () => {
        const rows = await fetchGscByCountry(ws.gsc_property, startDate, today);
        await upsertWithWorkspace(
          supabase,
          "gsc_country_daily",
          ws.id,
          rows,
          "workspace_id,date,country",
        );
        return rows.length;
      });
    }

    if (ws.ga4_property_id) {
      // Legacy: top-line daily aggregates feed the overview dashboard.
      await track(results, ws.slug, "ga4", async () => {
        const rows = await fetchGa4Daily(ws.ga4_property_id, startDate, today);
        await upsertLegacyMetricSnapshots(supabase, ws.id, "ga4", rows, [
          "sessions",
          "totalUsers",
          "conversions",
        ]);
        return rows.length;
      });

      // Phase 2: dimensional fact tables feed the explorer.
      await track(results, ws.slug, "ga4_page", async () => {
        const rows = await fetchGa4ByPage(
          ws.ga4_property_id,
          startDate,
          today,
        );
        await upsertWithWorkspace(
          supabase,
          "ga4_page_daily",
          ws.id,
          rows,
          "workspace_id,date,page_path",
        );
        return rows.length;
      });

      await track(results, ws.slug, "ga4_source", async () => {
        const rows = await fetchGa4BySource(
          ws.ga4_property_id,
          startDate,
          today,
        );
        await upsertWithWorkspace(
          supabase,
          "ga4_source_daily",
          ws.id,
          rows,
          "workspace_id,date,source,medium,channel_group",
        );
        return rows.length;
      });

      await track(results, ws.slug, "ga4_device", async () => {
        const rows = await fetchGa4ByDevice(
          ws.ga4_property_id,
          startDate,
          today,
        );
        await upsertWithWorkspace(
          supabase,
          "ga4_device_daily",
          ws.id,
          rows,
          "workspace_id,date,device",
        );
        return rows.length;
      });
    }

    if (ws.ahrefs_domain) {
      // Phase 3: ahrefs_domain_daily replaces the legacy metric_snapshots
      // Ahrefs writes. DR + refdomains now come from the correct endpoints.
      await track(results, ws.slug, "ahrefs_domain", async () => {
        const snap = await fetchAhrefsDomainSnapshot(ws.ahrefs_domain, today);
        await supabase.from("ahrefs_domain_daily").upsert(
          {
            workspace_id: ws.id,
            date: snap.date,
            org_traffic: snap.org_traffic,
            org_keywords: snap.org_keywords,
            domain_rating: snap.domain_rating,
            ahrefs_rank: snap.ahrefs_rank,
            refdomains: snap.refdomains,
            total_backlinks: snap.total_backlinks,
          },
          { onConflict: "workspace_id,date" },
        );
        return 1;
      });

      await track(results, ws.slug, "ahrefs_keywords", async () => {
        const kws = await fetchAhrefsOrganicKeywords(
          ws.ahrefs_domain,
          today,
          100,
        );
        await upsertWithWorkspace(
          supabase,
          "ahrefs_organic_keywords",
          ws.id,
          kws.map((k) => ({ snapshot_date: today, ...k })),
          "workspace_id,snapshot_date,keyword",
        );
        return kws.length;
      });

      await track(results, ws.slug, "ahrefs_pages", async () => {
        const pages = await fetchAhrefsTopPages(ws.ahrefs_domain, today, 50);
        await upsertWithWorkspace(
          supabase,
          "ahrefs_top_pages",
          ws.id,
          pages.map((p) => ({ snapshot_date: today, ...p })),
          "workspace_id,snapshot_date,page",
        );
        return pages.length;
      });
    }

    // GBP intentionally skipped until API access is approved.

    // Phase 3: recompute health rollup after all sources for this workspace
    // have refreshed. Reads from metric_snapshots (daily totals) + the new
    // ahrefs_domain_daily.
    await track(results, ws.slug, "health_rollup", async () => {
      await computeHealthRollup(supabase, ws.id, today);
      return 1;
    });
  }

  return NextResponse.json({ ok: true, results });
}

// Recompute the workspace_health_daily row for `today`. Compares the current
// 30-day window against the prior 30-day window for clicks, impressions,
// sessions, conversions, and avg. position. Health score 0-100 is a weighted
// blend of those four deltas (clicks heaviest).
async function computeHealthRollup(
  supabase: ReturnType<typeof createAdminClient>,
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

  // Score components: map a delta % to 0-100. -50% or worse → 0, 0% → 50,
  // +50% or better → 100. Position score is inverted (lower is better).
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

async function track(
  results: ResultRow[],
  workspaceSlug: string,
  source: string,
  fn: () => Promise<number>,
) {
  try {
    const rows = await fn();
    results.push({ workspace: workspaceSlug, source, rows });
  } catch (e) {
    results.push({
      workspace: workspaceSlug,
      source,
      rows: 0,
      error: (e as Error).message,
    });
  }
}

async function upsertWithWorkspace(
  supabase: ReturnType<typeof createAdminClient>,
  table: string,
  workspaceId: string,
  rows: Array<Record<string, string | number | null>>,
  onConflict: string,
) {
  if (rows.length === 0) return;
  await supabase
    .from(table)
    .upsert(
      rows.map((r) => ({ workspace_id: workspaceId, ...r })),
      { onConflict },
    );
}

async function upsertLegacyMetricSnapshots(
  supabase: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  source: MetricSource,
  rows: Array<Record<string, string | number>>,
  metricKeys: string[],
) {
  const records: Array<{
    workspace_id: string;
    source: MetricSource;
    metric_date: string;
    metric_key: string;
    metric_value: number;
  }> = [];
  for (const row of rows) {
    const date = String(row.date);
    for (const key of metricKeys) {
      const value = row[key];
      if (value === undefined || value === null) continue;
      records.push({
        workspace_id: workspaceId,
        source,
        metric_date: date,
        metric_key: key,
        metric_value: Number(value),
      });
    }
  }
  if (records.length === 0) return;
  await supabase.from("metric_snapshots").upsert(records, {
    onConflict: "workspace_id,source,metric_date,metric_key,dimensions_hash",
  });
}
