/**
 * Plain-language readings of raw values: Beaufort scale, compass points, how humid air feels,
 * UV and air quality categories, pressure trends and storm potential.
 */

// ---- Wind ---------------------------------------------------------------------------------------

const BEAUFORT: { max: number; name: string; land: string }[] = [
  { max: 2, name: "Calm", land: "Smoke rises straight up" },
  { max: 6, name: "Light air", land: "Smoke drifts, wind vanes still" },
  { max: 12, name: "Light breeze", land: "Leaves rustle, wind felt on the face" },
  { max: 20, name: "Gentle breeze", land: "Leaves and small twigs in motion" },
  { max: 29, name: "Moderate breeze", land: "Raises dust and loose paper" },
  { max: 39, name: "Fresh breeze", land: "Small trees sway" },
  { max: 50, name: "Strong breeze", land: "Large branches move, umbrellas are hard to use" },
  { max: 62, name: "Near gale", land: "Whole trees sway, walking against it is hard" },
  { max: 75, name: "Gale", land: "Twigs break off trees" },
  { max: 89, name: "Strong gale", land: "Light structural damage" },
  { max: 103, name: "Storm", land: "Trees uprooted, considerable damage" },
  { max: 118, name: "Violent storm", land: "Widespread damage" },
  { max: Number.POSITIVE_INFINITY, name: "Hurricane force", land: "Devastation" },
];

/** Beaufort force (0–12) from a speed in km/h. */
export function beaufort(kmh: number): { force: number; name: string; land: string } {
  const index = BEAUFORT.findIndex((band) => kmh < band.max);
  const force = index < 0 ? 12 : index;
  return { force, ...BEAUFORT[force] };
}

const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const POINT_NAMES: Record<string, string> = {
  N: "north",
  NE: "northeast",
  E: "east",
  SE: "southeast",
  S: "south",
  SW: "southwest",
  W: "west",
  NW: "northwest",
};

/** 16-point compass abbreviation for a direction in degrees ("NNW"). */
export function compassPoint(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360;
  return POINTS[Math.round(normalized / 22.5) % 16];
}

/** "northwest" style words, using 8 points, for sentences. */
export function compassWords(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360;
  const eight = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(normalized / 45) % 8];
  return POINT_NAMES[eight];
}

// ---- Humidity -------------------------------------------------------------------------------------

/** How the air feels, from the dew point in °C. */
export function dewPointFeel(dewPoint: number): string {
  if (dewPoint < 5) return "Dry";
  if (dewPoint < 10) return "Comfortable, a little dry";
  if (dewPoint < 13) return "Comfortable";
  if (dewPoint < 16) return "Pleasant";
  if (dewPoint < 18) return "Slightly humid";
  if (dewPoint < 21) return "Humid";
  if (dewPoint < 24) return "Muggy";
  return "Oppressive";
}

/**
 * Rough height of the base of convective clouds, from the gap between temperature and dew point
 * (about 125 m per degree). Meaningful for cumulus clouds, not for fog or stratus.
 */
export function cloudBaseMeters(temperature: number, dewPoint: number): number {
  return Math.max(0, (temperature - dewPoint) * 125);
}

// ---- Visibility -------------------------------------------------------------------------------------

export function visibilityWords(meters: number): string {
  if (meters < 200) return "Dense fog";
  if (meters < 1000) return "Fog";
  if (meters < 4000) return "Mist or haze";
  if (meters < 10000) return "Moderate";
  if (meters < 20000) return "Good";
  return "Excellent";
}

// ---- UV -------------------------------------------------------------------------------------------------

export interface Category {
  label: string;
  /** Position in its scale, 0 = best. */
  level: number;
  /** Official scale color, used only for marks, never for text. */
  color: string;
  advice: string;
}

/** WHO Global Solar UV Index categories and colors. */
export function uvCategory(index: number): Category {
  if (index < 3) return { label: "Low", level: 0, color: "#3ea72d", advice: "No protection needed." };
  if (index < 6) return { label: "Moderate", level: 1, color: "#fff300", advice: "Seek shade at midday; wear sunscreen and a hat." };
  if (index < 8) return { label: "High", level: 2, color: "#f18b00", advice: "Reduce time in the sun between late morning and mid-afternoon." };
  if (index < 11) return { label: "Very high", level: 3, color: "#e53210", advice: "Avoid the midday sun; shirt, sunscreen and hat are a must." };
  return { label: "Extreme", level: 4, color: "#b567a4", advice: "Stay indoors at midday if you can. Unprotected skin burns in minutes." };
}

// ---- Air quality ----------------------------------------------------------------------------------------

/** US EPA Air Quality Index categories and official colors. */
export function usAqiCategory(aqi: number): Category {
  if (aqi <= 50) return { label: "Good", level: 0, color: "#00e400", advice: "Air quality is satisfactory, with little or no risk." };
  if (aqi <= 100)
    return { label: "Moderate", level: 1, color: "#ffff00", advice: "Unusually sensitive people should consider reducing long or heavy exertion outdoors." };
  if (aqi <= 150)
    return {
      label: "Unhealthy for sensitive groups",
      level: 2,
      color: "#ff7e00",
      advice: "People with heart or lung disease, older adults and children should reduce long or heavy exertion outdoors.",
    };
  if (aqi <= 200) return { label: "Unhealthy", level: 3, color: "#ff0000", advice: "Everyone should reduce long or heavy exertion outdoors." };
  if (aqi <= 300) return { label: "Very unhealthy", level: 4, color: "#8f3f97", advice: "Everyone should avoid long or heavy exertion outdoors." };
  return { label: "Hazardous", level: 5, color: "#7e0023", advice: "Everyone should avoid all physical activity outdoors." };
}

/** European Environment Agency Air Quality Index categories and official colors. */
export function euAqiCategory(aqi: number): Category {
  if (aqi <= 20) return { label: "Good", level: 0, color: "#50f0e6", advice: "Enjoy your usual outdoor activities." };
  if (aqi <= 40) return { label: "Fair", level: 1, color: "#50ccaa", advice: "Enjoy your usual outdoor activities." };
  if (aqi <= 60) return { label: "Moderate", level: 2, color: "#f0e641", advice: "Sensitive people should consider reducing intense outdoor activity." };
  if (aqi <= 80) return { label: "Poor", level: 3, color: "#ff5050", advice: "Consider reducing intense activity outdoors, especially with symptoms." };
  if (aqi <= 100) return { label: "Very poor", level: 4, color: "#960032", advice: "Reduce physical activity outdoors." };
  return { label: "Extremely poor", level: 5, color: "#7d2181", advice: "Avoid physical activity outdoors." };
}

/**
 * WHO 2021 air quality guideline levels (µg/m³), the long-term health benchmarks.
 * PM and NO₂/SO₂/CO are 24-hour means, ozone is the peak-season 8-hour mean.
 */
export const WHO_GUIDELINES = {
  pm2_5: 15,
  pm10: 45,
  nitrogen_dioxide: 25,
  sulphur_dioxide: 40,
  ozone: 100,
  carbon_monoxide: 4000,
} as const;

/** Pollen concentration bands in grains/m³ (thresholds used by European pollen services). */
export function pollenLevel(kind: "tree" | "grass" | "weed", grains: number): { label: string; level: number } {
  const bands = kind === "tree" ? [1, 15, 90, 1500] : kind === "grass" ? [1, 5, 20, 200] : [1, 10, 50, 500];
  if (grains < bands[0]) return { label: "None", level: 0 };
  if (grains < bands[1]) return { label: "Low", level: 1 };
  if (grains < bands[2]) return { label: "Moderate", level: 2 };
  if (grains < bands[3]) return { label: "High", level: 3 };
  return { label: "Very high", level: 4 };
}

// ---- Pressure --------------------------------------------------------------------------------------------

export interface PressureTrend {
  /** Change over three hours in hPa. */
  change: number;
  direction: "rising" | "falling" | "steady";
  words: string;
}

/** Trend over the last three hours, using the usual synoptic thresholds. */
export function pressureTrend(now: number, threeHoursAgo: number): PressureTrend {
  const change = now - threeHoursAgo;
  const size = Math.abs(change);
  if (size < 0.8) return { change, direction: "steady", words: "Steady" };
  const direction = change > 0 ? "rising" : "falling";
  const speed = size >= 3.6 ? "Rapidly " : size >= 1.6 ? "" : "Slowly ";
  return { change, direction, words: `${speed}${direction}`.replace(/^./, (c) => c.toUpperCase()) };
}

export function pressureWords(hpa: number): string {
  if (hpa < 990) return "Very low, stormy";
  if (hpa < 1005) return "Low, unsettled";
  if (hpa < 1022) return "Normal";
  if (hpa < 1035) return "High, settled";
  return "Very high";
}

// ---- Storms -------------------------------------------------------------------------------------------------

/** How much energy the atmosphere has for thunderstorms (CAPE, J/kg). */
export function capeWords(cape: number): string {
  if (cape < 100) return "Stable, no storm energy";
  if (cape < 1000) return "Marginal storm energy";
  if (cape < 2500) return "Moderate storm energy";
  if (cape < 3500) return "High storm energy";
  return "Extreme storm energy";
}

// ---- Temperature feel -----------------------------------------------------------------------------------------

/** Why the "feels like" temperature differs from the air temperature. */
export function feelsLikeReason(temperature: number, apparent: number, windKmh: number, humidity: number): string {
  const diff = apparent - temperature;
  if (Math.abs(diff) < 1.5) return "Feels about the same as the air temperature.";
  if (diff < 0) return windKmh >= 12 ? "The wind makes it feel colder." : "Dry air and little sun make it feel colder.";
  if (humidity >= 60) return "Humidity makes it feel warmer.";
  return "Sunshine and light wind make it feel warmer.";
}

/** Heat stress from the wet-bulb temperature, °C. Above 31 is dangerous even for healthy people at rest. */
export function wetBulbWords(wetBulb: number): string {
  if (wetBulb < 21) return "No heat stress";
  if (wetBulb < 25) return "Low heat stress";
  if (wetBulb < 28) return "Moderate heat stress, take breaks";
  if (wetBulb < 31) return "High heat stress, limit exertion";
  return "Extreme heat stress, dangerous";
}
