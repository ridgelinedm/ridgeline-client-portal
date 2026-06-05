import { createClient } from "@supabase/supabase-js";

// Service-role client. Bypasses RLS — use ONLY in server-side cron jobs and
// agency-admin paths, never in user-facing requests.
//
// Authorized importers (keep this list current; audit any addition):
//   - src/app/api/cron/refresh/route.ts   (daily refresh loop)
//   - src/app/api/admin/*                 (backfill, recompute-health, workspaces)
//   - src/app/admin/*                     (agency dashboard pages)
// Every admin path MUST gate on requireAgencyAdmin()/isAgencyAdminRequest()
// (src/lib/auth/admin.ts) BEFORE using this client; cron paths are gated by the
// CRON_SECRET bearer.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
