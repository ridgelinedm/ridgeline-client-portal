export type MetricSource = "gsc" | "ga4" | "gbp" | "ahrefs";

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  gsc_property: string | null;
  ga4_property_id: string | null;
  gbp_location_id: string | null;
  ahrefs_domain: string | null;
  logo_url: string | null;
  primary_color: string | null;
};

export type MetricSnapshot = {
  id: string;
  workspace_id: string;
  source: MetricSource;
  metric_date: string;
  metric_key: string;
  metric_value: number;
  dimensions: Record<string, string> | null;
};
