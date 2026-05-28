import { google } from "googleapis";
import { getGoogleAuthClient } from "../google/oauth";

export type GscDailyMetric = {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscQueryDailyRow = {
  date: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscPageDailyRow = {
  date: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscQueryPageDailyRow = {
  date: string;
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscDeviceDailyRow = {
  date: string;
  device: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscCountryDailyRow = {
  date: string;
  country: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

const PAGE_SIZE = 25000;

type GscRawRow = {
  keys?: string[] | null;
  clicks?: number | null;
  impressions?: number | null;
  ctr?: number | null;
  position?: number | null;
};

// GSC caps responses at 25k rows. Page through with startRow until we get a short page.
async function fetchGscRows(
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
): Promise<GscRawRow[]> {
  const sc = google.searchconsole({
    version: "v1",
    auth: getGoogleAuthClient(),
  });
  const all: GscRawRow[] = [];
  let startRow = 0;
  while (true) {
    const res = await sc.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions,
        rowLimit: PAGE_SIZE,
        startRow,
      },
    });
    const rows = res.data.rows ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    startRow += PAGE_SIZE;
  }
  return all;
}

function metric<T extends { keys?: string[] | null }>(
  row: T,
  i: number,
): string {
  return row.keys?.[i] ?? "";
}

export async function fetchGscDaily(
  siteUrl: string,
  startDate: string,
  endDate: string,
): Promise<GscDailyMetric[]> {
  const rows = await fetchGscRows(siteUrl, startDate, endDate, ["date"]);
  return rows.map((r) => ({
    date: metric(r, 0),
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }));
}

export async function fetchGscByQuery(
  siteUrl: string,
  startDate: string,
  endDate: string,
): Promise<GscQueryDailyRow[]> {
  const rows = await fetchGscRows(siteUrl, startDate, endDate, [
    "date",
    "query",
  ]);
  return rows.map((r) => ({
    date: metric(r, 0),
    query: metric(r, 1),
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }));
}

export async function fetchGscByPage(
  siteUrl: string,
  startDate: string,
  endDate: string,
): Promise<GscPageDailyRow[]> {
  const rows = await fetchGscRows(siteUrl, startDate, endDate, [
    "date",
    "page",
  ]);
  return rows.map((r) => ({
    date: metric(r, 0),
    page: metric(r, 1),
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }));
}

export async function fetchGscByQueryPage(
  siteUrl: string,
  startDate: string,
  endDate: string,
): Promise<GscQueryPageDailyRow[]> {
  const rows = await fetchGscRows(siteUrl, startDate, endDate, [
    "date",
    "query",
    "page",
  ]);
  return rows.map((r) => ({
    date: metric(r, 0),
    query: metric(r, 1),
    page: metric(r, 2),
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }));
}

export async function fetchGscByDevice(
  siteUrl: string,
  startDate: string,
  endDate: string,
): Promise<GscDeviceDailyRow[]> {
  const rows = await fetchGscRows(siteUrl, startDate, endDate, [
    "date",
    "device",
  ]);
  return rows.map((r) => ({
    date: metric(r, 0),
    device: metric(r, 1),
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }));
}

export async function fetchGscByCountry(
  siteUrl: string,
  startDate: string,
  endDate: string,
): Promise<GscCountryDailyRow[]> {
  const rows = await fetchGscRows(siteUrl, startDate, endDate, [
    "date",
    "country",
  ]);
  return rows.map((r) => ({
    date: metric(r, 0),
    country: metric(r, 1),
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }));
}
