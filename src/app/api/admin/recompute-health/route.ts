import { NextResponse } from "next/server";
import { z } from "zod";
import { addDays, format, parseISO } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAgencyAdminRequest } from "@/lib/auth/admin";
import { computeHealthRollup } from "@/lib/jobs/health-rollup";

// Recompute workspace_health_daily for every date in [start_date, end_date].
// Used by the backfill script (Bearer CRON_SECRET) as a final pass after all
// source data is in, and by the onboarding UI (agency-admin session) to seed the
// latest health row — isAgencyAdminRequest accepts either.

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
    .select("id, slug")
    .eq("id", workspace_id)
    .maybeSingle();
  if (!ws) {
    return NextResponse.json({ error: "workspace not found" }, { status: 404 });
  }

  const start = parseISO(start_date);
  const end = parseISO(end_date);
  let count = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    await computeHealthRollup(supabase, ws.id, format(d, "yyyy-MM-dd"));
    count += 1;
  }

  return NextResponse.json({
    ok: true,
    workspace: ws.slug,
    start_date,
    end_date,
    dates_recomputed: count,
  });
}
