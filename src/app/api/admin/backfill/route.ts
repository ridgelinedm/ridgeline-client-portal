import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAgencyAdminRequest } from "@/lib/auth/admin";
import {
  pullGsc,
  pullGa4,
  upsertDailySeries,
  track,
  type ResultRow,
} from "@/lib/jobs/pulls";

// Admin one-shot backfill for one (workspace × date-window). Called per month by
// scripts/backfill-workspace.mjs (Bearer CRON_SECRET) AND by the onboarding UI
// (agency-admin session) — isAgencyAdminRequest accepts either. Skips Ahrefs
// intentionally — historical depth isn't meaningful at the account tier we're
// on and the daily snapshot only makes sense for "today".

export const maxDuration = 60;

const BodySchema = z.object({
  workspace_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(request: Request) {
  if (!(await isAgencyAdminRequest(request))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { workspace_id, start_date, end_date } = parsed.data;

  const supabase = createAdminClient();
  const { data: ws } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", workspace_id)
    .maybeSingle();
  if (!ws) {
    return NextResponse.json({ error: "workspace not found" }, { status: 404 });
  }

  const results: ResultRow[] = [];

  if (ws.gsc_property) {
    await pullGsc(supabase, ws, start_date, end_date, results);
  }
  if (ws.ga4_property_id) {
    await pullGa4(supabase, ws, start_date, end_date, results);
  }

  // Populate the all-clients grid series for this window too.
  await track(results, ws.slug, "daily_series", async () =>
    upsertDailySeries(supabase, ws.id, start_date, end_date),
  );

  return NextResponse.json({
    ok: true,
    workspace: ws.slug,
    start_date,
    end_date,
    results,
  });
}
