import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspace:workspaces(slug, name)")
    .order("created_at", { ascending: true });

  // Single workspace? Drop them straight in.
  if (memberships?.length === 1) {
    const slug = (memberships[0].workspace as unknown as { slug: string })
      ?.slug;
    if (slug) redirect(`/${slug}`);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Your dashboards</h1>
      <ul className="mt-8 grid gap-3">
        {(memberships ?? []).map((m, i) => {
          const w = m.workspace as unknown as { slug: string; name: string };
          return (
            <li key={i}>
              <a
                href={`/${w.slug}`}
                className="block rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <span className="font-medium">{w.name}</span>
              </a>
            </li>
          );
        })}
        {!memberships?.length && (
          <li className="text-sm text-zinc-500">
            No workspaces yet — your account manager will add you to one.
          </li>
        )}
      </ul>
    </main>
  );
}
