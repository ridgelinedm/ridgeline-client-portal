# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- BEGIN:nextjs-agent-rules -->
## This is NOT the Next.js you know

This repo uses Next.js 16 (App Router, React 19). It has breaking changes from older Next.js versions — APIs, conventions, and file structure may all differ from your training data. Before writing non-trivial Next.js code, consult `node_modules/next/dist/docs/` for the actual current API. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## What this is

Ridgeline Client Portal — a white-labeled, multi-tenant SEO analytics dashboard for Ridgeline Digital Marketing's agency clients. Each client (workspace) sees their own metrics pulled daily from Google Search Console, GA4, and Ahrefs into a unified read-only dashboard. Clients sign in via Supabase magic-link auth and only see their own workspace's data, enforced by Postgres RLS.

Repo on GitHub: `ridgelinedm/ridgeline-client-portal`. Deploys to Vercel. **Deployment is the current pain point — see the Deployment section below.**

## Stack

- **Framework**: Next.js 16 App Router, React 19
- **Auth + DB**: Supabase (`@supabase/ssr`, `@supabase/supabase-js`)
- **Connectors**: `googleapis` (GSC + GA4), raw `fetch` (Ahrefs)
- **Validation**: zod
- **UI**: Tailwind 4 (PostCSS plugin), recharts, lucide-react
- **Scheduling**: Vercel Cron

## Commands

```bash
npm run dev    # next dev on :3000
npm run build  # next build
npm run start  # serve prod build locally
npm run lint   # eslint via eslint-config-next
```

## Architecture, the non-obvious parts

**Three concepts to keep in your head**: `workspaces` (one per client), `workspace_members` (user ↔ workspace with role `admin` or `client`), and `metric_snapshots` (the daily fact table). RLS in Supabase scopes every read to the workspaces the current user is a member of.

**Cron-driven refresh, not on-demand fetching.** `/api/cron/refresh` (in `src/app/api/cron/refresh/route.ts`) is invoked by Vercel Cron daily at 09:00 UTC (configured in `vercel.json`). It loops over all workspaces, pulls the last ~7 days from each enabled connector, and upserts rows into `metric_snapshots` keyed by `(workspace_id, source, metric_date, metric_key, dimensions_hash)`. The dashboard reads from this table; it never calls Google/Ahrefs APIs in the request path. Auth on this endpoint is `Authorization: Bearer ${CRON_SECRET}` — Vercel injects it automatically when calling the cron.

**Connector credentialing model**:
- **GSC + GA4**: a single agency-wide Google OAuth refresh token (`GOOGLE_REFRESH_TOKEN`) authorizes access to every client's GSC property and GA4 property. The client mapping lives in `workspaces.gsc_property` / `workspaces.ga4_property_id` per row. Connector code in `src/lib/connectors/gsc.ts` and `ga4.ts`.
- **Ahrefs**: single API key (`AHREFS_API_KEY`) for all domains; per-workspace mapping via `workspaces.ahrefs_domain`. Code in `src/lib/connectors/ahrefs.ts`.
- **GBP (Google Business Profile)**: stubbed, awaiting API access approval.

**RLS bypass for the cron job + agency admin.** The cron and agency-admin paths use `SUPABASE_SERVICE_ROLE_KEY` (via `src/lib/supabase/admin.ts`) to read across all workspaces regardless of who initiated the request. RLS is **not** widened for admins — cross-workspace reads go through the service-role client *after* a hard gate. Every agency-admin path MUST gate before using the admin client: pages (`src/app/admin/*`) call `requireAgencyAdmin()`, JSON routes (`src/app/api/admin/*`) call `isAgencyAdminRequest()` (accepts an admin session OR the `CRON_SECRET` bearer) — both in `src/lib/auth/admin.ts`. Cron paths (`/api/cron/*`) are gated by `CRON_SECRET`. This key must never reach the browser. Audit any new code path touching the admin client (the authorized-importer list is in `src/lib/supabase/admin.ts`).

**Routing**: App Router. `src/app/layout.tsx` → `page.tsx` (workspace list or redirect to default) → `src/app/[workspace]/page.tsx` (dashboard). Workspace page exports `dynamic = "force-dynamic"` — do not try to statically generate it; data is per-user and lives behind RLS. Public routes (allowed without auth) live in `src/proxy.ts` (Next.js 16 renamed `middleware` → `proxy`): `/login`, `/auth/*`, `/api/cron/*`, `/api/admin/*`, `/api/auth/*`. (`/api/admin/*` is past the proxy but self-gated by `isAgencyAdminRequest()`; the `/admin/*` *pages* stay behind proxy auth.)

## Deployment

The user got stuck deploying this to Vercel. Likely causes to check first when resuming:

1. **All env vars set in Vercel project settings.** Every var in `.env.example` must be present in the Vercel project — both `NEXT_PUBLIC_*` (browser-safe) and the server-only secrets. Missing `CRON_SECRET` → cron returns 401. Missing `SUPABASE_SERVICE_ROLE_KEY` → cron 500. Missing Google vars → connectors fail silently per-workspace, no build error.
2. **`SUPABASE_SERVICE_ROLE_KEY` server-only.** Referenced only via `src/lib/supabase/admin.ts`, imported by the cron refresh route (`src/app/api/cron/refresh`) and the agency-admin paths (`src/app/admin/*`, `src/app/api/admin/*`) — see the authorized-importer list in `admin.ts`. If it's read from a client component or a page rendered client-side, Next.js will refuse to build it.
3. **Google refresh token validity.** `GOOGLE_REFRESH_TOKEN` is long-lived but can be revoked. No retry/recovery logic in the cron path — fail mode is silent.
4. **Daily refresh is driven by GitHub Actions, not Vercel Cron.** The project is on Hobby, where Vercel ignores the `crons` block in `vercel.json`. `.github/workflows/cron.yml` hits `GET /api/cron/refresh` daily with `Authorization: Bearer ${CRON_SECRET}` (set `CRON_SECRET` + `APP_URL` as repo secrets). The cron loops all workspaces in-process (`src/lib/jobs/pulls.ts`), then writes the `workspace_daily_series` grid rollup + `workspace_health_daily`. It's a single sequential loop under a 60s budget — fine for a handful of clients; per-workspace fan-out is the scaling path if the client count grows. `vercel.json` is kept so native Vercel Cron "just works" if the project later upgrades to Pro.
5. **No build-time env access** is currently required, so `next build` should not fail purely on missing secrets. If it does, something has been added that reads `process.env.*` at module top-level during build — look for that.

`next.config.ts` is empty. `vercel.json` only configures the cron schedule. No edge runtime declarations anywhere.

## Env vars

From `.env.example`:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — browser-safe
- `SUPABASE_SERVICE_ROLE_KEY` — **server-only**, RLS bypass
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_REFRESH_TOKEN` — agency-wide Google auth
- `AHREFS_API_KEY` — agency-wide
- `CRON_SECRET` — Bearer token for cron endpoint auth

## Supabase

Migrations live in `supabase/`. Core: `workspaces`, `workspace_members`, legacy `metric_snapshots`. Dimensional fact tables (per phase): `gsc_{query,page,query_page,device,country}_daily`, `ga4_{page,source,device}_daily`, `ahrefs_{domain_daily,organic_keywords,top_pages}`. Rollups: `workspace_health_daily` (overview) and `workspace_daily_series` (all-clients grid sparklines). Agency-pivot tables: `agency_admins`, `workspace_favorites`, `workspace_layouts`, `backfill_jobs`, plus `workspaces.tags`. Every table has RLS; each dimensional/rollup table uses a composite natural-key PK so the cron upserts are idempotent. `backfill_jobs` has RLS enabled with no policy (service-role only).
