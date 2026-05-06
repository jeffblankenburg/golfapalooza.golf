// Shared sessionStorage-backed geolocation cache. Used by RoundForm's "Near me"
// course search and the /loozers map's "Locate me" chip so a single GPS prompt
// covers both within a session.

const KEY = "gp_geo_v1";
const TTL_MS = 15 * 60 * 1000;

export interface GeoCache {
  lat: number;
  lng: number;
  capturedAt: number;
}

export const GEO_CACHE_TTL_MS = TTL_MS;

export function readGeoCache(): GeoCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GeoCache;
    if (Date.now() - parsed.capturedAt > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeGeoCache(lat: number, lng: number) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({ lat, lng, capturedAt: Date.now() } satisfies GeoCache)
    );
  } catch {
    // ignore
  }
}
