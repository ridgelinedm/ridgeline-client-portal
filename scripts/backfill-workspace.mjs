// Backfill 16 months of GSC + GA4 history for one workspace.
//
// Usage:
//   npm run dev                                              # in another terminal
//   node scripts/backfill-workspace.mjs <slug> [months=16] [baseUrl=http://localhost:3000]
//
// Hits the local dev server's admin endpoints. Localhost has no maxDuration
// limit so we can afford large per-call windows. Chunks monthly so each
// request returns a manageable result row count.
//
// Requires CRON_SECRET, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY
// in .env.local.

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

const slug = process.argv[2];
const months = Number(process.argv[3] ?? 16);
const baseUrl = process.argv[4] ?? "http://localhost:3000";

if (!slug) {
  console.error(
    "Usage: node scripts/backfill-workspace.mjs <slug> [months=16] [baseUrl=http://localhost:3000]",
  );
  process.exit(1);
}

if (!env.CRON_SECRET) {
  console.error("CRON_SECRET missing from .env.local");
  process.exit(1);
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: workspace, error: wsErr } = await supabase
  .from("workspaces")
  .select("id, slug, name")
  .eq("slug", slug)
  .maybeSingle();

if (wsErr || !workspace) {
  console.error(`workspace '${slug}' not found:`, wsErr?.message ?? "no row");
  process.exit(1);
}

console.log(
  `backfilling ${months}mo for workspace '${workspace.slug}' (${workspace.id}) via ${baseUrl}`,
);

// ─── Chunk the date range into monthly windows, newest first ────────────────
const today = new Date();
const overallEnd = isoDate(today);
const overallStart = isoDate(addMonths(today, -months));
const windows = monthlyWindows(overallStart, overallEnd);
console.log(`${windows.length} month-windows: ${overallStart} → ${overallEnd}`);

// ─── Pass 1: pull source data ───────────────────────────────────────────────
for (const [i, { start, end }] of windows.entries()) {
  const tag = `[${i + 1}/${windows.length}] ${start} → ${end}`;
  process.stdout.write(`${tag} pulling… `);
  const t0 = Date.now();
  const res = await postJson(`${baseUrl}/api/admin/backfill`, {
    workspace_id: workspace.id,
    start_date: start,
    end_date: end,
  });
  if (!res.ok) {
    console.error(`failed (${res.status}):`, await res.text());
    process.exit(1);
  }
  const body = await res.json();
  const counts = (body.results ?? [])
    .map((r) => `${r.source}=${r.error ? `ERR(${r.error})` : r.rows}`)
    .join(" ");
  console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s — ${counts}`);
}

// ─── Pass 2: recompute workspace_health_daily for every date ────────────────
console.log(`recomputing health rollup for ${overallStart} → ${overallEnd}…`);
const t0 = Date.now();
const res = await postJson(`${baseUrl}/api/admin/recompute-health`, {
  workspace_id: workspace.id,
  start_date: overallStart,
  end_date: overallEnd,
});
if (!res.ok) {
  console.error(`failed (${res.status}):`, await res.text());
  process.exit(1);
}
const body = await res.json();
console.log(
  `recomputed ${body.dates_recomputed} dates in ${Math.round((Date.now() - t0) / 1000)}s`,
);

console.log("done.");

// ─── Helpers ────────────────────────────────────────────────────────────────

function postJson(url, body) {
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CRON_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function addMonths(d, n) {
  const copy = new Date(d);
  copy.setUTCMonth(copy.getUTCMonth() + n);
  return copy;
}

function addDays(d, n) {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

// Split [start, end] into adjacent monthly windows. Each window is a calendar
// month (e.g. 2024-11-01 → 2024-11-30) clamped to the requested bounds; the
// final window ends on `end`.
function monthlyWindows(startIso, endIso) {
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  const out = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor <= end) {
    const next = addMonths(cursor, 1);
    const winStart = cursor < start ? start : cursor;
    const winEnd = addDays(next, -1) > end ? end : addDays(next, -1);
    out.push({ start: isoDate(winStart), end: isoDate(winEnd) });
    cursor = next;
  }
  return out;
}
