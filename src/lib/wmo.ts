/**
 * WMO weather interpretation codes, as used by Open-Meteo, mapped to words and icons.
 * https://open-meteo.com/en/docs (section "WMO Weather interpretation codes")
 */

export type IconKind =
  | "clear"
  | "mostly-clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "heavy-rain"
  | "freezing-rain"
  | "snow"
  | "heavy-snow"
  | "sleet"
  | "showers"
  | "snow-showers"
  | "thunder"
  | "hail";

/** Broad groups used by the sky, summaries and warnings. */
export type ConditionGroup = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

export interface Condition {
  /** Wording for daytime; night wording replaces "sunny" with "clear". */
  day: string;
  night: string;
  icon: IconKind;
  group: ConditionGroup;
  /** 0 none, 1 light, 2 moderate, 3 heavy. */
  intensity: 0 | 1 | 2 | 3;
  freezing?: boolean;
}

const TABLE: Record<number, Condition> = {
  0: { day: "Sunny", night: "Clear", icon: "clear", group: "clear", intensity: 0 },
  1: { day: "Mostly sunny", night: "Mostly clear", icon: "mostly-clear", group: "clear", intensity: 0 },
  2: { day: "Partly cloudy", night: "Partly cloudy", icon: "partly-cloudy", group: "partly", intensity: 0 },
  3: { day: "Overcast", night: "Overcast", icon: "cloudy", group: "cloudy", intensity: 0 },
  45: { day: "Fog", night: "Fog", icon: "fog", group: "fog", intensity: 1 },
  48: { day: "Freezing fog", night: "Freezing fog", icon: "fog", group: "fog", intensity: 2, freezing: true },
  51: { day: "Light drizzle", night: "Light drizzle", icon: "drizzle", group: "drizzle", intensity: 1 },
  53: { day: "Drizzle", night: "Drizzle", icon: "drizzle", group: "drizzle", intensity: 2 },
  55: { day: "Heavy drizzle", night: "Heavy drizzle", icon: "drizzle", group: "drizzle", intensity: 3 },
  56: { day: "Light freezing drizzle", night: "Light freezing drizzle", icon: "freezing-rain", group: "drizzle", intensity: 1, freezing: true },
  57: { day: "Freezing drizzle", night: "Freezing drizzle", icon: "freezing-rain", group: "drizzle", intensity: 2, freezing: true },
  61: { day: "Light rain", night: "Light rain", icon: "rain", group: "rain", intensity: 1 },
  63: { day: "Rain", night: "Rain", icon: "rain", group: "rain", intensity: 2 },
  65: { day: "Heavy rain", night: "Heavy rain", icon: "heavy-rain", group: "rain", intensity: 3 },
  66: { day: "Light freezing rain", night: "Light freezing rain", icon: "freezing-rain", group: "rain", intensity: 1, freezing: true },
  67: { day: "Freezing rain", night: "Freezing rain", icon: "freezing-rain", group: "rain", intensity: 3, freezing: true },
  71: { day: "Light snow", night: "Light snow", icon: "snow", group: "snow", intensity: 1 },
  73: { day: "Snow", night: "Snow", icon: "snow", group: "snow", intensity: 2 },
  75: { day: "Heavy snow", night: "Heavy snow", icon: "heavy-snow", group: "snow", intensity: 3 },
  77: { day: "Snow grains", night: "Snow grains", icon: "sleet", group: "snow", intensity: 1 },
  80: { day: "Light showers", night: "Light showers", icon: "showers", group: "rain", intensity: 1 },
  81: { day: "Showers", night: "Showers", icon: "showers", group: "rain", intensity: 2 },
  82: { day: "Violent showers", night: "Violent showers", icon: "heavy-rain", group: "rain", intensity: 3 },
  85: { day: "Snow showers", night: "Snow showers", icon: "snow-showers", group: "snow", intensity: 1 },
  86: { day: "Heavy snow showers", night: "Heavy snow showers", icon: "snow-showers", group: "snow", intensity: 3 },
  95: { day: "Thunderstorm", night: "Thunderstorm", icon: "thunder", group: "storm", intensity: 2 },
  96: { day: "Thunderstorm with hail", night: "Thunderstorm with hail", icon: "hail", group: "storm", intensity: 3 },
  99: { day: "Thunderstorm with heavy hail", night: "Thunderstorm with heavy hail", icon: "hail", group: "storm", intensity: 3 },
};

const UNKNOWN: Condition = { day: "Unknown", night: "Unknown", icon: "cloudy", group: "cloudy", intensity: 0 };

export function condition(code: number | null | undefined): Condition {
  if (typeof code !== "number" || !Number.isFinite(code)) return UNKNOWN;
  return TABLE[Math.round(code)] ?? UNKNOWN;
}

export function conditionLabel(code: number | null | undefined, isDay: boolean): string {
  const c = condition(code);
  return isDay ? c.day : c.night;
}

export function isPrecipitation(code: number | null | undefined): boolean {
  const group = condition(code).group;
  return group === "drizzle" || group === "rain" || group === "snow" || group === "storm";
}

export function isStorm(code: number | null | undefined): boolean {
  return condition(code).group === "storm";
}

export function isSnow(code: number | null | undefined): boolean {
  return condition(code).group === "snow";
}

/** What falls, in words: "rain", "snow", "drizzle"... Used in sentences. */
export function precipitationNoun(code: number | null | undefined): string {
  const c = condition(code);
  if (c.group === "snow") return "snow";
  if (c.group === "drizzle") return c.freezing ? "freezing drizzle" : "drizzle";
  if (c.group === "storm") return "thunderstorms";
  if (c.freezing) return "freezing rain";
  if (c.icon === "showers") return "showers";
  return "rain";
}
