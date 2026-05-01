import { NextResponse } from "next/server";
import { format, subDays } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchGscDaily } from "@/lib/connectors/gsc";
import { fetchGa4Daily } from "@/lib/connectors/ga4";
import { fetchAhrefsDomainSnapshot } from "@/lib/connectors/ahrefs";
import type { MetricSource } from "@/lib/types";

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

  const results: Array<{ workspace: string; source: MetricSource; rows: number; error?: string }> = [];

  for (const ws of workspaces ?? []) {
    if (ws.gsc_property) {
      try {
        const rows = await fetchGscDaily(ws.gsc_property, startDate, today);
        await upsertDaily(supabase, ws.id, "gsc", rows, [
          "clicks",
          "impressions",
          "ctr",
          "position",
        ]);
        results.push({ workspace: ws.slug, source: "gsc", rows: rows.length });
      } catch (e) {
        results.push({
          workspace: ws.slug,
          source: "gsc",
          rows: 0,
          error: (e as Error).message,
        });
      }
    }

    if (ws.ga4_property_id) {
      try {
        const rows = await fetchGa4Daily(ws.ga4_property_id, startDate, today);
        await upsertDaily(supabase, ws.id, "ga4", rows, [
          "sessions",
          "totalUsers",
          "conversions",
        ]);
        results.push({ workspace: ws.slug, source: "ga4", rows: rows.length });
      } catch (e) {
        results.push({
          workspace: ws.slug,
          source: "ga4",
          rows: 0,
          error: (e as Error).message,
        });
      }
    }

    if (ws.ahrefs_domain) {
      try {
        const snap = await fetchAhrefsDomainSnapshot(ws.ahrefs_domain, today);
        await upsertDaily(
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
          ["organic_traffic", "organic_keywords", "referring_domains", "domain_rating"],
        );
        results.push({ workspace: ws.slug, source: "ahrefs", rows: 1 });
      } catch (e) {
        results.push({
          workspace: ws.slug,
          source: "ahrefs",
          rows: 0,
          error: (e as Error).message,
        });
      }
    }

    // GBP intentionally skipped until API access is approved.
  }

  return NextResponse.json({ ok: true, results });
}

async function upsertDaily(
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
