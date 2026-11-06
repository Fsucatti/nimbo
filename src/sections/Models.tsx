/**
 * Model comparison: each day, every model's value as a dot, the range between them as a band and
 * their middle value as a mark. Pick a model in the list to follow it across the days.
 */
import { scaleLinear } from "d3-scale";
import { useState } from "react";
import { messageFor } from "../api/http";
import { MODELS, type ModelComparison, type ModelId, type ModelMetric } from "../api/models";
import { ChartFrame, DataTable, SERIES, ticks } from "../charts/common";
import { useSeen, useWidth } from "../components/hooks";
import { Section, SectionError, SectionLoading } from "../components/Section";
import { median } from "../lib/stats";
import { relativeDay } from "../lib/time";
import type { Place } from "../lib/types";
import { formatPrecipitation, formatTemperature, num, toPrecipitation, toTemperature, toTemperatureDelta, type Units } from "../lib/units";
import type { ForecastView } from "../lib/view";
import { useModels } from "../state/queries";

/** Models within this many °C of each other count as agreeing. */
const TOLERANCE = 4;

const METRICS: { value: ModelMetric; label: string }[] = [
  { value: "tempMax", label: "Highs" },
  { value: "tempMin", label: "Lows" },
  { value: "precipitation", label: "Precipitation" },
];

function display(value: number, metric: ModelMetric, units: Units): number {
  return metric === "precipitation" ? toPrecipitation(value, units.precipitation) : toTemperature(value, units.temperature);
}

function format(value: number, metric: ModelMetric, units: Units): string {
  return metric === "precipitation" ? formatPrecipitation(value, units.precipitation) : formatTemperature(value, units.temperature, 1);
}

function Strips({ data, view, units, metric, focus, day, onDay }: { data: ModelComparison; view: ForecastView; units: Units; metric: ModelMetric; focus: ModelId | null; day: number; onDay: (day: number) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>(800);
  const height = 240;
  const left = 42;
  const right = 8;
  const top = 12;
  const bottom = height - 30;
  const days = data.time.map((_, i) => i);
  const all = data.runs.flatMap((run) => run[metric].map((v) => display(v, metric, units))).filter(Number.isFinite);
  const isRain = metric === "precipitation";
  const low = isRain ? 0 : Math.min(...all);
  const high = Math.max(...all, isRain ? (units.precipitation === "mm" ? 5 : 0.2) : low + 5);
  const y = scaleLinear().domain([low, high]).nice(4).range([bottom, top]);
  const slot = (width - left - right) / days.length;
  const cx = (d: number) => left + (d + 0.5) * slot;
  const color = isRain ? SERIES.precipitation : SERIES.temperature;

  return (
    <div
      ref={ref}
      className="model-strips"
      tabIndex={0}
      role="group"
      aria-label="Model comparison by day. Use the left and right arrow keys to change the day; each model's value is listed below."
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") onDay(Math.min(days.length - 1, day + 1));
        if (event.key === "ArrowLeft") onDay(Math.max(0, day - 1));
      }}
    >
      <svg width={width} height={height} role="presentation">
        {ticks(y.domain()[0], y.domain()[1], 4).map((v) => (
          <g key={v}>
            <line x1={left} x2={width - right} y1={y(v)} y2={y(v)} className="grid" />
            <text x={left - 6} y={y(v) + 4} textAnchor="end" className="axis-label">
              {isRain ? num(v, v < 1 && v > 0 ? 1 : 0) : `${num(v)}°`}
            </text>
          </g>
        ))}
        {days.map((d) => {
          const values = data.runs.map((run) => display(run[metric][d], metric, units)).filter(Number.isFinite);
          if (values.length === 0) return null;
          const lo = Math.min(...values);
          const hi = Math.max(...values);
          const mid = median(values);
          const selected = d === day;
          return (
            <g key={d} onPointerEnter={() => onDay(d)} onClick={() => onDay(d)} className="model-day">
              <rect x={cx(d) - slot / 2} y={top} width={slot} height={bottom - top} className={selected ? "model-day-hit is-selected" : "model-day-hit"} />
              <rect x={cx(d) - 7} y={y(hi)} width={14} height={Math.max(2, y(lo) - y(hi))} rx={7} fill={color} className="model-range" />
              <line x1={cx(d) - 12} x2={cx(d) + 12} y1={y(mid)} y2={y(mid)} stroke={color} strokeWidth={3} strokeLinecap="round" />
              {data.runs.map((run) => {
                const value = display(run[metric][d], metric, units);
                if (!Number.isFinite(value)) return null;
                const isFocus = focus === run.id;
                return <circle key={run.id} cx={cx(d)} cy={y(value)} r={isFocus ? 5 : 3.5} className={isFocus ? "model-dot is-focus" : "model-dot"} />;
              })}
              <text x={cx(d)} y={height - 10} textAnchor="middle" className={selected ? "axis-label is-strong" : "axis-label"}>
                {d === 0 ? "Today" : view.clock.weekday(data.time[d])}
              </text>
            </g>
          );
        })}
        {focus &&
          (() => {
            const run = data.runs.find((r) => r.id === focus);
            if (!run) return null;
            const points = days
              .map((d) => [cx(d), y(display(run[metric][d], metric, units))] as const)
              .filter(([, py]) => Number.isFinite(py))
              .map(([px, py]) => `${px},${py}`)
              .join(" ");
            return <polyline points={points} className="model-focus-line" />;
          })()}
      </svg>
    </div>
  );
}

export function Models({ view, units, place }: { view: ForecastView; units: Units; place: Place }) {
  const [ref, seen] = useSeen<HTMLDivElement>("400px");
  const models = useModels(place, seen);
  const [metric, setMetric] = useState<ModelMetric>("tempMax");
  const [focus, setFocus] = useState<ModelId | null>(null);
  const [day, setDay] = useState(1);
  const data = models.data;

  let agreement: string | null = null;
  if (data && metric !== "precipitation") {
    // Today's value is partly measured already, so agreement is judged from tomorrow on.
    const spreads = data.time.map((_, d) => {
      const values = data.runs.map((run) => run[metric][d]).filter(Number.isFinite);
      return d >= 1 && values.length >= 3 ? Math.max(...values) - Math.min(...values) : Number.NaN;
    });
    const firstWide = spreads.findIndex((s) => s > TOLERANCE);
    const lastValid = spreads.map((s, i) => [s, i] as const).filter(([s]) => Number.isFinite(s)).at(-1);
    const deg = (c: number) => `${num(toTemperatureDelta(c, units.temperature))}°`;
    const tolerance = deg(TOLERANCE);
    if (firstWide < 0) agreement = `The models agree within ${tolerance} on every day shown: a confident forecast.`;
    else if (firstWide <= 1) agreement = `The models already differ by ${deg(spreads[firstWide])} ${relativeDay(view.clock, data.time[firstWide], view.now).toLowerCase()}, so expect changes to the forecast.`;
    else
      agreement = `The models agree within ${tolerance} until ${view.clock.weekdayLong(data.time[firstWide - 1])}.${
        lastValid ? ` By ${view.clock.weekdayLong(data.time[lastValid[1]])} they differ by ${deg(lastValid[0])}.` : ""
      }`;
  }

  const selectedDay = data ? Math.min(day, data.time.length - 1) : 0;

  return (
    <Section
      id="models"
      title="What each model says"
      intro="Forecasts come from computer models run by weather services around the world. When they agree, trust the forecast more."
      aside={
        <div className="segmented" role="group" aria-label="Value to compare">
          {METRICS.map((option) => (
            <button key={option.value} type="button" aria-pressed={metric === option.value} onClick={() => setMetric(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
      }
    >
      <div ref={ref}>
        {models.isLoading && <SectionLoading>Loading nine models…</SectionLoading>}
        {models.error && !data ? <SectionError message={messageFor(models.error)} onRetry={() => models.refetch()} /> : null}
        {data && (
          <>
            {agreement && <p className="models-agreement">{agreement}</p>}
            <ChartFrame
              legend={
                <>
                  <span className="legend-item">
                    <span className="legend-dot" aria-hidden="true" /> One model
                  </span>
                  <span className="legend-item">
                    <span className="legend-swatch" style={{ background: metric === "precipitation" ? SERIES.precipitation : SERIES.temperature, opacity: 0.3 }} aria-hidden="true" />
                    Range between models
                  </span>
                  <span className="legend-item">
                    <svg width="18" height="8" aria-hidden="true">
                      <line x1="2" y1="4" x2="16" y2="4" stroke={metric === "precipitation" ? SERIES.precipitation : SERIES.temperature} strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    Middle value
                  </span>
                </>
              }
              table={() => (
                <DataTable
                  caption="Daily values by model"
                  rowKey={(run) => run.id}
                  rows={data.runs}
                  columns={[
                    { header: "Model", cell: (run) => MODELS.find((m) => m.id === run.id)?.name ?? run.id },
                    ...data.time.map((ts, d) => ({ header: d === 0 ? "Today" : `${view.clock.weekday(ts)} ${view.clock.dayMonth(ts).split(" ")[1]}`, cell: (run: (typeof data.runs)[number]) => format(run[metric][d], metric, units), numeric: true })),
                  ]}
                />
              )}
            >
              <Strips data={data} view={view} units={units} metric={metric} focus={focus} day={selectedDay} onDay={setDay} />
            </ChartFrame>
            <div className="model-list" aria-live="polite">
              <h3>
                {selectedDay === 0 ? "Today" : view.clock.weekdayLong(data.time[selectedDay])}, {METRICS.find((m) => m.value === metric)?.label.toLowerCase()}
              </h3>
              <ul>
                {[...data.runs]
                  .sort((a, b) => (b[metric][selectedDay] || -999) - (a[metric][selectedDay] || -999))
                  .map((run) => {
                    const info = MODELS.find((m) => m.id === run.id)!;
                    return (
                      <li key={run.id}>
                        <button type="button" className="model-item" aria-pressed={focus === run.id} onClick={() => setFocus(focus === run.id ? null : run.id)}>
                          <span className="model-name">{info.name}</span>
                          <span className="model-origin">{info.origin}</span>
                          <span className="model-value tabular">{Number.isFinite(run[metric][selectedDay]) ? format(run[metric][selectedDay], metric, units) : "No data"}</span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
              <p className="muted model-hint">Select a model to follow it across the days. Some models only reach 4 to 7 days ahead.</p>
            </div>
          </>
        )}
      </div>
    </Section>
  );
}
