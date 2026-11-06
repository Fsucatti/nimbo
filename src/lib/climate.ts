/**
 * Climate normals for the days around today: what highs, lows and rain usually look like
 * between 1991 and 2020 (the current standard reference period), from ERA5 reanalysis data.
 */
import { mean, percentile } from "./stats";
import { addDays } from "./time";

export const NORMAL_YEARS = { first: 1991, last: 2020 } as const;
/** Days before and after the anchor date that the chart covers. */
export const PAST_DAYS = 30;
export const FUTURE_DAYS = 15;
/** Each normal averages this many days on either side, which smooths out single odd days. */
export const SMOOTHING = 3;

export interface YearWindow {
  year: number;
  /** Offsets from the anchor date, in days. */
  offsets: number[];
  tempMax: number[];
  tempMin: number[];
  precipitation: number[];
}

export interface ClimateRecord {
  value: number;
  year: number;
}

export interface Normals {
  /** Anchor date as "MM-DD". */
  anchor: string;
  offsets: number[];
  maxMean: number[];
  maxP10: number[];
  maxP90: number[];
  minMean: number[];
  minP10: number[];
  minP90: number[];
  /** Average daily precipitation, mm. */
  precipMean: number[];
  /** Share of years with at least 1 mm on that day, 0–1. */
  wetChance: number[];
  /** Extremes for the anchor date itself. */
  records: { warmest: ClimateRecord; coldest: ClimateRecord; wettest: ClimateRecord; coolestHigh: ClimateRecord; warmestLow: ClimateRecord } | null;
  yearsUsed: number;
}

/** The anchor date in a given year; Feb 29 falls back to Feb 28 in common years. */
export function anchorInYear(anchor: string, year: number): string {
  const [month, day] = anchor.split("-").map(Number);
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const safeDay = month === 2 && day === 29 && !isLeap ? 28 : day;
  return `${year}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

/** The date range to request for each year: the chart range plus the smoothing margin. */
export function yearRange(anchor: string, year: number): { start: string; end: string } {
  const center = anchorInYear(anchor, year);
  return { start: addDays(center, -(PAST_DAYS + SMOOTHING)), end: addDays(center, FUTURE_DAYS + SMOOTHING) };
}

export function computeNormals(anchor: string, years: YearWindow[]): Normals {
  const offsets: number[] = [];
  for (let k = -PAST_DAYS; k <= FUTURE_DAYS; k++) offsets.push(k);

  const pick = (year: YearWindow, values: number[], offset: number) => {
    const index = year.offsets.indexOf(offset);
    return index < 0 ? Number.NaN : values[index];
  };
  const pool = (key: "tempMax" | "tempMin" | "precipitation", center: number) => {
    const values: number[] = [];
    for (const year of years) for (let d = -SMOOTHING; d <= SMOOTHING; d++) values.push(pick(year, year[key], center + d));
    return values;
  };

  const normals: Normals = {
    anchor,
    offsets,
    maxMean: [],
    maxP10: [],
    maxP90: [],
    minMean: [],
    minP10: [],
    minP90: [],
    precipMean: [],
    wetChance: [],
    records: null,
    yearsUsed: years.length,
  };
  for (const offset of offsets) {
    const highs = pool("tempMax", offset);
    const lows = pool("tempMin", offset);
    const rain = pool("precipitation", offset).filter(Number.isFinite);
    normals.maxMean.push(mean(highs));
    normals.maxP10.push(percentile(highs, 10));
    normals.maxP90.push(percentile(highs, 90));
    normals.minMean.push(mean(lows));
    normals.minP10.push(percentile(lows, 10));
    normals.minP90.push(percentile(lows, 90));
    normals.precipMean.push(mean(rain));
    normals.wetChance.push(rain.length ? rain.filter((value) => value >= 1).length / rain.length : Number.NaN);
  }

  // Records for the date itself, without smoothing.
  const sameDay = years
    .map((year) => ({ year: year.year, max: pick(year, year.tempMax, 0), min: pick(year, year.tempMin, 0), rain: pick(year, year.precipitation, 0) }))
    .filter((row) => Number.isFinite(row.max) && Number.isFinite(row.min));
  if (sameDay.length > 0) {
    const by = (compare: (a: (typeof sameDay)[number], b: (typeof sameDay)[number]) => number) => [...sameDay].sort(compare)[0];
    const warmest = by((a, b) => b.max - a.max);
    const coldest = by((a, b) => a.min - b.min);
    const coolestHigh = by((a, b) => a.max - b.max);
    const warmestLow = by((a, b) => b.min - a.min);
    const wettest = by((a, b) => (Number.isFinite(b.rain) ? b.rain : -1) - (Number.isFinite(a.rain) ? a.rain : -1));
    normals.records = {
      warmest: { value: warmest.max, year: warmest.year },
      coldest: { value: coldest.min, year: coldest.year },
      coolestHigh: { value: coolestHigh.max, year: coolestHigh.year },
      warmestLow: { value: warmestLow.min, year: warmestLow.year },
      wettest: { value: wettest.rain, year: wettest.year },
    };
  }
  return normals;
}

export interface Comparison {
  /** Mean difference of daily highs and lows from normal over the period, °C. */
  anomaly: number;
  /** Total precipitation and its normal, mm. */
  precipitation: number;
  normalPrecipitation: number;
  days: number;
}

/** Compares actual (or forecast) daily values with the normals over a range of offsets. */
export function compare(
  normals: Normals,
  actual: { offset: number; tempMax: number; tempMin: number; precipitation: number }[],
  fromOffset: number,
  toOffset: number,
): Comparison | null {
  const rows = actual.filter((row) => row.offset >= fromOffset && row.offset <= toOffset);
  const diffs: number[] = [];
  let precipitation = 0;
  let normalPrecipitation = 0;
  let days = 0;
  for (const row of rows) {
    const index = normals.offsets.indexOf(row.offset);
    if (index < 0) continue;
    if (Number.isFinite(row.tempMax)) diffs.push(row.tempMax - normals.maxMean[index]);
    if (Number.isFinite(row.tempMin)) diffs.push(row.tempMin - normals.minMean[index]);
    if (Number.isFinite(row.precipitation)) precipitation += row.precipitation;
    if (Number.isFinite(normals.precipMean[index])) normalPrecipitation += normals.precipMean[index];
    days += 1;
  }
  if (days === 0) return null;
  return { anomaly: mean(diffs), precipitation, normalPrecipitation, days };
}
