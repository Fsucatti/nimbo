import { describe, expect, it } from "vitest";
import * as SunCalc from "suncalc";
import { dayLength, moonNow, moonPhaseName, nextPhase, sunDay } from "./astro";
import { anchorInYear, compare, computeNormals, yearRange, type YearWindow } from "./climate";
import { makeClock } from "./time";

describe("sun", () => {
  it("gives London's sunrise on the June solstice in local time", () => {
    const noon = Date.UTC(2026, 5, 21, 11) / 1000;
    const day = sunDay(noon, 51.5074, -0.1278, "Europe/London");
    const clock = makeClock("Europe/London", false);
    expect(clock.time(day.sunrise!)).toMatch(/^04:4\d$/);
    expect(clock.time(day.sunset!)).toMatch(/^21:2\d$/);
    expect(day.noonAltitude).toBeGreaterThan(61);
    expect(day.noonAltitude).toBeLessThan(63);
  });

  it("handles polar day and night", () => {
    const june = Date.UTC(2026, 5, 21, 12) / 1000;
    expect(sunDay(june, 78.22, 15.65, "Arctic/Longyearbyen").alwaysUp).toBe(true);
    expect(dayLength(june, 78.22, 15.65, "Arctic/Longyearbyen")).toBe(86400);
    const december = Date.UTC(2026, 11, 21, 12) / 1000;
    expect(dayLength(december, 78.22, 15.65, "Arctic/Longyearbyen")).toBe(0);
  });
});

describe("moon", () => {
  it("names phases by snapping to the nearest eighth", () => {
    expect(moonPhaseName(0)).toBe("New moon");
    expect(moonPhaseName(0.49)).toBe("Full moon");
    expect(moonPhaseName(0.3)).toBe("First quarter");
    expect(moonPhaseName(0.97)).toBe("New moon");
    expect(moonPhaseName(0.86)).toBe("Waning crescent");
  });

  it("finds the next full moon, and the phase there is full", () => {
    const start = Date.UTC(2026, 10, 6) / 1000;
    const full = nextPhase(start, 0.5);
    expect(full).not.toBeNull();
    expect(full! - start).toBeLessThan(30 * 86400);
    expect(Math.abs(SunCalc.getMoonIllumination(new Date(full! * 1000)).phase - 0.5)).toBeLessThan(0.001);
  });

  it("reports illumination between 0 and 1", () => {
    const moon = moonNow(Date.UTC(2026, 10, 6) / 1000, -34.6, -58.4);
    expect(moon.fraction).toBeGreaterThanOrEqual(0);
    expect(moon.fraction).toBeLessThanOrEqual(1);
    expect(moon.ageDays).toBeLessThan(29.6);
  });
});

describe("climate normals", () => {
  const anchor = "11-06";
  function year(y: number, warmth: number): YearWindow {
    const offsets = Array.from({ length: 53 }, (_, i) => i - 33);
    return {
      year: y,
      offsets,
      tempMax: offsets.map(() => 24 + warmth),
      tempMin: offsets.map(() => 14 + warmth),
      precipitation: offsets.map((o) => (o % 4 === 0 ? 4 : 0)),
    };
  }

  it("averages highs and lows and finds the records for the date", () => {
    const years = Array.from({ length: 30 }, (_, i) => year(1991 + i, i === 10 ? 6 : i === 20 ? -5 : 0));
    const normals = computeNormals(anchor, years);
    const today = normals.offsets.indexOf(0);
    expect(normals.offsets[0]).toBe(-30);
    expect(normals.offsets[normals.offsets.length - 1]).toBe(15);
    expect(normals.maxMean[today]).toBeCloseTo(24 + (6 - 5) / 30, 5);
    expect(normals.records?.warmest).toEqual({ value: 30, year: 2001 });
    expect(normals.records?.coldest).toEqual({ value: 9, year: 2011 });
    // In the seven days around the date, only the date itself is rainy, with 4 mm.
    expect(normals.precipMean[today]).toBeCloseTo(4 / 7, 5);
  });

  it("compares actual days with normal", () => {
    const normals = computeNormals(anchor, Array.from({ length: 30 }, (_, i) => year(1991 + i, 0)));
    const actual = [-2, -1].map((offset) => ({ offset, tempMax: 26, tempMin: 16, precipitation: 1 }));
    const result = compare(normals, actual, -30, -1);
    expect(result?.anomaly).toBeCloseTo(2, 5);
    expect(result?.precipitation).toBe(2);
  });

  it("handles February 29 and the request ranges", () => {
    expect(anchorInYear("02-29", 2023)).toBe("2023-02-28");
    expect(anchorInYear("02-29", 2024)).toBe("2024-02-29");
    expect(yearRange("01-10", 2000)).toEqual({ start: "1999-12-08", end: "2000-01-28" });
  });
});
