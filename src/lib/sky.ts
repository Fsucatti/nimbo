/**
 * The colors of the sky at the top of the page, from the real sun altitude at the place,
 * its cloud cover and what is falling. Returns three gradient stops and the text color
 * that stays readable on them.
 */
import type { ConditionGroup } from "./wmo";

type Rgb = [number, number, number];

export interface SkyColors {
  top: string;
  middle: string;
  horizon: string;
  /** Glow around the sun or moon. */
  glow: string;
  /** Whether text on this sky should be light or dark. */
  ink: "light" | "dark";
}

const hex = (value: string): Rgb => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as Rgb;
const toHex = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

interface Stop {
  altitude: number;
  top: string;
  middle: string;
  horizon: string;
  glow: string;
}

/** Clear-sky keyframes by sun altitude in degrees. */
const CLEAR: Stop[] = [
  { altitude: -90, top: "#03060f", middle: "#081127", horizon: "#0f1d3d", glow: "#9fb4e8" },
  { altitude: -18, top: "#050a1a", middle: "#0c1834", horizon: "#16264c", glow: "#a8b9e8" },
  { altitude: -12, top: "#081028", middle: "#16244e", horizon: "#2d3a6e", glow: "#b5c0ea" },
  { altitude: -6, top: "#0f1d45", middle: "#2f427f", horizon: "#6c5f93", glow: "#e7b7c4" },
  { altitude: -2, top: "#1b3266", middle: "#55609e", horizon: "#d98f88", glow: "#ffc59a" },
  { altitude: 2, top: "#24478a", middle: "#6f86c0", horizon: "#f2a873", glow: "#ffd08a" },
  { altitude: 8, top: "#2558a8", middle: "#5f93d4", horizon: "#f1c792", glow: "#ffe2a6" },
  { altitude: 20, top: "#1f5fbd", middle: "#4b8ddb", horizon: "#9cc6ef", glow: "#fff1c4" },
  { altitude: 90, top: "#1a5bbd", middle: "#3f86dc", horizon: "#8ec0f1", glow: "#fff6d8" },
];

/** Overcast keyframes: the same times of day under a full cloud deck. */
const OVERCAST: Stop[] = [
  { altitude: -90, top: "#07090e", middle: "#0f131b", horizon: "#171c26", glow: "#4a5263" },
  { altitude: -12, top: "#0e121a", middle: "#1a202b", horizon: "#272e3b", glow: "#5a6273" },
  { altitude: -4, top: "#262c38", middle: "#3b4250", horizon: "#565b68", glow: "#8b8a92" },
  { altitude: 2, top: "#454c5a", middle: "#646b78", horizon: "#8c8686", glow: "#b0a59c" },
  { altitude: 10, top: "#5f6b78", middle: "#7c8794", horizon: "#9aa3ad", glow: "#c7ccd2" },
  { altitude: 90, top: "#6d7a88", middle: "#8b97a4", horizon: "#aab3bd", glow: "#d6dbe0" },
];

/** Tints applied on top for what is falling or hanging in the air. */
const TINTS: Partial<Record<ConditionGroup, { day: Rgb; night: Rgb; strength: number }>> = {
  rain: { day: hex("#4a5664"), night: hex("#0b1018"), strength: 0.45 },
  drizzle: { day: hex("#66717d"), night: hex("#10151d"), strength: 0.3 },
  storm: { day: hex("#2c2f40"), night: hex("#0a0a14"), strength: 0.65 },
  snow: { day: hex("#c9d2dc"), night: hex("#2a3240"), strength: 0.55 },
  fog: { day: hex("#b8c0c7"), night: hex("#2b313a"), strength: 0.6 },
};

function interpolate(stops: Stop[], altitude: number): { top: Rgb; middle: Rgb; horizon: Rgb; glow: Rgb } {
  const a = Math.max(-90, Math.min(90, altitude));
  let i = 0;
  while (i < stops.length - 2 && a > stops[i + 1].altitude) i++;
  const from = stops[i];
  const to = stops[i + 1];
  const t = (a - from.altitude) / (to.altitude - from.altitude || 1);
  const k = Math.max(0, Math.min(1, t));
  return {
    top: mix(hex(from.top), hex(to.top), k),
    middle: mix(hex(from.middle), hex(to.middle), k),
    horizon: mix(hex(from.horizon), hex(to.horizon), k),
    glow: mix(hex(from.glow), hex(to.glow), k),
  };
}

function luminance([r, g, b]: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(hex(a));
  const lb = luminance(hex(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export interface SkyInput {
  sunAltitude: number;
  /** Total cloud cover, 0–100. */
  cloudCover: number;
  group: ConditionGroup;
  /** 0–3, from the weather code. */
  intensity: number;
}

export function skyColors({ sunAltitude, cloudCover, group, intensity }: SkyInput): SkyColors {
  const clear = interpolate(CLEAR, sunAltitude);
  const overcast = interpolate(OVERCAST, sunAltitude);
  // Thin cloud barely changes the color; a full deck flattens it completely.
  const cover = Math.max(0, Math.min(1, cloudCover / 100)) ** 1.4;
  let top = mix(clear.top, overcast.top, cover);
  let middle = mix(clear.middle, overcast.middle, cover);
  let horizon = mix(clear.horizon, overcast.horizon, cover);
  const glow = mix(clear.glow, overcast.glow, cover);

  const tint = TINTS[group];
  if (tint) {
    const daylight = Math.max(0, Math.min(1, (sunAltitude + 6) / 12));
    const color = mix(tint.night, tint.day, daylight);
    const strength = tint.strength * (0.6 + 0.15 * intensity);
    top = mix(top, color, strength);
    middle = mix(middle, color, strength);
    horizon = mix(horizon, color, strength * 0.9);
  }

  // Text sits over the top half, so judge contrast there.
  const sample = toHex(mix(top, middle, 0.6));
  const ink = contrastRatio("#ffffff", sample) >= 4.5 || contrastRatio("#ffffff", sample) >= contrastRatio("#10202e", sample) ? "light" : "dark";

  return { top: toHex(top), middle: toHex(middle), horizon: toHex(horizon), glow: toHex(glow), ink };
}
