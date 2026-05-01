import { google } from "googleapis";
import { getGoogleAuthClient } from "../google/oauth";

export type Ga4DailyMetric = {
  date: string;
  sessions: number;
  totalUsers: number;
  conversions: number;
};

export type Ga4LandingPage = {
  page: string;
  sessions: number;
  conversions: number;
};

function ga4DateToIso(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
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
  const res = await ga.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "conversions" },
      ],
      orderBys: [{ dimension: { dimensionName: "date" } }],
    },
  });
  return (res.data.rows ?? []).map((row) => ({
    date: ga4DateToIso(row.dimensionValues?.[0]?.value ?? ""),
    sessions: Number(row.metricValues?.[0]?.value ?? 0),
    totalUsers: Number(row.metricValues?.[1]?.value ?? 0),
    conversions: Number(row.metricValues?.[2]?.value ?? 0),
  }));
}

export async function fetchGa4LandingPages(
  propertyId: string,
  startDate: string,
  endDate: string,
  limit = 25,
): Promise<Ga4LandingPage[]> {
  const ga = google.analyticsdata({
    version: "v1beta",
    auth: getGoogleAuthClient(),
  });
  const res = await ga.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "landingPage" }],
      metrics: [{ name: "sessions" }, { name: "conversions" }],
      orderBys: [
        { metric: { metricName: "sessions" }, desc: true },
      ],
      limit: String(limit),
    },
  });
  return (res.data.rows ?? []).map((row) => ({
    page: row.dimensionValues?.[0]?.value ?? "",
    sessions: Number(row.metricValues?.[0]?.value ?? 0),
    conversions: Number(row.metricValues?.[1]?.value ?? 0),
  }));
}
