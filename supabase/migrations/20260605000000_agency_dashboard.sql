-- Phase 5 schema: agency dashboard + client self-serve portal pivot.
--
-- Adds the agency-admin concept, client grouping/favorites, per-workspace custom
-- layouts, a lightweight daily series for the all-clients grid sparklines, and
-- backfill-job tracking for onboarding.

-- ─────────────────────────────────────────────────────────────────────────────
-- Agency admins. A user in this table is an agency operator who can see the
-- all-clients dashboard and onboard/configure workspaces. Deliberately separate
-- from workspace_members.role so an admin doesn't need a membership row in every
-- client workspace. Cross-workspace reads still go through the service-role
-- client server-side (RLS is NOT widened for admins) — this table only gates UI.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists agency_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Client grouping tags, for the grid's filter chips (e.g. 'Cookeville', 'SaaS').
-- ─────────────────────────────────────────────────────────────────────────────
alter table workspaces add column if not exists tags text[] not null default '{}';

-- ─────────────────────────────────────────────────────────────────────────────
-- Per-admin starred clients (the grid's favorite star).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists workspace_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, workspace_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Per-workspace dashboard layout. One row per workspace; `layout` is a JSON blob
-- describing the ordered widget list (see src/lib/widgets/registry.ts). Absence
-- of a row means "use the default layout". Kept off the hot `workspaces` row so
-- the frequently-edited blob doesn't bloat every workspace read.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists workspace_layouts (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  layout jsonb not null default '{"version":1,"widgets":[]}'::jsonb,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Lightweight per-workspace daily series. Powers the all-clients grid sparklines
-- and headline totals in ONE cheap query for all clients. Written at the end of
-- refreshWorkspace from the GSC/GA4 daily connector results (true API daily
-- totals — not summed dimensions). workspace_health_daily can't serve this: it
-- only holds a single "today" row of 30d-window aggregates per run.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists workspace_daily_series (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  date date not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  sessions integer not null default 0,
  conversions integer not null default 0,
  fetched_at timestamptz not null default now(),
  primary key (workspace_id, date)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill jobs. Onboarding kicks off a multi-month backfill; we process one
-- date chunk per invocation (60s function ceiling) and advance `cursor_date`.
-- The onboarding UI polls this to show progress and re-posts until done.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists backfill_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  cursor_date date not null,
  status text not null check (status in ('pending', 'running', 'done', 'error')) default 'pending',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_daily_series_workspace_date_idx
  on workspace_daily_series (workspace_id, date desc);
create index if not exists backfill_jobs_workspace_idx
  on backfill_jobs (workspace_id, created_at desc);

alter table agency_admins          enable row level security;
alter table workspace_favorites    enable row level security;
alter table workspace_layouts      enable row level security;
alter table workspace_daily_series enable row level security;
alter table backfill_jobs          enable row level security;

-- A user can read their own agency-admin marker (so requireAgencyAdmin can check
-- it via the anon client). Writes are service-role only.
create policy "self read agency_admins"
  on agency_admins for select
  using (user_id = auth.uid());

-- A user manages only their own favorites.
create policy "self read workspace_favorites"
  on workspace_favorites for select
  using (user_id = auth.uid());
create policy "self insert workspace_favorites"
  on workspace_favorites for insert
  with check (user_id = auth.uid());
create policy "self delete workspace_favorites"
  on workspace_favorites for delete
  using (user_id = auth.uid());

-- Members read their workspace's layout. Writes happen via the service-role
-- client on the admin path (service role bypasses RLS), so no write policy here.
create policy "members read workspace_layouts"
  on workspace_layouts for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

create policy "members read workspace_daily_series"
  on workspace_daily_series for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

-- backfill_jobs: no anon/auth policy on purpose — only the service-role client
-- (admin path) reads/writes these. RLS enabled with no policy = locked down.
