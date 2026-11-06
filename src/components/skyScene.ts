/** Builds the sky scene for the current moment from the forecast and SunCalc. */
import { moonDay, moonNow, moonPosition, sunDay, sunPosition } from "../lib/astro";
import { skyColors } from "../lib/sky";
import { clamp } from "../lib/stats";
import type { ForecastView } from "../lib/view";
import { condition } from "../lib/wmo";
import type { SkyScene } from "./Sky";

export function sceneFor(view: ForecastView, ts: number, seed: string): SkyScene {
  const { current, latitude, longitude, timezone } = view.forecast;
  const position = sunPosition(ts, latitude, longitude);
  const day = sunDay(ts, latitude, longitude, timezone);
  const moon = moonNow(ts, latitude, longitude);
  const moonTimes = moonDay(ts, latitude, longitude, timezone);
  const c = condition(current.weatherCode);
  const colors = skyColors({ sunAltitude: position.altitude, cloudCover: current.cloudCover, group: c.group, intensity: c.intensity });

  // From the eastern horizon (0) to the western one (1): through the south in the northern
  // hemisphere, through the north in the southern one.
  const acrossSky = (azimuth: number) => (latitude >= 0 ? ((azimuth - 90 + 360) % 360) / 180 : ((90 - azimuth + 360) % 360) / 180);

  let sun: SkyScene["sun"] = null;
  if (position.altitude > -1) {
    const progress = day.sunrise !== null && day.sunset !== null ? (ts - day.sunrise) / (day.sunset - day.sunrise) : acrossSky(position.azimuth);
    sun = { progress: clamp(progress, 0, 1), height: clamp(position.altitude / Math.max(day.noonAltitude, 8), 0, 1) };
  }

  let moonScene: SkyScene["moon"] = null;
  if (!sun && moon.altitude > 0) {
    const progress =
      moonTimes.rise !== null && moonTimes.set !== null && moonTimes.rise < ts && ts < moonTimes.set
        ? (ts - moonTimes.rise) / (moonTimes.set - moonTimes.rise)
        : acrossSky(moonPosition(ts, latitude, longitude).azimuth);
    moonScene = {
      progress: clamp(progress, 0, 1),
      height: clamp(moon.altitude / 60, 0.08, 1),
      fraction: moon.fraction,
      waxing: moon.waxing,
      southern: latitude < 0,
    };
  }

  const darkness = clamp((-position.altitude - 6) / 10, 0, 1);
  const clearSky = (1 - clamp(current.cloudCover / 100, 0, 1)) ** 1.5;
  const moonGlare = moon.altitude > 0 ? 1 - moon.fraction * 0.45 : 1;

  return {
    colors,
    sun,
    moon: moonScene,
    clouds: { low: current.cloudLow, mid: current.cloudMid, high: current.cloudHigh },
    cover: Number.isFinite(current.cloudCover) ? current.cloudCover : 0,
    group: c.group,
    // "Current" precipitation is the total of the last 15 minutes; the sky wants a rate per hour.
    precipitation: Number.isFinite(current.precipitation) ? current.precipitation * 4 : 0,
    snowing: c.group === "snow" || current.snowfall > 0,
    hail: c.icon === "hail",
    windDirection: Number.isFinite(current.windDirection) ? current.windDirection : 270,
    windSpeed: Number.isFinite(current.windSpeed) ? current.windSpeed : 0,
    stars: darkness * clearSky * moonGlare,
    daylight: clamp((position.altitude + 6) / 18, 0, 1),
    fog: c.group === "fog" ? 0.7 : current.visibility < 3000 ? 0.35 : 0,
    seed,
  };
}
