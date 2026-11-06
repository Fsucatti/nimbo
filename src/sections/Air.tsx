/** Air quality now and for five days, pollutants against WHO guidelines, and pollen in Europe. */
import { scaleLinear } from "d3-scale";
import { useState } from "react";
import { POLLEN_INFO, type AirQuality, type PollenKey } from "../api/air";
import { messageFor } from "../api/http";
import { ChartFrame, DataTable } from "../charts/common";
import { useWidth } from "../components/hooks";
import { Section, SectionError, SectionLoading } from "../components/Section";
import { euAqiCategory, pollenLevel, usAqiCategory, WHO_GUIDELINES, type Category } from "../lib/comfort";
import { num } from "../lib/units";
import type { ForecastView } from "../lib/view";

type Standard = "us" | "eu";

const POLLUTANTS: { key: keyof typeof WHO_GUIDELINES | "dust"; name: string; note: string }[] = [
  { key: "pm2_5", name: "Fine particles (PM2.5)", note: "Smoke, traffic and industry; reach deep into the lungs" },
  { key: "pm10", name: "Coarse particles (PM10)", note: "Dust, pollen and construction" },
  { key: "ozone", name: "Ozone (O₃)", note: "Forms in sunlight from traffic fumes; peaks in the afternoon" },
  { key: "nitrogen_dioxide", name: "Nitrogen dioxide (NO₂)", note: "Mostly from vehicle engines" },
  { key: "sulphur_dioxide", name: "Sulfur dioxide (SO₂)", note: "Burning coal and oil, volcanoes" },
  { key: "carbon_monoxide", name: "Carbon monoxide (CO)", note: "Incomplete burning; traffic and heating" },
];

function scaleFor(standard: Standard): { max: number; category: (value: number) => Category; name: string } {
  return standard === "us" ? { max: 300, category: usAqiCategory, name: "US AQI" } : { max: 100, category: euAqiCategory, name: "European AQI" };
}

function AqiDial({ value, standard }: { value: number; standard: Standard }) {
  const { max, category, name } = scaleFor(standard);
  const c = category(value);
  const fraction = Math.max(0, Math.min(1, value / max));
  const r = 52;
  const length = Math.PI * r;
  return (
    <div className="aqi-dial">
      <svg viewBox="-64 -64 128 74" role="img" aria-label={`${name} ${Math.round(value)}, ${c.label}`}>
        <path d={`M${-r},0 A${r},${r} 0 0 1 ${r},0`} className="aqi-track" />
        <path d={`M${-r},0 A${r},${r} 0 0 1 ${r},0`} className="aqi-fill" stroke={c.color} strokeDasharray={`${fraction * length} ${length}`} />
      </svg>
      <div className="aqi-reading">
        <span className="aqi-number">{Number.isFinite(value) ? Math.round(value) : "–"}</span>
        <span className="aqi-name">{name}</span>
      </div>
    </div>
  );
}

function Forecast({ air, view, standard }: { air: AirQuality; view: ForecastView; standard: Standard }) {
  const [ref, width] = useWidth<HTMLDivElement>(700);
  const { category, max } = scaleFor(standard);
  const values = standard === "us" ? air.hourly.usAqi : air.hourly.euAqi;
  const start = air.hourly.time.findIndex((t) => t >= view.now - 3600);
  const indices = values.map((_, i) => i).filter((i) => i >= Math.max(0, start) && Number.isFinite(values[i]));
  const height = 120;
  const left = 34;
  const top = Math.max(standard === "us" ? 100 : 60, ...indices.map((i) => values[i]));
  const y = scaleLinear().domain([0, Math.min(max, Math.ceil(top / 25) * 25)]).range([height, 8]);
  const slot = (width - left) / Math.max(1, indices.length);
  const barWidth = Math.max(1, Math.min(12, slot - 1.5));
  const ticksList = y.ticks(3);
  return (
    <div ref={ref} className="aqi-forecast">
      <svg width={width} height={height + 24} role="img" aria-label={`Hourly ${scaleFor(standard).name} for the next days`}>
        {ticksList.map((tick) => (
          <g key={tick}>
            <line x1={left} x2={width} y1={y(tick)} y2={y(tick)} className="grid" />
            <text x={left - 6} y={y(tick) + 4} textAnchor="end" className="axis-label">
              {tick}
            </text>
          </g>
        ))}
        {indices.map((i, k) => {
          const value = values[i];
          const h = Math.max(1.5, height - y(value));
          return (
            <rect key={i} x={left + k * slot + (slot - barWidth) / 2} y={height - h} width={barWidth} height={h} rx={Math.min(2, barWidth / 2)} fill={category(value).color}>
              <title>{`${view.clock.weekday(air.hourly.time[i])} ${view.clock.hour(air.hourly.time[i])}: ${Math.round(value)}, ${category(value).label}`}</title>
            </rect>
          );
        })}
        <line x1={left} x2={width} y1={height} y2={height} className="baseline" />
        {indices.map((i, k) =>
          view.clock.hourOfDay(air.hourly.time[i]) === 0 ? (
            <g key={`d${i}`}>
              <line x1={left + k * slot} x2={left + k * slot} y1={0} y2={height} className="day-line" />
              <text x={left + k * slot + 4} y={height + 16} className="axis-label">
                {view.clock.weekday(air.hourly.time[i])}
              </text>
            </g>
          ) : null,
        )}
      </svg>
    </div>
  );
}

function CategoryLegend({ standard }: { standard: Standard }) {
  const { category } = scaleFor(standard);
  const samples = standard === "us" ? [25, 75, 125, 175, 250, 350] : [10, 30, 50, 70, 90, 120];
  return (
    <span className="chart-legend">
      {samples.map((value) => {
        const c = category(value);
        return (
          <span key={c.label} className="legend-item">
            <span className="legend-swatch" style={{ background: c.color }} aria-hidden="true" />
            {c.label}
          </span>
        );
      })}
    </span>
  );
}

function Pollen({ air }: { air: AirQuality }) {
  const keys = Object.keys(POLLEN_INFO) as PollenKey[];
  const rows = keys
    .map((key) => {
      const info = POLLEN_INFO[key];
      const value = air.current[key];
      return { key, info, value, level: pollenLevel(info.kind, Number.isFinite(value) ? value : 0) };
    })
    .filter((row) => Number.isFinite(row.value));
  return (
    <div className="pollen">
      <h3>Pollen now</h3>
      <ul>
        {rows.map((row) => (
          <li key={row.key}>
            <span className="pollen-name">{row.info.name}</span>
            <span className={`pollen-level level-${row.level.level}`}>
              <span className="pollen-dots" aria-hidden="true">
                {[1, 2, 3, 4].map((n) => (
                  <span key={n} className={n <= row.level.level ? "on" : undefined} />
                ))}
              </span>
              {row.level.label}
            </span>
            <span className="pollen-value tabular">{num(row.value)} grains/m³</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Air({ air, view, onRetry }: { air: { data?: AirQuality; error: unknown; isLoading: boolean }; view: ForecastView; onRetry: () => void }) {
  const [standard, setStandard] = useState<Standard>("us");
  const data = air.data;
  const toggle = (
    <div className="segmented" role="group" aria-label="Air quality index">
      <button type="button" aria-pressed={standard === "us"} onClick={() => setStandard("us")}>
        US AQI
      </button>
      <button type="button" aria-pressed={standard === "eu"} onClick={() => setStandard("eu")}>
        European AQI
      </button>
    </div>
  );

  return (
    <Section
      id="air"
      title="Air quality"
      intro="Modeled by the Copernicus Atmosphere Monitoring Service at a regional scale. Next to busy roads or fires the air can be worse than shown."
      aside={toggle}
    >
      {air.isLoading && <SectionLoading>Loading air quality…</SectionLoading>}
      {air.error && !data ? <SectionError message={messageFor(air.error)} onRetry={onRetry} /> : null}
      {data && (
        <>
          <div className="air-now">
            <div className="air-summary">
              <AqiDial value={standard === "us" ? data.current.usAqi : data.current.euAqi} standard={standard} />
              <div>
                <p className="air-category">{scaleFor(standard).category(standard === "us" ? data.current.usAqi : data.current.euAqi).label}</p>
                <p className="air-advice">{scaleFor(standard).category(standard === "us" ? data.current.usAqi : data.current.euAqi).advice}</p>
                <p className="air-extra">
                  Dust {Number.isFinite(data.current.dust) ? `${num(data.current.dust)} µg/m³` : "–"}. Haze (aerosol optical depth){" "}
                  {Number.isFinite(data.current.aod) ? num(data.current.aod, 2) : "–"}
                  {data.current.aod >= 0.5 ? ", the sky looks milky." : "."}
                </p>
              </div>
            </div>
            <ul className="pollutants">
              {POLLUTANTS.filter((p) => p.key !== "dust").map((p) => {
                const value = data.current[p.key as keyof typeof data.current] as number;
                const guideline = WHO_GUIDELINES[p.key as keyof typeof WHO_GUIDELINES];
                const share = value / guideline;
                return (
                  <li key={p.key}>
                    <div className="pollutant-head">
                      <span className="pollutant-name">{p.name}</span>
                      <span className="pollutant-value tabular">
                        {Number.isFinite(value) ? num(value) : "–"} µg/m³
                      </span>
                    </div>
                    <span className="meter" role="img" aria-label={`${num(share * 100)}% of the WHO guideline`} style={{ "--meter": share > 1 ? "var(--serious)" : "var(--good)" } as React.CSSProperties}>
                      <span className="meter-fill" style={{ width: `${Math.min(100, share * 100)}%` }} />
                    </span>
                    <span className="pollutant-note">
                      {Number.isFinite(share) ? `${num(share * 100)}% of the WHO guideline` : "No data"}. {p.note}.
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <ChartFrame
            title="Next days, hour by hour"
            legend={<CategoryLegend standard={standard} />}
            table={() => (
              <DataTable
                caption="Hourly air quality"
                rowKey={(i) => i}
                rows={data.hourly.time.map((_, i) => i).filter((i) => data.hourly.time[i] >= view.now - 3600 && Number.isFinite(data.hourly.usAqi[i]))}
                columns={[
                  { header: "Time", cell: (i) => `${view.clock.weekday(data.hourly.time[i])} ${view.clock.hour(data.hourly.time[i])}` },
                  { header: "US AQI", cell: (i) => num(data.hourly.usAqi[i]), numeric: true },
                  { header: "European AQI", cell: (i) => num(data.hourly.euAqi[i]), numeric: true },
                  { header: "PM2.5", cell: (i) => num(data.hourly.pm2_5[i]), numeric: true },
                  { header: "PM10", cell: (i) => num(data.hourly.pm10[i]), numeric: true },
                  { header: "O₃", cell: (i) => num(data.hourly.ozone[i]), numeric: true },
                  { header: "NO₂", cell: (i) => num(data.hourly.nitrogen_dioxide[i]), numeric: true },
                ]}
              />
            )}
          >
            <Forecast air={data} view={view} standard={standard} />
          </ChartFrame>
          {data.hasPollen ? (
            <Pollen air={data} />
          ) : (
            <p className="air-footnote">Pollen forecasts are only modeled for Europe, during the pollen season.</p>
          )}
        </>
      )}
    </Section>
  );
}
