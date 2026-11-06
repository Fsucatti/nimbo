/** Next 3 hours in 15-minute steps, then the meteogram for 48 hours, 7 days or 16 days. */
import { scaleLinear } from "d3-scale";
import { useState } from "react";
import { MeteogramLegend, Meteogram, MeteogramTable, TRACKS, type RangeHours, type TrackId } from "../charts/Meteogram";
import { ChartFrame } from "../charts/common";
import { useWidth } from "../components/hooks";
import { Section } from "../components/Section";
import { nowcastSentence } from "../lib/summary";
import { formatPrecipitation, type Units } from "../lib/units";
import type { ForecastView } from "../lib/view";

function Nowcast({ view, units }: { view: ForecastView; units: Units }) {
  const { minutely, current } = view.forecast;
  const [ref, width] = useWidth<HTMLDivElement>(600);
  const sentence = nowcastSentence(view);
  const rates = minutely.precipitation.map((value) => (Number.isFinite(value) ? value * 4 : 0));
  const wet = rates.some((rate) => rate > 0) || current.precipitation > 0;

  if (!wet) {
    return (
      <p className="nowcast-dry">
        <strong>Next 3 hours:</strong> no precipitation expected.
      </p>
    );
  }
  const height = 70;
  const max = Math.max(2, ...rates);
  const y = scaleLinear().domain([0, max]).range([height, 8]);
  const slot = width / rates.length;
  const barWidth = Math.min(24, slot - 4);
  return (
    <div className="nowcast">
      <p className="nowcast-sentence">
        <strong>Next 3 hours:</strong> {sentence ?? "Light precipitation at times."}
      </p>
      <div ref={ref} className="nowcast-chart">
        <svg width={width} height={height + 22} role="img" aria-label={`Precipitation every 15 minutes for the next 3 hours, up to ${formatPrecipitation(max, units.precipitation)} per hour`}>
          {rates.map((rate, i) => {
            const h = Math.max(rate > 0 ? 2 : 0, height - y(rate));
            const x = i * slot + (slot - barWidth) / 2;
            return (
              <g key={minutely.time[i]}>
                {h > 0 && <rect x={x} y={height - h} width={barWidth} height={h} rx={3} fill="var(--precip)" />}
                {i % 2 === 0 && (
                  <text x={i * slot + slot / 2} y={height + 16} textAnchor="middle" className="axis-label">
                    {view.clock.time(minutely.time[i])}
                  </text>
                )}
                <title>{`${view.clock.time(minutely.time[i])}: ${formatPrecipitation(rate, units.precipitation)} per hour`}</title>
              </g>
            );
          })}
          <line x1={0} x2={width} y1={height} y2={height} className="baseline" />
        </svg>
      </div>
    </div>
  );
}


export function Hourly({ view, units }: { view: ForecastView; units: Units }) {
  const [range, setRange] = useState<RangeHours>(48);
  const available = Math.floor((view.forecast.hourly.time.length - view.nowIndex) / 24);
  const ranges: { value: RangeHours; label: string }[] = [
    { value: 48, label: "48 hours" },
    { value: 168, label: "7 days" },
    { value: 384, label: `${available} days` },
  ];
  const [tracks, setTracks] = useState<Set<TrackId>>(() => new Set(["temperature", "precipitation", "wind", "clouds"]));
  const toggle = (id: TrackId) =>
    setTracks((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else next.add(id);
      return next;
    });

  return (
    <Section
      id="hourly"
      title="Hour by hour"
      intro="Temperature, rain, wind and clouds on one timeline. Move along the chart, or focus it and use the arrow keys, to read every value."
    >
      <Nowcast view={view} units={units} />
      <div className="chart-filters">
        <div className="segmented" role="group" aria-label="Time range">
          {ranges.map((option) => (
            <button key={option.value} type="button" aria-pressed={range === option.value} onClick={() => setRange(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Show on the chart">
          {TRACKS.map((track) => (
            <button
              key={track.id}
              type="button"
              className="chip"
              aria-pressed={tracks.has(track.id)}
              onClick={() => toggle(track.id)}
              style={{ "--key": track.color } as React.CSSProperties}
            >
              <span className="chip-key" aria-hidden="true" />
              {track.label}
            </button>
          ))}
        </div>
      </div>
      <ChartFrame legend={<MeteogramLegend tracks={tracks} />} table={() => <MeteogramTable view={view} units={units} range={range} />}>
        <Meteogram view={view} units={units} range={range} tracks={tracks} />
      </ChartFrame>
    </Section>
  );
}
