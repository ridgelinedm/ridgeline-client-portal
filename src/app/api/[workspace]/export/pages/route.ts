import { format, parseISO, subDays } from "date-fns";
import { agencyScopedClient } from "@/lib/auth/admin";
import { toCsv } from "@/lib/csv";

export const maxDuration = 60;

// CSV of the merged GSC + GA4 page metrics for a date range, via the
// get_page_metrics RPC (shipped in Phase 4). Same scoping as the explorer.
export async function GET(
  request: Request,
  ctx: { params: Promise<{ workspace: string }> },
) {
  const { workspace: slug } = await ctx.params;
  const supabase = await agencyScopedClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (!workspace) return new Response("not found", { status: 404 });

  const url = new URL(request.url);
  const end = url.searchParams.get("end") || format(new Date(), "yyyy-MM-dd");
  const start =
    url.searchParams.get("start") ||
    format(subDays(parseISO(end), 29), "yyyy-MM-dd");

  const { data, error } = await supabase.rpc("get_page_metrics", {
    p_workspace_id: workspace.id,
    p_start: start,
    p_end: end,
  });
  if (error) return new Response(error.message, { status: 500 });

  const rows = (data ?? []) as Array<{
    page_path: string;
    clicks: number;
    impressions: number;
    ctr: number;
    avg_position: number;
    sessions: number;
    total_users: number;
    engaged_sessions: number;
    conversions: number;
    engagement_rate: number;
  }>;

  const csv = toCsv(
    [
      "page_path",
      "clicks",
      "impressions",
      "ctr",
      "avg_position",
      "sessions",
      "total_users",
      "engaged_sessions",
      "conversions",
      "engagement_rate",
    ],
    rows.map((r) => [
      r.page_path,
      r.clicks,
      r.impressions,
      r.ctr.toFixed(4),
      r.avg_position.toFixed(2),
      r.sessions,
      r.total_users,
      r.engaged_sessions,
      r.conversions,
      r.engagement_rate.toFixed(4),
    ]),
  );

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-pages-${start}_${end}.csv"`,
    },
  });
}
