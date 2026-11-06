/**
 * Temperature color scale (the one meteorological convention for a multi-hue ramp),
 * always shown with a scale legend. Stops in °C.
 */
const STOPS: [number, string][] = [
  [-25, "#6a4fb8"],
  [-12, "#4466d8"],
  [0, "#3d9fe0"],
  [9, "#3fb8a0"],
  [17, "#8cc556"],
  [24, "#e9bc3a"],
  [31, "#ee8a36"],
  [38, "#dc4637"],
  [46, "#a8264f"],
];

export const TEMPERATURE_RANGE = { min: STOPS[0][0], max: STOPS[STOPS.length - 1][0] };

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

export function temperatureColor(celsius: number): string {
  if (!Number.isFinite(celsius)) return "#8696a4";
  if (celsius <= STOPS[0][0]) return STOPS[0][1];
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    if (celsius <= t1) {
      const [t0, c0] = STOPS[i - 1];
      const k = (celsius - t0) / (t1 - t0);
      const a = hexToRgb(c0);
      const b = hexToRgb(c1);
      return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * k)).join(" ")})`;
    }
  }
  return STOPS[STOPS.length - 1][1];
}

/** A CSS gradient covering `min` to `max` °C, with enough stops to follow the scale. */
export function temperatureGradient(min: number, max: number, direction = "90deg"): string {
  const span = Math.max(1, max - min);
  const stops: string[] = [];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = min + (span * i) / steps;
    stops.push(`${temperatureColor(t)} ${((i / steps) * 100).toFixed(1)}%`);
  }
  return `linear-gradient(${direction}, ${stops.join(", ")})`;
}
