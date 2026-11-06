/** Notable weather in the next days, found by rules. Each item carries an icon and words, never color alone. */
import { ArrowDown, CloudFog, CloudLightning, CloudRain, Flame, Info, Snowflake, Sun, ThermometerSnowflake, TriangleAlert, Wind, Factory } from "lucide-react";
import { Section } from "../components/Section";
import { findHighlights, type Highlight } from "../lib/highlights";
import type { Units } from "../lib/units";
import type { ForecastView } from "../lib/view";
import type { AirQuality } from "../api/air";

const ICONS: Record<Highlight["icon"], typeof Info> = {
  storm: CloudLightning,
  rain: CloudRain,
  wind: Wind,
  heat: Flame,
  frost: ThermometerSnowflake,
  snow: Snowflake,
  ice: TriangleAlert,
  fog: CloudFog,
  uv: Sun,
  air: Factory,
  drop: ArrowDown,
  rise: Info,
};

const LEVEL_WORDS: Record<Highlight["level"], string> = {
  serious: "Take care",
  warning: "Be aware",
  info: "Good to know",
};

export function Highlights({ view, units, air }: { view: ForecastView; units: Units; air?: AirQuality }) {
  const items = findHighlights(view, units, air ? { time: air.hourly.time, usAqi: air.hourly.usAqi } : undefined);
  if (items.length === 0) return null;
  return (
    <Section
      id="worth-knowing"
      title="Worth knowing"
      intro="Notable weather in the next days, picked out of the forecast by fixed rules. These are not official warnings."
    >
      <ul className="highlights">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          return (
            <li key={item.id} className={`highlight level-${item.level}`}>
              <span className="highlight-icon" aria-hidden="true">
                <Icon size={20} />
              </span>
              <div>
                <p className="highlight-level">{LEVEL_WORDS[item.level]}</p>
                <h3>{item.title}</h3>
                <p className="highlight-detail">{item.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
