/**
 * The place being shown and the saved places.
 * The place lives in the address bar (so a link opens the same place), and the last one is
 * remembered. A first-time visitor without a link sees their approximate city.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { approximateLocation } from "../api/places";
import { DEFAULT_PLACE, placeKey, type Place } from "../lib/types";
import { load, save } from "./storage";

const LAST_KEY = "nimbo:last-place";
const SAVED_KEY = "nimbo:saved-places";
export const MAX_SAVED = 12;

function isPlace(value: unknown): value is Place {
  if (!value || typeof value !== "object") return false;
  const p = value as Place;
  return typeof p.name === "string" && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;
}

const isPlaceList = (value: unknown): value is Place[] => Array.isArray(value) && value.every(isPlace);

/** Reads ?lat=&lon=&name=&region=&country=&cc= from the address bar. */
export function placeFromUrl(search: string): Place | null {
  const params = new URLSearchParams(search);
  const latitude = Number(params.get("lat"));
  const longitude = Number(params.get("lon"));
  if (!params.has("lat") || !params.has("lon") || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const text = (name: string, max = 80) => params.get(name)?.slice(0, max) || undefined;
  return {
    name: text("name") ?? `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
    region: text("region"),
    country: text("country"),
    countryCode: text("cc", 2)?.toUpperCase(),
    latitude,
    longitude,
    source: "url",
  };
}

export function urlForPlace(place: Place): string {
  const params = new URLSearchParams();
  params.set("lat", place.latitude.toFixed(4));
  params.set("lon", place.longitude.toFixed(4));
  params.set("name", place.name);
  if (place.region) params.set("region", place.region);
  if (place.country) params.set("country", place.country);
  if (place.countryCode) params.set("cc", place.countryCode);
  return `${location.pathname}?${params.toString()}${location.hash}`;
}

interface PlacesApi {
  /** Null only while a first-time visitor's area is being looked up. */
  place: Place | null;
  setPlace(place: Place): void;
  saved: Place[];
  isSaved(place: Place): boolean;
  toggleSaved(place: Place): void;
  removeSaved(place: Place): void;
}

const PlacesContext = createContext<PlacesApi | null>(null);

export function PlacesProvider({ children }: { children: ReactNode }) {
  const [place, setPlaceState] = useState<Place | null>(() => placeFromUrl(location.search) ?? load<Place | null>(LAST_KEY, null, (v): v is Place | null => v === null || isPlace(v)));
  const [saved, setSaved] = useState<Place[]>(() => load(SAVED_KEY, [], isPlaceList));

  // First visit with no link: estimate the area from the connection, or fall back to Buenos Aires.
  useEffect(() => {
    if (place) return;
    const controller = new AbortController();
    approximateLocation(controller.signal).then((found) => {
      if (!controller.signal.aborted) setPlaceState(found ?? DEFAULT_PLACE);
    });
    return () => controller.abort();
  }, [place]);

  // Keep the address bar and the remembered place in step with what's shown.
  useEffect(() => {
    if (!place) return;
    save(LAST_KEY, place);
    const url = urlForPlace(place);
    if (url !== `${location.pathname}${location.search}${location.hash}`) history.replaceState(null, "", url);
    document.title = `${place.name} weather – Nimbo`;
  }, [place]);

  const setPlace = useCallback((next: Place) => {
    setPlaceState(next);
    window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, []);

  const api = useMemo<PlacesApi>(() => {
    const has = (p: Place) => saved.some((s) => placeKey(s) === placeKey(p));
    const store = (list: Place[]) => {
      setSaved(list);
      save(SAVED_KEY, list);
    };
    return {
      place,
      setPlace,
      saved,
      isSaved: has,
      toggleSaved: (p) => {
        if (has(p)) store(saved.filter((s) => placeKey(s) !== placeKey(p)));
        else store([{ ...p, source: undefined }, ...saved].slice(0, MAX_SAVED));
      },
      removeSaved: (p) => store(saved.filter((s) => placeKey(s) !== placeKey(p))),
    };
  }, [place, saved, setPlace]);

  return <PlacesContext.Provider value={api}>{children}</PlacesContext.Provider>;
}

export function usePlaces(): PlacesApi {
  const api = useContext(PlacesContext);
  if (!api) throw new Error("usePlaces needs a PlacesProvider");
  return api;
}
