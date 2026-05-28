import { notFound } from "next/navigation";
import Link from "next/link";
import { differenceInDays, format, parseISO, subDays } from "date-fns";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageRow = {
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
};

type SortKey =
  | "page_path"
  | "clicks"
  | "impressions"
  | "ctr"
  | "avg_position"
  | "sessions"
  | "engagement_rate"
  | "conversions";
type SortDir = "asc" | "desc";

const DISPLAY_CAP = 1000;

function parseSort(raw: string | undefined): { key: SortKey; dir: SortDir } {
  const allowed: SortKey[] = [
    "page_path",
    "clicks",
    "impressions",
    "ctr",
    "avg_position",
    "sessions",
    "engagement_rate",
    "conversions",
  ];
  // sessions / engagement_rate include underscores; accept the last token as dir
  const idx = (raw ?? "clicks_desc").lastIndexOf("_");
  const keyToken = idx >= 0 ? (raw ?? "").slice(0, idx) : "clicks";
  const dirToken = idx >= 0 ? (raw ?? "").slice(idx + 1) : "desc";
  const key = (allowed as string[]).includes(keyToken)
    ? (keyToken as SortKey)
    : "clicks";
  const dir: SortDir = dirToken === "asc" ? "asc" : "desc";
  return { key, dir };
}

function delta(curr: number, prev: number) {
  if (prev === 0) return curr === 0 ? 0 : 1;
  return (curr - prev) / prev;
}

function fmtPct(n: number) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}

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
  }>;
}) {
  const { workspace: slug } = await props.params;
  const sp = await props.searchParams;

  const supabase = await createClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!workspace) notFound();

  const today = new Date();
  const end = sp.end ?? format(today, "yyyy-MM-dd");
  const start = sp.start ?? format(subDays(parseISO(end), 29), "yyyy-MM-dd");
  const periodDays = differenceInDays(parseISO(end), parseISO(start)) + 1;
  const priorEnd = format(subDays(parseISO(start), 1), "yyyy-MM-dd");
  const priorStart = format(
    subDays(parseISO(priorEnd), periodDays - 1),
    "yyyy-MM-dd",
  );

  const search = sp.search?.trim() ?? "";
  const { key: sortKey, dir: sortDir } = parseSort(sp.sort);

  const fetchMetrics = (s: string, e: string) =>
    supabase.rpc("get_page_metrics", {
      p_workspace_id: workspace.id,
      p_start: s,
      p_end: e,
    });

  const [{ data: currRows }, { data: priorRows }] = await Promise.all([
    fetchMetrics(start, end),
    fetchMetrics(priorStart, priorEnd),
  ]);

  const current = (currRows ?? []) as PageRow[];
  const prior = (priorRows ?? []) as PageRow[];
  const priorByPath = new Map(prior.map((r) => [r.page_path, r]));

  const filtered = search
    ? current.filter((r) =>
        r.page_path.toLowerCase().includes(search.toLowerCase()),
      )
    : current;

  const sorted = [...filtered].sort((a, b) => {
    const cmp =
      sortKey === "page_path"
        ? a.page_path.localeCompare(b.page_path)
        : (a[sortKey] as number) - (b[sortKey] as number);
    return sortDir === "asc" ? cmp : -cmp;
  });
  const visible = sorted.slice(0, DISPLAY_CAP);

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

      <p className="mt-4 text-xs text-zinc-500">
        {filtered.length.toLocaleString()} pages
        {sorted.length > DISPLAY_CAP
          ? ` · showing top ${DISPLAY_CAP.toLocaleString()}`
          : ""}
      </p>

      <div className="mt-2 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <SortHeader
                label="Page"
                col="page_path"
                slug={slug}
                params={{ start, end, search }}
                sortKey={sortKey}
                sortDir={sortDir}
              />
              <SortHeader
                label="Clicks"
                col="clicks"
                slug={slug}
                params={{ start, end, search }}
                sortKey={sortKey}
                sortDir={sortDir}
                align="right"
              />
              <SortHeader
                label="Impr."
                col="impressions"
                slug={slug}
                params={{ start, end, search }}
                sortKey={sortKey}
                sortDir={sortDir}
                align="right"
              />
              <SortHeader
                label="CTR"
                col="ctr"
                slug={slug}
                params={{ start, end, search }}
                sortKey={sortKey}
                sortDir={sortDir}
                align="right"
              />
              <SortHeader
                label="Avg pos"
                col="avg_position"
                slug={slug}
                params={{ start, end, search }}
                sortKey={sortKey}
                sortDir={sortDir}
                align="right"
              />
              <SortHeader
                label="Sessions"
                col="sessions"
                slug={slug}
                params={{ start, end, search }}
                sortKey={sortKey}
                sortDir={sortDir}
                align="right"
              />
              <SortHeader
                label="Engagement"
                col="engagement_rate"
                slug={slug}
                params={{ start, end, search }}
                sortKey={sortKey}
                sortDir={sortDir}
                align="right"
              />
              <SortHeader
                label="Conv."
                col="conversions"
                slug={slug}
                params={{ start, end, search }}
                sortKey={sortKey}
                sortDir={sortDir}
                align="right"
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {visible.map((r) => {
              const p = priorByPath.get(r.page_path);
              return (
                <tr key={r.page_path}>
                  <td className="max-w-md truncate px-3 py-2" title={r.page_path}>
                    {r.page_path}
                  </td>
                  <Cell
                    value={r.clicks.toLocaleString()}
                    delta={p ? delta(r.clicks, p.clicks) : undefined}
                  />
                  <Cell
                    value={r.impressions.toLocaleString()}
                    delta={p ? delta(r.impressions, p.impressions) : undefined}
                  />
                  <Cell
                    value={fmtRate(r.ctr)}
                    delta={p ? delta(r.ctr, p.ctr) : undefined}
                  />
                  <Cell
                    value={fmtPos(r.avg_position)}
                    delta={p ? delta(r.avg_position, p.avg_position) : undefined}
                    invert
                  />
                  <Cell
                    value={r.sessions.toLocaleString()}
                    delta={p ? delta(r.sessions, p.sessions) : undefined}
                  />
                  <Cell
                    value={fmtRate(r.engagement_rate)}
                    delta={
                      p ? delta(r.engagement_rate, p.engagement_rate) : undefined
                    }
                  />
                  <Cell
                    value={r.conversions.toLocaleString()}
                    delta={p ? delta(r.conversions, p.conversions) : undefined}
                  />
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-zinc-500">
                  No pages for this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      {children}
    </label>
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
  col: SortKey;
  slug: string;
  params: { start: string; end: string; search: string };
  sortKey: SortKey;
  sortDir: SortDir;
  align?: "left" | "right";
}) {
  const isActive = sortKey === col;
  const nextDir: SortDir = isActive && sortDir === "desc" ? "asc" : "desc";
  const qs = new URLSearchParams({
    start: params.start,
    end: params.end,
    sort: `${col}_${nextDir}`,
  });
  if (params.search) qs.set("search", params.search);
  const arrow = isActive ? (sortDir === "desc" ? "↓" : "↑") : "";
  return (
    <th className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : ""}`}>
      <Link
        href={`/${slug}/explore/pages?${qs.toString()}`}
        className="hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        {label} {arrow}
      </Link>
    </th>
  );
}

function Cell({
  value,
  delta,
  invert = false,
}: {
  value: string;
  delta?: number;
  invert?: boolean;
}) {
  // For position, lower is better — flip the delta colors.
  const goodWhenPositive = !invert;
  const isGood = delta !== undefined && (goodWhenPositive ? delta > 0 : delta < 0);
  const isBad = delta !== undefined && (goodWhenPositive ? delta < 0 : delta > 0);
  return (
    <td className="px-3 py-2 text-right tabular-nums">
      <div>{value}</div>
      {delta !== undefined && delta !== 0 && (
        <div
          className={`text-xs ${
            isGood
              ? "text-emerald-600"
              : isBad
                ? "text-red-600"
                : "text-zinc-400"
          }`}
        >
          {fmtPct(delta)}
        </div>
      )}
    </td>
  );
}
