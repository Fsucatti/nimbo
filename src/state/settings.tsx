/** Units and theme, saved in the browser. */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { defaultUnits, type Units } from "../lib/units";
import { load, save } from "./storage";

/**
 * "place": light while it's day at the place shown, dark while it's night there.
 * "device": follow the operating system.
 */
export type ThemeChoice = "place" | "light" | "dark" | "device";

export interface Settings {
  units: Units;
  theme: ThemeChoice;
}

const KEY = "nimbo:settings";

const UNIT_VALUES: { [K in keyof Units]: readonly Units[K][] } = {
  temperature: ["c", "f"],
  wind: ["kmh", "ms", "mph", "kn"],
  precipitation: ["mm", "in"],
  pressure: ["hpa", "inhg", "mmhg"],
  distance: ["km", "mi"],
  time: ["24", "12"],
};

function isSettings(value: unknown): value is Settings {
  if (!value || typeof value !== "object") return false;
  const { units, theme } = value as Partial<Settings>;
  if (!units || !["place", "light", "dark", "device"].includes(theme as string)) return false;
  return (Object.keys(UNIT_VALUES) as (keyof Units)[]).every((key) => (UNIT_VALUES[key] as readonly string[]).includes(units[key] as string));
}

interface SettingsApi {
  settings: Settings;
  setUnits(change: Partial<Units>): void;
  setTheme(theme: ThemeChoice): void;
}

const SettingsContext = createContext<SettingsApi | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() =>
    load(KEY, { units: defaultUnits(typeof navigator === "undefined" ? undefined : navigator.language), theme: "place" }, isSettings),
  );

  const update = useCallback((next: (previous: Settings) => Settings) => {
    setSettings((previous) => {
      const value = next(previous);
      save(KEY, value);
      return value;
    });
  }, []);

  const api = useMemo<SettingsApi>(
    () => ({
      settings,
      setUnits: (change) => update((previous) => ({ ...previous, units: { ...previous.units, ...change } })),
      setTheme: (theme) => update((previous) => ({ ...previous, theme })),
    }),
    [settings, update],
  );

  return <SettingsContext.Provider value={api}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsApi {
  const api = useContext(SettingsContext);
  if (!api) throw new Error("useSettings needs a SettingsProvider");
  return api;
}

export function useUnits(): Units {
  return useSettings().settings.units;
}
