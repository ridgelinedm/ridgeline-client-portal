-- Cleanup: server-side aggregation + pagination for the pages explorer, mirroring
-- gsc_queries_agg. Aggregates the page_metrics_daily view (GSC×GA4 by page_path)
-- over current + prior windows, sorts, paginates, and returns a window
-- total_count. Replaces the "fetch all via get_page_metrics then sort/slice-1000
-- in JS" path. security invoker so RLS still applies to clients.

create or replace function gsc_pages_agg(
  p_workspace_id uuid,
  p_start date,
  p_end date,
  p_prior_start date,
  p_prior_end date,
  p_search text,
  p_sort text,
  p_dir text,
  p_limit int,
  p_offset int
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
  engagement_rate double precision,
  prior_clicks bigint,
  prior_impressions bigint,
  prior_ctr double precision,
  prior_avg_position double precision,
  prior_sessions bigint,
  prior_engaged_sessions bigint,
  prior_conversions bigint,
  prior_engagement_rate double precision,
  total_count bigint
)
language sql
stable
security invoker
as $$
  with cur as (
    select
      m.page_path,
      sum(m.clicks)::bigint as clicks,
      sum(m.impressions)::bigint as impressions,
      case when sum(m.impressions) > 0
           then sum(m.ctr * m.impressions) / sum(m.impressions) else 0 end as ctr,
      case when sum(m.impressions) > 0
           then sum(m.avg_position * m.impressions) / sum(m.impressions) else 0 end as avg_position,
      sum(m.sessions)::bigint as sessions,
      sum(m.total_users)::bigint as total_users,
      sum(m.engaged_sessions)::bigint as engaged_sessions,
      sum(m.conversions)::bigint as conversions,
      case when sum(m.sessions) > 0
           then sum(m.engaged_sessions)::double precision / sum(m.sessions) else 0 end as engagement_rate
    from page_metrics_daily m
    where m.workspace_id = p_workspace_id
      and m.date between p_start and p_end
      and (coalesce(p_search, '') = '' or m.page_path ilike '%' || p_search || '%')
    group by m.page_path
  ),
  pri as (
    select
      m.page_path,
      sum(m.clicks)::bigint as clicks,
      sum(m.impressions)::bigint as impressions,
      case when sum(m.impressions) > 0
           then sum(m.ctr * m.impressions) / sum(m.impressions) else 0 end as ctr,
      case when sum(m.impressions) > 0
           then sum(m.avg_position * m.impressions) / sum(m.impressions) else 0 end as avg_position,
      sum(m.sessions)::bigint as sessions,
      sum(m.engaged_sessions)::bigint as engaged_sessions,
      sum(m.conversions)::bigint as conversions,
      case when sum(m.sessions) > 0
           then sum(m.engaged_sessions)::double precision / sum(m.sessions) else 0 end as engagement_rate
    from page_metrics_daily m
    where m.workspace_id = p_workspace_id
      and m.date between p_prior_start and p_prior_end
      and (coalesce(p_search, '') = '' or m.page_path ilike '%' || p_search || '%')
    group by m.page_path
  ),
  joined as (
    select
      c.page_path, c.clicks, c.impressions, c.ctr, c.avg_position,
      c.sessions, c.total_users, c.engaged_sessions, c.conversions, c.engagement_rate,
      coalesce(p.clicks, 0)::bigint as prior_clicks,
      coalesce(p.impressions, 0)::bigint as prior_impressions,
      coalesce(p.ctr, 0) as prior_ctr,
      coalesce(p.avg_position, 0) as prior_avg_position,
      coalesce(p.sessions, 0)::bigint as prior_sessions,
      coalesce(p.engaged_sessions, 0)::bigint as prior_engaged_sessions,
      coalesce(p.conversions, 0)::bigint as prior_conversions,
      coalesce(p.engagement_rate, 0) as prior_engagement_rate
    from cur c
    left join pri p on p.page_path = c.page_path
  )
  select
    j.page_path, j.clicks, j.impressions, j.ctr, j.avg_position,
    j.sessions, j.total_users, j.engaged_sessions, j.conversions, j.engagement_rate,
    j.prior_clicks, j.prior_impressions, j.prior_ctr, j.prior_avg_position,
    j.prior_sessions, j.prior_engaged_sessions, j.prior_conversions, j.prior_engagement_rate,
    count(*) over () as total_count
  from joined j
  order by
    case when p_sort = 'page_path'       and p_dir = 'asc'  then j.page_path end asc,
    case when p_sort = 'page_path'       and p_dir = 'desc' then j.page_path end desc,
    case when p_sort = 'clicks'          and p_dir = 'asc'  then j.clicks end asc,
    case when p_sort = 'clicks'          and p_dir = 'desc' then j.clicks end desc,
    case when p_sort = 'impressions'     and p_dir = 'asc'  then j.impressions end asc,
    case when p_sort = 'impressions'     and p_dir = 'desc' then j.impressions end desc,
    case when p_sort = 'ctr'             and p_dir = 'asc'  then j.ctr end asc,
    case when p_sort = 'ctr'             and p_dir = 'desc' then j.ctr end desc,
    case when p_sort = 'avg_position'    and p_dir = 'asc'  then j.avg_position end asc,
    case when p_sort = 'avg_position'    and p_dir = 'desc' then j.avg_position end desc,
    case when p_sort = 'sessions'        and p_dir = 'asc'  then j.sessions end asc,
    case when p_sort = 'sessions'        and p_dir = 'desc' then j.sessions end desc,
    case when p_sort = 'engagement_rate' and p_dir = 'asc'  then j.engagement_rate end asc,
    case when p_sort = 'engagement_rate' and p_dir = 'desc' then j.engagement_rate end desc,
    case when p_sort = 'conversions'     and p_dir = 'asc'  then j.conversions end asc,
    case when p_sort = 'conversions'     and p_dir = 'desc' then j.conversions end desc,
    j.clicks desc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;
