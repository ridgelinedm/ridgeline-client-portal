import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Hard server-side gate for agency-admin-only pages and actions.
//
// Verifies the session with the RLS-bound anon client, then checks membership
// in `agency_admins` (self-readable under RLS). RLS is intentionally NOT widened
// for admins — cross-workspace reads happen via the service-role client AFTER
// this gate passes. Therefore: ALWAYS call requireAgencyAdmin() before any
// createAdminClient() usage on an admin path. Non-admins are bounced to their
// own portal at "/".
export async function requireAgencyAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: row } = await supabase
    .from("agency_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!row) redirect("/");
  return user;
}

// Non-redirecting check, for places that branch on admin status (e.g. the home
// page deciding whether to send the user to /admin).
export async function isAgencyAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: row } = await supabase
    .from("agency_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return Boolean(row);
}

// Admin gate for JSON API routes (returns a boolean instead of redirecting).
// Accepts an agency-admin session OR the cron secret for server-to-server calls.
// Routes should respond 403 when this is false.
export async function isAgencyAdminRequest(request: Request): Promise<boolean> {
  const auth = request.headers.get("authorization");
  if (auth && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  return isAgencyAdmin();
}

// Pick the Supabase client for reading a single client workspace on the shared
// /[workspace] pages: the service-role client for agency admins (so they can
// view ANY client, like the all-clients grid does), otherwise the RLS-bound
// client (a client only sees workspaces they're a member of). Server-only —
// the service-role client is constructed ONLY after confirming admin status.
export async function agencyScopedClient() {
  if (await isAgencyAdmin()) return createAdminClient();
  return createClient();
}
