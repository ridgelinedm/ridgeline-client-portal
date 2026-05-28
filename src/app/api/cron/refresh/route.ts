import { NextResponse } from "next/server";
import { format, subDays } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchAhrefsDomainSnapshot,
  fetchAhrefsOrganicKeywords,
  fetchAhrefsTopPages,
} from "@/lib/connectors/ahrefs";
import {
  pullGsc,
  pullGa4,
  track,
  upsertWithWorkspace,
  type ResultRow,
} from "@/lib/jobs/pulls";
import { computeHealthRollup } from "@/lib/jobs/health-rollup";

export const maxDuration = 60;

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
      await pullGsc(supabase, ws, startDate, today, results);
    }

    if (ws.ga4_property_id) {
      await pullGa4(supabase, ws, startDate, today, results);
    }

    if (ws.ahrefs_domain) {
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

    // Recompute health rollup after all sources have refreshed for this workspace.
    await track(results, ws.slug, "health_rollup", async () => {
      await computeHealthRollup(supabase, ws.id, today);
      return 1;
    });
  }

  return NextResponse.json({ ok: true, results });
}
