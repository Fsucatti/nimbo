/**
 * Index bookkeeping on top of a forecast: which hourly row is "now", which daily row is "today",
 * and which hours belong to each day, all in the place's own calendar.
 */
import type { Forecast } from "../api/forecast";
import { makeClock, type Clock } from "./time";

export interface ForecastView {
  forecast: Forecast;
  clock: Clock;
  /** Current time at the source, Unix seconds. */
  now: number;
  /** Hourly row of the current hour. */
  nowIndex: number;
  /** Daily row of today. */
  todayIndex: number;
  /** Local date of each daily row. */
  dayKeys: string[];
  /** Daily row of each hourly row (-1 when outside the daily range). */
  hourDay: number[];
  /** For each daily row, its first hourly row and the row after its last. */
  dayHours: [number, number][];
}

export function lastIndexAtOrBefore(times: readonly number[], ts: number): number {
  let lo = 0;
  let hi = times.length - 1;
  if (hi < 0 || ts < times[0]) return 0;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (times[mid] <= ts) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function buildView(forecast: Forecast, hour12: boolean): ForecastView {
  const clock = makeClock(forecast.timezone, hour12);
  const now = forecast.current.time;
  const dayKeys = forecast.daily.time.map((ts) => clock.dateKey(ts));
  const dayIndexByKey = new Map(dayKeys.map((key, i) => [key, i]));
  const hourDay = forecast.hourly.time.map((ts) => dayIndexByKey.get(clock.dateKey(ts)) ?? -1);
  const dayHours = dayKeys.map((): [number, number] => [-1, -1]);
  hourDay.forEach((day, hour) => {
    if (day < 0) return;
    if (dayHours[day][0] < 0) dayHours[day][0] = hour;
    dayHours[day][1] = hour + 1;
  });
  const todayKey = clock.dateKey(now);
  return {
    forecast,
    clock,
    now,
    nowIndex: lastIndexAtOrBefore(forecast.hourly.time, now),
    todayIndex: Math.max(0, dayIndexByKey.get(todayKey) ?? 0),
    dayKeys,
    hourDay,
    dayHours,
  };
}

/** Hourly rows from `start` (inclusive) for `count` hours, clamped to the data. */
export function hourRange(view: ForecastView, start: number, count: number): [number, number] {
  const length = view.forecast.hourly.time.length;
  const from = Math.max(0, Math.min(start, length));
  return [from, Math.max(from, Math.min(length, from + count))];
}

export function sumRange(values: readonly number[], from: number, to: number): number {
  let total = 0;
  for (let i = from; i < to; i++) if (Number.isFinite(values[i])) total += values[i];
  return total;
}

export function maxRange(values: readonly number[], from: number, to: number): { value: number; index: number } {
  let value = Number.NEGATIVE_INFINITY;
  let index = -1;
  for (let i = from; i < to; i++) {
    if (Number.isFinite(values[i]) && values[i] > value) {
      value = values[i];
      index = i;
    }
  }
  return { value: index < 0 ? Number.NaN : value, index };
}

export function minRange(values: readonly number[], from: number, to: number): { value: number; index: number } {
  let value = Number.POSITIVE_INFINITY;
  let index = -1;
  for (let i = from; i < to; i++) {
    if (Number.isFinite(values[i]) && values[i] < value) {
      value = values[i];
      index = i;
    }
  }
  return { value: index < 0 ? Number.NaN : value, index };
}
