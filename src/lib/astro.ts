/**
 * Sun and moon, computed in the browser with SunCalc (all angles in degrees).
 * Open-Meteo gives sunrise and sunset; twilight, golden hour, positions and the moon come from here.
 */
import * as SunCalc from "suncalc";
import { offsetMinutes } from "./time";

export const MOON_PHASES = [
  "New moon",
  "Waxing crescent",
  "First quarter",
  "Waxing gibbous",
  "Full moon",
  "Waning gibbous",
  "Last quarter",
  "Waning crescent",
] as const;

export type MoonPhaseName = (typeof MOON_PHASES)[number];

/** Snaps SunCalc's 0–1 phase to the nearest of the eight named phases. */
export function moonPhaseName(phase: number): MoonPhaseName {
  return MOON_PHASES[Math.round(phase * 8) % 8];
}

/** Days since the last new moon (a synodic month is 29.53 days). */
export function moonAge(phase: number): number {
  return phase * 29.530588;
}

const toDate = (ts: number) => new Date(ts * 1000);
const toTs = (date: Date | null | undefined): number | null => (date ? date.getTime() / 1000 : null);

export interface SunDay {
  /** Astronomical, nautical and civil dawn, then sunrise and the end of the morning golden hour. */
  nightEnd: number | null;
  nauticalDawn: number | null;
  dawn: number | null;
  sunrise: number | null;
  goldenHourEnd: number | null;
  solarNoon: number;
  goldenHour: number | null;
  sunset: number | null;
  dusk: number | null;
  nauticalDusk: number | null;
  night: number | null;
  /** Sun's altitude at solar noon, degrees. */
  noonAltitude: number;
  alwaysUp: boolean;
  alwaysDown: boolean;
}

/** Sun times for the calendar day at the place that contains `ts`. */
export function sunDay(ts: number, latitude: number, longitude: number, timezone: string): SunDay {
  const date = toDate(ts);
  const times = SunCalc.getTimes(date, latitude, longitude, 0, offsetMinutes(timezone, ts));
  const noon = times.solarNoon;
  return {
    nightEnd: toTs(times.nightEnd),
    nauticalDawn: toTs(times.nauticalDawn),
    dawn: toTs(times.dawn),
    sunrise: toTs(times.sunrise),
    goldenHourEnd: toTs(times.goldenHourEnd),
    solarNoon: noon.getTime() / 1000,
    goldenHour: toTs(times.goldenHour),
    sunset: toTs(times.sunset),
    dusk: toTs(times.dusk),
    nauticalDusk: toTs(times.nauticalDusk),
    night: toTs(times.night),
    noonAltitude: SunCalc.getPosition(noon, latitude, longitude).altitude,
    alwaysUp: Boolean(times.alwaysUp),
    alwaysDown: Boolean(times.alwaysDown),
  };
}

export function sunPosition(ts: number, latitude: number, longitude: number) {
  return SunCalc.getPosition(toDate(ts), latitude, longitude);
}

export function moonPosition(ts: number, latitude: number, longitude: number) {
  return SunCalc.getMoonPosition(toDate(ts), latitude, longitude);
}

export interface MoonNow {
  /** Illuminated fraction, 0–1. */
  fraction: number;
  phase: number;
  waxing: boolean;
  name: MoonPhaseName;
  ageDays: number;
  /** Bright limb angle relative to the zenith, degrees, for drawing the moon as seen in the sky. */
  zenithAngle: number;
  distanceKm: number;
  altitude: number;
}

export function moonNow(ts: number, latitude: number, longitude: number): MoonNow {
  const date = toDate(ts);
  const illumination = SunCalc.getMoonIllumination(date);
  const position = SunCalc.getMoonPosition(date, latitude, longitude);
  return {
    fraction: illumination.fraction,
    phase: illumination.phase,
    waxing: illumination.waxing,
    name: moonPhaseName(illumination.phase),
    ageDays: moonAge(illumination.phase),
    zenithAngle: illumination.angle - position.parallacticAngle,
    distanceKm: position.distance,
    altitude: position.altitude,
  };
}

export interface MoonDay {
  rise: number | null;
  set: number | null;
  alwaysUp: boolean;
  alwaysDown: boolean;
}

export function moonDay(ts: number, latitude: number, longitude: number, timezone: string): MoonDay {
  const times = SunCalc.getMoonTimes(toDate(ts), latitude, longitude, offsetMinutes(timezone, ts));
  return {
    rise: toTs(times.rise),
    set: toTs(times.set),
    alwaysUp: Boolean(times.alwaysUp),
    alwaysDown: Boolean(times.alwaysDown),
  };
}

/**
 * Finds the next moments the moon reaches a target phase (0 new, 0.25 first quarter, 0.5 full,
 * 0.75 last quarter) after `ts`. Scans in 6-hour steps, then refines by bisection to the minute.
 */
export function nextPhase(ts: number, target: number, maxDays = 32): number | null {
  const step = 6 * 3600;
  const distance = (t: number) => {
    const phase = SunCalc.getMoonIllumination(toDate(t)).phase;
    // Signed distance to the target in (-0.5, 0.5].
    let d = phase - target;
    if (d > 0.5) d -= 1;
    if (d <= -0.5) d += 1;
    return d;
  };
  let previous = distance(ts);
  for (let t = ts + step; t <= ts + maxDays * 86400; t += step) {
    const current = distance(t);
    // Crossing from just below to at-or-above the target (the phase only increases).
    if (previous < 0 && current >= 0 && current - previous < 0.5) {
      let lo = t - step;
      let hi = t;
      while (hi - lo > 60) {
        const mid = (lo + hi) / 2;
        if (distance(mid) < 0) lo = mid;
        else hi = mid;
      }
      return Math.round(hi);
    }
    previous = current;
  }
  return null;
}

/** Day length in seconds for the calendar day containing `ts` (0 in polar night, 86400 in polar day). */
export function dayLength(ts: number, latitude: number, longitude: number, timezone: string): number {
  const day = sunDay(ts, latitude, longitude, timezone);
  if (day.alwaysUp) return 86400;
  if (day.alwaysDown || day.sunrise === null || day.sunset === null) return 0;
  return day.sunset - day.sunrise;
}

/** Day length for every day of the year containing `ts`, for the "through the year" chart. */
export function yearOfDaylight(year: number, latitude: number, longitude: number, timezone: string): { ts: number; seconds: number }[] {
  const result: { ts: number; seconds: number }[] = [];
  const start = Date.UTC(year, 0, 1, 12) / 1000;
  const end = Date.UTC(year + 1, 0, 1, 12) / 1000;
  for (let t = start; t < end; t += 86400) result.push({ ts: t, seconds: dayLength(t, latitude, longitude, timezone) });
  return result;
}
