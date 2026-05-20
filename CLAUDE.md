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

**RLS bypass for the cron job**. The cron route uses `SUPABASE_SERVICE_ROLE_KEY` (via `src/lib/supabase/admin.ts`) to read all workspaces and write `metric_snapshots` regardless of who initiated the request. This key must never reach the browser. Audit any new code paths touching the admin client to confirm they stay server-only.

**Routing**: App Router. `src/app/layout.tsx` → `page.tsx` (workspace list or redirect to default) → `src/app/[workspace]/page.tsx` (dashboard). Workspace page exports `dynamic = "force-dynamic"` — do not try to statically generate it; data is per-user and lives behind RLS. Public routes (allowed without auth) live in `src/middleware.ts`: `/login`, `/auth/*`, `/api/cron/*`, `/api/auth/*`.

## Deployment

The user got stuck deploying this to Vercel. Likely causes to check first when resuming:

1. **All env vars set in Vercel project settings.** Every var in `.env.example` must be present in the Vercel project — both `NEXT_PUBLIC_*` (browser-safe) and the server-only secrets. Missing `CRON_SECRET` → cron returns 401. Missing `SUPABASE_SERVICE_ROLE_KEY` → cron 500. Missing Google vars → connectors fail silently per-workspace, no build error.
2. **`SUPABASE_SERVICE_ROLE_KEY` server-only.** Should only be referenced in `src/lib/supabase/admin.ts` and `src/app/api/cron/refresh/route.ts`. If it's read from a client component or a page rendered client-side, Next.js will refuse to build it.
3. **Google refresh token validity.** `GOOGLE_REFRESH_TOKEN` is long-lived but can be revoked. No retry/recovery logic in the cron path — fail mode is silent.
4. **Vercel Cron requires a Pro plan or higher** for daily schedules. If the project is on Hobby, the `crons` block in `vercel.json` is ignored (or rejected) — verify the plan.
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

Migrations live in `supabase/`. Three tables: `workspaces`, `workspace_members`, `metric_snapshots`. All three have RLS policies. `metric_snapshots` has a unique constraint on `(workspace_id, source, metric_date, metric_key, dimensions_hash)` so the cron upsert is idempotent.
