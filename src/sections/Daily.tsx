/** The 16-day forecast: one row per day, each opening into its hours and details. */
import { ChevronDown, Droplet } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { DayChart } from "../charts/DayChart";
import { Section } from "../components/Section";
import { WeatherIcon } from "../components/WeatherIcon";
import { temperatureGradient } from "../lib/colors";
import { compassPoint, uvCategory } from "../lib/comfort";
import { relativeDay } from "../lib/time";
import {
  formatDuration,
  formatPercent,
  formatPrecipitation,
  formatSnow,
  formatTemperature,
  formatWind,
  num,
  type Units,
} from "../lib/units";
import type { ForecastView } from "../lib/view";
import { conditionLabel } from "../lib/wmo";

function RangeBar({ low, high, min, max, current }: { low: number; high: number; min: number; max: number; current?: number }) {
  const span = Math.max(1, max - min);
  const left = ((low - min) / span) * 100;
  const right = ((high - min) / span) * 100;
  const width = Math.max(2, right - left);
  // The gradient spans the whole period, so the same temperature has the same color on every row.
  const style = {
    left: `${left}%`,
    width: `${width}%`,
    backgroundImage: temperatureGradient(min, max),
    backgroundSize: `${(100 / width) * 100}% 100%`,
    backgroundPosition: `${(left / Math.max(1, 100 - width)) * 100}% 0`,
  } as CSSProperties;
  return (
    <span className="range-track" aria-hidden="true">
      <span className="range-fill" style={style} />
      {current !== undefined && Number.isFinite(current) && <span className="range-now" style={{ left: `${((current - min) / span) * 100}%` }} />}
    </span>
  );
}

function Detail({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="detail">
      <dt>{label}</dt>
      <dd>
        {value}
        {note && <span className="detail-note">{note}</span>}
      </dd>
    </div>
  );
}

function DayDetails({ view, units, day }: { view: ForecastView; units: Units; day: number }) {
  const d = view.forecast.daily;
  const uv = uvCategory(d.uvMax[day]);
  const daylight = d.daylight[day];
  const sunshine = d.sunshine[day];
  return (
    <div className="day-details">
      <DayChart view={view} units={units} day={day} />
      <dl className="detail-grid">
        <Detail label="Feels like" value={`${formatTemperature(d.apparentMin[day], units.temperature)} to ${formatTemperature(d.apparentMax[day], units.temperature)}`} />
        <Detail
          label="Precipitation"
          value={formatPrecipitation(d.precipSum[day], units.precipitation)}
          note={d.precipHours[day] > 0 ? `over ${num(d.precipHours[day])} h, ${formatPercent(d.precipProbMax[day])} chance` : `${formatPercent(d.precipProbMax[day])} chance`}
        />
        {d.snowSum[day] > 0 && <Detail label="Snow" value={formatSnow(d.snowSum[day], units.precipitation)} />}
        <Detail label="Wind" value={formatWind(d.windMax[day], units.wind)} note={`from the ${compassPoint(d.windDirection[day])}, gusts ${formatWind(d.gustMax[day], units.wind)}`} />
        <Detail label="UV index" value={Number.isFinite(d.uvMax[day]) ? num(d.uvMax[day]) : "–"} note={uv.label} />
        <Detail label="Sunrise" value={Number.isFinite(d.sunrise[day]) ? view.clock.time(d.sunrise[day]) : "–"} />
        <Detail label="Sunset" value={Number.isFinite(d.sunset[day]) ? view.clock.time(d.sunset[day]) : "–"} />
        <Detail
          label="Sunshine"
          value={formatDuration(sunshine)}
          note={Number.isFinite(daylight) && daylight > 0 ? `of ${formatDuration(daylight)} of daylight` : undefined}
        />
        <Detail label="Humidity" value={formatPercent(d.humidityMean[day])} note="average" />
        <Detail label="Cloud cover" value={formatPercent(d.cloudMean[day])} note="average" />
        <Detail label="Solar energy" value={Number.isFinite(d.radiationSum[day]) ? `${num(d.radiationSum[day], 1)} MJ/m²` : "–"} />
        <Detail
          label="Evaporation"
          value={formatPrecipitation(d.et0[day], units.precipitation)}
          note="water a lawn loses (ET₀)"
        />
      </dl>
    </div>
  );
}

export function Daily({ view, units }: { view: ForecastView; units: Units }) {
  const { daily, current } = view.forecast;
  const [open, setOpen] = useState<number | null>(null);
  const days: number[] = [];
  for (let d = view.todayIndex; d < daily.time.length; d++) if (Number.isFinite(daily.tempMax[d])) days.push(d);
  const lows = days.map((d) => daily.tempMin[d]).filter(Number.isFinite);
  const highs = days.map((d) => daily.tempMax[d]).filter(Number.isFinite);
  const min = Math.floor(Math.min(...lows, current.temperature));
  const max = Math.ceil(Math.max(...highs, current.temperature));

  return (
    <Section
      id="days"
      title={`Next ${days.length} days`}
      intro="Lows and highs on one shared scale, so you can compare days at a glance. Open a day for its hours and details."
      aside={
        <div className="temp-scale" aria-label={`Color scale from ${formatTemperature(min, units.temperature)} to ${formatTemperature(max, units.temperature)}`}>
          <span>{formatTemperature(min, units.temperature)}</span>
          <span className="temp-scale-bar" style={{ backgroundImage: temperatureGradient(min, max) }} />
          <span>{formatTemperature(max, units.temperature)}</span>
        </div>
      }
    >
      <ol className="days">
        {days.map((d) => {
          const expanded = open === d;
          const isToday = d === view.todayIndex;
          const chance = daily.precipProbMax[d];
          return (
            <li key={d} className={`day${expanded ? " is-open" : ""}`}>
              <button
                type="button"
                className="day-row"
                aria-expanded={expanded}
                aria-controls={`day-details-${d}`}
                onClick={() => setOpen(expanded ? null : d)}
              >
                <span className="day-name">
                  <span>{relativeDay(view.clock, daily.time[d], view.now)}</span>
                  <span className="day-date">{view.clock.dayMonth(daily.time[d])}</span>
                </span>
                <WeatherIcon code={daily.weatherCode[d]} isDay size={34} />
                <span className="day-condition">{conditionLabel(daily.weatherCode[d], true)}</span>
                <span className="day-chance">
                  {chance >= 10 && (
                    <>
                      <Droplet size={13} aria-hidden="true" />
                      <span>{formatPercent(chance)}</span>
                      {daily.precipSum[d] >= 0.1 && <span className="day-amount">{formatPrecipitation(daily.precipSum[d], units.precipitation)}</span>}
                    </>
                  )}
                </span>
                <span className="day-low">
                  <span className="visually-hidden">Low </span>
                  {formatTemperature(daily.tempMin[d], units.temperature)}
                </span>
                <RangeBar low={daily.tempMin[d]} high={daily.tempMax[d]} min={min} max={max} current={isToday ? current.temperature : undefined} />
                <span className="day-high">
                  <span className="visually-hidden">High </span>
                  {formatTemperature(daily.tempMax[d], units.temperature)}
                </span>
                <ChevronDown size={18} className="day-chevron" aria-hidden="true" />
              </button>
              {expanded && (
                <div id={`day-details-${d}`}>
                  <DayDetails view={view} units={units} day={d} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
