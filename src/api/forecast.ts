/**
 * The main forecast: current conditions, the next three hours in 15-minute steps,
 * hourly data from yesterday to 16 days ahead, and daily summaries.
 * Source: Open-Meteo forecast API, which picks the best weather models for each place.
 */
import { column, getJSON, query, roundCoord } from "./http";

export const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

const CURRENT = {
  temperature: "temperature_2m",
  humidity: "relative_humidity_2m",
  apparent: "apparent_temperature",
  isDay: "is_day",
  precipitation: "precipitation",
  rain: "rain",
  showers: "showers",
  snowfall: "snowfall",
  weatherCode: "weather_code",
  cloudCover: "cloud_cover",
  cloudLow: "cloud_cover_low",
  cloudMid: "cloud_cover_mid",
  cloudHigh: "cloud_cover_high",
  pressure: "pressure_msl",
  surfacePressure: "surface_pressure",
  windSpeed: "wind_speed_10m",
  windDirection: "wind_direction_10m",
  windGusts: "wind_gusts_10m",
  visibility: "visibility",
  uvIndex: "uv_index",
  dewPoint: "dew_point_2m",
} as const;

const HOURLY = {
  temperature: "temperature_2m",
  humidity: "relative_humidity_2m",
  dewPoint: "dew_point_2m",
  apparent: "apparent_temperature",
  precipProbability: "precipitation_probability",
  precipitation: "precipitation",
  rain: "rain",
  showers: "showers",
  snowfall: "snowfall",
  snowDepth: "snow_depth",
  weatherCode: "weather_code",
  pressure: "pressure_msl",
  cloudCover: "cloud_cover",
  cloudLow: "cloud_cover_low",
  cloudMid: "cloud_cover_mid",
  cloudHigh: "cloud_cover_high",
  visibility: "visibility",
  windSpeed: "wind_speed_10m",
  windDirection: "wind_direction_10m",
  windGusts: "wind_gusts_10m",
  uvIndex: "uv_index",
  uvClearSky: "uv_index_clear_sky",
  isDay: "is_day",
  sunshine: "sunshine_duration",
  wetBulb: "wet_bulb_temperature_2m",
  cape: "cape",
  liftedIndex: "lifted_index",
  freezingLevel: "freezing_level_height",
  radiation: "shortwave_radiation",
  et0: "et0_fao_evapotranspiration",
  vpd: "vapour_pressure_deficit",
  soilTemperature: "soil_temperature_0cm",
  soilMoisture: "soil_moisture_0_to_1cm",
} as const;

const DAILY = {
  weatherCode: "weather_code",
  tempMax: "temperature_2m_max",
  tempMin: "temperature_2m_min",
  apparentMax: "apparent_temperature_max",
  apparentMin: "apparent_temperature_min",
  sunrise: "sunrise",
  sunset: "sunset",
  daylight: "daylight_duration",
  sunshine: "sunshine_duration",
  uvMax: "uv_index_max",
  precipSum: "precipitation_sum",
  rainSum: "rain_sum",
  showersSum: "showers_sum",
  snowSum: "snowfall_sum",
  precipHours: "precipitation_hours",
  precipProbMax: "precipitation_probability_max",
  windMax: "wind_speed_10m_max",
  gustMax: "wind_gusts_10m_max",
  windDirection: "wind_direction_10m_dominant",
  radiationSum: "shortwave_radiation_sum",
  et0: "et0_fao_evapotranspiration",
  humidityMean: "relative_humidity_2m_mean",
  cloudMean: "cloud_cover_mean",
} as const;

const MINUTELY = {
  precipitation: "precipitation",
  weatherCode: "weather_code",
} as const;

type Columns<T extends Record<string, string>> = { time: number[] } & { -readonly [K in keyof T]: number[] };

export type Current = { -readonly [K in keyof typeof CURRENT]: number } & { time: number; interval: number };
export type Hourly = Columns<typeof HOURLY>;
export type Daily = Columns<typeof DAILY>;
export type Minutely = Columns<typeof MINUTELY>;
export type HourlyKey = keyof typeof HOURLY;
export type DailyKey = keyof typeof DAILY;

export interface Forecast {
  latitude: number;
  longitude: number;
  elevation: number;
  timezone: string;
  timezoneAbbreviation: string;
  utcOffsetSeconds: number;
  current: Current;
  /** Next three hours, 15-minute steps. */
  minutely: Minutely;
  /** From the start of yesterday to the end of the forecast. */
  hourly: Hourly;
  /** Yesterday, today and the next 15 days. */
  daily: Daily;
  /** When the browser received it, in ms. */
  fetchedAt: number;
}

interface RawBlock {
  time: number[];
  [name: string]: (number | null)[] | number[];
}

interface RawForecast {
  latitude: number;
  longitude: number;
  elevation: number;
  timezone: string;
  timezone_abbreviation: string;
  utc_offset_seconds: number;
  current: Record<string, number | null>;
  minutely_15: RawBlock;
  hourly: RawBlock;
  daily: RawBlock;
}

function parseBlock<T extends Record<string, string>>(raw: RawBlock, names: T): Columns<T> {
  const length = raw.time.length;
  const result = { time: raw.time.slice() } as Columns<T>;
  for (const [key, apiName] of Object.entries(names)) {
    (result as Record<string, number[]>)[key] = column(raw[apiName] as (number | null)[], length);
  }
  return result;
}

/** Drops trailing rows past the end of the model run, where every value is missing. */
function trimTail<T extends { time: number[] }>(block: T, key: keyof T): T {
  const reference = block[key] as unknown as number[];
  let end = reference.length;
  while (end > 0 && !Number.isFinite(reference[end - 1])) end -= 1;
  if (end === reference.length) return block;
  const result = {} as T;
  for (const [name, values] of Object.entries(block)) (result as Record<string, number[]>)[name] = (values as number[]).slice(0, end);
  return result;
}

export function forecastUrl(latitude: number, longitude: number): string {
  return `${FORECAST_URL}?${query({
    latitude: roundCoord(latitude),
    longitude: roundCoord(longitude),
    current: Object.values(CURRENT),
    minutely_15: Object.values(MINUTELY),
    hourly: Object.values(HOURLY),
    daily: Object.values(DAILY),
    timezone: "auto",
    timeformat: "unixtime",
    past_days: 1,
    forecast_days: 16,
    forecast_minutely_15: 12,
  })}`;
}

export function parseForecast(raw: RawForecast, fetchedAt = Date.now()): Forecast {
  const current = { time: raw.current.time as number, interval: (raw.current.interval as number) ?? 900 } as Current;
  for (const [key, apiName] of Object.entries(CURRENT)) {
    const value = raw.current[apiName];
    (current as Record<string, number>)[key] = typeof value === "number" ? value : Number.NaN;
  }
  return {
    latitude: raw.latitude,
    longitude: raw.longitude,
    elevation: raw.elevation,
    timezone: raw.timezone,
    timezoneAbbreviation: raw.timezone_abbreviation,
    utcOffsetSeconds: raw.utc_offset_seconds,
    current,
    minutely: parseBlock(raw.minutely_15, MINUTELY),
    hourly: trimTail(parseBlock(raw.hourly, HOURLY), "temperature"),
    daily: trimTail(parseBlock(raw.daily, DAILY), "tempMax"),
    fetchedAt,
  };
}

export async function fetchForecast(latitude: number, longitude: number, signal?: AbortSignal): Promise<Forecast> {
  const raw = await getJSON<RawForecast>(forecastUrl(latitude, longitude), signal);
  return parseForecast(raw);
}

/** Current temperature and conditions for several places in one request (saved places list). */
export interface PlaceNow {
  temperature: number;
  weatherCode: number;
  isDay: boolean;
  tempMax: number;
  tempMin: number;
}

export async function fetchPlacesNow(places: { latitude: number; longitude: number }[], signal?: AbortSignal): Promise<PlaceNow[]> {
  if (places.length === 0) return [];
  const url = `${FORECAST_URL}?${query({
    latitude: places.map((p) => roundCoord(p.latitude)),
    longitude: places.map((p) => roundCoord(p.longitude)),
    current: ["temperature_2m", "weather_code", "is_day"],
    daily: ["temperature_2m_max", "temperature_2m_min"],
    timezone: "auto",
    forecast_days: 1,
  })}`;
  type Raw = { current: Record<string, number>; daily: Record<string, number[]> };
  const raw = await getJSON<Raw | Raw[]>(url, signal);
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((item) => ({
    temperature: item.current.temperature_2m,
    weatherCode: item.current.weather_code,
    isDay: item.current.is_day === 1,
    tempMax: item.daily.temperature_2m_max?.[0] ?? Number.NaN,
    tempMin: item.daily.temperature_2m_min?.[0] ?? Number.NaN,
  }));
}
