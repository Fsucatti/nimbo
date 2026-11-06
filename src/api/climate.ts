/**
 * History for the climate section:
 * - normals from 30 years of ERA5 reanalysis (Copernicus), one small request per year;
 * - the last 30 days and the next 16 from the forecast API;
 * - the same date one year ago.
 * Normals never change, so they're kept in the browser for a month after the first load.
 */
import { anchorInYear, computeNormals, NORMAL_YEARS, yearRange, type Normals, type YearWindow } from "../lib/climate";
import { dayDifference } from "../lib/time";
import { column, getJSON, query } from "./http";

const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const CACHE_VERSION = "v1";
const CACHE_DAYS = 30;

/** ERA5's grid is 0.25°, so nearby places share the same normals. */
const toGrid = (value: number) => Math.round(value * 4) / 4;

function cacheKey(latitude: number, longitude: number, anchor: string): string {
  return `nimbo:normals:${CACHE_VERSION}:${toGrid(latitude)},${toGrid(longitude)}:${anchor}`;
}

function readCache(key: string): Normals | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { savedAt, normals } = JSON.parse(raw) as { savedAt: number; normals: Normals };
    if (Date.now() - savedAt > CACHE_DAYS * 86_400_000) return null;
    return normals;
  } catch {
    return null;
  }
}

function writeCache(key: string, normals: Normals): void {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), normals }));
  } catch {
    // Storage full or blocked: the normals simply load again next time.
  }
}

/** Runs async jobs with a cap on how many run at once. */
async function pool<T>(jobs: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const index = next++;
      results[index] = await jobs[index]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return results;
}

type RawDaily = { daily: { time: string[] } & Record<string, (number | null)[]> };

export async function fetchNormals(
  latitude: number,
  longitude: number,
  anchor: string,
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<Normals> {
  const key = cacheKey(latitude, longitude, anchor);
  const cached = readCache(key);
  if (cached) return cached;

  const years: number[] = [];
  for (let year = NORMAL_YEARS.first; year <= NORMAL_YEARS.last; year++) years.push(year);
  let done = 0;
  const jobs = years.map((year) => async (): Promise<YearWindow> => {
    const { start, end } = yearRange(anchor, year);
    const url = `${ARCHIVE_URL}?${query({
      latitude: toGrid(latitude),
      longitude: toGrid(longitude),
      start_date: start,
      end_date: end,
      daily: ["temperature_2m_max", "temperature_2m_min", "precipitation_sum"],
      timezone: "auto",
      models: "era5",
    })}`;
    const raw = await getJSON<RawDaily>(url, signal, 30000);
    const length = raw.daily.time.length;
    // Offsets are counted from the anchor date in that year.
    const center = anchorInYear(anchor, year);
    const result: YearWindow = {
      year,
      offsets: raw.daily.time.map((date) => dayDifference(date, center)),
      tempMax: column(raw.daily.temperature_2m_max, length),
      tempMin: column(raw.daily.temperature_2m_min, length),
      precipitation: column(raw.daily.precipitation_sum, length),
    };
    done += 1;
    onProgress?.(done, years.length);
    return result;
  });
  const windows = await pool(jobs, 8);
  const normals = computeNormals(anchor, windows);
  writeCache(key, normals);
  return normals;
}

export interface RecentDays {
  /** Local midnight of each day, Unix seconds. */
  time: number[];
  tempMax: number[];
  tempMin: number[];
  precipitation: number[];
}

/** The last 31 days and the next 16, daily, in one request. */
export async function fetchRecent(latitude: number, longitude: number, signal?: AbortSignal): Promise<RecentDays> {
  const url = `https://api.open-meteo.com/v1/forecast?${query({
    latitude: Math.round(latitude * 1000) / 1000,
    longitude: Math.round(longitude * 1000) / 1000,
    daily: ["temperature_2m_max", "temperature_2m_min", "precipitation_sum"],
    past_days: 31,
    forecast_days: 16,
    timezone: "auto",
    timeformat: "unixtime",
  })}`;
  const raw = await getJSON<{ daily: { time: number[] } & Record<string, (number | null)[]> }>(url, signal);
  const length = raw.daily.time.length;
  return {
    time: raw.daily.time,
    tempMax: column(raw.daily.temperature_2m_max, length),
    tempMin: column(raw.daily.temperature_2m_min, length),
    precipitation: column(raw.daily.precipitation_sum, length),
  };
}

export interface DayRecord {
  date: string;
  tempMax: number;
  tempMin: number;
  precipitation: number;
  weatherCode: number;
}

/** One past day from the archive (best available models). */
export async function fetchPastDay(latitude: number, longitude: number, date: string, signal?: AbortSignal): Promise<DayRecord | null> {
  const url = `${ARCHIVE_URL}?${query({
    latitude: Math.round(latitude * 1000) / 1000,
    longitude: Math.round(longitude * 1000) / 1000,
    start_date: date,
    end_date: date,
    daily: ["temperature_2m_max", "temperature_2m_min", "precipitation_sum", "weather_code"],
    timezone: "auto",
  })}`;
  const raw = await getJSON<RawDaily>(url, signal);
  const value = (name: string) => {
    const v = raw.daily[name]?.[0];
    return typeof v === "number" ? v : Number.NaN;
  };
  if (!Number.isFinite(value("temperature_2m_max"))) return null;
  return {
    date,
    tempMax: value("temperature_2m_max"),
    tempMin: value("temperature_2m_min"),
    precipitation: value("precipitation_sum"),
    weatherCode: value("weather_code"),
  };
}
