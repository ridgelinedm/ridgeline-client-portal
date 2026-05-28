// Dump workspaces, memberships, and matching auth users via service role.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: workspaces } = await supabase.from("workspaces").select("*");
console.log("workspaces:", JSON.stringify(workspaces, null, 2));

const { data: members } = await supabase.from("workspace_members").select("*");
console.log("workspace_members:", JSON.stringify(members, null, 2));

const { data: users, error: userErr } = await supabase.auth.admin.listUsers();
if (userErr) console.error("listUsers error:", userErr);
console.log(
  "auth users:",
  JSON.stringify(
    users?.users?.map((u) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
    })),
    null,
    2,
  ),
);
