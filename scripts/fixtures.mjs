// Saves real API answers for one place as test fixtures, so tests never call the network.
// Usage: node scripts/fixtures.mjs
// Re-run it to refresh the fixtures; the tests read the "now" time from the saved forecast.
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "vite";

const place = { latitude: -34.613, longitude: -58.377 };
const out = new URL("../tests/fixtures/", import.meta.url);

// Vite loads the app's TypeScript module, so the fixture uses exactly the app's forecast URL.
const vite = await createServer({ server: { middlewareMode: true }, logLevel: "error" });
const forecastModule = await vite.ssrLoadModule("/src/api/forecast.ts");
await vite.close();

const urls = {
  forecast: forecastModule.forecastUrl(place.latitude, place.longitude),
  air: `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${place.latitude}&longitude=${place.longitude}&current=us_aqi,european_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,dust,aerosol_optical_depth,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&hourly=us_aqi,european_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,dust,aerosol_optical_depth,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&timezone=auto&timeformat=unixtime&forecast_days=5`,
  marine: `https://marine-api.open-meteo.com/v1/marine?latitude=-38.005&longitude=-57.542&hourly=wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,wind_wave_height,sea_surface_temperature,sea_level_height_msl,ocean_current_velocity,ocean_current_direction&timezone=auto&timeformat=unixtime&past_days=1&forecast_days=7`,
  models: `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&models=ecmwf_ifs,ecmwf_aifs025_single,gfs_seamless,icon_seamless,gem_seamless,jma_seamless,meteofrance_seamless,ukmo_seamless,cma_grapes_global&timezone=auto&timeformat=unixtime&forecast_days=10`,
  recent: `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&past_days=31&forecast_days=16&timezone=auto&timeformat=unixtime`,
  geocoding: "https://geocoding-api.open-meteo.com/v1/search?name=Cordoba&count=8&language=en&format=json",
};

await mkdir(out, { recursive: true });
for (const [name, url] of Object.entries(urls)) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const body = await response.text();
  await writeFile(new URL(`${name}.json`, out), body);
  console.log(`Saved tests/fixtures/${name}.json (${body.length} bytes)`);
}
