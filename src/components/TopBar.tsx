/** Brand, search, "use my location", saved places and settings. */
import { LocateFixed, LoaderCircle, SlidersHorizontal, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { nameForCoordinates } from "../api/places";
import { formatTemperature, UNIT_LABELS, type Units } from "../lib/units";
import { placeKey, placeSubtitle, type Place } from "../lib/types";
import { usePlaces } from "../state/places";
import { usePlacesNow } from "../state/queries";
import { useSettings, type ThemeChoice } from "../state/settings";
import { Popover } from "./Popover";
import { Search } from "./Search";
import { WeatherIcon } from "./WeatherIcon";

export function Brand() {
  return (
    <a className="brand" href="/" aria-label="Nimbo, home">
      <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
        <circle cx="20.5" cy="11.5" r="6.5" className="brand-sun" />
        <path d="M9.5 26.5h13.2a5.3 5.3 0 0 0 .6-10.56A7.2 7.2 0 0 0 9.6 14.2a6.15 6.15 0 0 0-.1 12.3z" className="brand-cloud" />
      </svg>
      <span>Nimbo</span>
    </a>
  );
}

function LocateButton({ onMessage }: { onMessage: (message: string | null) => void }) {
  const { setPlace } = usePlaces();
  const [busy, setBusy] = useState(false);

  const locate = () => {
    if (!("geolocation" in navigator)) {
      onMessage("This browser can't share its location. Search for a place instead.");
      return;
    }
    setBusy(true);
    onMessage(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        let named: Partial<Place> = {};
        try {
          named = await nameForCoordinates(coords.latitude, coords.longitude);
        } catch {
          // Without a name the coordinates still work.
        }
        setPlace({
          name: named.name ?? "My location",
          region: named.region,
          country: named.country,
          countryCode: named.countryCode,
          latitude: coords.latitude,
          longitude: coords.longitude,
          source: "gps",
        });
        setBusy(false);
      },
      (error) => {
        setBusy(false);
        onMessage(
          error.code === error.PERMISSION_DENIED
            ? "Location access is off for this site. Allow it in your browser's site settings, or search for a place."
            : "Couldn't get your location. Try again, or search for a place.",
        );
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60_000 },
    );
  };

  return (
    <button type="button" className="button icon-button hero-button" onClick={locate} aria-label="Use my location" title="Use my location" disabled={busy}>
      {busy ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : <LocateFixed size={18} aria-hidden="true" />}
    </button>
  );
}

function SavedPlaces() {
  const { saved, setPlace, removeSaved, place } = usePlaces();
  const [open, setOpen] = useState(false);
  const now = usePlacesNow(saved, open);
  const { units } = useSettings().settings;

  return (
    <Popover
      label="Saved places"
      triggerClassName="button hero-button saved-trigger"
      onOpenChange={setOpen}
      trigger={
        <span className="saved-trigger-content">
          <Star size={18} aria-hidden="true" />
          {saved.length > 0 && <span className="saved-count">{saved.length}</span>}
        </span>
      }
    >
      {(close) => (
        <div className="saved-panel">
          <h2 className="panel-title">Saved places</h2>
          {saved.length === 0 ? (
            <p className="panel-empty">Save a place with the star next to its name, and it will be here, with its weather now.</p>
          ) : (
            <ul className="saved-list">
              {saved.map((item, i) => {
                const reading = now.data?.[i];
                const current = place && placeKey(place) === placeKey(item);
                return (
                  <li key={placeKey(item)} className="saved-item">
                    <button
                      type="button"
                      className="saved-open"
                      aria-current={current ? "true" : undefined}
                      onClick={() => {
                        setPlace(item);
                        close();
                      }}
                    >
                      <span className="saved-name">{item.name}</span>
                      <span className="saved-detail">{placeSubtitle(item)}</span>
                      {reading && (
                        <span className="saved-now">
                          <WeatherIcon code={reading.weatherCode} isDay={reading.isDay} size={24} />
                          <span className="saved-temp">{formatTemperature(reading.temperature, units.temperature)}</span>
                        </span>
                      )}
                    </button>
                    <button type="button" className="button button-quiet icon-button" aria-label={`Remove ${item.name}`} onClick={() => removeSaved(item)}>
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Popover>
  );
}

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: "place", label: "Day and night at the place" },
  { value: "device", label: "Same as my device" },
  { value: "light", label: "Always light" },
  { value: "dark", label: "Always dark" },
];

function UnitRow<K extends keyof Units>({ name, label, options }: { name: K; label: string; options: { value: Units[K]; text: string }[] }) {
  const { settings, setUnits } = useSettings();
  return (
    <div className="setting-row">
      <span className="setting-label" id={`unit-${name}`}>
        {label}
      </span>
      <div className="segmented" role="group" aria-labelledby={`unit-${name}`}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={settings.units[name] === option.value}
            onClick={() => setUnits({ [name]: option.value } as Partial<Units>)}
          >
            {option.text}
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingsMenu() {
  const { settings, setTheme } = useSettings();
  return (
    <Popover label="Units and display" triggerClassName="button icon-button hero-button" trigger={<SlidersHorizontal size={18} aria-hidden="true" />}>
      {() => (
        <div className="settings-panel">
          <h2 className="panel-title">Units and display</h2>
          <UnitRow
            name="temperature"
            label="Temperature"
            options={[
              { value: "c", text: UNIT_LABELS.temperature.c },
              { value: "f", text: UNIT_LABELS.temperature.f },
            ]}
          />
          <UnitRow
            name="wind"
            label="Wind"
            options={(["kmh", "ms", "mph", "kn"] as const).map((value) => ({ value, text: UNIT_LABELS.wind[value] }))}
          />
          <UnitRow
            name="precipitation"
            label="Rain"
            options={(["mm", "in"] as const).map((value) => ({ value, text: UNIT_LABELS.precipitation[value] }))}
          />
          <UnitRow
            name="pressure"
            label="Pressure"
            options={(["hpa", "inhg", "mmhg"] as const).map((value) => ({ value, text: UNIT_LABELS.pressure[value] }))}
          />
          <UnitRow
            name="distance"
            label="Distance"
            options={(["km", "mi"] as const).map((value) => ({ value, text: UNIT_LABELS.distance[value] }))}
          />
          <UnitRow
            name="time"
            label="Clock"
            options={[
              { value: "24", text: "24-hour" },
              { value: "12", text: "12-hour" },
            ]}
          />
          <div className="setting-row setting-row-stack">
            <label className="setting-label" htmlFor="theme-choice">
              Colors
            </label>
            <select id="theme-choice" className="select" value={settings.theme} onChange={(event) => setTheme(event.target.value as ThemeChoice)}>
              {THEMES.map((theme) => (
                <option key={theme.value} value={theme.value}>
                  {theme.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </Popover>
  );
}

export function TopBar({ onMessage }: { onMessage: (message: string | null) => void }) {
  return (
    <div className="topbar">
      <Brand />
      <div className="topbar-search">
        <Search />
      </div>
      <div className="topbar-actions">
        <LocateButton onMessage={onMessage} />
        <SavedPlaces />
        <SettingsMenu />
      </div>
    </div>
  );
}
