/**
 * The same forecast from several national weather models, to show how much they agree.
 * Source: Open-Meteo forecast API with explicit models. Each model has its own range.
 */
import { column, getJSON, query, roundCoord } from "./http";

export const MODELS = [
  { id: "ecmwf_ifs", name: "ECMWF IFS", origin: "European Centre (ECMWF)" },
  { id: "ecmwf_aifs025_single", name: "ECMWF AIFS", origin: "ECMWF, machine-learning model" },
  { id: "gfs_seamless", name: "GFS", origin: "NOAA, United States" },
  { id: "icon_seamless", name: "ICON", origin: "DWD, Germany" },
  { id: "gem_seamless", name: "GEM", origin: "Environment Canada" },
  { id: "jma_seamless", name: "JMA", origin: "Japan Meteorological Agency" },
  { id: "meteofrance_seamless", name: "ARPEGE", origin: "Météo-France" },
  { id: "ukmo_seamless", name: "UKMO", origin: "Met Office, United Kingdom" },
  { id: "cma_grapes_global", name: "GRAPES", origin: "China Meteorological Administration" },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];
export type ModelMetric = "tempMax" | "tempMin" | "precipitation";

export interface ModelRun {
  id: ModelId;
  tempMax: number[];
  tempMin: number[];
  precipitation: number[];
}

export interface ModelComparison {
  time: number[];
  runs: ModelRun[];
}

export async function fetchModels(latitude: number, longitude: number, signal?: AbortSignal): Promise<ModelComparison> {
  const url = `https://api.open-meteo.com/v1/forecast?${query({
    latitude: roundCoord(latitude),
    longitude: roundCoord(longitude),
    daily: ["temperature_2m_max", "temperature_2m_min", "precipitation_sum"],
    models: MODELS.map((model) => model.id),
    timezone: "auto",
    timeformat: "unixtime",
    forecast_days: 10,
  })}`;
  const raw = await getJSON<{ daily: { time: number[] } & Record<string, (number | null)[]> }>(url, signal);
  const length = raw.daily.time.length;
  const runs = MODELS.map((model) => ({
    id: model.id,
    tempMax: column(raw.daily[`temperature_2m_max_${model.id}`], length),
    tempMin: column(raw.daily[`temperature_2m_min_${model.id}`], length),
    precipitation: column(raw.daily[`precipitation_sum_${model.id}`], length),
  })).filter((run) => run.tempMax.some(Number.isFinite));
  return { time: raw.daily.time, runs };
}
