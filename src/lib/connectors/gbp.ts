// Google Business Profile Performance API.
//
// Heads-up: this API has higher friction than GSC/GA4.
//   1. Enable "Business Profile Performance API" in Google Cloud Console.
//   2. File the GBP API access request form — approval can take days/weeks:
//      https://developers.google.com/my-business/content/prereqs
//   3. Each location ID looks like "locations/{location_id}", reachable via
//      the Account Management API.
//
// Once approved, swap the stub below for a real call to
// businessprofileperformance.locations.fetchMultiDailyMetricsTimeSeries.

export type GbpDailyMetric = {
  date: string;
  profileViews: number;
  calls: number;
  directionRequests: number;
  websiteClicks: number;
};

export async function fetchGbpDaily(
  _locationId: string,
  _startDate: string,
  _endDate: string,
): Promise<GbpDailyMetric[]> {
  throw new Error(
    "GBP connector not yet implemented — pending Business Profile API access approval.",
  );
}
