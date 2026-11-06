/**
 * Sea conditions: waves, swell, sea temperature, currents and sea level (tides).
 * Source: Open-Meteo marine API. Inland places get no data, and the section stays hidden.
 */
import { column, getJSON, query, roundCoord } from "./http";

const HOURLY = {
  waveHeight: "wave_height",
  waveDirection: "wave_direction",
  wavePeriod: "wave_period",
  swellHeight: "swell_wave_height",
  swellDirection: "swell_wave_direction",
  swellPeriod: "swell_wave_period",
  windWaveHeight: "wind_wave_height",
  seaTemperature: "sea_surface_temperature",
  seaLevel: "sea_level_height_msl",
  currentSpeed: "ocean_current_velocity",
  currentDirection: "ocean_current_direction",
} as const;

export type MarineKey = keyof typeof HOURLY;

export interface Marine {
  latitude: number;
  longitude: number;
  hourly: { time: number[] } & Record<MarineKey, number[]>;
}

type Raw = { latitude: number; longitude: number; hourly: { time: number[] } & Record<string, (number | null)[]> };

export async function fetchMarine(latitude: number, longitude: number, signal?: AbortSignal): Promise<Marine | null> {
  const url = `https://marine-api.open-meteo.com/v1/marine?${query({
    latitude: roundCoord(latitude),
    longitude: roundCoord(longitude),
    hourly: Object.values(HOURLY),
    timezone: "auto",
    timeformat: "unixtime",
    past_days: 1,
    forecast_days: 7,
  })}`;
  const raw = await getJSON<Raw>(url, signal);
  const length = raw.hourly.time.length;
  const hourly = { time: raw.hourly.time } as Marine["hourly"];
  for (const [key, apiName] of Object.entries(HOURLY)) (hourly as Record<string, number[]>)[key] = column(raw.hourly[apiName], length);
  const hasWaves = hourly.waveHeight.some(Number.isFinite) || hourly.seaTemperature.some(Number.isFinite);
  return hasWaves ? { latitude: raw.latitude, longitude: raw.longitude, hourly } : null;
}

/** Great-circle distance in km, to say how far the sea data point is from the place. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
