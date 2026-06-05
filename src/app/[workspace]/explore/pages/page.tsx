import { notFound } from "next/navigation";
import Link from "next/link";
import { differenceInDays, format, parseISO, subDays } from "date-fns";
import { agencyScopedClient } from "@/lib/auth/admin";
import { delta, fmtPct } from "@/lib/format";
import { parsePageSort, type PageSortKey, type SortDir } from "@/lib/explore";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

type Row = {
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
  prior_clicks: number;
  prior_impressions: number;
  prior_ctr: number;
  prior_avg_position: number;
  prior_sessions: number;
  prior_engaged_sessions: number;
  prior_conversions: number;
  prior_engagement_rate: number;
  total_count: number;
};

function fmtRate(n: number) {
  return `${(n * 100).toFixed(2)}%`;
}
function fmtPos(n: number) {
  return n.toFixed(1);
}

export default async function PagesExplorer(props: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{
    start?: string;
    end?: string;
    search?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const { workspace: slug } = await props.params;
  const sp = await props.searchParams;

  const supabase = await agencyScopedClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!workspace) notFound();

  const end = sp.end ?? format(new Date(), "yyyy-MM-dd");
  const start = sp.start ?? format(subDays(parseISO(end), 29), "yyyy-MM-dd");
  const periodDays = differenceInDays(parseISO(end), parseISO(start)) + 1;
  const priorEnd = format(subDays(parseISO(start), 1), "yyyy-MM-dd");
  const priorStart = format(
    subDays(parseISO(priorEnd), periodDays - 1),
    "yyyy-MM-dd",
  );

  const search = sp.search?.trim() ?? "";
  const { key: sortKey, dir: sortDir } = parsePageSort(sp.sort);
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { data: rpcData } = await supabase.rpc("gsc_pages_agg", {
    p_workspace_id: workspace.id,
    p_start: start,
    p_end: end,
    p_prior_start: priorStart,
    p_prior_end: priorEnd,
    p_search: search,
    p_sort: sortKey,
    p_dir: sortDir,
    p_limit: PAGE_SIZE,
    p_offset: offset,
  });
  const rows = (rpcData ?? []) as Row[];
  const total = Number(rows[0]?.total_count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstRow = total === 0 ? 0 : offset + 1;
  const lastRow = Math.min(offset + rows.length, total);

  const baseParams = { start, end, search };
  const exportQs = makeQs({ start, end, search, sort: `${sortKey}_${sortDir}` });

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="flex items-baseline justify-between">
        <div>
          <Link
            href={`/${slug}`}
            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            ← {workspace.name}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Pages</h1>
          <p className="text-sm text-zinc-500">
            {start} → {end} · vs. {priorStart} → {priorEnd}
          </p>
        </div>
        <a
          href={`/api/${slug}/export/pages?${exportQs}`}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Download CSV
        </a>
      </header>

      <form className="mt-6 flex flex-wrap items-end gap-3">
        <Field label="Start">
          <input
            type="date"
            name="start"
            defaultValue={start}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </Field>
        <Field label="End">
          <input
            type="date"
            name="end"
            defaultValue={end}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </Field>
        <Field label="Search">
          <input
            type="search"
            name="search"
            defaultValue={search}
            placeholder="path filter"
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </Field>
        <input type="hidden" name="sort" value={`${sortKey}_${sortDir}`} />
        <button
          type="submit"
          className="rounded border border-zinc-300 bg-zinc-100 px-3 py-1 text-sm hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
        >
          Apply
        </button>
      </form>

      <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
        <span>
          {total.toLocaleString()} pages
          {total > 0 ? ` · showing ${firstRow.toLocaleString()}–${lastRow.toLocaleString()}` : ""}
        </span>
        <Pager slug={slug} params={baseParams} sort={`${sortKey}_${sortDir}`} page={page} totalPages={totalPages} />
      </div>

      <div className="mt-2 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <SortHeader label="Page" col="page_path" slug={slug} params={baseParams} sortKey={sortKey} sortDir={sortDir} />
              <SortHeader label="Clicks" col="clicks" slug={slug} params={baseParams} sortKey={sortKey} sortDir={sortDir} align="right" />
              <SortHeader label="Impr." col="impressions" slug={slug} params={baseParams} sortKey={sortKey} sortDir={sortDir} align="right" />
              <SortHeader label="CTR" col="ctr" slug={slug} params={baseParams} sortKey={sortKey} sortDir={sortDir} align="right" />
              <SortHeader label="Avg pos" col="avg_position" slug={slug} params={baseParams} sortKey={sortKey} sortDir={sortDir} align="right" />
              <SortHeader label="Sessions" col="sessions" slug={slug} params={baseParams} sortKey={sortKey} sortDir={sortDir} align="right" />
              <SortHeader label="Engagement" col="engagement_rate" slug={slug} params={baseParams} sortKey={sortKey} sortDir={sortDir} align="right" />
              <SortHeader label="Conv." col="conversions" slug={slug} params={baseParams} sortKey={sortKey} sortDir={sortDir} align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((r) => (
              <tr key={r.page_path}>
                <td className="max-w-md truncate px-3 py-2" title={r.page_path}>
                  {r.page_path}
                </td>
                <Cell value={r.clicks.toLocaleString()} delta={delta(r.clicks, r.prior_clicks)} />
                <Cell value={r.impressions.toLocaleString()} delta={delta(r.impressions, r.prior_impressions)} />
                <Cell value={fmtRate(r.ctr)} delta={delta(r.ctr, r.prior_ctr)} />
                <Cell value={fmtPos(r.avg_position)} delta={delta(r.avg_position, r.prior_avg_position)} invert />
                <Cell value={r.sessions.toLocaleString()} delta={delta(r.sessions, r.prior_sessions)} />
                <Cell value={fmtRate(r.engagement_rate)} delta={delta(r.engagement_rate, r.prior_engagement_rate)} />
                <Cell value={r.conversions.toLocaleString()} delta={delta(r.conversions, r.prior_conversions)} />
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-zinc-500">
                  No pages for this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex justify-end">
        <Pager slug={slug} params={baseParams} sort={`${sortKey}_${sortDir}`} page={page} totalPages={totalPages} />
      </div>
    </main>
  );
}

function makeQs(params: Record<string, string | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) u.set(k, v);
  return u.toString();
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function Pager({
  slug,
  params,
  sort,
  page,
  totalPages,
}: {
  slug: string;
  params: { start: string; end: string; search: string };
  sort: string;
  page: number;
  totalPages: number;
}) {
  const href = (p: number) =>
    `/${slug}/explore/pages?${makeQs({ ...params, sort, page: String(p) })}`;
  const btn =
    "rounded border border-zinc-300 px-2 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";
  const disabled = "pointer-events-none opacity-40";
  return (
    <span className="flex items-center gap-2">
      <span>
        Page {page} of {totalPages}
      </span>
      <Link href={href(Math.max(1, page - 1))} className={`${btn} ${page <= 1 ? disabled : ""}`}>
        ← Prev
      </Link>
      <Link href={href(Math.min(totalPages, page + 1))} className={`${btn} ${page >= totalPages ? disabled : ""}`}>
        Next →
      </Link>
    </span>
  );
}

function SortHeader({
  label,
  col,
  slug,
  params,
  sortKey,
  sortDir,
  align = "left",
}: {
  label: string;
  col: PageSortKey;
  slug: string;
  params: { start: string; end: string; search: string };
  sortKey: PageSortKey;
  sortDir: SortDir;
  align?: "left" | "right";
}) {
  const isActive = sortKey === col;
  const nextDir: SortDir = isActive && sortDir === "desc" ? "asc" : "desc";
  const qs = makeQs({ ...params, sort: `${col}_${nextDir}` });
  const arrow = isActive ? (sortDir === "desc" ? "↓" : "↑") : "";
  return (
    <th className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : ""}`}>
      <Link
        href={`/${slug}/explore/pages?${qs}`}
        className="hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        {label} {arrow}
      </Link>
    </th>
  );
}

function Cell({
  value,
  delta: d,
  invert = false,
}: {
  value: string;
  delta?: number;
  invert?: boolean;
}) {
  const goodWhenPositive = !invert;
  const isGood = d !== undefined && (goodWhenPositive ? d > 0 : d < 0);
  const isBad = d !== undefined && (goodWhenPositive ? d < 0 : d > 0);
  return (
    <td className="px-3 py-2 text-right tabular-nums">
      <div>{value}</div>
      {d !== undefined && d !== 0 && (
        <div
          className={`text-xs ${
            isGood ? "text-emerald-600" : isBad ? "text-red-600" : "text-zinc-400"
          }`}
        >
          {fmtPct(d)}
        </div>
      )}
    </td>
  );
}
