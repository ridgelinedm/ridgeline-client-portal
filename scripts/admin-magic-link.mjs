// Generate a magic-link URL via Supabase admin API, bypassing email + rate limits.
// Usage: node scripts/admin-magic-link.mjs <email>
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

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/admin-magic-link.mjs <email>");
  process.exit(1);
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data, error } = await supabase.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: {
    redirectTo: "https://ridgeline-client-portal.vercel.app/",
  },
});

if (error) {
  console.error("error:", error);
  process.exit(1);
}

console.log(data.properties.action_link);
