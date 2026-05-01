import { google } from "googleapis";
import { getGoogleAuthClient } from "../google/oauth";

export type GscDailyMetric = {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscQueryRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export async function fetchGscDaily(
  siteUrl: string,
  startDate: string,
  endDate: string,
): Promise<GscDailyMetric[]> {
  const sc = google.searchconsole({ version: "v1", auth: getGoogleAuthClient() });
  const res = await sc.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["date"],
      rowLimit: 25000,
    },
  });
  return (res.data.rows ?? []).map((row) => ({
    date: row.keys?.[0] ?? "",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  }));
}

export async function fetchGscTopQueries(
  siteUrl: string,
  startDate: string,
  endDate: string,
  limit = 25,
): Promise<GscQueryRow[]> {
  const sc = google.searchconsole({ version: "v1", auth: getGoogleAuthClient() });
  const res = await sc.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["query"],
      rowLimit: limit,
    },
  });
  return (res.data.rows ?? []).map((row) => ({
    query: row.keys?.[0] ?? "",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  }));
}
