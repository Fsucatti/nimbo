/** Everything below the first screen, in reading order, with a section bar that follows the page. */
import { useEffect, useMemo, useState } from "react";
import type { Place } from "../lib/types";
import { formatTemperature, type Units } from "../lib/units";
import type { ForecastView } from "../lib/view";
import { Air } from "../sections/Air";
import { Climate } from "../sections/Climate";
import { Conditions } from "../sections/Conditions";
import { Daily } from "../sections/Daily";
import { Highlights } from "../sections/Highlights";
import { Hourly } from "../sections/Hourly";
import { Models } from "../sections/Models";
import { Plan } from "../sections/Plan";
import { Radar } from "../sections/Radar";
import { Sea } from "../sections/Sea";
import { SunMoon } from "../sections/SunMoon";
import { useAirQuality, useMarine } from "../state/queries";
import { WeatherIcon } from "./WeatherIcon";

interface Props {
  view: ForecastView;
  place: Place;
  units: Units;
}

function SectionBar({ view, place, units, links }: Props & { links: { id: string; label: string }[] }) {
  const [active, setActive] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = document.querySelector(".hero");
    if (!hero) return;
    const heroObserver = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), { threshold: 0 });
    heroObserver.observe(hero);
    const sections = links.map((link) => document.getElementById(link.id)).filter((node): node is HTMLElement => Boolean(node));
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        const shown = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (shown[0]) setActive(shown[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    sections.forEach((section) => sectionObserver.observe(section));
    return () => {
      heroObserver.disconnect();
      sectionObserver.disconnect();
    };
  }, [links]);

  const current = view.forecast.current;
  return (
    <nav className={`section-bar${visible ? " is-visible" : ""}`} aria-label="Sections">
      <div className="section-bar-inner">
        <a className="section-bar-place" href="#top" onClick={(event) => (event.preventDefault(), window.scrollTo({ top: 0 }))}>
          <WeatherIcon code={current.weatherCode} isDay={current.isDay === 1} size={26} />
          <span className="section-bar-temp">{formatTemperature(current.temperature, units.temperature)}</span>
          <span className="section-bar-name">{place.name}</span>
        </a>
        <ul className="section-bar-links">
          {links.map((link) => (
            <li key={link.id}>
              <a href={`#${link.id}`} aria-current={active === link.id ? "true" : undefined}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

export function Dashboard({ view, place, units }: Props) {
  const air = useAirQuality(place);
  const marine = useMarine(place);
  const hasSea = Boolean(marine.data);
  const links = useMemo(
    () => [
    { id: "hourly", label: "Hourly" },
    { id: "days", label: "Days" },
    { id: "now", label: "Now" },
    { id: "air", label: "Air" },
    { id: "sun-moon", label: "Sun & moon" },
    { id: "plan", label: "Plan" },
    { id: "climate", label: "Climate" },
    { id: "models", label: "Models" },
    { id: "radar", label: "Radar" },
    ...(hasSea ? [{ id: "sea", label: "Sea" }] : []),
    ],
    [hasSea],
  );

  return (
    <>
      <SectionBar view={view} place={place} units={units} links={links} />
      <div className="dashboard">
        <Highlights view={view} units={units} air={air.data} />
        <Hourly view={view} units={units} />
        <Daily view={view} units={units} />
        <Conditions view={view} units={units} place={place} />
        <Air air={air} view={view} onRetry={() => air.refetch()} />
        <SunMoon view={view} />
        <Plan view={view} units={units} />
        <Climate view={view} units={units} place={place} />
        <Models view={view} units={units} place={place} />
        <Radar view={view} place={place} />
        {marine.data && <Sea marine={marine.data} view={view} units={units} latitude={place.latitude} longitude={place.longitude} />}
      </div>
    </>
  );
}
