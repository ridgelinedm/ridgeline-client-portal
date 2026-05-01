import { createClient } from "@supabase/supabase-js";

// Service-role client. Bypasses RLS — use ONLY in server-side cron jobs and
// admin actions, never in user-facing requests.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
