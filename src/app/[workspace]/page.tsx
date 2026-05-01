import { notFound } from "next/navigation";
import { subDays, format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { MetricCard } from "@/components/MetricCard";
import { TimeseriesChart } from "@/components/TimeseriesChart";

export const dynamic = "force-dynamic";

type DailyRow = {
  metric_date: string;
  metric_key: string;
  metric_value: number;
};

function sumKey(rows: DailyRow[], key: string): number {
  return rows
    .filter((r) => r.metric_key === key)
    .reduce((acc, r) => acc + Number(r.metric_value), 0);
}

function seriesFor(rows: DailyRow[], key: string) {
  return rows
    .filter((r) => r.metric_key === key)
    .map((r) => ({
      date: r.metric_date,
      value: Number(r.metric_value),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export default async function WorkspaceDashboard(props: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await props.params;
  const supabase = await createClient();

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!workspace) notFound();

  const endDate = format(new Date(), "yyyy-MM-dd");
  const startDate = format(subDays(new Date(), 30), "yyyy-MM-dd");

  const { data: rows } = await supabase
    .from("metric_snapshots")
    .select("metric_date, metric_key, metric_value, source")
    .eq("workspace_id", workspace.id)
    .gte("metric_date", startDate)
    .lte("metric_date", endDate)
    .is("dimensions", null);

  const all = (rows ?? []) as DailyRow[];

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {workspace.name}
          </h1>
          <p className="text-sm text-zinc-500">
            Last 30 days · {startDate} → {endDate}
          </p>
        </div>
      </header>

      <section className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard
          label="GSC Clicks"
          value={sumKey(all, "clicks")}
        />
        <MetricCard
          label="GSC Impressions"
          value={sumKey(all, "impressions")}
        />
        <MetricCard label="GA4 Sessions" value={sumKey(all, "sessions")} />
        <MetricCard
          label="Ahrefs Org. Traffic"
          value={sumKey(all, "organic_traffic")}
          note="latest snapshot"
        />
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-500">
            Search Console — clicks
          </h2>
          <TimeseriesChart data={seriesFor(all, "clicks")} />
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-500">GA4 — sessions</h2>
          <TimeseriesChart data={seriesFor(all, "sessions")} />
        </div>
      </section>
    </main>
  );
}
