/** Small statistics helpers that ignore missing values (NaN). */

export function finite(values: readonly number[]): number[] {
  return values.filter((value) => Number.isFinite(value));
}

export function mean(values: readonly number[]): number {
  const list = finite(values);
  if (list.length === 0) return Number.NaN;
  return list.reduce((total, value) => total + value, 0) / list.length;
}

/** Percentile with linear interpolation, p in 0–100. */
export function percentile(values: readonly number[], p: number): number {
  const list = finite(values).sort((a, b) => a - b);
  if (list.length === 0) return Number.NaN;
  if (list.length === 1) return list[0];
  const rank = (p / 100) * (list.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  return list[low] + (list[high] - list[low]) * (rank - low);
}

export function median(values: readonly number[]): number {
  return percentile(values, 50);
}

export function extent(values: readonly number[]): [number, number] {
  const list = finite(values);
  if (list.length === 0) return [Number.NaN, Number.NaN];
  return [Math.min(...list), Math.max(...list)];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Rounds a domain outwards to "nice" steps, for chart axes. */
export function niceDomain(min: number, max: number, step: number): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, step];
  let low = Math.floor(min / step) * step;
  let high = Math.ceil(max / step) * step;
  if (low === high) {
    low -= step;
    high += step;
  }
  return [low, high];
}
