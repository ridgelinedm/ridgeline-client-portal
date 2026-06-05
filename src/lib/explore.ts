// Shared sort parsing for the explorers + their CSV export routes.

export type SortKey = "clicks" | "impressions" | "ctr" | "position" | "query";
export type SortDir = "asc" | "desc";

const ALLOWED: SortKey[] = ["clicks", "impressions", "ctr", "position", "query"];

export function parseSort(raw: string | null | undefined): {
  key: SortKey;
  dir: SortDir;
} {
  const [keyRaw, dirRaw] = (raw ?? "clicks_desc").split("_");
  const key = (ALLOWED as string[]).includes(keyRaw)
    ? (keyRaw as SortKey)
    : "clicks";
  const dir: SortDir = dirRaw === "asc" ? "asc" : "desc";
  return { key, dir };
}

export type PageSortKey =
  | "page_path"
  | "clicks"
  | "impressions"
  | "ctr"
  | "avg_position"
  | "sessions"
  | "engagement_rate"
  | "conversions";

const PAGE_ALLOWED: PageSortKey[] = [
  "page_path",
  "clicks",
  "impressions",
  "ctr",
  "avg_position",
  "sessions",
  "engagement_rate",
  "conversions",
];

// Pages keys can contain underscores (engagement_rate, avg_position), so split
// on the LAST underscore to separate the direction.
export function parsePageSort(raw: string | null | undefined): {
  key: PageSortKey;
  dir: SortDir;
} {
  const idx = (raw ?? "clicks_desc").lastIndexOf("_");
  const keyToken = idx >= 0 ? (raw ?? "").slice(0, idx) : "clicks";
  const dirToken = idx >= 0 ? (raw ?? "").slice(idx + 1) : "desc";
  const key = (PAGE_ALLOWED as string[]).includes(keyToken)
    ? (keyToken as PageSortKey)
    : "clicks";
  const dir: SortDir = dirToken === "asc" ? "asc" : "desc";
  return { key, dir };
}
