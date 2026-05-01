# Ridgeline Client Portal

Self-serve reporting dashboard for Ridgeline clients. Pulls data from Google
Search Console, GA4, Google Business Profile, and Ahrefs into a single
white-labeled view per client.

## Stack
- **Next.js** (App Router) on Vercel
- **Supabase** — Postgres + Auth (magic-link), with RLS enforcing per-client isolation
- **Recharts** for charts
- **googleapis** for GSC / GA4 / GBP, raw `fetch` for Ahrefs API v3

## Architecture

```
[Vercel Cron — daily 9am UTC]
    ↓
/api/cron/refresh
    → fetches last ~7 days from each connector for each workspace
    → upserts into `metric_snapshots`

[Client visits /<workspace-slug>]
    ↓
Server component reads from `metric_snapshots` (instant, no API hops)
RLS scopes the query to workspaces the user is a member of
```

One Google OAuth refresh token (the agency's account) covers GSC + GA4 + GBP
for every property the agency has been granted access to. Ahrefs uses a single
API key for all domains.

## Data model

- `workspaces` — one row per client (with connector config + branding fields)
- `workspace_members` — links Supabase auth users to workspaces (`admin` or `client`)
- `metric_snapshots` — daily metric values, one row per (workspace, source, date, metric_key, dimensions)

## Local dev

1. `cp .env.example .env.local` and fill in.
2. Apply the migration in `supabase/migrations/` — easiest path is to paste it
   into the Supabase SQL editor for now.
3. `npm run dev`

## Connector status

| Source | Status      | Notes                                                |
|--------|-------------|------------------------------------------------------|
| GSC    | done        | `fetchGscDaily`, `fetchGscTopQueries`               |
| GA4    | done        | `fetchGa4Daily`, `fetchGa4LandingPages`             |
| GBP    | stubbed     | Pending Business Profile API access approval        |
| Ahrefs | done        | `fetchAhrefsDomainSnapshot`, `fetchAhrefsTopKeywords` |

## TODO (post-MVP)

- Manual `Refresh now` button → `/api/refresh/[workspace]`
- Date range picker (currently hardcoded to last 30 days)
- Per-workspace branding (logo, primary color)
- GBP connector once API is approved
- Top queries / landing pages / keywords tables on the workspace page
- Admin UI for adding workspaces and inviting client users
