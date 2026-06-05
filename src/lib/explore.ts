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
