// Ahrefs API v3 — REST, single bearer token (the agency's), per-domain queries.
// Docs: https://docs.ahrefs.com/docs/api/reference/
//
// IMPORTANT: Always use mode=subdomains for domain-level queries. mode=domain
// excludes www and other subdomains, which silently undercounts traffic.

const AHREFS_BASE = "https://api.ahrefs.com/v3";
const MODE = "subdomains" as const;
const PROTOCOL = "both" as const;

async function ahrefsFetch<T>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${AHREFS_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.AHREFS_API_KEY}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Ahrefs API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export type AhrefsDomainSnapshot = {
  date: string;
  org_traffic: number;
  org_keywords: number;
  domain_rating: number;
  ahrefs_rank: number | null;
  refdomains: number;
  total_backlinks: number;
};

// Domain-level snapshot. Combines three endpoints because DR and refdomains
// live in separate endpoints from org_traffic / org_keywords.
export async function fetchAhrefsDomainSnapshot(
  domain: string,
  date: string,
): Promise<AhrefsDomainSnapshot> {
  const [metrics, dr, links] = await Promise.all([
    ahrefsFetch<{
      metrics: { org_traffic?: number; org_keywords?: number };
    }>("/site-explorer/metrics", {
      target: domain,
      mode: MODE,
      protocol: PROTOCOL,
      date,
    }),
    ahrefsFetch<{
      domain_rating: {
        domain_rating?: number;
        ahrefs_rank?: number | null;
      };
    }>("/site-explorer/domain-rating", {
      target: domain,
      protocol: PROTOCOL,
      date,
    }),
    ahrefsFetch<{
      metrics: {
        live?: number;
        live_refdomains?: number;
      };
    }>("/site-explorer/backlinks-stats", {
      target: domain,
      mode: MODE,
      protocol: PROTOCOL,
      date,
    }),
  ]);
  return {
    date,
    org_traffic: metrics.metrics.org_traffic ?? 0,
    org_keywords: metrics.metrics.org_keywords ?? 0,
    domain_rating: dr.domain_rating.domain_rating ?? 0,
    ahrefs_rank: dr.domain_rating.ahrefs_rank ?? null,
    refdomains: links.metrics.live_refdomains ?? 0,
    total_backlinks: links.metrics.live ?? 0,
  };
}

export type AhrefsOrganicKeyword = {
  keyword: string;
  best_position: number | null;
  volume: number | null;
  traffic: number;
  cpc_cents: number | null;
};

export async function fetchAhrefsOrganicKeywords(
  domain: string,
  date: string,
  limit = 100,
): Promise<AhrefsOrganicKeyword[]> {
  const data = await ahrefsFetch<{
    keywords: Array<{
      keyword?: string;
      best_position?: number | null;
      volume?: number | null;
      sum_traffic?: number | null;
      cpc?: number | null;
    }>;
  }>("/site-explorer/organic-keywords", {
    target: domain,
    mode: MODE,
    protocol: PROTOCOL,
    date,
    limit: String(limit),
    select: "keyword,best_position,volume,sum_traffic,cpc",
    order_by: "sum_traffic:desc",
  });
  return (data.keywords ?? []).map((k) => ({
    keyword: k.keyword ?? "",
    best_position: k.best_position ?? null,
    volume: k.volume ?? null,
    traffic: k.sum_traffic ?? 0,
    cpc_cents: k.cpc ?? null,
  }));
}

export type AhrefsTopPage = {
  page: string;
  traffic: number;
  keywords: number;
  top_keyword: string | null;
  top_keyword_position: number | null;
  url_rating: number | null;
  traffic_value_cents: number | null;
};

export async function fetchAhrefsTopPages(
  domain: string,
  date: string,
  limit = 50,
): Promise<AhrefsTopPage[]> {
  const data = await ahrefsFetch<{
    pages: Array<{
      url?: string | null;
      sum_traffic?: number | null;
      keywords?: number | null;
      top_keyword?: string | null;
      top_keyword_best_position?: number | null;
      ur?: number | null;
      value?: number | null;
    }>;
  }>("/site-explorer/top-pages", {
    target: domain,
    mode: MODE,
    protocol: PROTOCOL,
    date,
    limit: String(limit),
    select:
      "url,sum_traffic,keywords,top_keyword,top_keyword_best_position,ur,value",
    order_by: "sum_traffic:desc",
  });
  return (data.pages ?? [])
    .filter((p) => p.url)
    .map((p) => ({
      page: p.url ?? "",
      traffic: p.sum_traffic ?? 0,
      keywords: p.keywords ?? 0,
      top_keyword: p.top_keyword ?? null,
      top_keyword_position: p.top_keyword_best_position ?? null,
      url_rating: p.ur ?? null,
      traffic_value_cents: p.value ?? null,
    }));
}
