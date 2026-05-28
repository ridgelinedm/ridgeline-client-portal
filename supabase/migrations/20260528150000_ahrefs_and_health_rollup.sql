-- Phase 3 schema: Ahrefs dimensional tables + precomputed health rollup.

-- ─────────────────────────────────────────────────────────────────────────────
-- Ahrefs daily domain-level snapshot. One row per workspace per day. Replaces
-- the metric_snapshots rows the legacy cron writes for ahrefs, with proper
-- typed columns and the metrics it was supposed to be capturing all along.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists ahrefs_domain_daily (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  date date not null,
  org_traffic integer not null default 0,
  org_keywords integer not null default 0,
  domain_rating double precision not null default 0,
  ahrefs_rank bigint,
  refdomains integer not null default 0,
  total_backlinks bigint not null default 0,
  fetched_at timestamptz not null default now(),
  primary key (workspace_id, date)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Top-N organic keywords as of each snapshot date. We refresh weekly (Ahrefs
-- data is monthly-ish anyway). Keep history so we can show movement.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists ahrefs_organic_keywords (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  snapshot_date date not null,
  keyword text not null,
  best_position integer,
  volume integer,
  traffic integer not null default 0,
  cpc_cents integer,
  fetched_at timestamptz not null default now(),
  primary key (workspace_id, snapshot_date, keyword)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Top-N pages by organic traffic.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists ahrefs_top_pages (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  snapshot_date date not null,
  page text not null,
  traffic integer not null default 0,
  keywords integer not null default 0,
  top_keyword text,
  top_keyword_position integer,
  url_rating double precision,
  traffic_value_cents integer,
  fetched_at timestamptz not null default now(),
  primary key (workspace_id, snapshot_date, page)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Precomputed health rollup. One row per workspace per day. Recomputed at the
-- end of every cron run; the overview reads from here so it stays fast as the
-- underlying dimensional tables grow.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists workspace_health_daily (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  date date not null,
  -- 30-day window ending on `date`
  clicks_30d integer not null default 0,
  impressions_30d integer not null default 0,
  sessions_30d integer not null default 0,
  conversions_30d integer not null default 0,
  avg_position_30d double precision not null default 0,
  -- prior 30-day window
  clicks_prev_30d integer not null default 0,
  impressions_prev_30d integer not null default 0,
  sessions_prev_30d integer not null default 0,
  conversions_prev_30d integer not null default 0,
  avg_position_prev_30d double precision not null default 0,
  -- ahrefs snapshot at this date
  domain_rating double precision not null default 0,
  refdomains integer not null default 0,
  org_traffic integer not null default 0,
  -- composite health score 0–100
  health_score integer not null default 0,
  fetched_at timestamptz not null default now(),
  primary key (workspace_id, date)
);

create index if not exists ahrefs_domain_daily_workspace_date_idx
  on ahrefs_domain_daily (workspace_id, date desc);
create index if not exists ahrefs_organic_keywords_workspace_date_idx
  on ahrefs_organic_keywords (workspace_id, snapshot_date desc);
create index if not exists ahrefs_top_pages_workspace_date_idx
  on ahrefs_top_pages (workspace_id, snapshot_date desc);
create index if not exists workspace_health_daily_workspace_date_idx
  on workspace_health_daily (workspace_id, date desc);

alter table ahrefs_domain_daily       enable row level security;
alter table ahrefs_organic_keywords   enable row level security;
alter table ahrefs_top_pages          enable row level security;
alter table workspace_health_daily    enable row level security;

create policy "members read ahrefs_domain_daily"
  on ahrefs_domain_daily for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

create policy "members read ahrefs_organic_keywords"
  on ahrefs_organic_keywords for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

create policy "members read ahrefs_top_pages"
  on ahrefs_top_pages for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

create policy "members read workspace_health_daily"
  on workspace_health_daily for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );
