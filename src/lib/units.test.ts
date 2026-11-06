import { describe, expect, it } from "vitest";
import { addDays, dayDifference, makeClock, offsetMinutes, relativeDay } from "./time";
import {
  defaultUnits,
  formatDistance,
  formatDuration,
  formatDurationDelta,
  formatPrecipitation,
  formatPressure,
  formatTemperature,
  formatTemperatureDelta,
  formatWind,
  IMPERIAL,
  METRIC,
  num,
} from "./units";

describe("units", () => {
  it("converts temperatures and keeps the degree sign", () => {
    expect(formatTemperature(0, "f")).toBe("32°");
    expect(formatTemperature(-40, "f")).toBe("-40°");
    expect(formatTemperature(18.64, "c", 1)).toBe("18.6°");
    expect(formatTemperature(Number.NaN, "c")).toBe("–");
  });

  it("converts temperature differences without the 32° offset", () => {
    expect(formatTemperatureDelta(5, "f")).toBe("+9°");
    expect(formatTemperatureDelta(-2, "c")).toBe("−2°");
    expect(formatTemperatureDelta(0.2, "c")).toBe("±0°");
  });

  it("converts wind speeds", () => {
    expect(formatWind(100, "mph")).toBe("62 mph");
    expect(formatWind(36, "ms")).toBe("10 m/s");
    expect(formatWind(18, "ms")).toBe("5.0 m/s");
    expect(formatWind(18.52, "kn")).toBe("10 kn");
  });

  it("shows trace precipitation instead of rounding it to zero", () => {
    expect(formatPrecipitation(0, "mm")).toBe("0 mm");
    expect(formatPrecipitation(0.04, "mm")).toBe("<0.1 mm");
    expect(formatPrecipitation(2.46, "mm")).toBe("2.5 mm");
    expect(formatPrecipitation(25.4, "in")).toBe("1.00 in");
    expect(formatPrecipitation(0.1, "in")).toBe("<0.01 in");
  });

  it("converts pressure and distance", () => {
    expect(formatPressure(1013.25, "inhg")).toBe("29.92 inHg");
    expect(formatPressure(1013.25, "mmhg")).toBe("760 mmHg");
    expect(formatDistance(850, "km")).toBe("850 m");
    expect(formatDistance(51540, "km")).toBe("52 km");
    expect(formatDistance(16093.44, "mi")).toBe("10 mi");
  });

  it("formats durations", () => {
    expect(formatDuration(38_520)).toBe("10h 42m");
    expect(formatDuration(1800)).toBe("30m");
    expect(formatDurationDelta(112)).toBe("+1m 52s");
    expect(formatDurationDelta(-45)).toBe("−45s");
  });

  it("never shows a negative zero", () => {
    expect(num(-0.2)).toBe("0");
  });

  it("defaults to imperial only where it's the everyday system", () => {
    expect(defaultUnits("en-US")).toEqual(IMPERIAL);
    expect(defaultUnits("es-AR")).toEqual(METRIC);
    expect(defaultUnits("en-GB")).toEqual(METRIC);
    expect(defaultUnits(undefined)).toEqual(METRIC);
  });
});

describe("time at the place", () => {
  // 2026-11-06 04:15 UTC is 01:15 in Buenos Aires (UTC−3, no daylight saving time).
  const ts = Date.UTC(2026, 10, 6, 4, 15) / 1000;

  it("formats in the place's zone, not the browser's", () => {
    const clock = makeClock("America/Argentina/Buenos_Aires", false);
    expect(clock.time(ts)).toBe("01:15");
    expect(clock.hour(ts)).toBe("01:15");
    expect(clock.dateKey(ts)).toBe("2026-11-06");
    expect(clock.weekday(ts)).toBe("Fri");
    expect(clock.hourOfDay(ts)).toBe(1);
  });

  it("supports a 12-hour clock with plain spaces", () => {
    const clock = makeClock("Asia/Tokyo", true);
    expect(clock.time(ts)).toBe("1:15 PM");
    expect(clock.hour(ts)).toBe("1 PM");
  });

  it("follows daylight saving time", () => {
    expect(offsetMinutes("Europe/Madrid", Date.UTC(2026, 6, 1) / 1000)).toBe(120);
    expect(offsetMinutes("Europe/Madrid", Date.UTC(2026, 0, 15) / 1000)).toBe(60);
    expect(offsetMinutes("Asia/Kolkata", ts)).toBe(330);
  });

  it("falls back to UTC for an unknown zone", () => {
    expect(makeClock("Not/AZone", false).timezone).toBe("UTC");
  });

  it("counts days across month and leap-year boundaries", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(dayDifference("2026-11-08", "2026-11-06")).toBe(2);
  });

  it("names nearby days", () => {
    const clock = makeClock("America/Argentina/Buenos_Aires", false);
    expect(relativeDay(clock, ts, ts)).toBe("Today");
    expect(relativeDay(clock, ts + 86400, ts)).toBe("Tomorrow");
    expect(relativeDay(clock, ts + 2 * 86400, ts)).toBe("Sun");
    expect(relativeDay(clock, ts + 2 * 86400, ts, true)).toBe("Sunday");
  });
});
