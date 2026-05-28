-- Phase 4: stored page_path on GSC tables + GSC×GA4 join view.
--
-- Previously the pages explorer normalized URLs in JS at query time so GSC's
-- absolute URLs would line up with GA4's path-only values. That work is now
-- done in SQL: a generated column on the GSC tables strips protocol/host/
-- query/hash so the join key is the same shape on both sides.

-- ─────────────────────────────────────────────────────────────────────────────
-- Normalization function. IMMUTABLE so it can back a STORED generated column.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function normalize_page_path(raw text)
returns text
language sql
immutable
as $$
  with stripped as (
    select regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(raw, ''), '^https?://[^/]+', ''),
        '\?.*$', ''
      ),
      '#.*$', ''
    ) as p
  )
  select case
    when raw is null then null
    when p = '' then '/'
    when length(p) > 1 and right(p, 1) = '/' then left(p, length(p) - 1)
    else p
  end
  from stripped;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Stored generated columns. The cron continues to write only `page` — Postgres
-- computes `page_path` automatically. Existing rows get backfilled by the
-- ADD COLUMN itself (STORED + IMMUTABLE expr).
-- ─────────────────────────────────────────────────────────────────────────────
alter table gsc_page_daily
  add column if not exists page_path text
  generated always as (normalize_page_path(page)) stored;

alter table gsc_query_page_daily
  add column if not exists page_path text
  generated always as (normalize_page_path(page)) stored;

create index if not exists gsc_page_daily_workspace_date_path_idx
  on gsc_page_daily (workspace_id, date desc, page_path);

create index if not exists gsc_query_page_daily_workspace_date_path_idx
  on gsc_query_page_daily (workspace_id, date desc, page_path);

-- ─────────────────────────────────────────────────────────────────────────────
-- Cross-source join view. Aggregates GSC at (workspace, date, page_path) so
-- multiple raw URLs that collapse to the same path (e.g. utm variants) fold
-- into one row, then full-outer-joins GA4. Pages that exist in only one
-- source still appear with zeros on the other side.
--
-- security_invoker = true makes the view respect the calling user's RLS on
-- the underlying tables — without it the view would run as its owner and
-- bypass workspace_members checks.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view page_metrics_daily
with (security_invoker = true) as
with gsc as (
  select
    workspace_id,
    date,
    page_path,
    sum(clicks)::integer as clicks,
    sum(impressions)::integer as impressions,
    case when sum(impressions) > 0
         then sum(ctr * impressions) / sum(impressions)
         else 0 end as ctr,
    -- impression-weighted average; `position` is a SQL reserved word so we
    -- rename it here and downstream
    case when sum(impressions) > 0
         then sum(gsc_page_daily.position * impressions) / sum(impressions)
         else 0 end as avg_position
  from gsc_page_daily
  group by workspace_id, date, page_path
),
ga4 as (
  select
    workspace_id,
    date,
    normalize_page_path(page_path) as page_path,
    sum(sessions)::integer as sessions,
    sum(total_users)::integer as total_users,
    sum(engaged_sessions)::integer as engaged_sessions,
    sum(conversions)::integer as conversions
  from ga4_page_daily
  group by workspace_id, date, normalize_page_path(page_path)
)
select
  coalesce(g.workspace_id, a.workspace_id) as workspace_id,
  coalesce(g.date, a.date) as date,
  coalesce(g.page_path, a.page_path) as page_path,
  coalesce(g.clicks, 0) as clicks,
  coalesce(g.impressions, 0) as impressions,
  coalesce(g.ctr, 0) as ctr,
  coalesce(g.avg_position, 0) as avg_position,
  coalesce(a.sessions, 0) as sessions,
  coalesce(a.total_users, 0) as total_users,
  coalesce(a.engaged_sessions, 0) as engaged_sessions,
  coalesce(a.conversions, 0) as conversions
from gsc g
full outer join ga4 a
  on g.workspace_id = a.workspace_id
 and g.date = a.date
 and g.page_path = a.page_path;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_page_metrics(workspace, start, end) — RPC the pages explorer calls.
-- Returns one row per page_path aggregated over the date range. Runs with
-- caller privileges so RLS on the underlying tables (gsc_page_daily,
-- ga4_page_daily) still applies.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function get_page_metrics(
  p_workspace_id uuid,
  p_start date,
  p_end date
)
returns table (
  page_path text,
  clicks bigint,
  impressions bigint,
  ctr double precision,
  avg_position double precision,
  sessions bigint,
  total_users bigint,
  engaged_sessions bigint,
  conversions bigint,
  engagement_rate double precision
)
language sql
stable
security invoker
as $$
  select
    pmd.page_path,
    sum(pmd.clicks)::bigint as clicks,
    sum(pmd.impressions)::bigint as impressions,
    case when sum(pmd.impressions) > 0
         then sum(pmd.ctr * pmd.impressions) / sum(pmd.impressions)
         else 0 end as ctr,
    case when sum(pmd.impressions) > 0
         then sum(pmd.avg_position * pmd.impressions) / sum(pmd.impressions)
         else 0 end as avg_position,
    sum(pmd.sessions)::bigint as sessions,
    sum(pmd.total_users)::bigint as total_users,
    sum(pmd.engaged_sessions)::bigint as engaged_sessions,
    sum(pmd.conversions)::bigint as conversions,
    case when sum(pmd.sessions) > 0
         then sum(pmd.engaged_sessions)::double precision / sum(pmd.sessions)
         else 0 end as engagement_rate
  from page_metrics_daily pmd
  where pmd.workspace_id = p_workspace_id
    and pmd.date between p_start and p_end
  group by pmd.page_path;
$$;
