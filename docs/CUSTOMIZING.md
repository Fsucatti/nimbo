# How to customize Nimbo

## Colors

They're at the top of `src/styles/base.css`: the light theme under `:root` and the dark one under `:root[data-theme="night"]`. Each measure has its own color variable, such as `--temp` or `--precip`, used by every chart.

If you change a chart color, check that the colors that share a chart stay easy to tell apart, also for people with color blindness.

The sky's colors are in `src/lib/sky.ts`: one list for clear skies and one for overcast, by height of the sun.

## Wording and rules

| What | Where |
|---|---|
| Summary under the temperature | `src/lib/summary.ts` |
| "Worth knowing" items and their thresholds | `THRESHOLDS` in `src/lib/highlights.ts` |
| "Plan your day" scores | `src/lib/outdoor.ts` |
| Beaufort, UV, air quality and pollen categories | `src/lib/comfort.ts` |
| Weather code names and icons | `src/lib/wmo.ts` |

Run `npm test` after changing a rule. The tests cover each of these files.

## Weather data

The variables requested from Open-Meteo are listed at the top of `src/api/forecast.ts`. To add one:

1. Add it to `CURRENT`, `HOURLY` or `DAILY` with a short name.
2. Use it through the forecast object, for example `view.forecast.hourly.yourName`.

Every value arrives in metric units and is converted in `src/lib/units.ts`.

## Models

The models compared in the "Models" section are in `MODELS`, in `src/api/models.ts`. The [Open-Meteo documentation](https://open-meteo.com/en/docs) lists the available ones.

## Add a section

1. Create it in `src/sections/`, wrapped in `Section` from `src/components/Section.tsx`.
2. Add it to `Dashboard` in `src/components/Dashboard.tsx`, and to `links` there if it should appear in the section bar.
3. If it needs new data, add a fetch function in `src/api/` and a hook in `src/state/queries.ts`. Sections lower on the page can load only when they come into view with `useSeen`, as `Climate` and `Models` do.

## Test data

Browser tests use saved answers in `tests/fixtures/`. To refresh them with today's data:

```bash
node scripts/fixtures.mjs
```

## Before publishing

```bash
npm run check
```

```bash
npm test
```

```bash
npm run test:e2e
```
