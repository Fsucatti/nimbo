/**
 * "Plan your day": scores each hour for a few common activities and finds the best window.
 * Scores run from 0 to 100 and come from simple, documented penalties.
 */
import type { MoonNow } from "./astro";
import { clamp } from "./stats";
import type { ForecastView } from "./view";
import { condition, isStorm } from "./wmo";

export type Verdict = "Great" | "Good" | "Fair" | "Poor";

export function verdict(score: number): Verdict {
  if (score >= 80) return "Great";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Poor";
}

function temperaturePenalty(feels: number, low: number, high: number, below: number, above: number): number {
  if (feels < low) return Math.min(60, (low - feels) * below);
  if (feels > high) return Math.min(70, (feels - high) * above);
  return 0;
}

function precipitationPenalty(probability: number, amount: number, code: number): number {
  if (isStorm(code)) return 75;
  if (amount >= 1) return 60;
  if (amount >= 0.3) return 45;
  return (clamp(probability, 0, 100) / 100) * 35;
}

function windPenalty(speed: number, gusts: number, comfortable: number): number {
  let penalty = speed > comfortable ? (speed - comfortable) * 1.3 : 0;
  if (gusts >= 55) penalty += 15;
  return Math.min(50, penalty);
}

/** General time outside: walking, sitting in a park. */
export function outdoorScore(view: ForecastView, i: number): number {
  const h = view.forecast.hourly;
  let score = 100;
  score -= temperaturePenalty(h.apparent[i], 15, 26, 4, 5);
  score -= precipitationPenalty(h.precipProbability[i], h.precipitation[i], h.weatherCode[i]);
  score -= windPenalty(h.windSpeed[i], h.windGusts[i], 22);
  if (h.uvIndex[i] >= 8) score -= 12;
  else if (h.uvIndex[i] >= 6) score -= 6;
  if (h.isDay[i] === 0) score -= 15;
  if (condition(h.weatherCode[i]).group === "fog") score -= 10;
  return clamp(Math.round(score), 0, 100);
}

/** Running prefers it cooler, and humid heat hurts more. */
export function runningScore(view: ForecastView, i: number): number {
  const h = view.forecast.hourly;
  let score = 100;
  score -= temperaturePenalty(h.apparent[i], 6, 18, 3.5, 6);
  score -= precipitationPenalty(h.precipProbability[i], h.precipitation[i], h.weatherCode[i]) * 0.8;
  score -= windPenalty(h.windSpeed[i], h.windGusts[i], 20);
  if (h.dewPoint[i] >= 18) score -= (h.dewPoint[i] - 17) * 6;
  if (h.uvIndex[i] >= 6) score -= 10;
  if (h.isDay[i] === 0) score -= 20;
  return clamp(Math.round(score), 0, 100);
}

/** Laundry dries with sun, dry air and a breeze, and no rain at all. */
export function laundryScore(view: ForecastView, i: number): number {
  const h = view.forecast.hourly;
  if (h.isDay[i] === 0) return 0;
  let score = 100;
  if (h.precipitation[i] > 0.05 || h.precipProbability[i] >= 40) return 5;
  score -= h.precipProbability[i] * 0.8;
  score -= Math.max(0, h.humidity[i] - 55) * 1.2;
  const sun = Number.isFinite(h.sunshine[i]) ? h.sunshine[i] / 3600 : 0.5;
  score -= (1 - sun) * 25;
  if (h.windSpeed[i] < 5) score -= 10;
  if (h.windSpeed[i] > 40) score -= 20;
  if (h.temperature[i] < 8) score -= (8 - h.temperature[i]) * 3;
  return clamp(Math.round(score), 0, 100);
}

/**
 * Stargazing needs darkness, clear skies and little moonlight. `moonUp` says whether the moon is
 * above the horizon at that hour.
 */
export function stargazingScore(view: ForecastView, i: number, sunAltitude: number, moon: MoonNow, moonUp: boolean): number {
  const h = view.forecast.hourly;
  if (sunAltitude > -12) return 0;
  let score = 100;
  score -= h.cloudCover[i] * 0.9;
  if (moonUp) score -= moon.fraction * 40;
  if (h.precipitation[i] > 0 || h.precipProbability[i] >= 40) score -= 50;
  if (h.visibility[i] < 10000) score -= 20;
  if (h.humidity[i] >= 90) score -= 10;
  if (sunAltitude > -18) score -= 15;
  return clamp(Math.round(score), 0, 100);
}

/**
 * Sunset colors: some high and middle clouds catch the light; low overcast blocks it.
 * Scored at the sunset hour.
 */
export function sunsetScore(view: ForecastView, i: number): number {
  const h = view.forecast.hourly;
  let score = 55;
  const upper = Math.max(h.cloudMid[i], h.cloudHigh[i]);
  if (upper >= 20 && upper <= 70) score += 35;
  else if (upper > 70) score += 5;
  else score += 15;
  score -= h.cloudLow[i] * 0.6;
  if (h.precipitation[i] > 0.1) score -= 30;
  if (h.visibility[i] < 8000) score -= 10;
  return clamp(Math.round(score), 0, 100);
}

export interface Window {
  from: number;
  /** Hourly row after the window's last hour. */
  to: number;
  score: number;
}

/** The best run of `length` consecutive hours between rows `from` and `to`. */
export function bestWindow(scores: readonly number[], from: number, to: number, length: number): Window | null {
  let best: Window | null = null;
  for (let i = from; i + length <= to; i++) {
    let total = 0;
    let valid = true;
    for (let j = i; j < i + length; j++) {
      if (!Number.isFinite(scores[j])) {
        valid = false;
        break;
      }
      total += scores[j];
    }
    if (!valid) continue;
    // The weakest hour matters more than the average.
    const score = Math.round(total / length - (total / length - Math.min(...scores.slice(i, i + length))) * 0.5);
    if (!best || score > best.score) best = { from: i, to: i + length, score };
  }
  return best;
}
