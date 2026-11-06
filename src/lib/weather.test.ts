import { describe, expect, it } from "vitest";
import raw from "../../tests/fixtures/forecast.json" with { type: "json" };
import { parseForecast, type Forecast } from "../api/forecast";
import { beaufort, compassPoint, compassWords, dewPointFeel, pressureTrend, usAqiCategory, uvCategory } from "./comfort";
import { findHighlights } from "./highlights";
import { bestWindow } from "./outdoor";
import { skyColors } from "./sky";
import { summarize } from "./summary";
import { findTides } from "./tides";
import { METRIC } from "./units";
import { buildView, lastIndexAtOrBefore } from "./view";
import { condition, conditionLabel, precipitationNoun } from "./wmo";

const forecast = () => parseForecast(raw as never, 0);

/** A copy of the saved forecast with some hourly values replaced. */
function withHours(change: (f: Forecast) => void): Forecast {
  const copy = structuredClone(forecast());
  change(copy);
  return copy;
}

describe("parsing the forecast", () => {
  it("drops the empty rows after the end of the model run", () => {
    const f = forecast();
    expect(f.hourly.time.length).toBeGreaterThan(300);
    expect(Number.isFinite(f.hourly.temperature[f.hourly.time.length - 1])).toBe(true);
    expect(Object.values(f.hourly).every((values) => values.length === f.hourly.time.length)).toBe(true);
  });

  it("finds the current hour and today", () => {
    const view = buildView(forecast(), false);
    const { hourly, daily } = view.forecast;
    expect(hourly.time[view.nowIndex]).toBeLessThanOrEqual(view.now);
    expect(hourly.time[view.nowIndex + 1]).toBeGreaterThan(view.now);
    expect(view.clock.dateKey(daily.time[view.todayIndex])).toBe(view.clock.dateKey(view.now));
    // Yesterday is included, so today is the second day.
    expect(view.todayIndex).toBe(1);
    const [from, to] = view.dayHours[view.todayIndex];
    expect(to - from).toBe(24);
  });

  it("binary search returns the last time at or before a moment", () => {
    expect(lastIndexAtOrBefore([10, 20, 30], 25)).toBe(1);
    expect(lastIndexAtOrBefore([10, 20, 30], 30)).toBe(2);
    expect(lastIndexAtOrBefore([10, 20, 30], 5)).toBe(0);
  });
});

describe("weather codes", () => {
  it("words the sky differently by day and night", () => {
    expect(conditionLabel(0, true)).toBe("Sunny");
    expect(conditionLabel(0, false)).toBe("Clear");
    expect(condition(95).group).toBe("storm");
    expect(condition(1234).day).toBe("Unknown");
    expect(precipitationNoun(66)).toBe("freezing rain");
    expect(precipitationNoun(85)).toBe("snow");
  });
});

describe("plain-language readings", () => {
  it("uses the Beaufort scale", () => {
    expect(beaufort(0).name).toBe("Calm");
    expect(beaufort(25).force).toBe(4);
    expect(beaufort(65).name).toBe("Gale");
    expect(beaufort(130).force).toBe(12);
  });

  it("names compass points", () => {
    expect(compassPoint(339)).toBe("NNW");
    expect(compassPoint(360)).toBe("N");
    expect(compassPoint(-90)).toBe("W");
    expect(compassWords(135)).toBe("southeast");
  });

  it("reads pressure trends with synoptic thresholds", () => {
    expect(pressureTrend(1010, 1010.5).direction).toBe("steady");
    expect(pressureTrend(1012, 1010).words).toBe("Rising");
    expect(pressureTrend(1006, 1010).words).toBe("Rapidly falling");
    expect(pressureTrend(1011, 1010).words).toBe("Slowly rising");
  });

  it("uses the official UV and AQI categories", () => {
    expect(uvCategory(2.9).label).toBe("Low");
    expect(uvCategory(8).label).toBe("Very high");
    expect(uvCategory(11).label).toBe("Extreme");
    expect(usAqiCategory(50).label).toBe("Good");
    expect(usAqiCategory(101).label).toBe("Unhealthy for sensitive groups");
    expect(dewPointFeel(22)).toBe("Muggy");
  });
});

describe("summary", () => {
  it("writes a few sentences for the saved forecast", () => {
    const lines = summarize(buildView(forecast(), false), METRIC);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) expect(line).toMatch(/^[A-Z].*\.$/);
  });

  it("mentions rain that starts soon", () => {
    const f = withHours((copy) => {
      copy.current.precipitation = 0;
      copy.current.weatherCode = 3;
      copy.minutely.precipitation = copy.minutely.precipitation.map((_, i) => (i >= 2 ? 1.2 : 0));
      copy.minutely.weatherCode = copy.minutely.weatherCode.map((_, i) => (i >= 2 ? 63 : 3));
    });
    const [first] = summarize(buildView(f, false), METRIC);
    expect(first).toMatch(/^Rain likely in about \d+ minutes\.$/);
  });
});

describe("highlights", () => {
  it("flags strong gusts, thunderstorms and heavy rain tomorrow", () => {
    const f = withHours((copy) => {
      const view = buildView(copy, false);
      const [from] = view.dayHours[view.todayIndex + 1];
      copy.hourly.windGusts[from + 15] = 82;
      copy.hourly.weatherCode[from + 17] = 95;
      copy.hourly.precipitation[from + 17] = 12;
      copy.daily.precipSum[view.todayIndex + 1] = 35;
    });
    const items = findHighlights(buildView(f, false), METRIC);
    const titles = items.map((item) => item.title);
    expect(titles).toContain("Strong gusts tomorrow");
    expect(titles).toContain("Thunderstorms tomorrow");
    expect(titles).toContain("Heavy rain tomorrow");
    expect(items.find((item) => item.icon === "wind")?.detail).toContain("82 km/h");
  });

  it("flags poor air quality from the air data", () => {
    const view = buildView(forecast(), false);
    const items = findHighlights(view, METRIC, { time: [view.now + 3600], usAqi: [160] });
    expect(items.some((item) => item.icon === "air" && item.title === "Air quality: unhealthy")).toBe(true);
  });
});

describe("tides", () => {
  it("finds alternating high and low water close to the true times", () => {
    const period = 12.42 * 3600;
    const time = Array.from({ length: 48 }, (_, i) => i * 3600);
    const level = time.map((t) => 0.6 * Math.cos((2 * Math.PI * (t - 5000)) / period));
    const turns = findTides(time, level);
    expect(turns.length).toBeGreaterThanOrEqual(6);
    expect(turns[0].kind).toBe("high");
    expect(Math.abs(turns[0].ts - 5000)).toBeLessThan(600);
    for (let i = 1; i < turns.length; i++) expect(turns[i].kind).not.toBe(turns[i - 1].kind);
  });
});

describe("plan your day", () => {
  it("picks the best run of consecutive hours", () => {
    const scores = [10, 90, 95, 20, 85, 85, 85, 30];
    expect(bestWindow(scores, 0, scores.length, 3)).toMatchObject({ from: 4, to: 7, score: 85 });
    expect(bestWindow(scores, 0, 2, 3)).toBeNull();
  });
});

describe("sky colors", () => {
  it("keeps text light at night and dark on a bright snowy day", () => {
    expect(skyColors({ sunAltitude: -30, cloudCover: 0, group: "clear", intensity: 0 }).ink).toBe("light");
    expect(skyColors({ sunAltitude: 30, cloudCover: 100, group: "snow", intensity: 2 }).ink).toBe("dark");
  });

  it("turns grey under a full cloud deck", () => {
    const clear = skyColors({ sunAltitude: 40, cloudCover: 0, group: "clear", intensity: 0 });
    const overcast = skyColors({ sunAltitude: 40, cloudCover: 100, group: "cloudy", intensity: 0 });
    expect(clear.top).not.toBe(overcast.top);
    const saturation = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return Math.max(r, g, b) - Math.min(r, g, b);
    };
    expect(saturation(overcast.top)).toBeLessThan(saturation(clear.top));
  });
});
