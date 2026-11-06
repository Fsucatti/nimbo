/**
 * High and low water from an hourly sea-level series. The peaks are refined between hours with a
 * parabola through the three nearest points, so times are approximate to a few minutes.
 */

export interface TideTurn {
  ts: number;
  /** Meters relative to mean sea level. */
  height: number;
  kind: "high" | "low";
}

export function findTides(time: readonly number[], level: readonly number[], minRange = 0.05): TideTurn[] {
  const turns: TideTurn[] = [];
  for (let i = 1; i < level.length - 1; i++) {
    const [a, b, c] = [level[i - 1], level[i], level[i + 1]];
    if (![a, b, c].every(Number.isFinite)) continue;
    const isHigh = b > a && b >= c;
    const isLow = b < a && b <= c;
    if (!isHigh && !isLow) continue;
    const curvature = a - 2 * b + c;
    const shift = curvature === 0 ? 0 : (a - c) / (2 * curvature);
    const step = time[i + 1] - time[i];
    const height = b - ((a - c) * shift) / 4;
    turns.push({ ts: Math.round(time[i] + shift * step), height, kind: isHigh ? "high" : "low" });
  }
  // Drop wiggles: keep a turn only if it differs enough from the previous kept turn.
  const kept: TideTurn[] = [];
  for (const turn of turns) {
    const previous = kept[kept.length - 1];
    if (!previous) {
      kept.push(turn);
      continue;
    }
    if (previous.kind === turn.kind) {
      // Two highs in a row: keep the more extreme one.
      if ((turn.kind === "high" && turn.height > previous.height) || (turn.kind === "low" && turn.height < previous.height)) kept[kept.length - 1] = turn;
      continue;
    }
    if (Math.abs(turn.height - previous.height) >= minRange) kept.push(turn);
  }
  return kept;
}
