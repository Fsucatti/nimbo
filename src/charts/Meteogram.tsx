/**
 * The meteogram: the forecaster's chart. Several tracks share one time axis and one crosshair,
 * each with its own scale (never two scales on one track). Pointer, touch and arrow keys move
 * the crosshair; the readout above lists every value at that hour.
 */
import { scaleLinear } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
import { useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { WeatherIcon } from "../components/WeatherIcon";
import { useWidth } from "../components/hooks";
import { compassPoint, uvCategory } from "../lib/comfort";
import {
  formatDistance,
  formatPercent,
  formatPrecipitation,
  formatPressure,
  formatTemperature,
  formatWind,
  num,
  toPrecipitation,
  toPressure,
  toTemperature,
  toWind,
  UNIT_LABELS,
  type Units,
} from "../lib/units";
import type { ForecastView } from "../lib/view";
import { conditionLabel } from "../lib/wmo";
import { ChartFrame, DataTable, LegendLine, LegendSwatch, niceExtent, SERIES, ticks } from "./common";

export type TrackId = "temperature" | "precipitation" | "wind" | "clouds" | "humidity" | "pressure" | "uv" | "visibility";
export type RangeHours = 48 | 168 | 384;

export const TRACKS: { id: TrackId; label: string; color: string }[] = [
  { id: "temperature", label: "Temperature", color: SERIES.temperature },
  { id: "precipitation", label: "Precipitation", color: SERIES.precipitation },
  { id: "wind", label: "Wind", color: SERIES.wind },
  { id: "clouds", label: "Clouds", color: "var(--cloud-1)" },
  { id: "humidity", label: "Humidity", color: SERIES.humidity },
  { id: "pressure", label: "Pressure", color: SERIES.pressure },
  { id: "uv", label: "UV index", color: SERIES.solar },
  { id: "visibility", label: "Visibility", color: SERIES.neutral },
];

const GUTTER_LEFT = 46;
const GUTTER_RIGHT = 12;
const HEADER = 60;
const LABEL = 22;
const GAP = 18;
const HEIGHTS: Record<TrackId, number> = {
  temperature: 150,
  precipitation: 136,
  wind: 92,
  clouds: 54,
  humidity: 64,
  pressure: 64,
  uv: 52,
  visibility: 56,
};

/** A bar with rounded data-end (top) and a square base. */
function barPath(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.min(radius, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

interface Props {
  view: ForecastView;
  units: Units;
  range: RangeHours;
  tracks: Set<TrackId>;
}

export function Meteogram({ view, units, range, tracks }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>(900);
  const [hover, setHover] = useState<number | null>(null);
  const { hourly, daily } = view.forecast;
  const start = view.nowIndex;
  const end = Math.min(hourly.time.length, start + range + 1);
  const binHours = range === 48 ? 1 : range === 168 ? 3 : 6;

  const chart = useMemo(() => {
    const t0 = hourly.time[start];
    const t1 = hourly.time[end - 1];
    const x = scaleLinear().domain([t0, t1]).range([GUTTER_LEFT, width - GUTTER_RIGHT]);
    const pxPerHour = (width - GUTTER_LEFT - GUTTER_RIGHT) / Math.max(1, (t1 - t0) / 3600);
    const indices = Array.from({ length: end - start }, (_, k) => start + k);
    const visible = TRACKS.filter((track) => tracks.has(track.id));

    let cursor = HEADER;
    const layout = new Map<TrackId, { top: number; bottom: number }>();
    for (const track of visible) {
      const top = cursor + LABEL;
      const bottom = top + HEIGHTS[track.id] + (track.id === "precipitation" ? 0 : 0);
      layout.set(track.id, { top, bottom });
      cursor = bottom + GAP;
    }
    const plotBottom = cursor - GAP;
    const height = plotBottom + 26;
    const parts: ReactNode[] = [];
    const lineSeries: { id: string; color: string; y: (i: number) => number }[] = [];

    // Night shading, from each sunset to the next sunrise.
    const nights: [number, number][] = [];
    for (let d = 0; d < daily.time.length; d++) {
      const set = daily.sunset[d];
      const rise = daily.sunrise[d + 1] ?? set + 12 * 3600;
      if (d === 0 && daily.sunrise[0] > t0) nights.push([t0, daily.sunrise[0]]);
      if (Number.isFinite(set)) nights.push([set, Number.isFinite(rise) ? rise : set + 12 * 3600]);
    }
    for (const [a, b] of nights) {
      if (b < t0 || a > t1) continue;
      const xa = x(Math.max(a, t0));
      const xb = x(Math.min(b, t1));
      parts.push(<rect key={`night-${a}`} x={xa} y={HEADER} width={Math.max(0, xb - xa)} height={plotBottom - HEADER} className="night" />);
    }

    // Day boundaries and labels.
    const dayLabelEvery = pxPerHour * 24 < 52 ? 2 : 1;
    let dayCount = 0;
    for (let i = start; i < end; i++) {
      const isMidnight = view.clock.hourOfDay(hourly.time[i]) === 0;
      if (!isMidnight && i !== start) continue;
      const px = x(hourly.time[i]);
      if (isMidnight) parts.push(<line key={`day-${i}`} x1={px} x2={px} y1={4} y2={plotBottom} className="day-line" />);
      const showLabel = dayCount % dayLabelEvery === 0 && (i === start ? x(hourly.time[i] + 6 * 3600) - px > 0 : true);
      if (showLabel && (i === start ? (24 - view.clock.hourOfDay(hourly.time[i])) * pxPerHour > 46 : true)) {
        parts.push(
          <text key={`day-label-${i}`} x={px + 6} y={16} className="day-label">
            {i === start ? "Today" : `${view.clock.weekday(hourly.time[i])} ${view.clock.dayMonth(hourly.time[i]).split(" ")[1]}`}
          </text>,
        );
      }
      dayCount += 1;
    }

    // Weather icons along the top.
    const iconStride = Math.max(1, Math.ceil(34 / pxPerHour / 3)) * 3;
    for (let i = start; i < end - 1; i += iconStride) {
      const px = x(hourly.time[i]) + (pxPerHour * iconStride) / 2;
      if (px > width - GUTTER_RIGHT - 10) break;
      parts.push(
        <foreignObject key={`icon-${i}`} x={px - 12} y={24} width={24} height={24}>
          <WeatherIcon code={hourly.weatherCode[i]} isDay={hourly.isDay[i] === 1} size={24} />
        </foreignObject>,
      );
    }

    // Hour labels along the bottom, for the 48-hour view.
    if (range === 48) {
      const every = pxPerHour * 3 >= 40 ? 3 : 6;
      for (let i = start; i < end; i++) {
        const hour = view.clock.hourOfDay(hourly.time[i]);
        if (hour % every !== 0) continue;
        parts.push(
          <text key={`hour-${i}`} x={x(hourly.time[i])} y={plotBottom + 18} className="axis-label" textAnchor="middle">
            {view.clock.hour(hourly.time[i]).replace(":00", "")}
          </text>,
        );
      }
    }

    const yAxis = (key: string, scale: (v: number) => number, values: number[], format: (v: number) => string, top: number, bottom: number) => {
      for (const value of values) {
        const py = scale(value);
        if (py < top - 1 || py > bottom + 1) continue;
        parts.push(<line key={`${key}-grid-${value}`} x1={GUTTER_LEFT} x2={width - GUTTER_RIGHT} y1={py} y2={py} className="grid" />);
        parts.push(
          <text key={`${key}-tick-${value}`} x={GUTTER_LEFT - 8} y={py + 4} className="axis-label" textAnchor="end">
            {format(value)}
          </text>,
        );
      }
    };
    const trackLabel = (id: TrackId, text: string, top: number) =>
      parts.push(
        <text key={`label-${id}`} x={GUTTER_LEFT} y={top - 8} className="track-label">
          {text}
        </text>,
      );

    const linePath = (values: number[], y: (v: number) => number) =>
      line<number>()
        .defined((i) => Number.isFinite(values[i - start]))
        .x((i) => x(hourly.time[i]))
        .y((i) => y(values[i - start]))
        .curve(curveMonotoneX)(indices) ?? "";

    // Bins of 1, 3 or 6 hours for bars and cloud strips.
    const bins: { from: number; to: number }[] = [];
    for (let i = start; i < end - 1; i += binHours) bins.push({ from: i, to: Math.min(end - 1, i + binHours) });

    // ---- Temperature ----
    const temperatureBox = layout.get("temperature");
    if (temperatureBox) {
      const { top, bottom } = temperatureBox;
      const temp = indices.map((i) => toTemperature(hourly.temperature[i], units.temperature));
      const feels = indices.map((i) => toTemperature(hourly.apparent[i], units.temperature));
      const step = units.temperature === "c" ? 5 : 10;
      const [lo, hi] = niceExtent([...temp, ...feels], step * 1.2, step);
      const y = scaleLinear().domain([lo, hi]).range([bottom, top + 8]);
      trackLabel("temperature", `Temperature, ${UNIT_LABELS.temperature[units.temperature]}`, top);
      yAxis("t", y, ticks(lo, hi, 3), (v) => `${num(v)}°`, top, bottom);
      parts.push(<path key="feels" d={linePath(feels, y)} className="series-line" stroke={SERIES.feels} />);
      parts.push(<path key="temp" d={linePath(temp, y)} className="series-line" stroke={SERIES.temperature} />);
      // Label only the warmest and coldest hour.
      const finite = temp.map((v, k) => [v, k] as const).filter(([v]) => Number.isFinite(v));
      if (finite.length) {
        const max = finite.reduce((a, b) => (b[0] > a[0] ? b : a));
        const min = finite.reduce((a, b) => (b[0] < a[0] ? b : a));
        for (const [value, k, place] of [
          [max[0], max[1], "above"],
          [min[0], min[1], "below"],
        ] as const) {
          const px = x(hourly.time[start + k]);
          const py = y(value);
          parts.push(<circle key={`extreme-${place}`} cx={px} cy={py} r={4} className="series-dot" fill={SERIES.temperature} />);
          parts.push(
            <text key={`extreme-label-${place}`} x={Math.min(width - GUTTER_RIGHT - 16, Math.max(GUTTER_LEFT + 16, px))} y={place === "above" ? py - 10 : py + 20} className="value-label" textAnchor="middle">
              {num(value)}°
            </text>,
          );
        }
      }
      lineSeries.push({ id: "temp", color: SERIES.temperature, y: (i) => y(toTemperature(hourly.temperature[i], units.temperature)) });
      lineSeries.push({ id: "feels", color: SERIES.feels, y: (i) => y(toTemperature(hourly.apparent[i], units.temperature)) });
    }

    // ---- Precipitation: amount bars, then chance as its own small track ----
    const precipitationBox = layout.get("precipitation");
    if (precipitationBox) {
      const { top, bottom } = precipitationBox;
      const amountBottom = top + 70;
      const chanceTop = amountBottom + 26;
      const amounts = bins.map((bin) => {
        let total = 0;
        for (let i = bin.from; i < bin.to; i++) if (Number.isFinite(hourly.precipitation[i])) total += hourly.precipitation[i];
        return toPrecipitation(total, units.precipitation);
      });
      const minTop = units.precipitation === "mm" ? 2 * binHours : 0.08 * binHours;
      const maxAmount = Math.max(minTop, ...amounts);
      const yA = scaleLinear().domain([0, ticks(0, maxAmount, 2).at(-1)! < maxAmount ? maxAmount : ticks(0, maxAmount, 2).at(-1)!]).range([amountBottom, top + 8]);
      trackLabel("precipitation", `Precipitation, ${UNIT_LABELS.precipitation[units.precipitation]} per ${binHours === 1 ? "hour" : `${binHours} hours`}`, top);
      yAxis("p", yA, ticks(0, yA.domain()[1], 2), (v) => (v === 0 ? "0" : num(v, units.precipitation === "in" && v < 1 ? 2 : v < 1 ? 1 : 0)), top, amountBottom);
      bins.forEach((bin, k) => {
        if (amounts[k] <= 0) return;
        const xa = x(hourly.time[bin.from]);
        const xb = x(hourly.time[bin.to] ?? hourly.time[bin.from] + binHours * 3600);
        const w = Math.max(1, Math.min(24, xb - xa - 2));
        const h = Math.max(1.5, amountBottom - yA(amounts[k]));
        parts.push(<path key={`bar-${bin.from}`} d={barPath(xa + (xb - xa - w) / 2, amountBottom - h, w, h, 3)} fill={SERIES.precipitation} />);
      });
      parts.push(<line key="p-base" x1={GUTTER_LEFT} x2={width - GUTTER_RIGHT} y1={amountBottom} y2={amountBottom} className="baseline" />);
      // Chance of precipitation, 0–100%.
      const yC = scaleLinear().domain([0, 100]).range([bottom, chanceTop]);
      parts.push(
        <text key="label-chance" x={GUTTER_LEFT} y={chanceTop - 6} className="track-label">
          Chance of precipitation
        </text>,
      );
      yAxis("c", yC, [0, 100], (v) => `${v}%`, chanceTop, bottom);
      const chance = indices.map((i) => hourly.precipProbability[i]);
      const chanceArea =
        area<number>()
          .defined((i) => Number.isFinite(chance[i - start]))
          .x((i) => x(hourly.time[i]))
          .y0(bottom)
          .y1((i) => yC(chance[i - start]))
          .curve(curveMonotoneX)(indices) ?? "";
      parts.push(<path key="chance-area" d={chanceArea} fill={SERIES.precipitation} className="series-area" />);
      parts.push(<path key="chance" d={linePath(chance, yC)} className="series-line" stroke={SERIES.precipitation} />);
      lineSeries.push({ id: "chance", color: SERIES.precipitation, y: (i) => yC(hourly.precipProbability[i]) });
    }

    // ---- Wind: speed and gusts share a unit, so they share the track ----
    const windBox = layout.get("wind");
    if (windBox) {
      const { top, bottom } = windBox;
      const speed = indices.map((i) => toWind(hourly.windSpeed[i], units.wind));
      const gust = indices.map((i) => toWind(hourly.windGusts[i], units.wind));
      const maxWind = Math.max(toWind(30, units.wind), ...gust.filter(Number.isFinite));
      const plotTop = top + 16;
      const y = scaleLinear().domain([0, ticks(0, maxWind, 2).at(-1)! >= maxWind ? ticks(0, maxWind, 2).at(-1)! : maxWind]).range([bottom, plotTop]);
      trackLabel("wind", `Wind and gusts, ${UNIT_LABELS.wind[units.wind]}`, top);
      yAxis("w", y, ticks(0, y.domain()[1], 2), (v) => num(v), plotTop, bottom);
      const band =
        area<number>()
          .defined((i) => Number.isFinite(speed[i - start]) && Number.isFinite(gust[i - start]))
          .x((i) => x(hourly.time[i]))
          .y0((i) => y(speed[i - start]))
          .y1((i) => y(gust[i - start]))
          .curve(curveMonotoneX)(indices) ?? "";
      parts.push(<path key="gust-band" d={band} fill={SERIES.gust} className="series-area" />);
      parts.push(<path key="gust" d={linePath(gust, y)} className="series-line" stroke={SERIES.gust} />);
      parts.push(<path key="speed" d={linePath(speed, y)} className="series-line" stroke={SERIES.wind} />);
      // Arrows show where the wind blows to.
      for (let i = start; i < end - 1; i += iconStride) {
        const px = x(hourly.time[i]) + (pxPerHour * iconStride) / 2;
        if (px > width - GUTTER_RIGHT - 6) break;
        const to = (hourly.windDirection[i] + 180) % 360;
        parts.push(
          <path
            key={`arrow-${i}`}
            d="M0,-6 L4,4 L0,2 L-4,4 Z"
            transform={`translate(${px} ${top + 4}) rotate(${to})`}
            className="wind-arrow"
            aria-hidden="true"
          />,
        );
      }
      lineSeries.push({ id: "speed", color: SERIES.wind, y: (i) => y(toWind(hourly.windSpeed[i], units.wind)) });
      lineSeries.push({ id: "gust", color: SERIES.gust, y: (i) => y(toWind(hourly.windGusts[i], units.wind)) });
    }

    // ---- Clouds: three strips, darker means more cover ----
    const cloudBox = layout.get("clouds");
    if (cloudBox) {
      const { top, bottom } = cloudBox;
      trackLabel("clouds", "Cloud cover by height", top);
      const rows = [
        { name: "High", values: hourly.cloudHigh },
        { name: "Mid", values: hourly.cloudMid },
        { name: "Low", values: hourly.cloudLow },
      ];
      const rowHeight = (bottom - top - 4) / 3;
      rows.forEach((row, r) => {
        const rowTop = top + r * (rowHeight + 2);
        parts.push(
          <text key={`cloud-row-${row.name}`} x={GUTTER_LEFT - 8} y={rowTop + rowHeight / 2 + 4} className="axis-label" textAnchor="end">
            {row.name}
          </text>,
        );
        parts.push(<rect key={`cloud-bg-${row.name}`} x={GUTTER_LEFT} y={rowTop} width={width - GUTTER_LEFT - GUTTER_RIGHT} height={rowHeight} className="cloud-empty" />);
        for (const bin of bins) {
          let total = 0;
          let count = 0;
          for (let i = bin.from; i < bin.to; i++) {
            if (Number.isFinite(row.values[i])) {
              total += row.values[i];
              count += 1;
            }
          }
          const cover = count ? total / count : 0;
          if (cover < 3) continue;
          const xa = x(hourly.time[bin.from]);
          const xb = x(hourly.time[bin.to] ?? hourly.time[bin.from] + binHours * 3600);
          parts.push(<rect key={`cloud-${row.name}-${bin.from}`} x={xa} y={rowTop} width={Math.max(0.5, xb - xa)} height={rowHeight} fill="var(--cloud-1)" fillOpacity={(cover / 100) * 0.9} />);
        }
      });
    }

    // ---- Humidity ----
    const humidityBox = layout.get("humidity");
    if (humidityBox) {
      const { top, bottom } = humidityBox;
      const y = scaleLinear().domain([0, 100]).range([bottom, top]);
      trackLabel("humidity", "Relative humidity, %", top);
      yAxis("h", y, [0, 50, 100], (v) => `${v}`, top, bottom);
      const values = indices.map((i) => hourly.humidity[i]);
      parts.push(<path key="humidity" d={linePath(values, y)} className="series-line" stroke={SERIES.humidity} />);
      lineSeries.push({ id: "humidity", color: SERIES.humidity, y: (i) => y(hourly.humidity[i]) });
    }

    // ---- Pressure ----
    const pressureBox = layout.get("pressure");
    if (pressureBox) {
      const { top, bottom } = pressureBox;
      const values = indices.map((i) => toPressure(hourly.pressure[i], units.pressure));
      const span = units.pressure === "inhg" ? 0.3 : units.pressure === "mmhg" ? 8 : 10;
      const [lo, hi] = niceExtent(values, span);
      const y = scaleLinear().domain([lo, hi]).range([bottom, top]);
      trackLabel("pressure", `Pressure at sea level, ${UNIT_LABELS.pressure[units.pressure]}`, top);
      yAxis("pr", y, ticks(lo, hi, 2), (v) => num(v, units.pressure === "inhg" ? 2 : 0), top, bottom);
      parts.push(<path key="pressure" d={linePath(values, y)} className="series-line" stroke={SERIES.pressure} />);
      lineSeries.push({ id: "pressure", color: SERIES.pressure, y: (i) => y(toPressure(hourly.pressure[i], units.pressure)) });
    }

    // ---- UV index: bars in the official category colors ----
    const uvBox = layout.get("uv");
    if (uvBox) {
      const { top, bottom } = uvBox;
      const maxUv = Math.max(11, ...indices.map((i) => hourly.uvIndex[i]).filter(Number.isFinite));
      const y = scaleLinear().domain([0, maxUv]).range([bottom, top]);
      trackLabel("uv", "UV index", top);
      yAxis("uv", y, [0, 6, 11].filter((v) => v <= maxUv), (v) => `${v}`, top, bottom);
      for (const bin of bins) {
        let peak = 0;
        for (let i = bin.from; i < bin.to; i++) if (Number.isFinite(hourly.uvIndex[i])) peak = Math.max(peak, hourly.uvIndex[i]);
        if (peak < 0.5) continue;
        const xa = x(hourly.time[bin.from]);
        const xb = x(hourly.time[bin.to] ?? hourly.time[bin.from] + binHours * 3600);
        const w = Math.max(1, Math.min(24, xb - xa - 2));
        const h = bottom - y(peak);
        parts.push(<path key={`uv-${bin.from}`} d={barPath(xa + (xb - xa - w) / 2, bottom - h, w, h, 2)} fill={uvCategory(peak).color} className="uv-bar" />);
      }
      parts.push(<line key="uv-base" x1={GUTTER_LEFT} x2={width - GUTTER_RIGHT} y1={bottom} y2={bottom} className="baseline" />);
    }

    // ---- Visibility ----
    const visibilityBox = layout.get("visibility");
    if (visibilityBox) {
      const { top, bottom } = visibilityBox;
      const factor = units.distance === "mi" ? 1 / 1609.344 : 1 / 1000;
      const values = indices.map((i) => hourly.visibility[i] * factor);
      const maxValue = Math.max(10 * (units.distance === "mi" ? 0.62 : 1), ...values.filter(Number.isFinite));
      const y = scaleLinear().domain([0, ticks(0, maxValue, 2).at(-1)! >= maxValue ? ticks(0, maxValue, 2).at(-1)! : maxValue]).range([bottom, top]);
      trackLabel("visibility", `Visibility, ${UNIT_LABELS.distance[units.distance]}`, top);
      yAxis("v", y, ticks(0, y.domain()[1], 2), (v) => num(v), top, bottom);
      parts.push(<path key="visibility" d={linePath(values, y)} className="series-line" stroke={SERIES.neutral} />);
      lineSeries.push({ id: "visibility", color: SERIES.neutral, y: (i) => y(hourly.visibility[i] * factor) });
    }

    return { x, height, plotBottom, parts, lineSeries, t0, t1 };
  }, [hourly, daily, start, end, width, tracks, units, view.clock, range, binHours]);

  const active = hover ?? start;
  const stepFor = (direction: number) => direction * binHours;

  const indexAt = (clientX: number, element: Element) => {
    const box = element.getBoundingClientRect();
    const ts = chart.x.invert(clientX - box.left);
    const raw = start + Math.round((ts - chart.t0) / 3600);
    return Math.max(start, Math.min(end - 1, raw));
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => setHover(indexAt(event.clientX, event.currentTarget));
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number | "home" | "end"> = { ArrowRight: 1, ArrowLeft: -1, Home: "home", End: "end" };
    const action = keys[event.key];
    if (action === undefined) return;
    event.preventDefault();
    if (action === "home") setHover(start);
    else if (action === "end") setHover(end - 1);
    else setHover(Math.max(start, Math.min(end - 1, (hover ?? start) + stepFor(action))));
  };

  const crossX = chart.x(hourly.time[active]);

  return (
    <div className="meteogram">
      <Readout view={view} units={units} index={active} />
      <div
        ref={ref}
        className="meteogram-plot"
        tabIndex={0}
        role="group"
        aria-label="Hourly forecast chart. Use the left and right arrow keys to move through the hours; the values appear above the chart."
        onPointerMove={onPointerMove}
        onPointerDown={onPointerMove}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKeyDown}
        onBlur={() => setHover(null)}
      >
        <svg width={width} height={chart.height} role="presentation">
          {chart.parts}
          <g className="crosshair" aria-hidden="true">
            <line x1={crossX} x2={crossX} y1={HEADER - 4} y2={chart.plotBottom} />
            {chart.lineSeries.map((series) => {
              const py = series.y(active);
              return Number.isFinite(py) ? <circle key={series.id} cx={crossX} cy={py} r={4} fill={series.color} className="series-dot" /> : null;
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

function Readout({ view, units, index }: { view: ForecastView; units: Units; index: number }) {
  const h = view.forecast.hourly;
  const isDay = h.isDay[index] === 1;
  const time = index === view.nowIndex ? "Now" : `${view.clock.weekday(h.time[index])} ${view.clock.hour(h.time[index])}`;
  const items: [string, string][] = [
    [formatTemperature(h.temperature[index], units.temperature), "temperature"],
    [formatTemperature(h.apparent[index], units.temperature), "feels like"],
    [formatPrecipitation(h.precipitation[index], units.precipitation), "precipitation"],
    [formatPercent(h.precipProbability[index]), "chance of rain"],
    [formatWind(h.windSpeed[index], units.wind), `wind from ${compassPoint(h.windDirection[index])}`],
    [formatWind(h.windGusts[index], units.wind), "gusts"],
    [formatPercent(h.cloudCover[index]), "clouds"],
    [formatPercent(h.humidity[index]), "humidity"],
    [formatTemperature(h.dewPoint[index], units.temperature), "dew point"],
    [formatPressure(h.pressure[index], units.pressure), "pressure"],
    [Number.isFinite(h.uvIndex[index]) ? num(h.uvIndex[index], 0) : "–", "UV index"],
    [formatDistance(h.visibility[index], units.distance), "visibility"],
  ];
  return (
    <div className="readout" aria-live="polite" aria-atomic="true">
      <div className="readout-time">
        <WeatherIcon code={h.weatherCode[index]} isDay={isDay} size={34} />
        <span>
          <strong>{time}</strong>
          <span className="readout-condition">{conditionLabel(h.weatherCode[index], isDay)}</span>
        </span>
      </div>
      <dl className="readout-values">
        {items.map(([value, label]) => (
          <div key={label}>
            <dd>{value}</dd>
            <dt>{label}</dt>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The meteogram's table twin: one row per hour. */
export function MeteogramTable({ view, units, range }: { view: ForecastView; units: Units; range: RangeHours }) {
  const h = view.forecast.hourly;
  const rows: number[] = [];
  for (let i = view.nowIndex; i < Math.min(h.time.length, view.nowIndex + range + 1); i++) rows.push(i);
  return (
    <DataTable
      caption="Hourly forecast"
      rowKey={(i) => i}
      rows={rows}
      columns={[
        { header: "Time", cell: (i) => `${view.clock.weekday(h.time[i])} ${view.clock.hour(h.time[i])}` },
        { header: "Sky", cell: (i) => conditionLabel(h.weatherCode[i], h.isDay[i] === 1) },
        { header: "Temp.", cell: (i) => formatTemperature(h.temperature[i], units.temperature), numeric: true },
        { header: "Feels", cell: (i) => formatTemperature(h.apparent[i], units.temperature), numeric: true },
        { header: "Rain", cell: (i) => formatPrecipitation(h.precipitation[i], units.precipitation), numeric: true },
        { header: "Chance", cell: (i) => formatPercent(h.precipProbability[i]), numeric: true },
        { header: "Wind", cell: (i) => `${formatWind(h.windSpeed[i], units.wind)} ${compassPoint(h.windDirection[i])}`, numeric: true },
        { header: "Gusts", cell: (i) => formatWind(h.windGusts[i], units.wind), numeric: true },
        { header: "Clouds", cell: (i) => formatPercent(h.cloudCover[i]), numeric: true },
        { header: "Humidity", cell: (i) => formatPercent(h.humidity[i]), numeric: true },
        { header: "Pressure", cell: (i) => formatPressure(h.pressure[i], units.pressure), numeric: true },
        { header: "UV", cell: (i) => (Number.isFinite(h.uvIndex[i]) ? num(h.uvIndex[i]) : "–"), numeric: true },
        { header: "Visibility", cell: (i) => formatDistance(h.visibility[i], units.distance), numeric: true },
      ]}
    />
  );
}

export function MeteogramLegend({ tracks }: { tracks: Set<TrackId> }) {
  return (
    <>
      {tracks.has("temperature") && (
        <>
          <LegendLine color={SERIES.temperature} label="Temperature" />
          <LegendLine color={SERIES.feels} label="Feels like" />
        </>
      )}
      {tracks.has("precipitation") && <LegendSwatch color={SERIES.precipitation} label="Precipitation" />}
      {tracks.has("wind") && (
        <>
          <LegendLine color={SERIES.wind} label="Wind" />
          <LegendLine color={SERIES.gust} label="Gusts" />
        </>
      )}
    </>
  );
}

export { ChartFrame };
