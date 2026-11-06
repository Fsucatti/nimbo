/**
 * Finding places: search by name (Open-Meteo geocoding, GeoNames data), naming a point from
 * coordinates (Nominatim, OpenStreetMap data), and the rough location of a first-time visitor.
 */
import type { Place } from "../lib/types";
import { getJSON, query } from "./http";

interface GeoResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  country_code?: string;
  admin1?: string;
  timezone?: string;
  population?: number;
  feature_code?: string;
}

export async function searchPlaces(name: string, signal?: AbortSignal): Promise<Place[]> {
  const trimmed = name.trim();
  if (trimmed.length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?${query({ name: trimmed, count: 8, language: "en", format: "json" })}`;
  const data = await getJSON<{ results?: GeoResult[] }>(url, signal);
  return (data.results ?? []).map((result) => ({
    name: result.name,
    region: result.admin1,
    country: result.country,
    countryCode: result.country_code,
    latitude: result.latitude,
    longitude: result.longitude,
    timezone: result.timezone,
    source: "search",
  }));
}

interface NominatimResult {
  name?: string;
  address?: Record<string, string>;
  error?: string;
}

/**
 * Names a point on the map or the device's location. Nominatim asks for at most one request
 * per second; the app only calls it after a deliberate action (a map click or "Use my location").
 */
export async function nameForCoordinates(latitude: number, longitude: number, signal?: AbortSignal): Promise<Partial<Place>> {
  const url = `https://nominatim.openstreetmap.org/reverse?${query({
    format: "jsonv2",
    lat: latitude.toFixed(4),
    lon: longitude.toFixed(4),
    zoom: 10,
    "accept-language": "en",
  })}`;
  const data = await getJSON<NominatimResult>(url, signal, 8000);
  if (data.error || !data.address) return {};
  const a = data.address;
  return {
    name: a.city || a.town || a.village || a.municipality || a.county || data.name || a.state,
    region: a.state || a.region,
    country: a.country,
    countryCode: a.country_code?.toUpperCase(),
  };
}

/** The visitor's approximate city, from the app's own endpoint. Null when it can't tell. */
export async function approximateLocation(signal?: AbortSignal): Promise<Place | null> {
  try {
    const data = await getJSON<{ name: string; region?: string; countryCode?: string; latitude: number; longitude: number; timezone?: string } | null>(
      "/api/where",
      signal,
      4000,
    );
    if (!data || !Number.isFinite(data.latitude)) return null;
    return { ...data, country: countryName(data.countryCode), source: "ip" };
  } catch {
    return null;
  }
}

const regionNames = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
export function countryName(code: string | undefined): string | undefined {
  if (!code || !regionNames) return undefined;
  try {
    return regionNames.of(code.toUpperCase());
  } catch {
    return undefined;
  }
}
