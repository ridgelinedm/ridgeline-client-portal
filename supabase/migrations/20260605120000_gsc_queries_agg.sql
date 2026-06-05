-- M3: server-side aggregation for the queries explorer.
--
-- Replaces the old "fetch up to 50k rows then aggregate/sort/slice-to-1000 in
-- JS" path (which silently truncated busy workspaces and capped the table at
-- 1,000 rows). This does the aggregation, period-over-period join, sort, and
-- pagination in Postgres, returning a window total_count for the pager.
--
-- The avg-position column is named `avg_position` (not `position`) because
-- `position` is a reserved keyword in column position — same reason
-- get_page_metrics uses `avg_position`.
--
-- security invoker = the function runs with the caller's RLS, so a client only
-- ever sees their own workspace's rows; the agency-admin (service-role) path
-- bypasses RLS and can read any workspace.

create or replace function gsc_queries_agg(
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
  query text,
  clicks bigint,
  impressions bigint,
  ctr double precision,
  avg_position double precision,
  prior_clicks bigint,
  prior_impressions bigint,
  prior_ctr double precision,
  prior_avg_position double precision,
  total_count bigint
)
language sql
stable
security invoker
as $$
  with cur as (
    select
      q.query,
      sum(q.clicks)::bigint as clicks,
      sum(q.impressions)::bigint as impressions,
      case when sum(q.impressions) > 0
           then sum(q.ctr * q.impressions) / sum(q.impressions) else 0 end as ctr,
      case when sum(q.impressions) > 0
           then sum(q.position * q.impressions) / sum(q.impressions) else 0 end as avg_position
    from gsc_query_daily q
    where q.workspace_id = p_workspace_id
      and q.date between p_start and p_end
      and (coalesce(p_search, '') = '' or q.query ilike '%' || p_search || '%')
    group by q.query
  ),
  pri as (
    select
      q.query,
      sum(q.clicks)::bigint as clicks,
      sum(q.impressions)::bigint as impressions,
      case when sum(q.impressions) > 0
           then sum(q.ctr * q.impressions) / sum(q.impressions) else 0 end as ctr,
      case when sum(q.impressions) > 0
           then sum(q.position * q.impressions) / sum(q.impressions) else 0 end as avg_position
    from gsc_query_daily q
    where q.workspace_id = p_workspace_id
      and q.date between p_prior_start and p_prior_end
      and (coalesce(p_search, '') = '' or q.query ilike '%' || p_search || '%')
    group by q.query
  ),
  joined as (
    select
      c.query, c.clicks, c.impressions, c.ctr, c.avg_position,
      coalesce(p.clicks, 0)::bigint as prior_clicks,
      coalesce(p.impressions, 0)::bigint as prior_impressions,
      coalesce(p.ctr, 0) as prior_ctr,
      coalesce(p.avg_position, 0) as prior_avg_position
    from cur c
    left join pri p on p.query = c.query
  )
  select
    j.query, j.clicks, j.impressions, j.ctr, j.avg_position,
    j.prior_clicks, j.prior_impressions, j.prior_ctr, j.prior_avg_position,
    count(*) over () as total_count
  from joined j
  order by
    case when p_sort = 'query'       and p_dir = 'asc'  then j.query end asc,
    case when p_sort = 'query'       and p_dir = 'desc' then j.query end desc,
    case when p_sort = 'clicks'      and p_dir = 'asc'  then j.clicks end asc,
    case when p_sort = 'clicks'      and p_dir = 'desc' then j.clicks end desc,
    case when p_sort = 'impressions' and p_dir = 'asc'  then j.impressions end asc,
    case when p_sort = 'impressions' and p_dir = 'desc' then j.impressions end desc,
    case when p_sort = 'ctr'         and p_dir = 'asc'  then j.ctr end asc,
    case when p_sort = 'ctr'         and p_dir = 'desc' then j.ctr end desc,
    case when p_sort = 'position'    and p_dir = 'asc'  then j.avg_position end asc,
    case when p_sort = 'position'    and p_dir = 'desc' then j.avg_position end desc,
    j.clicks desc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;
