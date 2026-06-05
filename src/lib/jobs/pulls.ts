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
import type { createAdminClient } from "@/lib/supabase/admin";
import type { MetricSource } from "@/lib/types";

type AdminClient = ReturnType<typeof createAdminClient>;

export type ResultRow = {
  workspace: string;
  source: string;
  rows: number;
  error?: string;
};

// Shared by cron and admin backfill. Pulls GSC dimensional + legacy daily
// totals for one workspace over the given date range; appends one ResultRow
// per source to the provided results array.
export async function pullGsc(
  supabase: AdminClient,
  workspace: { id: string; slug: string; gsc_property: string },
  startDate: string,
  endDate: string,
  results: ResultRow[],
) {
  await track(results, workspace.slug, "gsc", async () => {
    const rows = await fetchGscDaily(workspace.gsc_property, startDate, endDate);
    await upsertLegacyMetricSnapshots(supabase, workspace.id, "gsc", rows, [
      "clicks",
      "impressions",
      "ctr",
      "position",
    ]);
    return rows.length;
  });

  await track(results, workspace.slug, "gsc_query", async () => {
    const rows = await fetchGscByQuery(workspace.gsc_property, startDate, endDate);
    await upsertWithWorkspace(
      supabase,
      "gsc_query_daily",
      workspace.id,
      rows,
      "workspace_id,date,query",
    );
    return rows.length;
  });

  await track(results, workspace.slug, "gsc_page", async () => {
    const rows = await fetchGscByPage(workspace.gsc_property, startDate, endDate);
    await upsertWithWorkspace(
      supabase,
      "gsc_page_daily",
      workspace.id,
      rows,
      "workspace_id,date,page",
    );
    return rows.length;
  });

  await track(results, workspace.slug, "gsc_query_page", async () => {
    const rows = await fetchGscByQueryPage(
      workspace.gsc_property,
      startDate,
      endDate,
    );
    await upsertWithWorkspace(
      supabase,
      "gsc_query_page_daily",
      workspace.id,
      rows,
      "workspace_id,date,query,page",
    );
    return rows.length;
  });

  await track(results, workspace.slug, "gsc_device", async () => {
    const rows = await fetchGscByDevice(workspace.gsc_property, startDate, endDate);
    await upsertWithWorkspace(
      supabase,
      "gsc_device_daily",
      workspace.id,
      rows,
      "workspace_id,date,device",
    );
    return rows.length;
  });

  await track(results, workspace.slug, "gsc_country", async () => {
    const rows = await fetchGscByCountry(workspace.gsc_property, startDate, endDate);
    await upsertWithWorkspace(
      supabase,
      "gsc_country_daily",
      workspace.id,
      rows,
      "workspace_id,date,country",
    );
    return rows.length;
  });
}

export async function pullGa4(
  supabase: AdminClient,
  workspace: { id: string; slug: string; ga4_property_id: string },
  startDate: string,
  endDate: string,
  results: ResultRow[],
) {
  await track(results, workspace.slug, "ga4", async () => {
    const rows = await fetchGa4Daily(workspace.ga4_property_id, startDate, endDate);
    await upsertLegacyMetricSnapshots(supabase, workspace.id, "ga4", rows, [
      "sessions",
      "totalUsers",
      "conversions",
    ]);
    return rows.length;
  });

  await track(results, workspace.slug, "ga4_page", async () => {
    const rows = await fetchGa4ByPage(
      workspace.ga4_property_id,
      startDate,
      endDate,
    );
    await upsertWithWorkspace(
      supabase,
      "ga4_page_daily",
      workspace.id,
      rows,
      "workspace_id,date,page_path",
    );
    return rows.length;
  });

  await track(results, workspace.slug, "ga4_source", async () => {
    const rows = await fetchGa4BySource(
      workspace.ga4_property_id,
      startDate,
      endDate,
    );
    await upsertWithWorkspace(
      supabase,
      "ga4_source_daily",
      workspace.id,
      rows,
      "workspace_id,date,source,medium,channel_group",
    );
    return rows.length;
  });

  await track(results, workspace.slug, "ga4_device", async () => {
    const rows = await fetchGa4ByDevice(
      workspace.ga4_property_id,
      startDate,
      endDate,
    );
    await upsertWithWorkspace(
      supabase,
      "ga4_device_daily",
      workspace.id,
      rows,
      "workspace_id,date,device",
    );
    return rows.length;
  });
}

export async function track(
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

export async function upsertWithWorkspace(
  supabase: AdminClient,
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

export async function upsertLegacyMetricSnapshots(
  supabase: AdminClient,
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

// Roll the per-day GSC clicks/impressions + GA4 sessions/conversions (the legacy
// metric_snapshots daily totals pullGsc/pullGa4 just wrote) into
// workspace_daily_series — the lightweight per-day source the all-clients grid
// reads for headline totals + sparklines. Called after the pulls by both the
// cron and the admin backfill, so the grid stays current and gains history.
export async function upsertDailySeries(
  supabase: AdminClient,
  workspaceId: string,
  startDate: string,
  endDate: string,
): Promise<number> {
  const { data } = await supabase
    .from("metric_snapshots")
    .select("source, metric_date, metric_key, metric_value")
    .eq("workspace_id", workspaceId)
    .gte("metric_date", startDate)
    .lte("metric_date", endDate)
    .is("dimensions", null)
    .in("metric_key", ["clicks", "impressions", "sessions", "conversions"]);

  const byDate = new Map<
    string,
    { clicks: number; impressions: number; sessions: number; conversions: number }
  >();
  for (const r of (data ?? []) as Array<{
    source: string;
    metric_date: string;
    metric_key: string;
    metric_value: number;
  }>) {
    let e = byDate.get(r.metric_date);
    if (!e) {
      e = { clicks: 0, impressions: 0, sessions: 0, conversions: 0 };
      byDate.set(r.metric_date, e);
    }
    const v = Number(r.metric_value);
    if (r.source === "gsc" && r.metric_key === "clicks") e.clicks = v;
    else if (r.source === "gsc" && r.metric_key === "impressions") e.impressions = v;
    else if (r.source === "ga4" && r.metric_key === "sessions") e.sessions = v;
    else if (r.source === "ga4" && r.metric_key === "conversions") e.conversions = v;
  }

  const rows = [...byDate.entries()].map(([date, e]) => ({
    workspace_id: workspaceId,
    date,
    ...e,
  }));
  if (rows.length === 0) return 0;
  await supabase
    .from("workspace_daily_series")
    .upsert(rows, { onConflict: "workspace_id,date" });
  return rows.length;
}
