/**
 * Rain radar on a map. The map library is large, so it loads only when this section comes into
 * view. Clicking the map offers the forecast for that point.
 */
import { Pause, Play } from "lucide-react";
import type { Map as MapLibreMap, Marker, Popup } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { messageFor } from "../api/http";
import { nameForCoordinates } from "../api/places";
import { RADAR_MAX_ZOOM, type RadarFrame } from "../api/radar";
import { useSeen } from "../components/hooks";
import { Section, SectionError, SectionLoading } from "../components/Section";
import { ago } from "../lib/time";
import { formatCoordinates, type Place } from "../lib/types";
import type { ForecastView } from "../lib/view";
import { usePlaces } from "../state/places";
import { useRadarFrames } from "../state/queries";

const STYLE = { day: "https://tiles.openfreemap.org/styles/positron", night: "https://tiles.openfreemap.org/styles/dark" } as const;
/** Frames in the animation: the last hour, to stay well inside the radar service's rate limit. */
const ANIMATION_FRAMES = 7;

/** Radar colors for rain (RainViewer "Universal Blue"), light to extreme. */
const RADAR_LEGEND = [
  { color: "#88ddee", label: "Light" },
  { color: "#0077aa", label: "Moderate" },
  { color: "#ffee00", label: "Heavy" },
  { color: "#ff4400", label: "Very heavy" },
  { color: "#ff77ff", label: "Hail possible" },
];

function themeNow(): "day" | "night" {
  return document.documentElement.dataset.theme === "night" ? "night" : "day";
}

export function Radar({ view, place }: { view: ForecastView; place: Place }) {
  const [sectionRef, seen] = useSeen<HTMLDivElement>("200px");
  const frames = useRadarFrames(seen);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [frameIndex, setFrameIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const { setPlace } = usePlaces();
  const list: RadarFrame[] = frames.data ?? [];
  const latest = list.length - 1;
  const shown = frameIndex ?? latest;

  // Create the map once the section is near the screen.
  useEffect(() => {
    if (!seen || !container.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        // The map draws in a web worker. Vite bundles it and gives its address, because the
        // library's own guess (a file next to itself) doesn't exist after bundling.
        const [maplibre, worker] = await Promise.all([
          import("maplibre-gl"),
          import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"),
          import("maplibre-gl/dist/maplibre-gl.css"),
        ]);
        maplibre.setWorkerUrl(worker.default);
        if (cancelled || !container.current) return;
        const map = new maplibre.Map({
          container: container.current,
          style: STYLE[themeNow()],
          center: [place.longitude, place.latitude],
          zoom: 6,
          minZoom: 2,
          maxZoom: 10,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          cooperativeGestures: true,
          attributionControl: { compact: true },
        });
        map.touchZoomRotate.disableRotation();
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        const dot = document.createElement("div");
        dot.className = "map-marker";
        dot.setAttribute("aria-hidden", "true");
        markerRef.current = new maplibre.Marker({ element: dot }).setLngLat([place.longitude, place.latitude]).addTo(map);
        map.on("load", () => !cancelled && setReady(true));
        map.on("error", (event) => {
          // Missing radar tiles are normal at the edges of coverage; only a failed style is fatal.
          if (!map.isStyleLoaded() && !cancelled) setMapError("The map couldn't load. Check your connection and try again.");
          void event;
        });
        map.on("click", (event) => {
          const { lng, lat } = event.lngLat;
          popupRef.current?.remove();
          const box = document.createElement("div");
          box.className = "map-popup";
          const text = document.createElement("p");
          text.textContent = formatCoordinates(lat, lng);
          const button = document.createElement("button");
          button.type = "button";
          button.className = "button button-primary";
          button.textContent = "Show the weather here";
          button.addEventListener("click", async () => {
            button.disabled = true;
            button.textContent = "Finding the place…";
            let named: Partial<Place> = {};
            try {
              named = await nameForCoordinates(lat, lng);
            } catch {
              // Coordinates alone are fine.
            }
            popupRef.current?.remove();
            setPlace({
              name: named.name ?? formatCoordinates(lat, lng),
              region: named.region,
              country: named.country,
              countryCode: named.countryCode,
              latitude: lat,
              longitude: lng,
              source: "map",
            });
          });
          box.append(text, button);
          popupRef.current = new maplibre.Popup({ closeButton: true, maxWidth: "260px" }).setLngLat([lng, lat]).setDOMContent(box).addTo(map);
        });
        mapRef.current = map;
      } catch {
        if (!cancelled) setMapError("The map couldn't load. Check your connection and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seen, place.latitude, place.longitude, setPlace]);

  // Remove the map when the page goes away.
  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    [],
  );

  // Follow the place.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerRef.current?.setLngLat([place.longitude, place.latitude]);
    map.jumpTo({ center: [place.longitude, place.latitude] });
  }, [place.latitude, place.longitude]);

  // Follow the page's light or dark colors.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const observer = new MutationObserver(() => {
      setReady(false);
      map.setStyle(STYLE[themeNow()]);
      map.once("styledata", () => setReady(true));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [ready]);

  // Radar layers: only the frame on screen is visible, so only its tiles load until "Play".
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || list.length === 0) return;
    const wanted = playing ? list.slice(-ANIMATION_FRAMES) : [list[shown]];
    for (const frame of list) {
      const id = `radar-${frame.time}`;
      const keep = wanted.includes(frame);
      if (keep && !map.getSource(id)) {
        map.addSource(id, {
          type: "raster",
          tiles: [frame.tileUrl],
          tileSize: 512,
          maxzoom: RADAR_MAX_ZOOM,
          attribution: '<a href="https://www.rainviewer.com/" target="_blank" rel="noopener">Weather data by RainViewer</a>',
        });
        map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": 0, "raster-opacity-transition": { duration: 0 } } });
      }
      if (!keep && map.getLayer(id) && !playing) {
        map.removeLayer(id);
        map.removeSource(id);
      }
    }
    for (const frame of list) {
      const id = `radar-${frame.time}`;
      if (map.getLayer(id)) map.setPaintProperty(id, "raster-opacity", frame === list[shown] ? 0.75 : 0);
    }
  }, [ready, list, shown, playing]);

  // Animation: step through the last hour, then hold on the latest frame for a moment.
  useEffect(() => {
    if (!playing || list.length === 0) return;
    const first = Math.max(0, list.length - ANIMATION_FRAMES);
    let index = first;
    setFrameIndex(index);
    const timer = setInterval(() => {
      index = index >= latest ? first : index + 1;
      setFrameIndex(index);
    }, 700);
    return () => clearInterval(timer);
  }, [playing, list.length, latest]);

  const frame = list[shown];
  return (
    <Section
      id="radar"
      title="Rain radar"
      intro="Rain and snow measured by weather radars over the last two hours. Coverage depends on each country's radar network; where there is none, the map stays clear."
    >
      <div ref={sectionRef} className="radar">
        <div className="radar-controls">
          <button type="button" className="button" onClick={() => setPlaying((p) => !p)} disabled={list.length === 0 || !ready}>
            {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
            {playing ? "Pause" : "Play the last hour"}
          </button>
          <label className="radar-slider">
            <span className="visually-hidden">Radar time</span>
            <input
              type="range"
              min={0}
              max={Math.max(0, latest)}
              value={shown}
              disabled={list.length === 0}
              onChange={(event) => {
                setPlaying(false);
                setFrameIndex(Number(event.target.value));
              }}
            />
          </label>
          <span className="radar-time" aria-live="polite">
            {frame ? `${view.clock.time(frame.time)} (${ago(frame.time * 1000, Date.now())})` : ""}
          </span>
        </div>
        {frames.error && !frames.data ? <SectionError message={messageFor(frames.error)} onRetry={() => frames.refetch()} /> : null}
        {mapError && <SectionError message={mapError} onRetry={() => location.reload()} />}
        <div className="radar-map" ref={container} role="region" aria-label="Map with rain radar. Click a point to get its forecast.">
          {!ready && !mapError && <SectionLoading>Loading the map…</SectionLoading>}
        </div>
        <div className="chart-legend radar-legend">
          {RADAR_LEGEND.map((item) => (
            <span key={item.label} className="legend-item">
              <span className="legend-swatch" style={{ background: item.color }} aria-hidden="true" />
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </Section>
  );
}
