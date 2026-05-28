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
import { fetchAhrefsDomainSnapshot } from "@/lib/connectors/ahrefs";
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
      await track(results, ws.slug, "ahrefs", async () => {
        const snap = await fetchAhrefsDomainSnapshot(ws.ahrefs_domain, today);
        await upsertLegacyMetricSnapshots(
          supabase,
          ws.id,
          "ahrefs",
          [
            {
              date: snap.date,
              organic_traffic: snap.organicTraffic,
              organic_keywords: snap.organicKeywords,
              referring_domains: snap.referringDomains,
              domain_rating: snap.domainRating,
            },
          ],
          [
            "organic_traffic",
            "organic_keywords",
            "referring_domains",
            "domain_rating",
          ],
        );
        return 1;
      });
    }

    // GBP intentionally skipped until API access is approved.
  }

  return NextResponse.json({ ok: true, results });
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
  rows: Array<Record<string, string | number>>,
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
