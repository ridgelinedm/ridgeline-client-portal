import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAgencyAdminRequest } from "@/lib/auth/admin";

// Empty form strings → null for nullable connector/branding columns.
const nullable = z
  .string()
  .trim()
  .transform((s) => (s === "" ? null : s))
  .nullable()
  .optional();

const schema = z.object({
  name: z.string().trim().min(1, "name required"),
  slug: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, dashes"),
  gsc_property: nullable,
  ga4_property_id: nullable,
  gbp_location_id: nullable,
  ahrefs_domain: nullable,
  logo_url: nullable,
  primary_color: nullable,
  tags: z.array(z.string().trim()).optional(),
  inviteEmail: z
    .string()
    .trim()
    .email()
    .optional()
    .or(z.literal("")),
});

export async function POST(request: Request) {
  if (!(await isAgencyAdminRequest(request))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid input" },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const admin = createAdminClient();

  const { data: workspace, error } = await admin
    .from("workspaces")
    .insert({
      name: input.name,
      slug: input.slug,
      gsc_property: input.gsc_property ?? null,
      ga4_property_id: input.ga4_property_id ?? null,
      gbp_location_id: input.gbp_location_id ?? null,
      ahrefs_domain: input.ahrefs_domain ?? null,
      logo_url: input.logo_url ?? null,
      primary_color: input.primary_color ?? null,
      tags: input.tags ?? [],
    })
    .select("id, slug, name")
    .single();

  if (error) {
    // 23505 = unique_violation (duplicate slug)
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  // Optionally invite the client as a member (role 'client').
  let invite: { ok: boolean; error?: string } | null = null;
  if (input.inviteEmail) {
    const { data: invited, error: inviteErr } =
      await admin.auth.admin.inviteUserByEmail(input.inviteEmail);
    if (inviteErr || !invited?.user) {
      invite = { ok: false, error: inviteErr?.message ?? "invite failed" };
    } else {
      const { error: memberErr } = await admin
        .from("workspace_members")
        .insert({
          workspace_id: workspace.id,
          user_id: invited.user.id,
          role: "client",
        });
      invite = memberErr
        ? { ok: false, error: memberErr.message }
        : { ok: true };
    }
  }

  return NextResponse.json({ ok: true, workspace, invite });
}
