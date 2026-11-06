/**
 * Climate: how the last 30 days and the next 15 compare with what's normal for the season,
 * records for today's date between 1991 and 2020, and the same day last year.
 */
import { scaleLinear } from "d3-scale";
import { useState } from "react";
import { messageFor } from "../api/http";
import { ChartFrame, DataTable, LegendSwatch, SERIES, ticks } from "../charts/common";
import { useSeen, useWidth } from "../components/hooks";
import { Section, SectionError, SectionLoading } from "../components/Section";
import { WeatherIcon } from "../components/WeatherIcon";
import { compare, NORMAL_YEARS, type Normals } from "../lib/climate";
import { dayDifference } from "../lib/time";
import type { Place } from "../lib/types";
import { formatPrecipitation, formatTemperature, formatTemperatureDelta, num, toTemperature, type Units } from "../lib/units";
import type { ForecastView } from "../lib/view";
import { conditionLabel } from "../lib/wmo";
import { useNormals, usePastDay, useRecentDays } from "../state/queries";
import type { RecentDays } from "../api/climate";

interface Row {
  offset: number;
  ts: number;
  tempMax: number;
  tempMin: number;
  precipitation: number;
}

function toRows(view: ForecastView, recent: RecentDays): Row[] {
  const todayKey = view.clock.dateKey(view.now);
  return recent.time.map((ts, i) => ({
    offset: dayDifference(view.clock.dateKey(ts), todayKey),
    ts,
    tempMax: recent.tempMax[i],
    tempMin: recent.tempMin[i],
    precipitation: recent.precipitation[i],
  }));
}

function NormalsChart({ view, units, normals, rows }: { view: ForecastView; units: Units; normals: Normals; rows: Row[] }) {
  const [ref, width] = useWidth<HTMLDivElement>(800);
  const height = 220;
  const left = 40;
  const right = 8;
  const shown = rows.filter((row) => normals.offsets.includes(row.offset));
  const t = (c: number) => toTemperature(c, units.temperature);
  const values = [...shown.flatMap((r) => [r.tempMax, r.tempMin]), ...normals.maxP90, ...normals.minP10].filter(Number.isFinite).map(t);
  const step = units.temperature === "c" ? 5 : 10;
  const y = scaleLinear()
    .domain([Math.floor(Math.min(...values) / step) * step, Math.ceil(Math.max(...values) / step) * step])
    .range([height - 24, 10]);
  const first = normals.offsets[0];
  const last = normals.offsets[normals.offsets.length - 1];
  const slot = (width - left - right) / (last - first + 1);
  const xCenter = (offset: number) => left + (offset - first + 0.5) * slot;
  const barWidth = Math.max(2, Math.min(10, slot * 0.45));
  const bandWidth = Math.max(3, Math.min(16, slot * 0.85));

  return (
    <div ref={ref} className="normals-chart">
      <svg width={width} height={height} role="img" aria-label="Daily highs and lows compared with the normal range for each date">
        {ticks(y.domain()[0], y.domain()[1], 4).map((v) => (
          <g key={v}>
            <line x1={left} x2={width - right} y1={y(v)} y2={y(v)} className="grid" />
            <text x={left - 6} y={y(v) + 4} textAnchor="end" className="axis-label">
              {num(v)}°
            </text>
          </g>
        ))}
        {/* Future days sit on a shaded background. */}
        <rect x={xCenter(0.5) - slot / 2 + slot} y={8} width={Math.max(0, width - right - (xCenter(0.5) + slot / 2))} height={height - 32} className="forecast-zone" />
        {normals.offsets.map((offset, k) => (
          <rect
            key={`n${offset}`}
            x={xCenter(offset) - bandWidth / 2}
            y={y(t(normals.maxMean[k]))}
            width={bandWidth}
            height={Math.max(1, y(t(normals.minMean[k])) - y(t(normals.maxMean[k])))}
            rx={3}
            className="normal-band"
          />
        ))}
        {shown.map((row) =>
          Number.isFinite(row.tempMax) && Number.isFinite(row.tempMin) ? (
            <rect
              key={`a${row.offset}`}
              x={xCenter(row.offset) - barWidth / 2}
              y={y(t(row.tempMax))}
              width={barWidth}
              height={Math.max(2, y(t(row.tempMin)) - y(t(row.tempMax)))}
              rx={Math.min(3, barWidth / 2)}
              fill={SERIES.temperature}
              opacity={row.offset > 0 ? 0.55 : 1}
            >
              <title>{`${view.clock.dayMonth(row.ts)}: ${formatTemperature(row.tempMin, units.temperature)} to ${formatTemperature(row.tempMax, units.temperature)}`}</title>
            </rect>
          ) : null,
        )}
        <line x1={xCenter(0)} x2={xCenter(0)} y1={8} y2={height - 24} className="now-line" />
        <text x={xCenter(0) + 4} y={20} className="axis-label">
          Today
        </text>
        {shown
          .filter((row) => row.offset % 7 === 0 && row.offset !== 0)
          .map((row) => (
            <text key={`l${row.offset}`} x={xCenter(row.offset)} y={height - 6} textAnchor="middle" className="axis-label">
              {view.clock.dayMonth(row.ts)}
            </text>
          ))}
      </svg>
    </div>
  );
}

/** Midday UTC of a "YYYY-MM-DD" date, safe to format in any time zone near that date. */
function dateToTs(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 15) / 1000;
}

function StatTile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="stat">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      <p className="stat-note">{note}</p>
    </div>
  );
}

function anomalyWords(anomaly: number): string {
  if (!Number.isFinite(anomaly)) return "";
  if (Math.abs(anomaly) < 1) return "close to normal";
  return anomaly > 0 ? "warmer than normal" : "cooler than normal";
}

export function Climate({ view, units, place }: { view: ForecastView; units: Units; place: Place }) {
  const [ref, seen] = useSeen<HTMLDivElement>("400px");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const todayKey = view.clock.dateKey(view.now);
  const anchor = todayKey.slice(5);
  const recent = useRecentDays(place, seen);
  const normals = useNormals(place, anchor, seen, (done, total) => setProgress({ done, total }));
  const lastYearDate = `${Number(todayKey.slice(0, 4)) - 1}-${anchor === "02-29" ? "02-28" : anchor}`;
  const lastYear = usePastDay(place, lastYearDate, seen);

  const rows = recent.data ? toRows(view, recent.data) : [];
  const n = normals.data;
  const past = n ? compare(n, rows, -30, -1) : null;
  const future = n ? compare(n, rows, 1, 15) : null;
  const todayNormal = n ? n.offsets.indexOf(0) : -1;

  return (
    <Section
      id="climate"
      title="Compared with normal"
      intro={`“Normal” is the average for each date from ${NORMAL_YEARS.first} to ${NORMAL_YEARS.last}, from ERA5 climate data, the current reference period.`}
    >
      <div ref={ref}>
        {(normals.isLoading || recent.isLoading) && (
          <SectionLoading>
            Loading 30 years of daily data{progress ? `: ${progress.done} of ${progress.total} years` : "…"}
          </SectionLoading>
        )}
        {normals.error || recent.error ? (
          <SectionError
            message={messageFor(normals.error ?? recent.error)}
            onRetry={() => {
              normals.refetch();
              recent.refetch();
            }}
          />
        ) : null}
        {n && recent.data && (
          <>
            <div className="stats">
              {past && (
                <StatTile
                  label="Last 30 days"
                  value={formatTemperatureDelta(past.anomaly, units.temperature, 1)}
                  note={`Highs and lows ${anomalyWords(past.anomaly)} on average.`}
                />
              )}
              {past && (
                <StatTile
                  label="Rain, last 30 days"
                  value={formatPrecipitation(past.precipitation, units.precipitation)}
                  note={`Normal is ${formatPrecipitation(past.normalPrecipitation, units.precipitation)}${
                    past.normalPrecipitation > 0 ? `, so ${num((past.precipitation / past.normalPrecipitation) * 100)}% of normal` : ""
                  }.`}
                />
              )}
              {future && (
                <StatTile label="Next 15 days" value={formatTemperatureDelta(future.anomaly, units.temperature, 1)} note={`The forecast runs ${anomalyWords(future.anomaly)}.`} />
              )}
              {todayNormal >= 0 && (
                <StatTile
                  label="Normal for today"
                  value={`${formatTemperature(n.maxMean[todayNormal], units.temperature)} / ${formatTemperature(n.minMean[todayNormal], units.temperature)}`}
                  note={`High and low. Today's forecast: ${formatTemperature(view.forecast.daily.tempMax[view.todayIndex], units.temperature)} / ${formatTemperature(view.forecast.daily.tempMin[view.todayIndex], units.temperature)}.`}
                />
              )}
            </div>
            <ChartFrame
              title="Daily range against the normal range"
              legend={
                <>
                  <LegendSwatch color={SERIES.temperature} label="Low to high, actual or forecast" />
                  <LegendSwatch color="var(--normal-band)" label="Normal low to high" />
                </>
              }
              table={() => (
                <DataTable
                  caption="Daily temperatures and normals"
                  rowKey={(row) => row.offset}
                  rows={rows.filter((row) => n.offsets.includes(row.offset))}
                  columns={[
                    { header: "Date", cell: (row) => `${view.clock.weekday(row.ts)} ${view.clock.dayMonth(row.ts)}${row.offset > 0 ? " (forecast)" : ""}` },
                    { header: "High", cell: (row) => formatTemperature(row.tempMax, units.temperature), numeric: true },
                    { header: "Normal high", cell: (row) => formatTemperature(n.maxMean[n.offsets.indexOf(row.offset)], units.temperature), numeric: true },
                    { header: "Low", cell: (row) => formatTemperature(row.tempMin, units.temperature), numeric: true },
                    { header: "Normal low", cell: (row) => formatTemperature(n.minMean[n.offsets.indexOf(row.offset)], units.temperature), numeric: true },
                    { header: "Rain", cell: (row) => formatPrecipitation(row.precipitation, units.precipitation), numeric: true },
                  ]}
                />
              )}
            >
              <NormalsChart view={view} units={units} normals={n} rows={rows} />
            </ChartFrame>
            <div className="records">
              {n.records && (
                <div>
                  <h3>
                    {view.clock.dayMonth(view.now)} from {NORMAL_YEARS.first} to {NORMAL_YEARS.last}
                  </h3>
                  <dl className="facts">
                    <div className="fact">
                      <dt>Warmest</dt>
                      <dd>
                        {formatTemperature(n.records.warmest.value, units.temperature)}
                        <span className="fact-note">in {n.records.warmest.year}</span>
                      </dd>
                    </div>
                    <div className="fact">
                      <dt>Coldest</dt>
                      <dd>
                        {formatTemperature(n.records.coldest.value, units.temperature)}
                        <span className="fact-note">in {n.records.coldest.year}</span>
                      </dd>
                    </div>
                    <div className="fact">
                      <dt>Wettest</dt>
                      <dd>
                        {formatPrecipitation(n.records.wettest.value, units.precipitation)}
                        <span className="fact-note">in {n.records.wettest.year}</span>
                      </dd>
                    </div>
                    <div className="fact">
                      <dt>Rainy days</dt>
                      <dd>
                        {num((n.wetChance[todayNormal] ?? 0) * 100)}%
                        <span className="fact-note">of years with 1 mm or more around this date</span>
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
              {lastYear.data && (
                <div className="last-year">
                  <h3>A year ago today</h3>
                  <p className="last-year-reading">
                    <WeatherIcon code={lastYear.data.weatherCode} isDay size={40} />
                    <span>
                      <strong>
                        {formatTemperature(lastYear.data.tempMax, units.temperature)} / {formatTemperature(lastYear.data.tempMin, units.temperature)}
                      </strong>
                      <span>
                        {conditionLabel(lastYear.data.weatherCode, true)}, {formatPrecipitation(lastYear.data.precipitation, units.precipitation)} of rain
                      </span>
                    </span>
                  </p>
                  <p className="muted">
                    {view.clock.fullDate(dateToTs(lastYearDate))}, {lastYearDate.slice(0, 4)}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Section>
  );
}
