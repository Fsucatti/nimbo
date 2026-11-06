/** Sea conditions for coastal places: waves, swell, water temperature, currents and tides. */
import { scaleLinear } from "d3-scale";
import { curveMonotoneX, line } from "d3-shape";
import { distanceKm, type Marine } from "../api/marine";
import { ChartFrame, DataTable, LegendLine, ticks } from "../charts/common";
import { useWidth } from "../components/hooks";
import { Section } from "../components/Section";
import { compassPoint } from "../lib/comfort";
import { lastIndexAtOrBefore } from "../lib/view";
import { findTides } from "../lib/tides";
import { formatTemperature, num, type Units } from "../lib/units";
import type { ForecastView } from "../lib/view";

function height(meters: number, units: Units): string {
  if (!Number.isFinite(meters)) return "–";
  return units.distance === "mi" ? `${num(meters * 3.28084, 1)} ft` : `${num(meters, 1)} m`;
}

function speed(kmh: number, units: Units): string {
  if (!Number.isFinite(kmh)) return "–";
  // Currents are usually given in knots at sea.
  return units.wind === "kn" || units.wind === "mph" ? `${num(kmh / 1.852, 1)} kn` : `${num(kmh, 1)} km/h`;
}

function TideChart({ marine, view, units }: { marine: Marine; view: ForecastView; units: Units }) {
  const [ref, width] = useWidth<HTMLDivElement>(700);
  const h = marine.hourly;
  const start = lastIndexAtOrBefore(h.time, view.now);
  const end = Math.min(h.time.length, start + 49);
  const indices = Array.from({ length: end - start }, (_, k) => start + k).filter((i) => Number.isFinite(h.seaLevel[i]));
  if (indices.length < 4) return null;
  const factor = units.distance === "mi" ? 3.28084 : 1;
  const values = indices.map((i) => h.seaLevel[i] * factor);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max(0.1, (hi - lo) * 0.25);
  const left = 40;
  const chartHeight = 150;
  const x = scaleLinear().domain([h.time[indices[0]], h.time[indices[indices.length - 1]]]).range([left, width - 8]);
  const y = scaleLinear().domain([lo - pad, hi + pad]).range([chartHeight - 22, 10]);
  const turns = findTides(h.time, h.seaLevel).filter((t) => t.ts >= h.time[indices[0]] && t.ts <= h.time[indices[indices.length - 1]]);
  const path = line<number>()
    .x((i) => x(h.time[i]))
    .y((i) => y(h.seaLevel[i] * factor))
    .curve(curveMonotoneX)(indices);
  return (
    <div ref={ref}>
      <svg width={width} height={chartHeight} role="img" aria-label="Sea level over the next 48 hours, with high and low water marked">
        {ticks(lo - pad, hi + pad, 3).map((v) => (
          <g key={v}>
            <line x1={left} x2={width - 8} y1={y(v)} y2={y(v)} className="grid" />
            <text x={left - 6} y={y(v) + 4} textAnchor="end" className="axis-label">
              {num(v, 1)}
            </text>
          </g>
        ))}
        <path d={path ?? ""} className="series-line" stroke="var(--precip)" />
        {turns.map((turn) => (
          <g key={turn.ts}>
            <circle cx={x(turn.ts)} cy={y(turn.height * factor)} r={4} fill="var(--precip)" className="series-dot" />
            <text x={x(turn.ts)} y={turn.kind === "high" ? y(turn.height * factor) - 10 : y(turn.height * factor) + 18} textAnchor="middle" className="axis-label is-strong">
              {view.clock.time(turn.ts)}
            </text>
          </g>
        ))}
        {indices
          .filter((i) => view.clock.hourOfDay(h.time[i]) === 0)
          .map((i) => (
            <g key={i}>
              <line x1={x(h.time[i])} x2={x(h.time[i])} y1={8} y2={chartHeight - 22} className="day-line" />
              <text x={x(h.time[i]) + 4} y={chartHeight - 6} className="axis-label">
                {view.clock.weekday(h.time[i])}
              </text>
            </g>
          ))}
      </svg>
    </div>
  );
}

export function Sea({ marine, view, units, latitude, longitude }: { marine: Marine; view: ForecastView; units: Units; latitude: number; longitude: number }) {
  const h = marine.hourly;
  const i = lastIndexAtOrBefore(h.time, view.now);
  const distance = distanceKm(latitude, longitude, marine.latitude, marine.longitude);
  const turns = findTides(h.time, h.seaLevel).filter((t) => t.ts > view.now).slice(0, 4);
  const hasTides = h.seaLevel.some(Number.isFinite);

  return (
    <Section
      id="sea"
      title="At sea"
      intro={`Waves and water ${distance >= 3 ? `about ${num(distance)} km offshore` : "just offshore"}, from ocean models. Approximate, and not for navigation.`}
    >
      <dl className="sea-now">
        <div className="fact">
          <dt>Waves</dt>
          <dd>
            {height(h.waveHeight[i], units)}
            <span className="fact-note">
              every {Number.isFinite(h.wavePeriod[i]) ? num(h.wavePeriod[i], 0) : "–"} s, from the {Number.isFinite(h.waveDirection[i]) ? compassPoint(h.waveDirection[i]) : "–"}
            </span>
          </dd>
        </div>
        <div className="fact">
          <dt>Swell</dt>
          <dd>
            {height(h.swellHeight[i], units)}
            <span className="fact-note">
              every {Number.isFinite(h.swellPeriod[i]) ? num(h.swellPeriod[i], 0) : "–"} s, from the {Number.isFinite(h.swellDirection[i]) ? compassPoint(h.swellDirection[i]) : "–"}
            </span>
          </dd>
        </div>
        <div className="fact">
          <dt>Wind waves</dt>
          <dd>
            {height(h.windWaveHeight[i], units)}
            <span className="fact-note">raised by local wind</span>
          </dd>
        </div>
        <div className="fact">
          <dt>Water temperature</dt>
          <dd>{formatTemperature(h.seaTemperature[i], units.temperature, 1)}</dd>
        </div>
        <div className="fact">
          <dt>Current</dt>
          <dd>
            {speed(h.currentSpeed[i], units)}
            <span className="fact-note">toward the {Number.isFinite(h.currentDirection[i]) ? compassPoint(h.currentDirection[i]) : "–"}</span>
          </dd>
        </div>
      </dl>

      {hasTides && (
        <ChartFrame
          title={`Sea level, ${units.distance === "mi" ? "ft" : "m"}`}
          legend={<LegendLine color="var(--precip)" label="Height above mean sea level" />}
          table={() => (
            <DataTable
              caption="High and low water"
              rowKey={(t) => t.ts}
              rows={findTides(h.time, h.seaLevel).filter((t) => t.ts > view.now - 3600)}
              columns={[
                { header: "Time", cell: (t) => `${view.clock.weekday(t.ts)} ${view.clock.time(t.ts)}` },
                { header: "Tide", cell: (t) => (t.kind === "high" ? "High water" : "Low water") },
                { header: "Height", cell: (t) => height(t.height, units), numeric: true },
              ]}
            />
          )}
        >
          <TideChart marine={marine} view={view} units={units} />
          {turns.length > 0 && (
            <ul className="tides">
              {turns.map((turn) => (
                <li key={turn.ts}>
                  <strong>{turn.kind === "high" ? "High water" : "Low water"}</strong> {view.clock.weekday(turn.ts)} {view.clock.time(turn.ts)}, {height(turn.height, units)}
                </li>
              ))}
            </ul>
          )}
        </ChartFrame>
      )}
    </Section>
  );
}
