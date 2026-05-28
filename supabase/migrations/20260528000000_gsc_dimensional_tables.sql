-- GSC dimensional fact tables — Phase 1 of the reporting platform redesign.
-- One table per natural grain; composite PK on (workspace_id, date, …dimensions)
-- so upserts target the natural key directly and we skip the synthetic-id overhead.
-- All four metrics (clicks, impressions, ctr, position) come back on every GSC row,
-- so they're NOT NULL with sensible defaults.

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists gsc_query_daily (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  date date not null,
  query text not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr double precision not null default 0,
  position double precision not null default 0,
  fetched_at timestamptz not null default now(),
  primary key (workspace_id, date, query)
);

create table if not exists gsc_page_daily (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  date date not null,
  page text not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr double precision not null default 0,
  position double precision not null default 0,
  fetched_at timestamptz not null default now(),
  primary key (workspace_id, date, page)
);

create table if not exists gsc_query_page_daily (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  date date not null,
  query text not null,
  page text not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr double precision not null default 0,
  position double precision not null default 0,
  fetched_at timestamptz not null default now(),
  primary key (workspace_id, date, query, page)
);

create table if not exists gsc_device_daily (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  date date not null,
  device text not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr double precision not null default 0,
  position double precision not null default 0,
  fetched_at timestamptz not null default now(),
  primary key (workspace_id, date, device)
);

create table if not exists gsc_country_daily (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  date date not null,
  country text not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr double precision not null default 0,
  position double precision not null default 0,
  fetched_at timestamptz not null default now(),
  primary key (workspace_id, date, country)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes — primary key already covers (workspace_id, date, …). These secondary
-- indexes accelerate "scan one workspace over a date range" (the dominant
-- explorer query) by ordering recent dates first.
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists gsc_query_daily_workspace_date_idx
  on gsc_query_daily (workspace_id, date desc);

create index if not exists gsc_page_daily_workspace_date_idx
  on gsc_page_daily (workspace_id, date desc);

create index if not exists gsc_query_page_daily_workspace_date_idx
  on gsc_query_page_daily (workspace_id, date desc);

create index if not exists gsc_device_daily_workspace_date_idx
  on gsc_device_daily (workspace_id, date desc);

create index if not exists gsc_country_daily_workspace_date_idx
  on gsc_country_daily (workspace_id, date desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — mirror the metric_snapshots pattern. Members of a workspace can read
-- its rows; the cron job uses the service role key, which bypasses RLS.
-- ─────────────────────────────────────────────────────────────────────────────

alter table gsc_query_daily       enable row level security;
alter table gsc_page_daily        enable row level security;
alter table gsc_query_page_daily  enable row level security;
alter table gsc_device_daily      enable row level security;
alter table gsc_country_daily     enable row level security;

create policy "members read gsc_query_daily"
  on gsc_query_daily for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

create policy "members read gsc_page_daily"
  on gsc_page_daily for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

create policy "members read gsc_query_page_daily"
  on gsc_query_page_daily for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

create policy "members read gsc_device_daily"
  on gsc_device_daily for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

create policy "members read gsc_country_daily"
  on gsc_country_daily for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );
