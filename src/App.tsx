import { useEffect, useMemo } from "react";
import { Dashboard } from "./components/Dashboard";
import { Footer } from "./components/Footer";
import { Hero } from "./components/Hero";
import { buildView } from "./lib/view";
import { usePlaces } from "./state/places";
import { useForecast } from "./state/queries";
import { useSettings } from "./state/settings";

/** Picks light or dark: by default it follows day and night at the place being shown. */
function useTheme(isDay: boolean | null) {
  const { theme } = useSettings().settings;
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      let mode: "day" | "night";
      if (theme === "light") mode = "day";
      else if (theme === "dark") mode = "night";
      else if (theme === "device" || isDay === null) mode = matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "day";
      else mode = isDay ? "day" : "night";
      root.dataset.theme = mode;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", mode === "day" ? "#f4f7f9" : "#0b1422");
    };
    apply();
    const query = matchMedia("(prefers-color-scheme: dark)");
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [theme, isDay]);
}

export function App() {
  const { place } = usePlaces();
  const { units } = useSettings().settings;
  const forecast = useForecast(place);
  const view = useMemo(() => (forecast.data ? buildView(forecast.data, units.time === "12") : null), [forecast.data, units.time]);
  useTheme(view ? view.forecast.current.isDay === 1 : null);

  // Data still on screen from the previous place while the new one loads.
  const stale = forecast.isPlaceholderData;

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to the forecast
      </a>
      <Hero place={place} view={stale ? null : view} units={units} loading={forecast.isFetching} error={forecast.error} onRetry={() => forecast.refetch()} />
      <main id="main" className={stale ? "is-stale" : undefined}>
        {view && place && <Dashboard view={view} place={place} units={units} />}
      </main>
      <Footer />
    </>
  );
}
