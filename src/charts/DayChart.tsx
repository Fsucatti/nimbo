/** A small two-track chart of one day: temperature on top, precipitation below, own scales each. */
import { scaleLinear } from "d3-scale";
import { curveMonotoneX, line } from "d3-shape";
import { useWidth } from "../components/hooks";
import { num, toPrecipitation, toTemperature, UNIT_LABELS, type Units } from "../lib/units";
import type { ForecastView } from "../lib/view";
import { niceExtent, SERIES, ticks } from "./common";

const LEFT = 40;
const RIGHT = 8;

export function DayChart({ view, units, day }: { view: ForecastView; units: Units; day: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(600);
  const { hourly } = view.forecast;
  const [from, to] = view.dayHours[day];
  if (from < 0) return null;
  const indices = Array.from({ length: to - from }, (_, k) => from + k);
  const x = scaleLinear()
    .domain([hourly.time[from], hourly.time[to - 1]])
    .range([LEFT, width - RIGHT]);
  const temp = indices.map((i) => toTemperature(hourly.temperature[i], units.temperature));
  const step = units.temperature === "c" ? 5 : 10;
  const [lo, hi] = niceExtent(temp, step, step);
  const tTop = 10;
  const tBottom = 86;
  const yT = scaleLinear().domain([lo, hi]).range([tBottom, tTop]);
  const pTop = 104;
  const pBottom = 140;
  const rain = indices.map((i) => toPrecipitation(hourly.precipitation[i], units.precipitation));
  const maxRain = Math.max(units.precipitation === "mm" ? 2 : 0.08, ...rain.filter(Number.isFinite));
  const yP = scaleLinear().domain([0, maxRain]).range([pBottom, pTop]);
  const path =
    line<number>()
      .defined((k) => Number.isFinite(temp[k]))
      .x((k) => x(hourly.time[from + k]))
      .y((k) => yT(temp[k]))
      .curve(curveMonotoneX)(indices.map((_, k) => k)) ?? "";
  const slot = (width - LEFT - RIGHT) / indices.length;
  const barWidth = Math.max(1, Math.min(14, slot - 2));

  return (
    <div ref={ref} className="day-chart">
      <svg width={width} height={164} role="img" aria-label={`Hourly temperature and precipitation for ${view.clock.weekdayLong(view.forecast.daily.time[day])}`}>
        {ticks(lo, hi, 2).map((v) => (
          <g key={`t${v}`}>
            <line x1={LEFT} x2={width - RIGHT} y1={yT(v)} y2={yT(v)} className="grid" />
            <text x={LEFT - 6} y={yT(v) + 4} textAnchor="end" className="axis-label">
              {num(v)}°
            </text>
          </g>
        ))}
        <path d={path} className="series-line" stroke={SERIES.temperature} />
        <text x={LEFT} y={pTop - 6} className="track-label">
          Precipitation, {UNIT_LABELS.precipitation[units.precipitation]}
        </text>
        {rain.map((value, k) =>
          value > 0 ? (
            <rect
              key={k}
              x={x(hourly.time[from + k]) - barWidth / 2}
              y={yP(value)}
              width={barWidth}
              height={Math.max(1.5, pBottom - yP(value))}
              rx={2}
              fill={SERIES.precipitation}
            />
          ) : null,
        )}
        <line x1={LEFT} x2={width - RIGHT} y1={pBottom} y2={pBottom} className="baseline" />
        {indices.map((i, k) =>
          view.clock.hourOfDay(hourly.time[i]) % 6 === 0 ? (
            <text key={i} x={x(hourly.time[from + k])} y={pBottom + 18} textAnchor="middle" className="axis-label">
              {view.clock.hour(hourly.time[i]).replace(":00", "")}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
