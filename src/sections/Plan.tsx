/** "Plan your day": the best hours for common activities today and tomorrow, with the reason. */
import { Bike, Camera, Footprints, Shirt, Telescope } from "lucide-react";
import type { ReactNode } from "react";
import { Section } from "../components/Section";
import { moonNow, moonPosition, sunDay, sunPosition } from "../lib/astro";
import { bestWindow, laundryScore, outdoorScore, runningScore, stargazingScore, sunsetScore, verdict, type Verdict } from "../lib/outdoor";
import { relativeDay } from "../lib/time";
import { formatPercent, formatTemperature, formatWind, type Units } from "../lib/units";
import type { ForecastView } from "../lib/view";

interface Activity {
  id: string;
  icon: ReactNode;
  name: string;
  verdict: Verdict;
  when: string;
  why: string;
}

const VERDICT_LEVEL: Record<Verdict, string> = { Great: "good", Good: "good", Fair: "warning", Poor: "serious" };

function windowText(view: ForecastView, from: number, to: number): string {
  const h = view.forecast.hourly;
  const day = relativeDay(view.clock, h.time[from], view.now);
  return `${day}, ${view.clock.hour(h.time[from])} to ${view.clock.hour(h.time[to - 1] + 3600)}`;
}

/** Daytime rows from now until the end of tomorrow. */
function daytimeRange(view: ForecastView): [number, number] {
  const tomorrow = view.dayHours[view.todayIndex + 1];
  const end = tomorrow && tomorrow[1] > 0 ? tomorrow[1] : view.nowIndex + 36;
  return [view.nowIndex, Math.min(view.forecast.hourly.time.length, end)];
}

function bestDaytime(view: ForecastView, score: (i: number) => number, length: number, earliest = 6, latest = 22) {
  const [from, to] = daytimeRange(view);
  const scores = view.forecast.hourly.time.map((ts, i) => {
    if (i < from || i >= to) return Number.NaN;
    const hour = view.clock.hourOfDay(ts);
    return hour >= earliest && hour < latest ? score(i) : Number.NaN;
  });
  return bestWindow(scores, from, to, length);
}

export function Plan({ view, units }: { view: ForecastView; units: Units }) {
  const h = view.forecast.hourly;
  const { latitude, longitude, timezone } = view.forecast;
  const activities: Activity[] = [];

  const outdoors = bestDaytime(view, (i) => outdoorScore(view, i), 2);
  if (outdoors) {
    const i = outdoors.from;
    activities.push({
      id: "outdoors",
      icon: <Footprints size={20} aria-hidden="true" />,
      name: "Time outside",
      verdict: verdict(outdoors.score),
      when: windowText(view, outdoors.from, outdoors.to),
      why: `Feels like ${formatTemperature(h.apparent[i], units.temperature)}, ${formatPercent(h.precipProbability[i])} chance of rain, wind ${formatWind(h.windSpeed[i], units.wind)}.`,
    });
  }

  const running = bestDaytime(view, (i) => runningScore(view, i), 1, 5, 22);
  if (running) {
    const i = running.from;
    activities.push({
      id: "running",
      icon: <Bike size={20} aria-hidden="true" />,
      name: "Running or cycling",
      verdict: verdict(running.score),
      when: windowText(view, running.from, running.to),
      why: `Cooler hours are easier on the body: ${formatTemperature(h.apparent[i], units.temperature)} feels like, dew point ${formatTemperature(h.dewPoint[i], units.temperature)}.`,
    });
  }

  const laundry = bestDaytime(view, (i) => laundryScore(view, i), 3, 7, 20);
  if (laundry) {
    const i = laundry.from;
    activities.push({
      id: "laundry",
      icon: <Shirt size={20} aria-hidden="true" />,
      name: "Drying laundry outside",
      verdict: verdict(laundry.score),
      when: windowText(view, laundry.from, laundry.to),
      why: laundry.score < 40 ? "Rain, damp air or little sun around; better to dry indoors." : `Humidity around ${formatPercent(h.humidity[i])}, with a breeze of ${formatWind(h.windSpeed[i], units.wind)}.`,
    });
  }

  // Stargazing tonight: from dark to dawn.
  const moon = moonNow(view.now, latitude, longitude);
  const [from, to] = daytimeRange(view);
  let starBest = { index: -1, score: -1 };
  for (let i = from; i < Math.min(to, from + 30); i++) {
    const altitude = sunPosition(h.time[i], latitude, longitude).altitude;
    const moonUp = moonPosition(h.time[i], latitude, longitude).altitude > 0;
    const score = stargazingScore(view, i, altitude, moon, moonUp);
    if (score > starBest.score) starBest = { index: i, score };
  }
  if (starBest.index >= 0) {
    const i = starBest.index;
    activities.push({
      id: "stars",
      icon: <Telescope size={20} aria-hidden="true" />,
      name: "Stargazing",
      verdict: verdict(starBest.score),
      when: starBest.score > 0 ? `${relativeDay(view.clock, h.time[i], view.now)}, around ${view.clock.hour(h.time[i])}` : "Not dark enough soon",
      why: `Cloud cover ${formatPercent(h.cloudCover[i])}; the moon is ${Math.round(moon.fraction * 100)}% lit.${starBest.score < 40 ? " Clouds or moonlight will hide most stars." : ""}`,
    });
  }

  // Sunset colors, for today's or tomorrow's sunset.
  const sunsets = [0, 1]
    .map((offset) => sunDay(view.now + offset * 86400, latitude, longitude, timezone).sunset)
    .filter((ts): ts is number => ts !== null && ts > view.now);
  if (sunsets.length) {
    const ts = sunsets[0];
    const i = h.time.findIndex((t) => t <= ts && ts < t + 3600);
    if (i >= 0) {
      const score = sunsetScore(view, i);
      const upper = Math.max(h.cloudMid[i], h.cloudHigh[i]);
      activities.push({
        id: "sunset",
        icon: <Camera size={20} aria-hidden="true" />,
        name: "Sunset photos",
        verdict: verdict(score),
        when: `${relativeDay(view.clock, ts, view.now)}, sunset at ${view.clock.time(ts)}`,
        why:
          upper >= 20 && upper <= 70 && h.cloudLow[i] < 50
            ? "Some high and middle clouds to catch the color."
            : h.cloudLow[i] >= 50
              ? "Low clouds may block the sun near the horizon."
              : "Clear skies: a clean sunset, with little color in the clouds.",
      });
    }
  }

  return (
    <Section id="plan" title="Plan your day" intro="The best hours today and tomorrow for a few everyday things, worked out from the forecast.">
      <ul className="activities">
        {activities.map((activity) => (
          <li key={activity.id} className="activity">
            <span className="activity-icon">{activity.icon}</span>
            <div className="activity-body">
              <h3>{activity.name}</h3>
              <p className={`activity-verdict status-${VERDICT_LEVEL[activity.verdict]}`}>
                <span className="status-dot" aria-hidden="true" />
                {activity.verdict}
                <span className="activity-when">{activity.when}</span>
              </p>
              <p className="activity-why">{activity.why}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
