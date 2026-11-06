/** Answers every outside service from fixtures. Each test can override a route after this. */
import type { Page, Route } from "@playwright/test";
import air from "./fixtures/air.json" with { type: "json" };
import forecast from "./fixtures/forecast.json" with { type: "json" };
import geocoding from "./fixtures/geocoding.json" with { type: "json" };
import marine from "./fixtures/marine.json" with { type: "json" };
import models from "./fixtures/models.json" with { type: "json" };
import recent from "./fixtures/recent.json" with { type: "json" };

export const NOW_MS = (forecast as { current: { time: number } }).current.time * 1000 + 5 * 60_000;

export const PLACE_URL = "/?lat=-34.6131&lon=-58.3772&name=Buenos%20Aires&region=Buenos%20Aires%20F.D.&country=Argentina&cc=AR";

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

/** A year of made-up but plausible daily values for the archive (normals and "a year ago"). */
function archive(url: URL) {
  const start = Date.parse(`${url.searchParams.get("start_date")}T00:00:00Z`);
  const end = Date.parse(`${url.searchParams.get("end_date")}T00:00:00Z`);
  const time: string[] = [];
  const max: number[] = [];
  const min: number[] = [];
  const rain: number[] = [];
  for (let t = start, i = 0; t <= end; t += 86_400_000, i++) {
    const year = new Date(t).getUTCFullYear();
    time.push(new Date(t).toISOString().slice(0, 10));
    max.push(22 + Math.sin(i / 5) * 3 + (year % 7) * 0.3);
    min.push(13 + Math.cos(i / 4) * 2 - (year % 5) * 0.2);
    rain.push(i % 5 === 0 ? 6 + (year % 3) : 0);
  }
  return {
    daily: { time, temperature_2m_max: max, temperature_2m_min: min, precipitation_sum: rain, weather_code: time.map((_, i) => (i % 5 === 0 ? 61 : 2)) },
  };
}

const TRANSPARENT_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

export interface MockLog {
  archive: number;
  nominatim: number;
}

export async function mockServices(page: Page, options: { coastal?: boolean } = {}): Promise<MockLog> {
  const log: MockLog = { archive: 0, nominatim: 0 };
  await page.clock.setFixedTime(NOW_MS);

  await page.route("https://api.open-meteo.com/**", (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has("models")) return json(route, models);
    if (url.searchParams.get("past_days") === "31") return json(route, recent);
    const lats = url.searchParams.get("latitude") ?? "";
    if (url.searchParams.get("forecast_days") === "1") {
      // Saved places: one entry per coordinate.
      const one = { current: { temperature_2m: 21.5, weather_code: 2, is_day: 1 }, daily: { temperature_2m_max: [25], temperature_2m_min: [14] } };
      const count = lats.split(",").length;
      return json(route, count > 1 ? Array.from({ length: count }, () => one) : one);
    }
    return json(route, forecast);
  });
  await page.route("https://air-quality-api.open-meteo.com/**", (route) => json(route, air));
  await page.route("https://marine-api.open-meteo.com/**", (route) =>
    options.coastal ? json(route, marine) : json(route, { latitude: 0, longitude: 0, hourly: { time: [], wave_height: [] } }),
  );
  await page.route("https://geocoding-api.open-meteo.com/**", (route) => json(route, geocoding));
  await page.route("https://archive-api.open-meteo.com/**", (route) => {
    log.archive += 1;
    return json(route, archive(new URL(route.request().url())));
  });
  await page.route("https://api.rainviewer.com/**", (route) =>
    json(route, {
      host: "https://tilecache.rainviewer.com",
      radar: {
        past: [0, 1, 2].map((k) => ({ time: Math.floor(NOW_MS / 1000) - (2 - k) * 600, path: `/v2/radar/test${k}` })),
      },
    }),
  );
  await page.route("https://tilecache.rainviewer.com/**", (route) => route.fulfill({ contentType: "image/png", body: TRANSPARENT_PNG }));
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    json(route, { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#203040" } }] }),
  );
  await page.route("https://nominatim.openstreetmap.org/**", (route) => {
    log.nominatim += 1;
    return json(route, { name: "Rosario", address: { city: "Rosario", state: "Santa Fe", country: "Argentina", country_code: "ar" } });
  });
  await page.route("**/api/where", (route) =>
    json(route, { name: "Madrid", region: "Madrid", countryCode: "ES", latitude: 40.4168, longitude: -3.7038, timezone: "Europe/Madrid" }),
  );
  return log;
}

/** Collects page errors and console errors so each test can assert there were none. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}
