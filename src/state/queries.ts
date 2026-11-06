/** Data hooks. TanStack Query caches each answer, retries once and refreshes the forecast. */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchAirQuality } from "../api/air";
import { fetchNormals, fetchPastDay, fetchRecent } from "../api/climate";
import { fetchForecast, fetchPlacesNow } from "../api/forecast";
import { ApiError } from "../api/http";
import { fetchMarine } from "../api/marine";
import { fetchModels } from "../api/models";
import { fetchRadarFrames } from "../api/radar";
import { placeKey, type Place } from "../lib/types";

const MINUTE = 60_000;

/** Don't retry what retrying can't fix. */
function retry(count: number, error: unknown): boolean {
  if (error instanceof ApiError && (error.kind === "bad-request" || error.kind === "rate")) return false;
  return count < 1;
}

export function useForecast(place: Place | null) {
  return useQuery({
    queryKey: ["forecast", place ? placeKey(place) : null],
    queryFn: ({ signal }) => fetchForecast(place!.latitude, place!.longitude, signal),
    enabled: Boolean(place),
    staleTime: 10 * MINUTE,
    refetchInterval: 15 * MINUTE,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
    retry,
  });
}

export function useAirQuality(place: Place | null) {
  return useQuery({
    queryKey: ["air", place ? placeKey(place) : null],
    queryFn: ({ signal }) => fetchAirQuality(place!.latitude, place!.longitude, signal),
    enabled: Boolean(place),
    staleTime: 30 * MINUTE,
    retry,
  });
}

export function useMarine(place: Place | null) {
  return useQuery({
    queryKey: ["marine", place ? placeKey(place) : null],
    queryFn: ({ signal }) => fetchMarine(place!.latitude, place!.longitude, signal),
    enabled: Boolean(place),
    staleTime: 30 * MINUTE,
    retry,
  });
}

export function useModels(place: Place | null, enabled: boolean) {
  return useQuery({
    queryKey: ["models", place ? placeKey(place) : null],
    queryFn: ({ signal }) => fetchModels(place!.latitude, place!.longitude, signal),
    enabled: Boolean(place) && enabled,
    staleTime: 60 * MINUTE,
    retry,
  });
}

export function useRecentDays(place: Place | null, enabled: boolean) {
  return useQuery({
    queryKey: ["recent", place ? placeKey(place) : null],
    queryFn: ({ signal }) => fetchRecent(place!.latitude, place!.longitude, signal),
    enabled: Boolean(place) && enabled,
    staleTime: 60 * MINUTE,
    retry,
  });
}

export function useNormals(place: Place | null, anchor: string | null, enabled: boolean, onProgress?: (done: number, total: number) => void) {
  return useQuery({
    queryKey: ["normals", place ? placeKey(place) : null, anchor],
    queryFn: ({ signal }) => fetchNormals(place!.latitude, place!.longitude, anchor!, signal, onProgress),
    enabled: Boolean(place) && Boolean(anchor) && enabled,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * MINUTE,
    retry,
  });
}

export function usePastDay(place: Place | null, date: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["past-day", place ? placeKey(place) : null, date],
    queryFn: ({ signal }) => fetchPastDay(place!.latitude, place!.longitude, date!, signal),
    enabled: Boolean(place) && Boolean(date) && enabled,
    staleTime: Number.POSITIVE_INFINITY,
    retry,
  });
}

export function useRadarFrames(enabled: boolean) {
  return useQuery({
    queryKey: ["radar"],
    queryFn: ({ signal }) => fetchRadarFrames(signal),
    enabled,
    staleTime: 5 * MINUTE,
    refetchInterval: enabled ? 10 * MINUTE : false,
    retry,
  });
}

export function usePlacesNow(places: Place[], enabled: boolean) {
  return useQuery({
    queryKey: ["places-now", places.map(placeKey).join("|")],
    queryFn: ({ signal }) => fetchPlacesNow(places, signal),
    enabled: enabled && places.length > 0,
    staleTime: 10 * MINUTE,
    retry,
  });
}
