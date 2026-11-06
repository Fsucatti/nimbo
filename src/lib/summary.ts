/**
 * A short written summary of what's coming, built from rules (no AI): the next few hours,
 * the next day, how tomorrow compares with today, and the week.
 */
import type { Units } from "./units";
import { formatTemperatureDelta, formatWind } from "./units";
import type { ForecastView } from "./view";
import { maxRange, sumRange } from "./view";
import { condition, isPrecipitation, precipitationNoun } from "./wmo";

/** Part of the day for an hour, in words. */
export function partOfDay(hour: number): string {
  if (hour < 5) return "overnight";
  if (hour < 12) return "this morning";
  if (hour < 18) return "this afternoon";
  return "this evening";
}

function partOfDayLater(hour: number, sameDay: boolean): string {
  if (!sameDay) {
    if (hour < 5) return "overnight";
    if (hour < 12) return "tomorrow morning";
    if (hour < 18) return "tomorrow afternoon";
    return "tomorrow evening";
  }
  return partOfDay(hour);
}

/** Next three hours, from the 15-minute data. */
export function nowcastSentence(view: ForecastView): string | null {
  const { minutely, current } = view.forecast;
  const wet = (i: number) => minutely.precipitation[i] >= 0.1;
  const raining = current.precipitation >= 0.1 || isPrecipitation(current.weatherCode);
  const steps = minutely.time.length;
  if (steps === 0) return null;
  const noun = precipitationNoun(raining ? current.weatherCode : minutely.weatherCode.find((_, i) => wet(i)) ?? 61);
  if (raining) {
    const stop = minutely.time.findIndex((_, i) => !wet(i) && (i + 1 >= steps || !wet(i + 1)));
    if (stop < 0) return `${capitalize(noun)} for at least the next ${Math.round((steps * 15) / 60)} hours.`;
    if (stop === 0) return `${capitalize(noun)} ending now.`;
    return `${capitalize(noun)} ending around ${view.clock.time(minutely.time[stop])}.`;
  }
  const start = minutely.time.findIndex((_, i) => wet(i));
  if (start < 0) return null;
  const minutes = Math.max(15, Math.round((minutely.time[start] - current.time) / 60 / 5) * 5);
  return minutes <= 60
    ? `${capitalize(noun)} likely in about ${minutes} minutes.`
    : `${capitalize(noun)} likely from around ${view.clock.time(minutely.time[start])}.`;
}

/** The main sentence about the next 24 hours. */
export function next24Sentence(view: ForecastView, units: Units): string {
  const { hourly } = view.forecast;
  const from = view.nowIndex + 1;
  const to = Math.min(hourly.time.length, from + 24);
  const nowHour = view.clock.hourOfDay(view.now);
  const todayKey = view.clock.dateKey(view.now);

  // First hour with a meaningful chance of precipitation.
  let wetIndex = -1;
  for (let i = from; i < to; i++) {
    if (hourly.precipProbability[i] >= 50 && hourly.precipitation[i] >= 0.2) {
      wetIndex = i;
      break;
    }
  }
  const parts: string[] = [];
  if (wetIndex >= 0) {
    const hour = view.clock.hourOfDay(hourly.time[wetIndex]);
    const sameDay = view.clock.dateKey(hourly.time[wetIndex]) === todayKey && !(nowHour >= 18 && hour < 5);
    const noun = precipitationNoun(hourly.weatherCode[wetIndex]);
    const chance = maxRange(hourly.precipProbability, wetIndex, Math.min(to, wetIndex + 6)).value;
    const total = sumRange(hourly.precipitation, from, to);
    const heavy = total >= 15 ? "Heavy " : "";
    parts.push(`${heavy ? heavy + noun : capitalize(noun)} likely ${partOfDayLater(hour, sameDay)} (${Math.round(chance)}%).`);
  } else {
    const anyChance = maxRange(hourly.precipProbability, from, to).value;
    if (anyChance >= 30) parts.push(`Mostly dry for the next 24 hours, with a ${Math.round(anyChance)}% chance of a shower.`);
    else parts.push(skyPhrase(view, from, to));
  }

  const gust = maxRange(hourly.windGusts, from, to);
  if (gust.value >= 50) {
    const hour = view.clock.hourOfDay(hourly.time[gust.index]);
    const sameDay = view.clock.dateKey(hourly.time[gust.index]) === todayKey;
    parts.push(`Gusts up to ${formatWind(gust.value, units.wind)} ${partOfDayLater(hour, sameDay)}.`);
  }
  return parts.join(" ");
}

function skyPhrase(view: ForecastView, from: number, to: number): string {
  const { hourly } = view.forecast;
  let cloud = 0;
  let count = 0;
  for (let i = from; i < to; i++) {
    if (!Number.isFinite(hourly.cloudCover[i])) continue;
    cloud += hourly.cloudCover[i];
    count += 1;
  }
  const mean = count ? cloud / count : 50;
  const foggy = hourly.weatherCode.slice(from, to).some((code) => condition(code).group === "fog");
  if (foggy) return "Dry, with fog at times in the next 24 hours.";
  if (mean < 20) return "Clear skies and dry for the next 24 hours.";
  if (mean < 50) return "Dry, with a mix of sun and clouds in the next 24 hours.";
  if (mean < 80) return "Dry and mostly cloudy for the next 24 hours.";
  return "Dry but overcast for the next 24 hours.";
}

/** "Tomorrow will be 5° cooler than today." */
export function tomorrowSentence(view: ForecastView, units: Units): string | null {
  const { daily } = view.forecast;
  const today = view.todayIndex;
  const tomorrow = today + 1;
  if (tomorrow >= daily.time.length) return null;
  const diff = daily.tempMax[tomorrow] - daily.tempMax[today];
  if (!Number.isFinite(diff)) return null;
  if (Math.abs(diff) < 2) return "Tomorrow will be about as warm as today.";
  const words = diff > 0 ? "warmer" : "cooler";
  return `Tomorrow will be ${formatTemperatureDelta(Math.abs(diff), units.temperature).replace(/^[+±]/, "")} ${words} than today.`;
}

/** Which of the next days look wet: "Rain on Saturday and Sunday." */
export function weekSentence(view: ForecastView): string | null {
  const { daily } = view.forecast;
  const start = view.todayIndex + 2;
  const end = Math.min(daily.time.length, view.todayIndex + 7);
  const wet: string[] = [];
  let noun = "rain";
  for (let i = start; i < end; i++) {
    if (daily.precipProbMax[i] >= 60 && daily.precipSum[i] >= 1) {
      wet.push(view.clock.weekdayLong(daily.time[i]));
      noun = precipitationNoun(daily.weatherCode[i]);
    }
  }
  if (wet.length === 0) return "Mostly dry later in the week.";
  if (wet.length >= 4) return `Unsettled later in the week, with ${noun} on most days.`;
  return `${capitalize(noun)} likely on ${joinWords(wet)}.`;
}

export function summarize(view: ForecastView, units: Units): string[] {
  return [nowcastSentence(view), next24Sentence(view, units), tomorrowSentence(view, units), weekSentence(view)].filter(
    (line): line is string => Boolean(line),
  );
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
