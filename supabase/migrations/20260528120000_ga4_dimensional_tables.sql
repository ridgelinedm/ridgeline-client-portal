-- GA4 dimensional fact tables — Phase 2.
-- Three grains for the pages, sources, and devices explorers. Metrics chosen
-- to support engagement rate (engaged_sessions / sessions) and conversion rate
-- (conversions / sessions) without storing them as derived columns.

create table if not exists ga4_page_daily (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  date date not null,
  page_path text not null,
  sessions integer not null default 0,
  total_users integer not null default 0,
  engaged_sessions integer not null default 0,
  conversions integer not null default 0,
  fetched_at timestamptz not null default now(),
  primary key (workspace_id, date, page_path)
);

create table if not exists ga4_source_daily (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  date date not null,
  source text not null,
  medium text not null,
  channel_group text not null,
  sessions integer not null default 0,
  total_users integer not null default 0,
  engaged_sessions integer not null default 0,
  conversions integer not null default 0,
  fetched_at timestamptz not null default now(),
  primary key (workspace_id, date, source, medium, channel_group)
);

create table if not exists ga4_device_daily (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  date date not null,
  device text not null,
  sessions integer not null default 0,
  total_users integer not null default 0,
  engaged_sessions integer not null default 0,
  conversions integer not null default 0,
  fetched_at timestamptz not null default now(),
  primary key (workspace_id, date, device)
);

create index if not exists ga4_page_daily_workspace_date_idx
  on ga4_page_daily (workspace_id, date desc);
create index if not exists ga4_source_daily_workspace_date_idx
  on ga4_source_daily (workspace_id, date desc);
create index if not exists ga4_device_daily_workspace_date_idx
  on ga4_device_daily (workspace_id, date desc);

alter table ga4_page_daily   enable row level security;
alter table ga4_source_daily enable row level security;
alter table ga4_device_daily enable row level security;

create policy "members read ga4_page_daily"
  on ga4_page_daily for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

create policy "members read ga4_source_daily"
  on ga4_source_daily for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

create policy "members read ga4_device_daily"
  on ga4_device_daily for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );
