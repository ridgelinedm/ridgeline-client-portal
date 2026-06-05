import { format, parseISO, subDays, differenceInDays } from "date-fns";
import { agencyScopedClient } from "@/lib/auth/admin";
import { parseSort } from "@/lib/explore";
import { toCsv } from "@/lib/csv";

export const maxDuration = 60;

// CSV of the aggregated queries for a date range — the full result set (no
// 1,000-row cap), respecting the same scoping as the explorer (admins via
// service-role, clients via RLS). Reachable only by authenticated users.
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
  const periodDays = differenceInDays(parseISO(end), parseISO(start)) + 1;
  const priorEnd = format(subDays(parseISO(start), 1), "yyyy-MM-dd");
  const priorStart = format(
    subDays(parseISO(priorEnd), periodDays - 1),
    "yyyy-MM-dd",
  );
  const search = (url.searchParams.get("search") || "").trim();
  const { key, dir } = parseSort(url.searchParams.get("sort"));

  const { data, error } = await supabase.rpc("gsc_queries_agg", {
    p_workspace_id: workspace.id,
    p_start: start,
    p_end: end,
    p_prior_start: priorStart,
    p_prior_end: priorEnd,
    p_search: search,
    p_sort: key,
    p_dir: dir,
    p_limit: 1_000_000,
    p_offset: 0,
  });
  if (error) return new Response(error.message, { status: 500 });

  const rows = (data ?? []) as Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    avg_position: number;
    prior_clicks: number;
    prior_impressions: number;
  }>;

  const csv = toCsv(
    [
      "query",
      "clicks",
      "impressions",
      "ctr",
      "avg_position",
      "prior_clicks",
      "prior_impressions",
    ],
    rows.map((r) => [
      r.query,
      r.clicks,
      r.impressions,
      r.ctr.toFixed(4),
      r.avg_position.toFixed(2),
      r.prior_clicks,
      r.prior_impressions,
    ]),
  );

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-queries-${start}_${end}.csv"`,
    },
  });
}
