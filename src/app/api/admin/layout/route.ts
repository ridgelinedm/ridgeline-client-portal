import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAgencyAdminRequest } from "@/lib/auth/admin";
import { ALL_WIDGET_TYPES } from "@/lib/widgets/types";

// Save a workspace's custom dashboard layout. Agency-admin only.
export const maxDuration = 60;

const LayoutSchema = z.object({
  version: z.number().int(),
  widgets: z
    .array(
      z.object({
        id: z.string().min(1),
        type: z
          .string()
          .refine(
            (t) => (ALL_WIDGET_TYPES as string[]).includes(t),
            "unknown widget type",
          ),
        w: z.number().int().min(1).max(3),
      }),
    )
    .max(40),
});

const BodySchema = z.object({
  workspace_id: z.string().uuid(),
  layout: LayoutSchema,
});

export async function POST(request: Request) {
  if (!(await isAgencyAdminRequest(request))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "bad request" },
      { status: 400 },
    );
  }
  const { workspace_id, layout } = parsed.data;

  // Stamp who edited it (session user; null on server-to-server calls).
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();

  const admin = createAdminClient();
  const { error } = await admin.from("workspace_layouts").upsert(
    {
      workspace_id,
      layout,
      version: layout.version,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    },
    { onConflict: "workspace_id" },
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
