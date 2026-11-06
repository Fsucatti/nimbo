/** "Right now": an instrument panel, each reading with its own small gauge and a plain sentence. */
import { CloudSun, Droplets, Eye, Gauge, Layers, MapPin, Sprout, Sun, Thermometer, Umbrella, Wind, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { Section } from "../components/Section";
import {
  beaufort,
  capeWords,
  cloudBaseMeters,
  compassPoint,
  compassWords,
  dewPointFeel,
  feelsLikeReason,
  pressureTrend,
  pressureWords,
  uvCategory,
  visibilityWords,
  wetBulbWords,
} from "../lib/comfort";
import { uvWindow } from "../lib/highlights";
import { formatCoordinates, type Place } from "../lib/types";
import {
  formatDistance,
  formatDuration,
  formatHeight,
  formatPercent,
  formatPrecipitation,
  formatPressure,
  formatPressureDelta,
  formatSnow,
  formatTemperature,
  formatWind,
  num,
  type Units,
} from "../lib/units";
import { maxRange, sumRange, type ForecastView } from "../lib/view";

function Instrument({ icon, label, value, children, note }: { icon: ReactNode; label: string; value: ReactNode; children?: ReactNode; note?: ReactNode }) {
  return (
    <div className="instrument">
      <h3 className="instrument-label">
        {icon}
        {label}
      </h3>
      <p className="instrument-value">{value}</p>
      {children && <div className="instrument-figure">{children}</div>}
      {note && <p className="instrument-note">{note}</p>}
    </div>
  );
}

/** A horizontal meter on a 0–1 scale, with the same hue for track and fill. */
function Meter({ value, label, color = "var(--accent)" }: { value: number; label: string; color?: string }) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <span className="meter" role="img" aria-label={label} style={{ "--meter": color } as React.CSSProperties}>
      <span className="meter-fill" style={{ width: `${clamped * 100}%` }} />
    </span>
  );
}

function Compass({ direction, speed }: { direction: number; speed: string }) {
  // Wind direction is where it comes from; the arrow shows the way it blows.
  const to = (direction + 180) % 360;
  return (
    <svg viewBox="-60 -60 120 120" className="compass" role="img" aria-label={`Wind from the ${compassWords(direction)}`}>
      <circle r="50" className="compass-ring" />
      {Array.from({ length: 36 }, (_, i) => (
        <line key={i} x1="0" y1={-50} x2="0" y2={i % 9 === 0 ? -42 : -46} transform={`rotate(${i * 10})`} className="compass-tick" />
      ))}
      {[
        ["N", 0],
        ["E", 90],
        ["S", 180],
        ["W", 270],
      ].map(([label, angle]) => (
        <text key={label} x={Math.sin(((angle as number) * Math.PI) / 180) * 33} y={-Math.cos(((angle as number) * Math.PI) / 180) * 33 + 4} textAnchor="middle" className="compass-label">
          {label}
        </text>
      ))}
      <g transform={`rotate(${to})`}>
        <line x1="0" y1="46" x2="0" y2="-36" className="compass-arrow" />
        <path d="M0,-48 L7,-34 L0,-37 L-7,-34 Z" className="compass-head" />
        <circle cy="44" r="4" className="compass-tail" />
      </g>
      <circle r="17" className="compass-hub" />
      <text y="5" textAnchor="middle" className="compass-speed">
        {speed}
      </text>
    </svg>
  );
}

function Barometer({ hpa, label }: { hpa: number; label: string }) {
  const min = 960;
  const max = 1050;
  const r = 40;
  const angle = -120 + ((Math.max(min, Math.min(max, hpa)) - min) / (max - min)) * 240;
  const point = (a: number, radius: number) => [Math.sin((a * Math.PI) / 180) * radius, -Math.cos((a * Math.PI) / 180) * radius];
  const [x1, y1] = point(-120, r);
  const [x2, y2] = point(120, r);
  return (
    <svg viewBox="-70 -62 140 92" className="barometer" role="img" aria-label={label}>
      <path d={`M${x1},${y1} A${r},${r} 0 1 1 ${x2},${y2}`} className="barometer-track" />
      {/* The classic dial words sit outside the scale, so the needle never covers them. */}
      {[
        ["Stormy", -95, "end"],
        ["Change", 0, "middle"],
        ["Fair", 95, "start"],
      ].map(([text, a, anchor]) => {
        const [x, y] = point(a as number, r + 12);
        return (
          <text key={text as string} x={x} y={y + 3} textAnchor={anchor as "start" | "middle" | "end"} className="barometer-word">
            {text}
          </text>
        );
      })}
      <g transform={`rotate(${angle})`}>
        <line x1="0" y1="6" x2="0" y2={-(r - 8)} className="barometer-needle" />
      </g>
      <circle r="4.5" className="barometer-hub" />
    </svg>
  );
}

function UvScale({ value }: { value: number }) {
  const position = Math.max(0, Math.min(1, value / 12));
  return (
    <span className="uv-scale" role="img" aria-label={`UV index ${num(value)} on a scale to 11 and above`}>
      <span className="uv-scale-marker" style={{ left: `${position * 100}%` }} />
    </span>
  );
}

export function Conditions({ view, units, place }: { view: ForecastView; units: Units; place: Place }) {
  const { current, hourly, daily, elevation, timezoneAbbreviation, latitude, longitude } = view.forecast;
  const now = view.nowIndex;
  const today = view.todayIndex;
  const [dayFrom, dayTo] = view.dayHours[today];

  const wind = beaufort(current.windSpeed);
  const trend = pressureTrend(current.pressure, hourly.pressure[Math.max(0, now - 3)]);
  const uvNow = current.uvIndex;
  const uvMax = daily.uvMax[today];
  const uv = uvCategory(Number.isFinite(uvMax) ? uvMax : 0);
  const protection = uvWindow(view, dayFrom, dayTo, 3);
  const lastDay = sumRange(hourly.precipitation, Math.max(0, now - 23), now + 1);
  const nextDay = sumRange(hourly.precipitation, now + 1, now + 25);
  const nextChance = maxRange(hourly.precipProbability, now + 1, now + 25).value;
  const snowDepth = hourly.snowDepth[now];
  const base = cloudBaseMeters(current.temperature, current.dewPoint);
  const capeNext = maxRange(hourly.cape, now, now + 24);
  const sunshine = daily.sunshine[today];
  const daylight = daily.daylight[today];
  const radiation = hourly.radiation[now];
  const et0 = daily.et0[today];
  const rainToday = daily.precipSum[today];
  const soilMoisture = hourly.soilMoisture[now];
  const utcOffset = view.clock.offsetMinutes(view.now);
  const offsetText = `UTC${utcOffset >= 0 ? "+" : "−"}${Math.floor(Math.abs(utcOffset) / 60)}${Math.abs(utcOffset) % 60 ? `:${String(Math.abs(utcOffset) % 60).padStart(2, "0")}` : ""}`;

  return (
    <Section id="now" title="Right now" intro={`Measured by the weather models for ${view.clock.time(current.time)} local time, refreshed every 15 minutes.`}>
      <div className="instruments">
        <Instrument
          icon={<Wind size={16} aria-hidden="true" />}
          label="Wind"
          value={
            <>
              {formatWind(current.windSpeed, units.wind)} <span className="instrument-sub">from the {compassPoint(current.windDirection)}</span>
            </>
          }
          note={`Gusts up to ${formatWind(current.windGusts, units.wind)}. Force ${wind.force}, ${wind.name.toLowerCase()}: ${wind.land.toLowerCase()}.`}
        >
          <Compass direction={current.windDirection} speed={formatWind(current.windSpeed, units.wind, false)} />
        </Instrument>

        <Instrument
          icon={<Gauge size={16} aria-hidden="true" />}
          label="Pressure"
          value={formatPressure(current.pressure, units.pressure)}
          note={`${trend.words}, ${formatPressureDelta(trend.change, units.pressure)} in 3 hours. ${pressureWords(current.pressure)}.`}
        >
          <Barometer hpa={current.pressure} label={`Pressure ${formatPressure(current.pressure, units.pressure)}`} />
        </Instrument>

        <Instrument
          icon={<Sun size={16} aria-hidden="true" />}
          label="UV index"
          value={
            <>
              {Number.isFinite(uvNow) ? num(uvNow) : "–"} <span className="instrument-sub">now, up to {Number.isFinite(uvMax) ? num(uvMax) : "–"} today</span>
            </>
          }
          note={`${uv.label} today. ${protection ? `Protection needed from ${protection}. ` : ""}${uv.advice}`}
        >
          <UvScale value={Number.isFinite(uvMax) ? uvMax : 0} />
          <span className="uv-scale-labels" aria-hidden="true">
            <span>Low</span>
            <span>Moderate</span>
            <span>High</span>
            <span>Very high</span>
            <span>Extreme</span>
          </span>
        </Instrument>

        <Instrument
          icon={<Droplets size={16} aria-hidden="true" />}
          label="Humidity"
          value={
            <>
              {formatPercent(current.humidity)} <span className="instrument-sub">dew point {formatTemperature(current.dewPoint, units.temperature)}</span>
            </>
          }
          note={`${dewPointFeel(current.dewPoint)}. The dew point is the temperature at which dew or fog forms; it tells how humid the air feels better than the percentage.`}
        >
          <Meter value={current.humidity / 100} label={`Relative humidity ${formatPercent(current.humidity)}`} color="var(--humidity)" />
        </Instrument>

        <Instrument
          icon={<Thermometer size={16} aria-hidden="true" />}
          label="Feels like"
          value={formatTemperature(current.apparent, units.temperature)}
          note={`${feelsLikeReason(current.temperature, current.apparent, current.windSpeed, current.humidity)} Wet-bulb temperature ${formatTemperature(hourly.wetBulb[now], units.temperature)}: ${wetBulbWords(hourly.wetBulb[now]).toLowerCase()}.`}
        />

        <Instrument
          icon={<Eye size={16} aria-hidden="true" />}
          label="Visibility"
          value={formatDistance(current.visibility, units.distance)}
          note={`${visibilityWords(current.visibility)}.`}
        >
          <Meter value={Math.log10(Math.max(100, current.visibility) / 100) / Math.log10(500)} label={`Visibility ${formatDistance(current.visibility, units.distance)}`} color="var(--neutral-mark)" />
        </Instrument>

        <Instrument
          icon={<Layers size={16} aria-hidden="true" />}
          label="Clouds"
          value={formatPercent(current.cloudCover)}
          note={
            current.cloudLow >= 20 && base > 0
              ? `Low cloud base estimated around ${formatHeight(base, units.distance)} above the ground.`
              : current.cloudCover < 10
                ? "Clear sky."
                : "Most of the cover is higher up."
          }
        >
          <div className="cloud-layers">
            {[
              ["High", current.cloudHigh],
              ["Middle", current.cloudMid],
              ["Low", current.cloudLow],
            ].map(([label, value]) => (
              <div key={label as string} className="cloud-layer-row">
                <span>{label}</span>
                <Meter value={(value as number) / 100} label={`${label} clouds ${formatPercent(value as number)}`} color="var(--cloud-1)" />
                <span className="tabular">{formatPercent(value as number)}</span>
              </div>
            ))}
          </div>
        </Instrument>

        <Instrument
          icon={<Umbrella size={16} aria-hidden="true" />}
          label="Precipitation"
          value={
            <>
              {formatPrecipitation(lastDay, units.precipitation)} <span className="instrument-sub">in the last 24 hours</span>
            </>
          }
          note={
            <>
              {formatPrecipitation(nextDay, units.precipitation)} expected in the next 24 hours, chance up to {formatPercent(nextChance)}.
              {snowDepth > 0 ? ` Snow on the ground: ${formatSnow(snowDepth * 100, units.precipitation)}.` : ""}
            </>
          }
        />

        <Instrument
          icon={<CloudSun size={16} aria-hidden="true" />}
          label="Sunshine"
          value={
            <>
              {formatDuration(sunshine)} <span className="instrument-sub">of sun today</span>
            </>
          }
          note={`Out of ${formatDuration(daylight)} of daylight. Sunlight now: ${Number.isFinite(radiation) ? num(radiation) : "–"} W/m²; today's total ${Number.isFinite(daily.radiationSum[today]) ? num(daily.radiationSum[today], 1) : "–"} MJ/m².`}
        >
          <Meter value={daylight > 0 ? sunshine / daylight : 0} label={`Sunshine ${formatDuration(sunshine)} of ${formatDuration(daylight)}`} color="var(--solar)" />
        </Instrument>

        <Instrument
          icon={<Zap size={16} aria-hidden="true" />}
          label="Storm potential"
          value={
            <>
              {Number.isFinite(capeNext.value) ? num(capeNext.value) : "–"} <span className="instrument-sub">J/kg in the next 24 hours</span>
            </>
          }
          note={`${capeWords(capeNext.value)} (CAPE, the energy available to rising air). Lifted index now ${Number.isFinite(hourly.liftedIndex[now]) ? num(hourly.liftedIndex[now], 1) : "–"}; below zero means unstable. Freezing level ${formatHeight(hourly.freezingLevel[now], units.distance)}.`}
        />

        <Instrument
          icon={<Sprout size={16} aria-hidden="true" />}
          label="Ground and garden"
          value={
            <>
              {formatTemperature(hourly.soilTemperature[now], units.temperature)} <span className="instrument-sub">at the soil surface</span>
            </>
          }
          note={`Topsoil moisture ${Number.isFinite(soilMoisture) ? `${num(soilMoisture * 100)}%` : "–"} by volume. Today plants lose about ${formatPrecipitation(et0, units.precipitation)} of water${
            Number.isFinite(rainToday) && Number.isFinite(et0) ? (rainToday >= et0 ? ", and rain covers it." : `, and rain brings ${formatPrecipitation(rainToday, units.precipitation)}.`) : "."
          }`}
        />

        <Instrument
          icon={<MapPin size={16} aria-hidden="true" />}
          label="This place"
          value={
            <>
              {formatHeight(elevation, units.distance)} <span className="instrument-sub">above sea level</span>
            </>
          }
          note={`${formatCoordinates(latitude, longitude)}. Time zone ${view.forecast.timezone.replace(/_/g, " ")} (${timezoneAbbreviation.startsWith("GMT") ? offsetText : `${timezoneAbbreviation}, ${offsetText}`}).${
            place.source === "ip" ? " Location estimated from your connection." : ""
          }`}
        />
      </div>
    </Section>
  );
}
