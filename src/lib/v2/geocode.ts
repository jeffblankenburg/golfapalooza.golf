import { fullStateName } from "./geo";

/**
 * Geocode an address using Mapbox Geocoding API.
 * Returns [latitude, longitude] or null if not found.
 */
export async function geocodeAddress(
  parts: { address?: string | null; city?: string | null; state?: string | null; name?: string | null }
): Promise<[number, number] | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;

  // Try most specific first, fall back to broader. Use the FULL state name — a bare
  // 2-letter code is ambiguous to Mapbox (e.g. "Eureka, MO" resolves to Montana).
  const queries: string[] = [];
  const { address, city, name } = parts;
  const state = fullStateName(parts.state);

  if (address && city && state) queries.push(`${address}, ${city}, ${state}`);
  if (name && city && state) queries.push(`${name}, ${city}, ${state}`);
  if (city && state) queries.push(`${city}, ${state}`);

  for (const query of queries) {
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&country=us&limit=1`
      );
      const data = await res.json();
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        return [lat, lng];
      }
    } catch {
      // try next query
    }
  }

  return null;
}
