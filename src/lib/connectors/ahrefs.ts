// Ahrefs API v3 — REST, single bearer token (the agency's), per-domain queries.
// Docs: https://docs.ahrefs.com/docs/api/reference/

const AHREFS_BASE = "https://api.ahrefs.com/v3";

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
  organicTraffic: number;
  organicKeywords: number;
  referringDomains: number;
  domainRating: number;
};

export async function fetchAhrefsDomainSnapshot(
  domain: string,
  date: string,
): Promise<AhrefsDomainSnapshot> {
  const data = await ahrefsFetch<{
    metrics: {
      org_traffic?: number;
      org_keywords?: number;
      refdomains?: number;
      domain_rating?: number;
    };
  }>("/site-explorer/metrics", {
    target: domain,
    mode: "domain",
    date,
    protocol: "both",
  });
  return {
    date,
    organicTraffic: data.metrics.org_traffic ?? 0,
    organicKeywords: data.metrics.org_keywords ?? 0,
    referringDomains: data.metrics.refdomains ?? 0,
    domainRating: data.metrics.domain_rating ?? 0,
  };
}

export type AhrefsTopKeyword = {
  keyword: string;
  position: number;
  volume: number;
  traffic: number;
};

export async function fetchAhrefsTopKeywords(
  domain: string,
  limit = 25,
): Promise<AhrefsTopKeyword[]> {
  const data = await ahrefsFetch<{
    keywords: Array<{
      keyword: string;
      best_position?: number;
      volume?: number;
      traffic?: number;
    }>;
  }>("/site-explorer/organic-keywords", {
    target: domain,
    mode: "domain",
    limit: String(limit),
    select: "keyword,best_position,volume,traffic",
    order_by: "traffic:desc",
  });
  return (data.keywords ?? []).map((k) => ({
    keyword: k.keyword,
    position: k.best_position ?? 0,
    volume: k.volume ?? 0,
    traffic: k.traffic ?? 0,
  }));
}
