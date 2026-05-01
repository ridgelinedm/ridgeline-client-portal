-- Ridgeline client portal — initial schema.

create extension if not exists "pgcrypto";

-- One row per client.
create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  -- connector configs
  gsc_property text,           -- "sc-domain:example.com" or "https://example.com/"
  ga4_property_id text,        -- "123456789"
  gbp_location_id text,        -- "locations/{id}"
  ahrefs_domain text,          -- "example.com"
  -- branding
  logo_url text,
  primary_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Which Supabase auth user can access which workspace.
create table if not exists workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'client')) default 'client',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- Daily metric values, one row per (workspace, source, date, metric, dimension-set).
create table if not exists metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  source text not null check (source in ('gsc', 'ga4', 'gbp', 'ahrefs')),
  metric_date date not null,
  metric_key text not null,
  metric_value numeric not null,
  dimensions jsonb,
  -- md5 of dimensions json so the unique index can include it (jsonb itself
  -- isn't reliably comparable for uniqueness with NULLs)
  dimensions_hash text generated always as (
    coalesce(md5(dimensions::text), '')
  ) stored,
  fetched_at timestamptz not null default now(),
  unique (workspace_id, source, metric_date, metric_key, dimensions_hash)
);

create index if not exists metric_snapshots_workspace_date_idx
  on metric_snapshots (workspace_id, metric_date desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — every client query is scoped to workspaces the user is a member of.
-- The cron job uses the service role key, which bypasses RLS by design.
-- ─────────────────────────────────────────────────────────────────────────────

alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table metric_snapshots enable row level security;

create policy "members read their workspaces"
  on workspaces for select
  using (
    id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

create policy "members read their memberships"
  on workspace_members for select
  using (user_id = auth.uid());

create policy "members read metrics for their workspaces"
  on metric_snapshots for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );
