// Widget catalogue + layout schema for per-client custom dashboards. No JSX and
// no server imports here, so both the server renderer and the client-side editor
// can import it.

export type WidgetType =
  | "health-score"
  | "kpi-grid"
  | "traffic-trend"
  | "top-movers"
  | "top-queries"
  | "top-pages"
  | "gbp-block";

// One widget instance in a workspace's layout. `w` is the column span (1–3).
export type LayoutWidget = {
  id: string;
  type: WidgetType;
  w: 1 | 2 | 3;
};

export type Layout = {
  version: number;
  widgets: LayoutWidget[];
};

export const WIDGET_META: Record<
  WidgetType,
  { label: string; description: string; defaultWidth: 1 | 2 | 3 }
> = {
  "health-score": {
    label: "Health score",
    description: "The 0–100 composite score tile.",
    defaultWidth: 1,
  },
  "kpi-grid": {
    label: "KPI cards",
    description: "Clicks, impressions, sessions, conversions, position, DR, refdomains.",
    defaultWidth: 2,
  },
  "traffic-trend": {
    label: "Traffic trend",
    description: "Daily clicks trend chart.",
    defaultWidth: 3,
  },
  "top-movers": {
    label: "Top movers",
    description: "Biggest winning + losing queries by click change.",
    defaultWidth: 3,
  },
  "top-queries": {
    label: "Top queries",
    description: "Highest-click search queries this period.",
    defaultWidth: 3,
  },
  "top-pages": {
    label: "Top pages",
    description: "Top pages by organic traffic (Ahrefs).",
    defaultWidth: 3,
  },
  "gbp-block": {
    label: "Google Business Profile",
    description: "Local metrics — placeholder until GBP API access is approved.",
    defaultWidth: 3,
  },
};

export const ALL_WIDGET_TYPES = Object.keys(WIDGET_META) as WidgetType[];

// Default layout when a workspace has no saved layout — reproduces the existing
// overview (health + KPIs, then movers + pages) plus a traffic-trend chart.
export const DEFAULT_LAYOUT: Layout = {
  version: 1,
  widgets: [
    { id: "w_health", type: "health-score", w: 1 },
    { id: "w_kpis", type: "kpi-grid", w: 2 },
    { id: "w_trend", type: "traffic-trend", w: 3 },
    { id: "w_movers", type: "top-movers", w: 3 },
    { id: "w_pages", type: "top-pages", w: 3 },
  ],
};

// Tailwind needs static class names, so map span → class explicitly.
export function widthClass(w: 1 | 2 | 3): string {
  return w === 3 ? "md:col-span-3" : w === 2 ? "md:col-span-2" : "md:col-span-1";
}
