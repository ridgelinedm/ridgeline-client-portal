import Link from "next/link";
import { revalidatePath } from "next/cache";
import { format, subDays } from "date-fns";
import { Star, MousePointerClick, Eye, Plus, Search } from "lucide-react";
import { requireAgencyAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Sparkline, type SparkPoint } from "@/components/charts/Sparkline";

// Per-user data (favorites) + cross-workspace reads; never static.
export const dynamic = "force-dynamic";

const RANGES = [
  { key: "28d", label: "28d", days: 28 },
  { key: "90d", label: "90d", days: 90 },
  { key: "6mo", label: "6mo", days: 180 },
  { key: "12mo", label: "12mo", days: 365 },
  { key: "16mo", label: "16mo", days: 487 },
] as const;

const DEFAULT_RANGE = "90d";

function rangeStart(key: string): string {
  const r = RANGES.find((x) => x.key === key) ?? RANGES[1];
  return format(subDays(new Date(), r.days), "yyyy-MM-dd");
}

function compact(n: number): string {
  return Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

type Filters = { q: string; tag: string; range: string; fav: boolean };

function hrefWith(base: Filters, overrides: Partial<Filters>): string {
  const m = { ...base, ...overrides };
  const params = new URLSearchParams();
  if (m.q) params.set("q", m.q);
  if (m.tag) params.set("tag", m.tag);
  if (m.range && m.range !== DEFAULT_RANGE) params.set("range", m.range);
  if (m.fav) params.set("fav", "1");
  const qs = params.toString();
  return `/admin${qs ? `?${qs}` : ""}`;
}

// Toggle a starred client for the current admin. Uses the RLS-bound anon client
// (the self-manage policies on workspace_favorites), not the service role.
async function toggleFavorite(formData: FormData) {
  "use server";
  const workspaceId = String(formData.get("workspaceId"));
  const on = formData.get("on") === "1";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  if (on) {
    await supabase
      .from("workspace_favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("workspace_id", workspaceId);
  } else {
    await supabase
      .from("workspace_favorites")
      .insert({ user_id: user.id, workspace_id: workspaceId });
  }
  revalidatePath("/admin");
}

export default async function AdminGrid(props: {
  searchParams: Promise<{
    q?: string;
    tag?: string;
    range?: string;
    fav?: string;
  }>;
}) {
  const user = await requireAgencyAdmin();
  const sp = await props.searchParams;
  const filters: Filters = {
    q: sp.q?.trim() ?? "",
    tag: sp.tag ?? "",
    range: RANGES.find((r) => r.key === sp.range)?.key ?? DEFAULT_RANGE,
    fav: sp.fav === "1",
  };
  const start = rangeStart(filters.range);

  const admin = createAdminClient();

  const { data: workspaces } = await admin
    .from("workspaces")
    .select("id, slug, name, logo_url, primary_color, tags")
    .order("name", { ascending: true });

  const [{ data: favRows }, { data: seriesRows }] = await Promise.all([
    admin
      .from("workspace_favorites")
      .select("workspace_id")
      .eq("user_id", user.id),
    // One row per workspace per day — small even at 16mo × dozens of clients.
    // (At very large scale, move this to a per-workspace aggregate RPC.)
    admin
      .from("workspace_daily_series")
      .select("workspace_id, date, clicks, impressions")
      .gte("date", start)
      .order("date", { ascending: true })
      .limit(100000),
  ]);

  const favSet = new Set((favRows ?? []).map((r) => r.workspace_id));
  const seriesByWs = new Map<
    string,
    { date: string; clicks: number; impressions: number }[]
  >();
  for (const row of seriesRows ?? []) {
    const arr = seriesByWs.get(row.workspace_id) ?? [];
    arr.push(row);
    seriesByWs.set(row.workspace_id, arr);
  }

  const allTags = new Set<string>();
  let cards = (workspaces ?? []).map((w) => {
    const series = seriesByWs.get(w.id) ?? [];
    (w.tags ?? []).forEach((t: string) => allTags.add(t));
    return {
      id: w.id as string,
      slug: w.slug as string,
      name: w.name as string,
      color: (w.primary_color as string | null) ?? "#6366f1",
      tags: (w.tags as string[] | null) ?? [],
      clicks: series.reduce((a, r) => a + r.clicks, 0),
      impressions: series.reduce((a, r) => a + r.impressions, 0),
      spark: series.map((r) => ({ date: r.date, value: r.clicks })) as SparkPoint[],
      isFav: favSet.has(w.id),
    };
  });

  const qLower = filters.q.toLowerCase();
  if (filters.q)
    cards = cards.filter(
      (c) =>
        c.name.toLowerCase().includes(qLower) ||
        c.slug.toLowerCase().includes(qLower),
    );
  if (filters.tag) cards = cards.filter((c) => c.tags.includes(filters.tag));
  if (filters.fav) cards = cards.filter((c) => c.isFav);
  cards.sort(
    (a, b) => Number(b.isFav) - Number(a.isFav) || b.clicks - a.clicks,
  );

  const sortedTags = [...allTags].sort();
  const totalCount = workspaces?.length ?? 0;

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">All Clients</h1>
          <p className="text-sm text-zinc-500">
            {totalCount} {totalCount === 1 ? "client" : "clients"}
            {filters.fav ? " · starred" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form action="/admin" className="relative">
            {/* Preserve other filters across search */}
            {filters.tag && <input type="hidden" name="tag" value={filters.tag} />}
            {filters.range !== DEFAULT_RANGE && (
              <input type="hidden" name="range" value={filters.range} />
            )}
            {filters.fav && <input type="hidden" name="fav" value="1" />}
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="Search clients"
              className="w-48 rounded-lg border border-zinc-200 bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
            />
          </form>
          <Link
            href={hrefWith(filters, { fav: !filters.fav })}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${
              filters.fav
                ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-800"
            }`}
          >
            <Star className="h-4 w-4" fill={filters.fav ? "currentColor" : "none"} />
            Starred
          </Link>
          <Link
            href="/admin/onboarding"
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <Plus className="h-4 w-4" />
            Add client
          </Link>
        </div>
      </header>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {/* Range selector */}
        <div className="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-800">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={hrefWith(filters, { range: r.key })}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                filters.range === r.key
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              {r.label}
            </Link>
          ))}
        </div>
        {/* Tag chips */}
        {sortedTags.map((t) => (
          <Link
            key={t}
            href={hrefWith(filters, { tag: filters.tag === t ? "" : t })}
            className={`rounded-full border px-3 py-1 text-xs ${
              filters.tag === t
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                : "border-zinc-200 text-zinc-600 hover:border-zinc-400 dark:border-zinc-800 dark:text-zinc-400"
            }`}
          >
            {t}
          </Link>
        ))}
      </div>

      {cards.length === 0 ? (
        <div className="mt-16 text-center text-sm text-zinc-500">
          {totalCount === 0 ? (
            <>
              No clients yet.{" "}
              <Link href="/admin/onboarding" className="underline">
                Add your first client
              </Link>
              .
            </>
          ) : (
            "No clients match these filters."
          )}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <div
              key={c.id}
              className="relative rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
            >
              <form
                action={toggleFavorite}
                className="absolute right-2.5 top-2.5 z-10"
              >
                <input type="hidden" name="workspaceId" value={c.id} />
                <input type="hidden" name="on" value={c.isFav ? "1" : "0"} />
                <button
                  type="submit"
                  aria-label={c.isFav ? "Unstar" : "Star"}
                  className={`rounded-md p-1 ${
                    c.isFav
                      ? "text-amber-500"
                      : "text-zinc-300 hover:text-zinc-500 dark:text-zinc-700"
                  }`}
                >
                  <Star className="h-4 w-4" fill={c.isFav ? "currentColor" : "none"} />
                </button>
              </form>
              <Link href={`/${c.slug}`} className="block p-4">
                <div className="flex items-center gap-2 pr-6">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="truncate text-sm font-medium" title={c.name}>
                    {c.name}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500">
                  <span className="flex items-center gap-1" title="Clicks">
                    <MousePointerClick className="h-3.5 w-3.5" />
                    <span className="tabular-nums text-zinc-800 dark:text-zinc-200">
                      {compact(c.clicks)}
                    </span>
                  </span>
                  <span className="flex items-center gap-1" title="Impressions">
                    <Eye className="h-3.5 w-3.5" />
                    <span className="tabular-nums text-zinc-800 dark:text-zinc-200">
                      {compact(c.impressions)}
                    </span>
                  </span>
                </div>
                <div className="mt-3">
                  <Sparkline data={c.spark} color={c.color} />
                </div>
                {c.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-900"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
