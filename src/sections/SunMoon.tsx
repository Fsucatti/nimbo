/** Sun and moon: today's light from night to noon, both paths across the sky, the moon's phase, and daylight through the year. */
import { scaleLinear } from "d3-scale";
import { curveMonotoneX, line } from "d3-shape";
import { useMemo } from "react";
import { ChartFrame, DataTable, LegendLine, SERIES } from "../charts/common";
import { useWidth } from "../components/hooks";
import { Section } from "../components/Section";
import { dayLength, moonDay, moonNow, moonPosition, nextPhase, sunDay, sunPosition, yearOfDaylight, type SunDay } from "../lib/astro";
import { formatDuration, formatDurationDelta, num } from "../lib/units";
import type { ForecastView } from "../lib/view";

const LIGHT_BANDS = [
  { key: "night", label: "Night" },
  { key: "astro", label: "Astronomical twilight" },
  { key: "nautical", label: "Nautical twilight" },
  { key: "civil", label: "Civil twilight" },
  { key: "golden", label: "Golden hour" },
  { key: "day", label: "Daylight" },
] as const;

type Band = (typeof LIGHT_BANDS)[number]["key"];

/** Splits the day into periods of light from the sun times. */
function lightPeriods(day: SunDay, start: number, end: number): { from: number; to: number; band: Band }[] {
  if (day.alwaysUp) return [{ from: start, to: end, band: "day" }];
  const marks: [number | null, Band][] = [
    [day.nightEnd, "astro"],
    [day.nauticalDawn, "nautical"],
    [day.dawn, "civil"],
    [day.sunrise, "golden"],
    [day.goldenHourEnd, "day"],
    [day.goldenHour, "golden"],
    [day.sunset, "civil"],
    [day.dusk, "nautical"],
    [day.nauticalDusk, "astro"],
    [day.night, "night"],
  ];
  const list = marks.filter((m): m is [number, Band] => m[0] !== null && m[0] > start && m[0] < end).sort((a, b) => a[0] - b[0]);
  // What light the day starts in: the band before the first change.
  const order: Band[] = ["night", "astro", "nautical", "civil", "golden", "day"];
  let band: Band = day.alwaysDown ? "night" : "night";
  if (list.length && list[0][1] !== "astro") {
    // The night never gets fully dark (high latitudes in summer).
    const firstIndex = order.indexOf(list[0][1]);
    band = order[Math.max(0, firstIndex - 1)];
  }
  const periods: { from: number; to: number; band: Band }[] = [];
  let cursor = start;
  for (const [ts, next] of list) {
    periods.push({ from: cursor, to: ts, band });
    band = next;
    cursor = ts;
  }
  periods.push({ from: cursor, to: end, band });
  return periods.filter((p) => p.to > p.from);
}

function DayBand({ view, day, start, end }: { view: ForecastView; day: SunDay; start: number; end: number }) {
  const periods = lightPeriods(day, start, end);
  const now = view.now;
  const position = ((now - start) / (end - start)) * 100;
  return (
    <div className="light-band">
      <div className="light-band-bar" role="img" aria-label="Light through today, from midnight to midnight">
        {periods.map((p) => (
          <span key={p.from} className={`light light-${p.band}`} style={{ left: `${((p.from - start) / (end - start)) * 100}%`, width: `${((p.to - p.from) / (end - start)) * 100}%` }}>
            <span className="visually-hidden">
              {LIGHT_BANDS.find((b) => b.key === p.band)?.label} from {view.clock.time(p.from)} to {view.clock.time(p.to)}
            </span>
          </span>
        ))}
        {now >= start && now <= end && <span className="light-now" style={{ left: `${position}%` }} />}
      </div>
      <div className="light-band-hours" aria-hidden="true">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
            {view.clock.hour(start + h * 3600 - (h === 24 ? 60 : 0)).replace(":00", "").replace("23:59", "24")}
          </span>
        ))}
      </div>
      <div className="light-band-legend chart-legend">
        {LIGHT_BANDS.map((band) => (
          <span key={band.key} className="legend-item">
            <span className={`legend-swatch light-${band.key}`} aria-hidden="true" />
            {band.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function AltitudeChart({ view, start, end }: { view: ForecastView; start: number; end: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(600);
  const { latitude, longitude } = view.forecast;
  const samples = useMemo(() => {
    const list: { ts: number; sun: number; moon: number }[] = [];
    for (let t = start; t <= end; t += 900) {
      list.push({ ts: t, sun: sunPosition(t, latitude, longitude).altitude, moon: moonPosition(t, latitude, longitude).altitude });
    }
    return list;
  }, [start, end, latitude, longitude]);
  const height = 190;
  const left = 38;
  const x = scaleLinear().domain([start, end]).range([left, width - 8]);
  const y = scaleLinear().domain([-60, 90]).range([height - 20, 8]).clamp(true);
  const path = (key: "sun" | "moon") =>
    line<{ ts: number; sun: number; moon: number }>()
      .x((d) => x(d.ts))
      .y((d) => y(d[key]))
      .curve(curveMonotoneX)(samples) ?? "";
  const nowSun = sunPosition(view.now, latitude, longitude).altitude;
  const nowMoon = moonPosition(view.now, latitude, longitude).altitude;
  return (
    <div ref={ref} className="altitude-chart">
      <svg width={width} height={height} role="img" aria-label={`Height of the sun and the moon above the horizon today. Now: sun ${num(nowSun)}°, moon ${num(nowMoon)}°.`}>
        <rect x={left} y={y(0)} width={width - left - 8} height={height - 20 - y(0)} className="below-horizon" />
        {[-30, 0, 30, 60, 90].map((v) => (
          <g key={v}>
            <line x1={left} x2={width - 8} y1={y(v)} y2={y(v)} className={v === 0 ? "baseline" : "grid"} />
            <text x={left - 6} y={y(v) + 4} textAnchor="end" className="axis-label">
              {v}°
            </text>
          </g>
        ))}
        <text x={width - 12} y={y(0) - 6} textAnchor="end" className="axis-label">
          Horizon
        </text>
        <path d={path("moon")} className="series-line" stroke={SERIES.moon} />
        <path d={path("sun")} className="series-line" stroke={SERIES.solar} />
        {view.now >= start && view.now <= end && (
          <>
            <line x1={x(view.now)} x2={x(view.now)} y1={8} y2={height - 20} className="now-line" />
            <circle cx={x(view.now)} cy={y(nowSun)} r={5} fill={SERIES.solar} className="series-dot" />
            <circle cx={x(view.now)} cy={y(nowMoon)} r={5} fill={SERIES.moon} className="series-dot" />
          </>
        )}
        {[0, 6, 12, 18].map((h) => (
          <text key={h} x={x(start + h * 3600)} y={height - 4} textAnchor="middle" className="axis-label">
            {view.clock.hour(start + h * 3600).replace(":00", "")}
          </text>
        ))}
      </svg>
    </div>
  );
}

function MoonPicture({ fraction, waxing, southern }: { fraction: number; waxing: boolean; southern: boolean }) {
  const r = 46;
  const k = Math.abs(1 - 2 * fraction) * r;
  const sweepOuter = waxing ? 1 : 0;
  const sweepInner = fraction > 0.5 ? sweepOuter : 1 - sweepOuter;
  const lit = `M 0 ${-r} A ${r} ${r} 0 0 ${sweepOuter} 0 ${r} A ${k} ${r} 0 0 ${sweepInner} 0 ${-r} Z`;
  return (
    <svg viewBox="-52 -52 104 104" className="moon-picture" style={southern ? { transform: "scaleX(-1)" } : undefined} aria-hidden="true">
      <circle r={r} className="moon-shadow" />
      <path d={lit} className="moon-light" />
      <circle r={r} className="moon-edge" />
    </svg>
  );
}

function YearChart({ view }: { view: ForecastView }) {
  const [ref, width] = useWidth<HTMLDivElement>(600);
  const { latitude, longitude, timezone } = view.forecast;
  const year = Number(view.clock.dateKey(view.now).slice(0, 4));
  const days = useMemo(() => yearOfDaylight(year, latitude, longitude, timezone), [year, latitude, longitude, timezone]);
  const height = 150;
  const left = 38;
  const x = scaleLinear().domain([days[0].ts, days[days.length - 1].ts]).range([left, width - 8]);
  const y = scaleLinear().domain([0, 24]).range([height - 20, 8]);
  const path = line<{ ts: number; seconds: number }>()
    .x((d) => x(d.ts))
    .y((d) => y(d.seconds / 3600))
    .curve(curveMonotoneX)(days);
  const longest = days.reduce((a, b) => (b.seconds > a.seconds ? b : a));
  const shortest = days.reduce((a, b) => (b.seconds < a.seconds ? b : a));
  const today = dayLength(view.now, latitude, longitude, timezone);
  const months = Array.from({ length: 12 }, (_, m) => Date.UTC(year, m, 1, 12) / 1000);
  return (
    <ChartFrame
      title="Daylight through the year"
      table={() => (
        <DataTable
          caption="Daylight on the first day of each month"
          rowKey={(ts) => ts}
          rows={months}
          columns={[
            { header: "Date", cell: (ts) => view.clock.dayMonth(ts) },
            { header: "Daylight", cell: (ts) => formatDuration(dayLength(ts, latitude, longitude, timezone)), numeric: true },
          ]}
        />
      )}
    >
      <div ref={ref} className="year-chart">
        <svg width={width} height={height} role="img" aria-label={`Hours of daylight through ${year}. Longest ${view.clock.dayMonth(longest.ts)}, ${formatDuration(longest.seconds)}. Shortest ${view.clock.dayMonth(shortest.ts)}, ${formatDuration(shortest.seconds)}.`}>
          {[0, 6, 12, 18, 24].map((h) => (
            <g key={h}>
              <line x1={left} x2={width - 8} y1={y(h)} y2={y(h)} className="grid" />
              <text x={left - 6} y={y(h) + 4} textAnchor="end" className="axis-label">
                {h}h
              </text>
            </g>
          ))}
          <path d={path ?? ""} className="series-line" stroke={SERIES.solar} />
          {months.map((ts) => (
            <text key={ts} x={x(ts) + 2} y={height - 4} className="axis-label">
              {view.clock.dayMonth(ts).slice(0, 3)}
            </text>
          ))}
          <circle cx={x(view.now)} cy={y(today / 3600)} r={5} fill={SERIES.solar} className="series-dot" />
          <text x={Math.min(width - 60, x(view.now) + 8)} y={y(today / 3600) - 8} className="value-label">
            Today {formatDuration(today)}
          </text>
        </svg>
      </div>
      <p className="chart-note">
        Longest day: {view.clock.dayMonth(longest.ts)}, {formatDuration(longest.seconds)}. Shortest: {view.clock.dayMonth(shortest.ts)}, {formatDuration(shortest.seconds)}.
      </p>
    </ChartFrame>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>
        {value}
        {note && <span className="fact-note">{note}</span>}
      </dd>
    </div>
  );
}

export function SunMoon({ view }: { view: ForecastView }) {
  const { latitude, longitude, timezone, daily } = view.forecast;
  const today = view.todayIndex;
  const start = daily.time[today];
  const end = daily.time[today + 1] ?? start + 86400;
  const day = sunDay(view.now, latitude, longitude, timezone);
  const yesterdayLength = dayLength(view.now - 86400, latitude, longitude, timezone);
  const length = dayLength(view.now, latitude, longitude, timezone);
  const moon = moonNow(view.now, latitude, longitude);
  const moonTimes = moonDay(view.now, latitude, longitude, timezone);
  const phases = useMemo(
    () =>
      [
        { name: "New moon", ts: nextPhase(view.now, 0) },
        { name: "First quarter", ts: nextPhase(view.now, 0.25) },
        { name: "Full moon", ts: nextPhase(view.now, 0.5) },
        { name: "Last quarter", ts: nextPhase(view.now, 0.75) },
      ]
        .filter((p): p is { name: string; ts: number } => p.ts !== null)
        .sort((a, b) => a.ts - b.ts),
    [view.now],
  );
  const t = (ts: number | null) => (ts === null ? "–" : view.clock.time(ts));
  const lengthNote = day.alwaysUp ? "The sun doesn't set today" : day.alwaysDown ? "The sun doesn't rise today" : `${formatDurationDelta(length - yesterdayLength)} vs yesterday`;

  return (
    <Section id="sun-moon" title="Sun and moon" intro="Calculated for this exact spot. Twilight times tell you when there's still light to see by, and when the sky gets truly dark.">
      <DayBand view={view} day={day} start={start} end={end} />
      <div className="sun-moon-grid">
        <div>
          <ChartFrame
            title="Height above the horizon today"
            legend={
              <>
                <LegendLine color={SERIES.solar} label="Sun" />
                <LegendLine color={SERIES.moon} label="Moon" />
              </>
            }
            table={() => (
              <DataTable
                caption="Sun and moon height every hour"
                rowKey={(h) => h}
                rows={Array.from({ length: 24 }, (_, h) => h)}
                columns={[
                  { header: "Time", cell: (h) => view.clock.hour(start + h * 3600) },
                  { header: "Sun", cell: (h) => `${num(sunPosition(start + h * 3600, latitude, longitude).altitude)}°`, numeric: true },
                  { header: "Moon", cell: (h) => `${num(moonPosition(start + h * 3600, latitude, longitude).altitude)}°`, numeric: true },
                ]}
              />
            )}
          >
            <AltitudeChart view={view} start={start} end={end} />
          </ChartFrame>
          <dl className="facts">
            <Fact label="Sunrise" value={t(day.sunrise)} />
            <Fact label="Sunset" value={t(day.sunset)} />
            <Fact label="Daylight" value={formatDuration(length)} note={lengthNote} />
            <Fact label="Solar noon" value={view.clock.time(day.solarNoon)} note={`Sun ${num(day.noonAltitude)}° above the horizon`} />
            <Fact label="First light" value={t(day.dawn)} note="Civil dawn" />
            <Fact label="Last light" value={t(day.dusk)} note="Civil dusk" />
            <Fact label="Golden hour" value={day.goldenHour ? `${t(day.goldenHour)} to ${t(day.sunset)}` : "–"} note={day.goldenHourEnd ? `and ${t(day.sunrise)} to ${t(day.goldenHourEnd)}` : undefined} />
            <Fact label="Dark sky" value={day.night ? `${t(day.night)} to ${t(day.nightEnd)}` : "Not tonight"} note="Astronomical night" />
          </dl>
        </div>
        <div className="moon-panel">
          <MoonPicture fraction={moon.fraction} waxing={moon.waxing} southern={latitude < 0} />
          <p className="moon-name">{moon.name}</p>
          <p className="moon-lit">
            {num(moon.fraction * 100)}% lit, {num(moon.ageDays, 1)} days old
          </p>
          <dl className="facts facts-compact">
            <Fact label="Moonrise" value={moonTimes.alwaysUp ? "Up all day" : moonTimes.alwaysDown ? "Not today" : t(moonTimes.rise)} />
            <Fact label="Moonset" value={moonTimes.alwaysUp ? "Up all day" : moonTimes.alwaysDown ? "Not today" : t(moonTimes.set)} />
            <Fact label="Distance" value={`${num(moon.distanceKm)} km`} />
          </dl>
          <h3 className="moon-next-title">Next phases</h3>
          <ul className="moon-next">
            {phases.map((phase) => (
              <li key={phase.name}>
                <span>{phase.name}</span>
                <span className="tabular">
                  {view.clock.weekday(phase.ts)} {view.clock.dayMonth(phase.ts)}, {view.clock.time(phase.ts)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <YearChart view={view} />
    </Section>
  );
}
