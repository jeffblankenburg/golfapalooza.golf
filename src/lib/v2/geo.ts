/**
 * Location coarsening for the member map. A member picks how precisely they appear
 * via `v2_profiles.map_visibility` ('address' | 'city' | 'state' | 'off'); this maps
 * their geocoded point to the coordinate the map is allowed to show:
 *
 *   address → exact point
 *   city    → rounded to ~1 km (keeps the city/neighborhood, hides the house)
 *   state   → snapped to the state centroid (no sub-state precision at all)
 *   off     → not shown (null)
 *
 * Never return a precise home coordinate for anything below 'address'.
 */

export type MapVisibility = "address" | "city" | "state" | "off";

/** Approximate geographic centers of US states + DC, keyed by 2-letter code. */
const STATE_CENTROIDS: Record<string, [number, number]> = {
  AL: [32.8, -86.8], AK: [64.2, -149.5], AZ: [34.3, -111.7], AR: [34.9, -92.4],
  CA: [37.2, -119.3], CO: [39.0, -105.5], CT: [41.6, -72.7], DE: [39.0, -75.5],
  DC: [38.9, -77.0], FL: [28.6, -82.4], GA: [32.6, -83.4], HI: [20.3, -156.4],
  ID: [44.4, -114.6], IL: [40.0, -89.2], IN: [39.9, -86.3], IA: [42.0, -93.5],
  KS: [38.5, -98.4], KY: [37.5, -85.3], LA: [31.0, -92.0], ME: [45.4, -69.2],
  MD: [39.0, -76.8], MA: [42.3, -71.8], MI: [44.3, -85.4], MN: [46.3, -94.3],
  MS: [32.7, -89.7], MO: [38.4, -92.5], MT: [47.0, -109.6], NE: [41.5, -99.8],
  NV: [39.3, -116.6], NH: [43.7, -71.6], NJ: [40.1, -74.7], NM: [34.4, -106.1],
  NY: [42.9, -75.5], NC: [35.5, -79.4], ND: [47.5, -100.5], OH: [40.3, -82.8],
  OK: [35.6, -97.5], OR: [44.0, -120.5], PA: [40.9, -77.8], RI: [41.7, -71.6],
  SC: [33.9, -80.9], SD: [44.4, -100.2], TN: [35.9, -86.4], TX: [31.5, -99.3],
  UT: [39.3, -111.7], VT: [44.1, -72.7], VA: [37.5, -78.9], WA: [47.4, -120.5],
  WV: [38.6, -80.6], WI: [44.6, -89.9], WY: [43.0, -107.6],
};

/** Full state names, so geocoding uses "Eureka, Missouri" (unambiguous) rather than
 *  "Eureka, MO" (Mapbox mis-matches the bare code — "MO" resolves to Montana). */
export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/** 2-letter code → full state name (for geocoding); passes through anything else. */
export function fullStateName(state: string | null | undefined): string | null {
  if (!state) return null;
  return STATE_NAMES[state.toUpperCase()] ?? state;
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/**
 * Resolve the coordinate the map may display for a member, honoring their chosen
 * precision. Returns null when they shouldn't appear (off, or a level we can't place).
 */
export function coarsenLocation(
  level: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
  state: string | null | undefined,
): { lat: number; lng: number; precision: MapVisibility } | null {
  if (level === "address" && lat != null && lng != null) {
    return { lat, lng, precision: "address" };
  }
  if (level === "city" && lat != null && lng != null) {
    return { lat: round(lat, 2), lng: round(lng, 2), precision: "city" };
  }
  if (level === "state") {
    const c = state ? STATE_CENTROIDS[state.toUpperCase()] : undefined;
    if (c) return { lat: c[0], lng: c[1], precision: "state" };
  }
  return null; // off, unknown level, or missing data for the chosen level
}
