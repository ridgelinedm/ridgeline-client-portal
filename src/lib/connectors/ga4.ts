import { google, analyticsdata_v1beta } from "googleapis";
import { getGoogleAuthClient } from "../google/oauth";

export type Ga4DailyMetric = {
  date: string;
  sessions: number;
  totalUsers: number;
  conversions: number;
};

export type Ga4PageDailyRow = {
  date: string;
  page_path: string;
  sessions: number;
  total_users: number;
  engaged_sessions: number;
  conversions: number;
};

export type Ga4SourceDailyRow = {
  date: string;
  source: string;
  medium: string;
  channel_group: string;
  sessions: number;
  total_users: number;
  engaged_sessions: number;
  conversions: number;
};

export type Ga4DeviceDailyRow = {
  date: string;
  device: string;
  sessions: number;
  total_users: number;
  engaged_sessions: number;
  conversions: number;
};

const PAGE_SIZE = 100000;

function ga4DateToIso(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

// Paginate a runReport call via offset. Returns the full set of rows.
async function runReportPaginated(
  client: analyticsdata_v1beta.Analyticsdata,
  propertyId: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
  metrics: string[],
): Promise<analyticsdata_v1beta.Schema$Row[]> {
  const all: analyticsdata_v1beta.Schema$Row[] = [];
  let offset = 0;
  while (true) {
    const res = await client.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: dimensions.map((name) => ({ name })),
        metrics: metrics.map((name) => ({ name })),
        offset: String(offset),
        limit: String(PAGE_SIZE),
      },
    });
    const rows = res.data.rows ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

function dim(row: analyticsdata_v1beta.Schema$Row, i: number): string {
  return row.dimensionValues?.[i]?.value ?? "";
}

function num(row: analyticsdata_v1beta.Schema$Row, i: number): number {
  return Number(row.metricValues?.[i]?.value ?? 0);
}

export async function fetchGa4Daily(
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<Ga4DailyMetric[]> {
  const ga = google.analyticsdata({
    version: "v1beta",
    auth: getGoogleAuthClient(),
  });
  const rows = await runReportPaginated(
    ga,
    propertyId,
    startDate,
    endDate,
    ["date"],
    ["sessions", "totalUsers", "conversions"],
  );
  return rows.map((r) => ({
    date: ga4DateToIso(dim(r, 0)),
    sessions: num(r, 0),
    totalUsers: num(r, 1),
    conversions: num(r, 2),
  }));
}

export async function fetchGa4ByPage(
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<Ga4PageDailyRow[]> {
  const ga = google.analyticsdata({
    version: "v1beta",
    auth: getGoogleAuthClient(),
  });
  const rows = await runReportPaginated(
    ga,
    propertyId,
    startDate,
    endDate,
    ["date", "pagePath"],
    ["sessions", "totalUsers", "engagedSessions", "conversions"],
  );
  return rows.map((r) => ({
    date: ga4DateToIso(dim(r, 0)),
    page_path: dim(r, 1),
    sessions: num(r, 0),
    total_users: num(r, 1),
    engaged_sessions: num(r, 2),
    conversions: num(r, 3),
  }));
}

export async function fetchGa4BySource(
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<Ga4SourceDailyRow[]> {
  const ga = google.analyticsdata({
    version: "v1beta",
    auth: getGoogleAuthClient(),
  });
  const rows = await runReportPaginated(
    ga,
    propertyId,
    startDate,
    endDate,
    [
      "date",
      "sessionSource",
      "sessionMedium",
      "sessionDefaultChannelGroup",
    ],
    ["sessions", "totalUsers", "engagedSessions", "conversions"],
  );
  return rows.map((r) => ({
    date: ga4DateToIso(dim(r, 0)),
    source: dim(r, 1),
    medium: dim(r, 2),
    channel_group: dim(r, 3),
    sessions: num(r, 0),
    total_users: num(r, 1),
    engaged_sessions: num(r, 2),
    conversions: num(r, 3),
  }));
}

export async function fetchGa4ByDevice(
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<Ga4DeviceDailyRow[]> {
  const ga = google.analyticsdata({
    version: "v1beta",
    auth: getGoogleAuthClient(),
  });
  const rows = await runReportPaginated(
    ga,
    propertyId,
    startDate,
    endDate,
    ["date", "deviceCategory"],
    ["sessions", "totalUsers", "engagedSessions", "conversions"],
  );
  return rows.map((r) => ({
    date: ga4DateToIso(dim(r, 0)),
    device: dim(r, 1),
    sessions: num(r, 0),
    total_users: num(r, 1),
    engaged_sessions: num(r, 2),
    conversions: num(r, 3),
  }));
}
