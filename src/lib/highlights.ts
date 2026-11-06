/**
 * "Worth knowing" items: notable weather in the forecast, found with fixed thresholds.
 * These are not official warnings, and the interface says so.
 */
import { uvCategory, usAqiCategory } from "./comfort";
import type { Units } from "./units";
import { formatPrecipitation, formatSnow, formatTemperature, formatWind } from "./units";
import type { ForecastView } from "./view";
import { maxRange, minRange } from "./view";
import { relativeDay } from "./time";
import { condition, isStorm } from "./wmo";

export type HighlightLevel = "info" | "warning" | "serious";

export interface Highlight {
  id: string;
  level: HighlightLevel;
  /** Icon name from the app's icon set. */
  icon: "storm" | "rain" | "wind" | "heat" | "frost" | "snow" | "ice" | "fog" | "uv" | "air" | "drop" | "rise";
  title: string;
  detail: string;
  /** When it peaks, Unix seconds, for sorting. */
  at: number;
}

/** Thresholds, in metric units. */
export const THRESHOLDS = {
  heavyRainDay: 20, // mm in a day
  veryHeavyRainDay: 50,
  intenseRainHour: 8, // mm in an hour
  strongGust: 60, // km/h, about Beaufort 8 (gale)
  severeGust: 90,
  hotDay: 35, // °C
  extremeHeatFeel: 40,
  frostNight: 0, // °C
  hardFreeze: -5,
  snowDay: 1, // cm
  uvVeryHigh: 8,
  poorAir: 101, // US AQI
  bigDrop: 8, // °C change in daily high
} as const;

interface AirInput {
  /** Hourly US AQI with its timestamps. */
  time: number[];
  usAqi: number[];
}

export function findHighlights(view: ForecastView, units: Units, air?: AirInput): Highlight[] {
  const { hourly, daily } = view.forecast;
  const items: Highlight[] = [];
  const now = view.now;
  const dayLabel = (ts: number) => {
    const day = relativeDay(view.clock, ts, now, true);
    return day === "Today" || day === "Tomorrow" ? day.toLowerCase() : `on ${day}`;
  };
  const lastDay = Math.min(daily.time.length, view.todayIndex + 7);

  for (let d = view.todayIndex; d < lastDay; d++) {
    const [from, to] = view.dayHours[d];
    if (from < 0) continue;
    const start = d === view.todayIndex ? Math.max(from, view.nowIndex) : from;
    const when = dayLabel(daily.time[d]);

    // Thunderstorms.
    const stormHour = hourly.weatherCode.slice(start, to).findIndex((code) => isStorm(code));
    if (stormHour >= 0) {
      const index = start + stormHour;
      const hail = hourly.weatherCode.slice(start, to).some((code) => code >= 96);
      items.push({
        id: `storm-${d}`,
        level: hail ? "serious" : "warning",
        icon: "storm",
        title: hail ? `Thunderstorms with hail ${when}` : `Thunderstorms ${when}`,
        detail: `From around ${view.clock.hour(hourly.time[index])}. Lightning is dangerous outdoors: move inside when you hear thunder.`,
        at: hourly.time[index],
      });
    }

    // Heavy rain over the day, or an intense hour.
    const remainingRain = sumFinite(hourly.precipitation, start, to);
    const dayRain = d === view.todayIndex ? remainingRain : daily.precipSum[d];
    const peakHour = maxRange(hourly.precipitation, start, to);
    const isSnowDay = daily.snowSum[d] >= THRESHOLDS.snowDay;
    if (!isSnowDay && (dayRain >= THRESHOLDS.heavyRainDay || peakHour.value >= THRESHOLDS.intenseRainHour)) {
      const veryHeavy = dayRain >= THRESHOLDS.veryHeavyRainDay;
      items.push({
        id: `rain-${d}`,
        level: veryHeavy ? "serious" : "warning",
        icon: "rain",
        title: `${veryHeavy ? "Very heavy" : "Heavy"} rain ${when}`,
        detail: `${formatPrecipitation(dayRain, units.precipitation)} expected${
          peakHour.value >= THRESHOLDS.intenseRainHour ? `, up to ${formatPrecipitation(peakHour.value, units.precipitation)} in an hour around ${view.clock.hour(hourly.time[peakHour.index])}` : ""
        }. Watch for flooded streets.`,
        at: hourly.time[peakHour.index] ?? daily.time[d],
      });
    }

    // Snow.
    if (isSnowDay) {
      items.push({
        id: `snow-${d}`,
        level: daily.snowSum[d] >= 10 ? "serious" : "warning",
        icon: "snow",
        title: `Snow ${when}`,
        detail: `${formatSnow(daily.snowSum[d], units.precipitation)} of snow expected. Roads and paths may be slippery.`,
        at: daily.time[d],
      });
    }

    // Freezing rain or drizzle.
    const iceHour = hourly.weatherCode.slice(start, to).findIndex((code) => condition(code).freezing && condition(code).group !== "fog");
    if (iceHour >= 0) {
      items.push({
        id: `ice-${d}`,
        level: "serious",
        icon: "ice",
        title: `Freezing rain ${when}`,
        detail: `From around ${view.clock.hour(hourly.time[start + iceHour])}. Rain freezes on contact and makes surfaces icy.`,
        at: hourly.time[start + iceHour],
      });
    }

    // Strong gusts.
    const gust = maxRange(hourly.windGusts, start, to);
    if (gust.value >= THRESHOLDS.strongGust) {
      items.push({
        id: `wind-${d}`,
        level: gust.value >= THRESHOLDS.severeGust ? "serious" : "warning",
        icon: "wind",
        title: `Strong gusts ${when}`,
        detail: `Up to ${formatWind(gust.value, units.wind)} around ${view.clock.hour(hourly.time[gust.index])}. Secure loose objects outdoors.`,
        at: hourly.time[gust.index],
      });
    }

    // Heat.
    const feel = maxRange(hourly.apparent, start, to);
    if (daily.tempMax[d] >= THRESHOLDS.hotDay || feel.value >= THRESHOLDS.extremeHeatFeel) {
      items.push({
        id: `heat-${d}`,
        level: feel.value >= THRESHOLDS.extremeHeatFeel ? "serious" : "warning",
        icon: "heat",
        title: `Very hot ${when}`,
        detail: `High of ${formatTemperature(daily.tempMax[d], units.temperature)}, feeling like ${formatTemperature(feel.value, units.temperature)}. Drink water and avoid exertion in the afternoon.`,
        at: hourly.time[feel.index] ?? daily.time[d],
      });
    }

    // Frost overnight (only the next three nights matter for planting and driving).
    if (d <= view.todayIndex + 2) {
      const low = minRange(hourly.temperature, start, to);
      if (low.value <= THRESHOLDS.frostNight) {
        items.push({
          id: `frost-${d}`,
          level: low.value <= THRESHOLDS.hardFreeze ? "warning" : "info",
          icon: "frost",
          title: low.value <= THRESHOLDS.hardFreeze ? `Hard freeze ${when}` : `Frost possible ${when}`,
          detail: `Down to ${formatTemperature(low.value, units.temperature)} around ${view.clock.hour(hourly.time[low.index])}. Protect plants and watch for ice.`,
          at: hourly.time[low.index],
        });
      }
    }

    // Fog in the morning hours.
    if (d <= view.todayIndex + 1) {
      const fogHour = hourly.weatherCode.slice(start, to).findIndex((code) => condition(code).group === "fog");
      if (fogHour >= 0) {
        items.push({
          id: `fog-${d}`,
          level: "info",
          icon: "fog",
          title: `Fog ${when}`,
          detail: `Around ${view.clock.hour(hourly.time[start + fogHour])}. Visibility may drop below 1 km; drive with care.`,
          at: hourly.time[start + fogHour],
        });
      }
    }
  }

  // Very high UV today or tomorrow.
  for (let d = view.todayIndex; d < Math.min(daily.time.length, view.todayIndex + 2); d++) {
    if (daily.uvMax[d] >= THRESHOLDS.uvVeryHigh) {
      const [from, to] = view.dayHours[d];
      const window = uvWindow(view, from, to, 6);
      items.push({
        id: `uv-${d}`,
        level: "info",
        icon: "uv",
        title: `${uvCategory(daily.uvMax[d]).label} UV ${dayLabel(daily.time[d])}`,
        detail: `UV index up to ${Math.round(daily.uvMax[d])}${window ? `, highest from ${window}` : ""}. Use sunscreen and seek shade.`,
        at: daily.time[d] + 12 * 3600,
      });
    }
  }

  // A big drop in temperature tomorrow.
  const t = view.todayIndex;
  if (t + 1 < daily.time.length && daily.tempMax[t] - daily.tempMax[t + 1] >= THRESHOLDS.bigDrop) {
    items.push({
      id: "drop",
      level: "info",
      icon: "drop",
      title: "Much cooler tomorrow",
      detail: `The high falls from ${formatTemperature(daily.tempMax[t], units.temperature)} to ${formatTemperature(daily.tempMax[t + 1], units.temperature)}.`,
      at: daily.time[t + 1],
    });
  }

  // Poor air quality in the next two days.
  if (air) {
    const end = now + 48 * 3600;
    let worst = -1;
    for (let i = 0; i < air.time.length; i++) {
      if (air.time[i] < now - 3600 || air.time[i] > end || !Number.isFinite(air.usAqi[i])) continue;
      if (worst < 0 || air.usAqi[i] > air.usAqi[worst]) worst = i;
    }
    if (worst >= 0 && air.usAqi[worst] >= THRESHOLDS.poorAir) {
      const category = usAqiCategory(air.usAqi[worst]);
      items.push({
        id: "air",
        level: category.level >= 3 ? "serious" : "warning",
        icon: "air",
        title: `Air quality: ${category.label.toLowerCase()}`,
        detail: `US AQI up to ${Math.round(air.usAqi[worst])} ${dayLabel(air.time[worst])} around ${view.clock.hour(air.time[worst])}. ${category.advice}`,
        at: air.time[worst],
      });
    }
  }

  const rank: Record<HighlightLevel, number> = { serious: 0, warning: 1, info: 2 };
  return items.sort((a, b) => rank[a.level] - rank[b.level] || a.at - b.at).slice(0, 6);
}

/** "11:00 to 16:00": the hours with UV at or above a level. */
export function uvWindow(view: ForecastView, from: number, to: number, level: number): string | null {
  const { hourly } = view.forecast;
  let first = -1;
  let last = -1;
  for (let i = from; i < to; i++) {
    if (hourly.uvIndex[i] >= level) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return null;
  return `${view.clock.hour(hourly.time[first])} to ${view.clock.hour(hourly.time[last] + 3600)}`;
}

function sumFinite(values: number[], from: number, to: number): number {
  let total = 0;
  for (let i = from; i < to; i++) if (Number.isFinite(values[i])) total += values[i];
  return total;
}
