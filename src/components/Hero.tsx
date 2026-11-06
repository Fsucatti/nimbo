/** The first screen: the place, its sky right now, the current reading and the next 24 hours. */
import { RotateCcw, Star, Sunrise, Sunset } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { messageFor } from "../api/http";
import { sunDay } from "../lib/astro";
import { skyColors } from "../lib/sky";
import { summarize } from "../lib/summary";
import { offsetMinutes } from "../lib/time";
import { formatPercent, formatTemperature, num, toTemperature, type Units } from "../lib/units";
import { placeKey, placeSubtitle, type Place } from "../lib/types";
import type { ForecastView } from "../lib/view";
import { conditionLabel } from "../lib/wmo";
import { usePlaces } from "../state/places";
import { useNow } from "./hooks";
import { Sky, type SkyScene } from "./Sky";
import { sceneFor } from "./skyScene";
import { TopBar } from "./TopBar";
import { WeatherIcon } from "./WeatherIcon";

const LOADING_SCENE: SkyScene = {
  colors: skyColors({ sunAltitude: 25, cloudCover: 40, group: "partly", intensity: 0 }),
  sun: null,
  moon: null,
  clouds: { low: 20, mid: 30, high: 30 },
  cover: 40,
  group: "partly",
  precipitation: 0,
  snowing: false,
  hail: false,
  windDirection: 270,
  windSpeed: 8,
  stars: 0,
  daylight: 1,
  fog: 0,
  seed: "loading",
};

/** "18.6°" with the decimal set smaller. */
function BigTemperature({ celsius, units }: { celsius: number; units: Units }) {
  const value = toTemperature(celsius, units.temperature);
  const text = num(value, 1);
  const [whole, decimal] = text.split(".");
  return (
    <p className="hero-temp" aria-label={`${text} degrees ${units.temperature === "c" ? "Celsius" : "Fahrenheit"}`}>
      <span className="hero-temp-whole">{whole}</span>
      <span className="hero-temp-rest">
        <span className="hero-temp-degree">°</span>
        {decimal !== undefined && <span className="hero-temp-decimal">.{decimal}</span>}
      </span>
    </p>
  );
}

/** "3 hours ahead of you" when the place's clock differs from the visitor's. */
function timeDifference(timezone: string, ts: number): string | null {
  const place = offsetMinutes(timezone, ts);
  const visitor = -new Date(ts * 1000).getTimezoneOffset();
  const diff = place - visitor;
  if (diff === 0) return null;
  const hours = Math.abs(diff) / 60;
  const amount = Number.isInteger(hours) ? `${hours} ${hours === 1 ? "hour" : "hours"}` : `${num(hours, 1)} hours`;
  return `${amount} ${diff > 0 ? "ahead of" : "behind"} you`;
}

function NextHours({ view, units }: { view: ForecastView; units: Units }) {
  const { hourly, latitude, longitude, timezone } = view.forecast;
  const start = view.nowIndex;
  const end = Math.min(hourly.time.length, start + 25);

  // Sunrise and sunset falling inside the next 24 hours appear between the hours.
  const events = useMemo(() => {
    const list: { ts: number; kind: "sunrise" | "sunset" }[] = [];
    for (const offset of [0, 1]) {
      const day = sunDay(view.now + offset * 86400, latitude, longitude, timezone);
      if (day.sunrise) list.push({ ts: day.sunrise, kind: "sunrise" });
      if (day.sunset) list.push({ ts: day.sunset, kind: "sunset" });
    }
    return list.filter((event) => event.ts > view.now && event.ts < view.now + 24 * 3600);
  }, [view.now, latitude, longitude, timezone]);

  const items = [];
  for (let i = start; i < end; i++) {
    const label = i === start ? "Now" : view.clock.hour(hourly.time[i]);
    const chance = hourly.precipProbability[i];
    items.push(
      <li key={hourly.time[i]} className="next-hour">
        <span className="next-hour-time">{label}</span>
        <WeatherIcon code={hourly.weatherCode[i]} isDay={hourly.isDay[i] === 1} size={30} label={conditionLabel(hourly.weatherCode[i], hourly.isDay[i] === 1)} />
        <span className="next-hour-temp">{formatTemperature(i === start ? view.forecast.current.temperature : hourly.temperature[i], units.temperature)}</span>
        <span className="next-hour-chance">{chance >= 20 ? formatPercent(chance) : ""}</span>
      </li>,
    );
    for (const event of events) {
      if (event.ts >= hourly.time[i] && event.ts < hourly.time[i] + 3600) {
        const Icon = event.kind === "sunrise" ? Sunrise : Sunset;
        items.push(
          <li key={`${event.kind}-${event.ts}`} className="next-hour next-hour-event">
            <span className="next-hour-time">{view.clock.time(event.ts)}</span>
            <Icon size={26} aria-hidden="true" className="next-hour-event-icon" />
            <span className="next-hour-temp">{event.kind === "sunrise" ? "Sunrise" : "Sunset"}</span>
            <span className="next-hour-chance" />
          </li>,
        );
      }
    }
  }
  return (
    <div className="next-hours" role="region" aria-label="Next 24 hours" tabIndex={0}>
      <ol>{items}</ol>
    </div>
  );
}

interface Props {
  place: Place | null;
  view: ForecastView | null;
  units: Units;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}

export function Hero({ place, view, units, loading, error, onRetry }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const { isSaved, toggleSaved } = usePlaces();
  const now = useNow();
  // The sky uses the real time, so the sun keeps moving while the page is open.
  const scene = useMemo(() => (view ? sceneFor(view, now, place ? placeKey(place) : "x") : LOADING_SCENE), [view, now, place]);
  const current = view?.forecast.current;
  const today = view ? view.todayIndex : 0;
  const saved = place ? isSaved(place) : false;
  const difference = view ? timeDifference(view.forecast.timezone, now) : null;

  return (
    <header className="hero" data-ink={scene.colors.ink}>
      <Sky scene={scene} />
      <div className="hero-inner">
        <TopBar onMessage={setMessage} />
        {message && (
          <p className="hero-message" role="alert">
            {message}
          </p>
        )}

        <div className={`hero-reading${loading && !view ? " is-loading" : ""}`} aria-busy={loading}>
          {place ? (
            <>
              <div className="hero-place">
                <h1>{place.name}</h1>
                <button
                  type="button"
                  className="hero-save"
                  aria-pressed={saved}
                  aria-label={saved ? `Remove ${place.name} from saved places` : `Save ${place.name}`}
                  title={saved ? "Saved" : "Save this place"}
                  onClick={() => toggleSaved(place)}
                >
                  <Star size={22} aria-hidden="true" fill={saved ? "currentColor" : "none"} />
                </button>
              </div>
              <p className="hero-where">
                {placeSubtitle(place) && <span>{placeSubtitle(place)}</span>}
                {view && (
                  <span>
                    {view.clock.fullDate(now)}, {view.clock.time(now)}
                    {difference && <span className="hero-offset"> ({difference})</span>}
                  </span>
                )}
              </p>
            </>
          ) : (
            <h1 className="hero-finding">Finding your area…</h1>
          )}

          {view && current ? (
            <>
              <div className="hero-now">
                <BigTemperature celsius={current.temperature} units={units} />
                <div className="hero-condition">
                  <WeatherIcon code={current.weatherCode} isDay={current.isDay === 1} size={64} animated />
                  <span>{conditionLabel(current.weatherCode, current.isDay === 1)}</span>
                </div>
              </div>
              <dl className="hero-facts">
                <div>
                  <dt>Feels like</dt>
                  <dd>{formatTemperature(current.apparent, units.temperature)}</dd>
                </div>
                <div>
                  <dt>High</dt>
                  <dd>{formatTemperature(view.forecast.daily.tempMax[today], units.temperature)}</dd>
                </div>
                <div>
                  <dt>Low</dt>
                  <dd>{formatTemperature(view.forecast.daily.tempMin[today], units.temperature)}</dd>
                </div>
              </dl>
              <div className="hero-summary">
                {summarize(view, units).map((line) => (
                  <Fragment key={line}>
                    <p>{line}</p>
                  </Fragment>
                ))}
              </div>
              {place?.source === "ip" && (
                <p className="hero-note">This is your approximate area, estimated from your connection. Search or use your location for a precise forecast.</p>
              )}
            </>
          ) : error && !loading ? (
            <div className="hero-error" role="alert">
              <p>{messageFor(error)}</p>
              <button type="button" className="button" onClick={onRetry}>
                <RotateCcw size={16} aria-hidden="true" /> Try again
              </button>
            </div>
          ) : (
            place && <p className="hero-loading">Loading the forecast for {place.name}…</p>
          )}
        </div>

        {view && <NextHours view={view} units={units} />}
      </div>
    </header>
  );
}
