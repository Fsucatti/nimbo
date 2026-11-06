/**
 * Rain radar frames from RainViewer (free for personal and educational use, with attribution).
 * Frames cover the last two hours in 10-minute steps. Tiles exist up to zoom level 7.
 */
import { getJSON } from "./http";

export interface RadarFrame {
  /** Unix seconds. */
  time: number;
  tileUrl: string;
}

export const RADAR_MAX_ZOOM = 7;

interface Raw {
  host: string;
  radar: { past: { time: number; path: string }[] };
}

export async function fetchRadarFrames(signal?: AbortSignal): Promise<RadarFrame[]> {
  const raw = await getJSON<Raw>("https://api.rainviewer.com/public/weather-maps.json", signal);
  // 512-pixel tiles need a quarter of the requests of 256-pixel ones. Color scheme 2 is the
  // only one still offered; "1_1" turns on smoothing and shows snow in its own colors.
  return raw.radar.past.map((frame) => ({
    time: frame.time,
    tileUrl: `${raw.host}${frame.path}/512/{z}/{x}/{y}/2/1_1.png`,
  }));
}
