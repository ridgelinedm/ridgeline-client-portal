import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAgencyAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_LAYOUT, type Layout } from "@/lib/widgets/types";
import { LayoutEditor } from "./LayoutEditor";

export const dynamic = "force-dynamic";

export default async function LayoutEditorPage(props: {
  params: Promise<{ workspace: string }>;
}) {
  await requireAgencyAdmin();
  const { workspace: slug } = await props.params;

  const admin = createAdminClient();
  const { data: workspace } = await admin
    .from("workspaces")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!workspace) notFound();

  const { data: layoutRow } = await admin
    .from("workspace_layouts")
    .select("layout")
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  const saved = layoutRow?.layout as Layout | undefined;
  const initial = saved && saved.widgets?.length ? saved : DEFAULT_LAYOUT;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        <ArrowLeft className="h-4 w-4" />
        All clients
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        Customize dashboard — {workspace.name}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Arrange the widgets this client sees at{" "}
        <Link href={`/${workspace.slug}`} className="underline">
          /{workspace.slug}
        </Link>
        .
      </p>
      <LayoutEditor
        workspaceId={workspace.id}
        slug={workspace.slug}
        initialLayout={initial}
      />
    </main>
  );
}
