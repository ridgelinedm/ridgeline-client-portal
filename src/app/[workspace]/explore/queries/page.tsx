import { notFound } from "next/navigation";
import Link from "next/link";
import { differenceInDays, format, parseISO, subDays } from "date-fns";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type DailyRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type AggregatedRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type SortKey = "clicks" | "impressions" | "ctr" | "position" | "query";
type SortDir = "asc" | "desc";

const ROW_CAP = 50000;
const DISPLAY_CAP = 1000;

function aggregate(rows: DailyRow[]): AggregatedRow[] {
  const byQuery = new Map<
    string,
    {
      clicks: number;
      impressions: number;
      ctrNumerator: number;
      positionNumerator: number;
    }
  >();
  for (const r of rows) {
    const e = byQuery.get(r.query) ?? {
      clicks: 0,
      impressions: 0,
      ctrNumerator: 0,
      positionNumerator: 0,
    };
    e.clicks += r.clicks;
    e.impressions += r.impressions;
    // CTR and avg position are weighted by impressions so the daily averages
    // roll up correctly.
    e.ctrNumerator += r.ctr * r.impressions;
    e.positionNumerator += r.position * r.impressions;
    byQuery.set(r.query, e);
  }
  return [...byQuery.entries()].map(([query, e]) => ({
    query,
    clicks: e.clicks,
    impressions: e.impressions,
    ctr: e.impressions > 0 ? e.ctrNumerator / e.impressions : 0,
    position: e.impressions > 0 ? e.positionNumerator / e.impressions : 0,
  }));
}

function parseSort(raw: string | undefined): { key: SortKey; dir: SortDir } {
  const allowed: SortKey[] = [
    "clicks",
    "impressions",
    "ctr",
    "position",
    "query",
  ];
  const [keyRaw, dirRaw] = (raw ?? "clicks_desc").split("_");
  const key = (allowed as string[]).includes(keyRaw)
    ? (keyRaw as SortKey)
    : "clicks";
  const dir: SortDir = dirRaw === "asc" ? "asc" : "desc";
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

function fmtCtr(n: number) {
  return `${(n * 100).toFixed(2)}%`;
}

function fmtPos(n: number) {
  return n.toFixed(1);
}

export default async function QueriesExplorer(props: {
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

  let currentQuery = supabase
    .from("gsc_query_daily")
    .select("query,clicks,impressions,ctr,position")
    .eq("workspace_id", workspace.id)
    .gte("date", start)
    .lte("date", end)
    .range(0, ROW_CAP - 1);
  let priorQuery = supabase
    .from("gsc_query_daily")
    .select("query,clicks,impressions,ctr,position")
    .eq("workspace_id", workspace.id)
    .gte("date", priorStart)
    .lte("date", priorEnd)
    .range(0, ROW_CAP - 1);
  if (search) {
    currentQuery = currentQuery.ilike("query", `%${search}%`);
    priorQuery = priorQuery.ilike("query", `%${search}%`);
  }

  const [{ data: currentRows }, { data: priorRows }] = await Promise.all([
    currentQuery,
    priorQuery,
  ]);

  const current = aggregate((currentRows ?? []) as DailyRow[]);
  const prior = aggregate((priorRows ?? []) as DailyRow[]);
  const priorByQuery = new Map(prior.map((r) => [r.query, r]));

  const sorted = [...current].sort((a, b) => {
    const cmp =
      sortKey === "query"
        ? a.query.localeCompare(b.query)
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
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Queries
          </h1>
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
            placeholder="keyword filter"
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
        {current.length.toLocaleString()} queries
        {sorted.length > DISPLAY_CAP
          ? ` · showing top ${DISPLAY_CAP.toLocaleString()}`
          : ""}
      </p>

      <div className="mt-2 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <SortHeader
                label="Query"
                col="query"
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
                label="Impressions"
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
                label="Avg position"
                col="position"
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
              const p = priorByQuery.get(r.query);
              return (
                <tr key={r.query}>
                  <td className="px-3 py-2">{r.query}</td>
                  <Cell value={r.clicks.toLocaleString()} delta={p ? delta(r.clicks, p.clicks) : undefined} />
                  <Cell
                    value={r.impressions.toLocaleString()}
                    delta={p ? delta(r.impressions, p.impressions) : undefined}
                  />
                  <Cell value={fmtCtr(r.ctr)} delta={p ? delta(r.ctr, p.ctr) : undefined} />
                  <Cell
                    value={fmtPos(r.position)}
                    delta={p ? delta(r.position, p.position) : undefined}
                    invert
                  />
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-zinc-500">
                  No queries for this period.
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
        href={`/${slug}/explore/queries?${qs.toString()}`}
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
  // For position, lower is better — so a "negative delta" is actually good.
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
