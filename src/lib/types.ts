/** A place the app can show weather for. */
export interface Place {
  name: string;
  /** State, province or region. */
  region?: string;
  country?: string;
  /** ISO 3166-1 alpha-2, e.g. "AR". */
  countryCode?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  /** How the place was chosen. "ip" means it was estimated from the connection. */
  source?: "search" | "gps" | "ip" | "map" | "url" | "default";
}

export function placeKey(place: Pick<Place, "latitude" | "longitude">): string {
  return `${place.latitude.toFixed(3)},${place.longitude.toFixed(3)}`;
}

/** "Córdoba, Argentina" or "Córdoba, Andalusia, Spain" when the region adds information. */
export function placeSubtitle(place: Place): string {
  const parts = [place.region, place.country].filter((part): part is string => Boolean(part) && part !== place.name);
  return parts.join(", ");
}

export function formatCoordinates(latitude: number, longitude: number): string {
  const lat = `${Math.abs(latitude).toFixed(2)}°${latitude >= 0 ? "N" : "S"}`;
  const lon = `${Math.abs(longitude).toFixed(2)}°${longitude >= 0 ? "E" : "W"}`;
  return `${lat}, ${lon}`;
}

export const DEFAULT_PLACE: Place = {
  name: "Buenos Aires",
  region: "Buenos Aires F.D.",
  country: "Argentina",
  countryCode: "AR",
  latitude: -34.6131,
  longitude: -58.3772,
  timezone: "America/Argentina/Buenos_Aires",
  source: "default",
};
