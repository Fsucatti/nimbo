/**
 * Unit conversion and number formatting. The API is always asked for metric values
 * (°C, km/h, mm, hPa, m) and everything is converted here, so switching units never refetches.
 */

export type TemperatureUnit = "c" | "f";
export type WindUnit = "kmh" | "ms" | "mph" | "kn";
export type PrecipitationUnit = "mm" | "in";
export type PressureUnit = "hpa" | "inhg" | "mmhg";
export type DistanceUnit = "km" | "mi";
export type TimeFormat = "24" | "12";

export interface Units {
  temperature: TemperatureUnit;
  wind: WindUnit;
  precipitation: PrecipitationUnit;
  pressure: PressureUnit;
  distance: DistanceUnit;
  time: TimeFormat;
}

export const METRIC: Units = { temperature: "c", wind: "kmh", precipitation: "mm", pressure: "hpa", distance: "km", time: "24" };
export const IMPERIAL: Units = { temperature: "f", wind: "mph", precipitation: "in", pressure: "inhg", distance: "mi", time: "12" };

/** Imperial by default only where it's the everyday system. */
export function defaultUnits(language: string | undefined): Units {
  const region = (language ?? "").split("-")[1]?.toUpperCase();
  return region === "US" || region === "LR" || region === "MM" ? IMPERIAL : METRIC;
}

export const UNIT_LABELS = {
  temperature: { c: "°C", f: "°F" },
  wind: { kmh: "km/h", ms: "m/s", mph: "mph", kn: "kn" },
  precipitation: { mm: "mm", in: "in" },
  pressure: { hpa: "hPa", inhg: "inHg", mmhg: "mmHg" },
  distance: { km: "km", mi: "mi" },
} as const;

const formatters = new Map<string, Intl.NumberFormat>();
/** Formats a number in English with grouping and a fixed number of decimals. */
export function num(value: number, decimals = 0): string {
  const key = String(decimals);
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    formatters.set(key, formatter);
  }
  // Avoid "-0".
  const rounded = Number(value.toFixed(decimals));
  return formatter.format(Object.is(rounded, -0) ? 0 : rounded);
}

const MISSING = "–";
const ok = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);

// ---- Temperature -------------------------------------------------------------------------

export function toTemperature(celsius: number, unit: TemperatureUnit): number {
  return unit === "f" ? (celsius * 9) / 5 + 32 : celsius;
}

/** Converts a temperature difference (not a reading), e.g. "+3°". */
export function toTemperatureDelta(celsius: number, unit: TemperatureUnit): number {
  return unit === "f" ? (celsius * 9) / 5 : celsius;
}

export function formatTemperature(celsius: number | null | undefined, unit: TemperatureUnit, decimals = 0): string {
  if (!ok(celsius)) return MISSING;
  return `${num(toTemperature(celsius, unit), decimals)}°`;
}

export function formatTemperatureDelta(celsius: number, unit: TemperatureUnit, decimals = 0): string {
  const value = Number(toTemperatureDelta(celsius, unit).toFixed(decimals));
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return `${sign}${num(Math.abs(value), decimals)}°`;
}

// ---- Wind ----------------------------------------------------------------------------------

export function toWind(kmh: number, unit: WindUnit): number {
  switch (unit) {
    case "ms":
      return kmh / 3.6;
    case "mph":
      return kmh / 1.609344;
    case "kn":
      return kmh / 1.852;
    default:
      return kmh;
  }
}

export function formatWind(kmh: number | null | undefined, unit: WindUnit, withUnit = true): string {
  if (!ok(kmh)) return MISSING;
  const value = toWind(kmh, unit);
  const text = num(value, unit === "ms" && value < 10 ? 1 : 0);
  return withUnit ? `${text} ${UNIT_LABELS.wind[unit]}` : text;
}

// ---- Precipitation and snow -----------------------------------------------------------------

export function toPrecipitation(mm: number, unit: PrecipitationUnit): number {
  return unit === "in" ? mm / 25.4 : mm;
}

export function formatPrecipitation(mm: number | null | undefined, unit: PrecipitationUnit, withUnit = true): string {
  if (!ok(mm)) return MISSING;
  const value = toPrecipitation(mm, unit);
  let text: string;
  if (value === 0) text = "0";
  else if (unit === "in") text = value < 0.01 ? "<0.01" : num(value, 2);
  else text = value < 0.1 ? "<0.1" : num(value, value < 10 ? 1 : 0);
  return withUnit ? `${text} ${UNIT_LABELS.precipitation[unit]}` : text;
}

/** Snowfall and snow depth arrive in centimeters (snowfall) or meters (depth, converted by the caller). */
export function formatSnow(cm: number | null | undefined, unit: PrecipitationUnit): string {
  if (!ok(cm)) return MISSING;
  if (unit === "in") {
    const inches = cm / 2.54;
    return `${inches < 0.1 && inches > 0 ? "<0.1" : num(inches, 1)} in`;
  }
  return `${cm < 0.1 && cm > 0 ? "<0.1" : num(cm, cm < 10 ? 1 : 0)} cm`;
}

// ---- Pressure --------------------------------------------------------------------------------

export function toPressure(hpa: number, unit: PressureUnit): number {
  if (unit === "inhg") return hpa * 0.0295299830714;
  if (unit === "mmhg") return hpa * 0.750061683;
  return hpa;
}

export function formatPressure(hpa: number | null | undefined, unit: PressureUnit, withUnit = true): string {
  if (!ok(hpa)) return MISSING;
  const value = toPressure(hpa, unit);
  const text = num(value, unit === "inhg" ? 2 : 0);
  return withUnit ? `${text} ${UNIT_LABELS.pressure[unit]}` : text;
}

/** A pressure change, e.g. "+1.4 hPa". */
export function formatPressureDelta(hpa: number, unit: PressureUnit): string {
  const value = toPressure(hpa, unit);
  const decimals = unit === "inhg" ? 2 : 1;
  const rounded = Number(value.toFixed(decimals));
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "±";
  return `${sign}${num(Math.abs(rounded), decimals)} ${UNIT_LABELS.pressure[unit]}`;
}

// ---- Distance and height ---------------------------------------------------------------------

export function formatDistance(meters: number | null | undefined, unit: DistanceUnit): string {
  if (!ok(meters)) return MISSING;
  if (unit === "mi") {
    const miles = meters / 1609.344;
    return `${num(miles, miles < 10 ? 1 : 0)} mi`;
  }
  if (meters < 1000) return `${num(Math.round(meters / 10) * 10)} m`;
  const km = meters / 1000;
  return `${num(km, km < 10 ? 1 : 0)} km`;
}

/** Heights such as the freezing level or a cloud base: meters or feet. */
export function formatHeight(meters: number | null | undefined, unit: DistanceUnit): string {
  if (!ok(meters)) return MISSING;
  if (unit === "mi") return `${num(Math.round((meters * 3.28084) / 50) * 50)} ft`;
  return `${num(Math.round(meters / 10) * 10)} m`;
}

export function formatPercent(value: number | null | undefined): string {
  return ok(value) ? `${num(value)}%` : MISSING;
}

/** Durations given in seconds, e.g. "10h 42m". */
export function formatDuration(seconds: number | null | undefined): string {
  if (!ok(seconds)) return MISSING;
  const totalMinutes = Math.round(Math.abs(seconds) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** A change in day length, e.g. "+1m 52s". */
export function formatDurationDelta(seconds: number): string {
  const sign = seconds > 0.5 ? "+" : seconds < -0.5 ? "−" : "±";
  const total = Math.round(Math.abs(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return minutes > 0 ? `${sign}${minutes}m ${rest}s` : `${sign}${rest}s`;
}

export { ok as isNumber };
