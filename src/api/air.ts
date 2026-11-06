/**
 * Air quality and pollen. Source: Open-Meteo air quality API, built on the Copernicus
 * Atmosphere Monitoring Service (CAMS). Pollen is only modeled for Europe, in season.
 */
import { column, getJSON, query, roundCoord } from "./http";

const POLLUTANTS = {
  usAqi: "us_aqi",
  euAqi: "european_aqi",
  pm2_5: "pm2_5",
  pm10: "pm10",
  ozone: "ozone",
  nitrogen_dioxide: "nitrogen_dioxide",
  sulphur_dioxide: "sulphur_dioxide",
  carbon_monoxide: "carbon_monoxide",
  dust: "dust",
  aod: "aerosol_optical_depth",
} as const;

const POLLEN = {
  alder: "alder_pollen",
  birch: "birch_pollen",
  grass: "grass_pollen",
  mugwort: "mugwort_pollen",
  olive: "olive_pollen",
  ragweed: "ragweed_pollen",
} as const;

export type PollutantKey = keyof typeof POLLUTANTS;
export type PollenKey = keyof typeof POLLEN;

export interface AirQuality {
  current: Record<PollutantKey | PollenKey, number> & { time: number };
  hourly: { time: number[] } & Record<PollutantKey | PollenKey, number[]>;
  /** False outside Europe or out of season, when every pollen value is missing. */
  hasPollen: boolean;
}

type Raw = {
  current: Record<string, number | null>;
  hourly: { time: number[] } & Record<string, (number | null)[]>;
};

export async function fetchAirQuality(latitude: number, longitude: number, signal?: AbortSignal): Promise<AirQuality> {
  const names = { ...POLLUTANTS, ...POLLEN };
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?${query({
    latitude: roundCoord(latitude),
    longitude: roundCoord(longitude),
    current: Object.values(names),
    hourly: Object.values(names),
    timezone: "auto",
    timeformat: "unixtime",
    forecast_days: 5,
  })}`;
  const raw = await getJSON<Raw>(url, signal);
  const length = raw.hourly.time.length;
  const current = { time: raw.current.time as number } as AirQuality["current"];
  const hourly = { time: raw.hourly.time } as AirQuality["hourly"];
  for (const [key, apiName] of Object.entries(names)) {
    const value = raw.current[apiName];
    (current as Record<string, number>)[key] = typeof value === "number" ? value : Number.NaN;
    (hourly as Record<string, number[]>)[key] = column(raw.hourly[apiName], length);
  }
  const hasPollen = (Object.keys(POLLEN) as PollenKey[]).some((key) => hourly[key].some((value) => Number.isFinite(value)));
  return { current, hourly, hasPollen };
}

export const POLLEN_INFO: Record<PollenKey, { name: string; kind: "tree" | "grass" | "weed" }> = {
  alder: { name: "Alder", kind: "tree" },
  birch: { name: "Birch", kind: "tree" },
  olive: { name: "Olive", kind: "tree" },
  grass: { name: "Grass", kind: "grass" },
  mugwort: { name: "Mugwort", kind: "weed" },
  ragweed: { name: "Ragweed", kind: "weed" },
};
