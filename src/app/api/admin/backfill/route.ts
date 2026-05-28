import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { pullGsc, pullGa4, type ResultRow } from "@/lib/jobs/pulls";

// Admin-only one-shot backfill. Called by scripts/backfill-workspace.mjs once
// per (workspace × month-window) so each request stays inside the 60s budget.
// Skips Ahrefs intentionally — historical depth isn't meaningful at the
// account tier we're on and the daily snapshot only makes sense for "today".

export const maxDuration = 60;

const BodySchema = z.object({
  workspace_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

  return NextResponse.json({
    ok: true,
    workspace: ws.slug,
    start_date,
    end_date,
    results,
  });
}
