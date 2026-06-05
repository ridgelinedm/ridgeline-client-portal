import { notFound } from "next/navigation";
import Link from "next/link";
import { agencyScopedClient, isAgencyAdmin } from "@/lib/auth/admin";
import { ClientHeader } from "@/components/ClientHeader";
import { loadDashboardData } from "@/lib/widgets/data";
import { renderWidget } from "@/components/widgets";
import { DEFAULT_LAYOUT, widthClass, type Layout } from "@/lib/widgets/types";

export const dynamic = "force-dynamic";

const navLink =
  "rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";

export default async function WorkspaceDashboard(props: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await props.params;
  const supabase = await agencyScopedClient();
  const isAdmin = await isAgencyAdmin();

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!workspace) notFound();

  const [{ data: layoutRow }, data] = await Promise.all([
    supabase
      .from("workspace_layouts")
      .select("layout")
      .eq("workspace_id", workspace.id)
      .maybeSingle(),
    loadDashboardData(supabase, workspace.id),
  ]);

  // Fall back to the default layout when there's no saved row (or it's empty).
  const saved = layoutRow?.layout as Layout | undefined;
  const layout = saved && saved.widgets?.length ? saved : DEFAULT_LAYOUT;
  const color = (workspace.primary_color as string | null) ?? "#6366f1";

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <ClientHeader
        workspace={workspace}
        subtitle={`Last 30 days · ${data.rangeStart} → ${data.rangeEnd}`}
      >
        <Link href={`/${slug}/explore/queries`} className={navLink}>
          Queries →
        </Link>
        <Link href={`/${slug}/explore/pages`} className={navLink}>
          Pages →
        </Link>
        {isAdmin && (
          <Link
            href={`/admin/${slug}/layout`}
            className="rounded border border-zinc-900 bg-zinc-900 px-3 py-1 text-white hover:bg-zinc-700 dark:border-white dark:bg-white dark:text-zinc-900"
          >
            Edit layout
          </Link>
        )}
      </ClientHeader>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        {layout.widgets.map((w) => (
          <div key={w.id} className={widthClass(w.w)}>
            {renderWidget(w.type, data, color)}
          </div>
        ))}
      </div>
    </main>
  );
}
