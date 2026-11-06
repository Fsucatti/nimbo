/**
 * Nimbo's own weather icons, drawn on a 64-unit grid. Colors come from CSS variables so the
 * icons follow the theme. `animated` adds slow motion, used only in the large current reading.
 */
import { useId } from "react";
import { condition, type IconKind } from "../lib/wmo";

/** Two circles and a flat base: (26,31) r13 and (44,35) r9, tangent to y=44. */
const CLOUD = "M26 44A13 13 0 1 1 38.6 27.8A9 9 0 1 1 44 44Z";

function Cloud({ x = 0, y = 0, scale = 1, tone = "light" }: { x?: number; y?: number; scale?: number; tone?: "light" | "dark" }) {
  return (
    <path
      d={CLOUD}
      transform={`translate(${x} ${y}) scale(${scale})`}
      className={tone === "dark" ? "wi-cloud wi-cloud-dark" : "wi-cloud"}
      strokeWidth={2.4 / scale}
      strokeLinejoin="round"
    />
  );
}

function Sun({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * Math.PI) / 4;
    const inner = r + 4.5;
    const outer = r + 9;
    return (
      <line
        key={i}
        x1={cx + Math.cos(angle) * inner}
        y1={cy + Math.sin(angle) * inner}
        x2={cx + Math.cos(angle) * outer}
        y2={cy + Math.sin(angle) * outer}
        className="wi-ray"
        strokeWidth={3.6}
        strokeLinecap="round"
      />
    );
  });
  return (
    <g className="wi-sun">
      <g className="wi-rays" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        {rays}
      </g>
      <circle cx={cx} cy={cy} r={r} className="wi-sun-disc" />
    </g>
  );
}

function Moon({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <g className="wi-moon">
      <mask id={`m${id}`}>
        <rect x="0" y="0" width="64" height="64" fill="#fff" />
        <circle cx={cx + r * 0.55} cy={cy - r * 0.45} r={r * 0.86} fill="#000" />
      </mask>
      <circle cx={cx} cy={cy} r={r} mask={`url(#m${id})`} className="wi-moon-disc" />
    </g>
  );
}

function Drops({ count, heavy = false }: { count: number; heavy?: boolean }) {
  const xs = count === 2 ? [27, 39] : count === 3 ? [24, 33, 42] : [20, 27, 34, 41, 48];
  return (
    <g className="wi-drops">
      {xs.map((x, i) => (
        <line
          key={x}
          x1={x}
          y1={49 + (i % 2) * 2}
          x2={x - 3}
          y2={(heavy ? 59 : 56) + (i % 2) * 2}
          className="wi-drop"
          strokeWidth={3.4}
          strokeLinecap="round"
          style={{ animationDelay: `${i * 0.23}s` }}
        />
      ))}
    </g>
  );
}

function Dots({ count = 3 }: { count?: number }) {
  const xs = count === 3 ? [25, 34, 43] : [22, 30, 38, 46];
  return (
    <g className="wi-drops">
      {xs.map((x, i) => (
        <circle key={x} cx={x - (i % 2)} cy={52 + (i % 2) * 4} r={2.2} className="wi-dot" style={{ animationDelay: `${i * 0.3}s` }} />
      ))}
    </g>
  );
}

function Flakes({ count }: { count: number }) {
  const spots = count === 3 ? [[24, 52], [34, 57], [44, 52]] : [[20, 51], [28, 57], [36, 51], [44, 57], [50, 50]];
  return (
    <g className="wi-flakes">
      {spots.map(([x, y], i) => (
        <g key={`${x}-${y}`} className="wi-flake" style={{ animationDelay: `${i * 0.35}s` }}>
          {[0, 60, 120].map((angle) => (
            <line
              key={angle}
              x1={x - 3.4 * Math.cos((angle * Math.PI) / 180)}
              y1={y - 3.4 * Math.sin((angle * Math.PI) / 180)}
              x2={x + 3.4 * Math.cos((angle * Math.PI) / 180)}
              y2={y + 3.4 * Math.sin((angle * Math.PI) / 180)}
              strokeWidth={2.2}
              strokeLinecap="round"
            />
          ))}
        </g>
      ))}
    </g>
  );
}

function Bolt() {
  return <path d="M35 43 L27.5 54.5 H33.5 L30 63 L41.5 50.5 H35.5 L39 43 Z" className="wi-bolt" strokeLinejoin="round" strokeWidth={1.6} />;
}

function Fog() {
  return (
    <g className="wi-fog">
      {[
        [12, 50, 44],
        [18, 56, 50],
        [10, 62, 38],
      ].map(([x1, y, x2]) => (
        <line key={y} x1={x1} y1={y - 8} x2={x2 + 8} y2={y - 8} strokeWidth={3.4} strokeLinecap="round" />
      ))}
    </g>
  );
}

function Hail() {
  return (
    <g className="wi-hail">
      {[
        [24, 55],
        [44, 56],
      ].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r={3} strokeWidth={2} />
      ))}
    </g>
  );
}

function shapes(kind: IconKind, isDay: boolean) {
  const sky = (cx: number, cy: number, r: number) => (isDay ? <Sun cx={cx} cy={cy} r={r} /> : <Moon cx={cx} cy={cy} r={r + 2} />);
  switch (kind) {
    case "clear":
      return isDay ? <Sun cx={32} cy={32} r={12} /> : <Moon cx={32} cy={32} r={16} />;
    case "mostly-clear":
      return (
        <>
          {sky(26, 25, 10)}
          <Cloud x={14} y={14} scale={0.78} />
        </>
      );
    case "partly-cloudy":
      return (
        <>
          {sky(23, 22, 9)}
          <Cloud x={2} y={6} scale={0.98} />
        </>
      );
    case "cloudy":
      return (
        <>
          <Cloud x={8} y={-4} scale={0.82} tone="dark" />
          <Cloud x={-4} y={6} scale={1} />
        </>
      );
    case "fog":
      return (
        <>
          <Cloud x={-1} y={-8} scale={0.96} />
          <Fog />
        </>
      );
    case "drizzle":
      return (
        <>
          <Cloud x={-1} y={-6} scale={1} />
          <Dots count={3} />
        </>
      );
    case "rain":
      return (
        <>
          <Cloud x={-1} y={-6} scale={1} />
          <Drops count={3} />
        </>
      );
    case "heavy-rain":
      return (
        <>
          <Cloud x={-1} y={-6} scale={1} tone="dark" />
          <Drops count={5} heavy />
        </>
      );
    case "freezing-rain":
    case "sleet":
      return (
        <>
          <Cloud x={-1} y={-6} scale={1} />
          <Drops count={2} />
          <Flakes count={3} />
        </>
      );
    case "snow":
      return (
        <>
          <Cloud x={-1} y={-6} scale={1} />
          <Flakes count={3} />
        </>
      );
    case "heavy-snow":
      return (
        <>
          <Cloud x={-1} y={-6} scale={1} tone="dark" />
          <Flakes count={5} />
        </>
      );
    case "showers":
      return (
        <>
          {sky(22, 18, 8)}
          <Cloud x={2} y={-1} scale={0.94} />
          <Drops count={3} />
        </>
      );
    case "snow-showers":
      return (
        <>
          {sky(22, 18, 8)}
          <Cloud x={2} y={-1} scale={0.94} />
          <Flakes count={3} />
        </>
      );
    case "thunder":
      return (
        <>
          <Cloud x={-1} y={-8} scale={1} tone="dark" />
          <Drops count={2} />
          <Bolt />
        </>
      );
    case "hail":
      return (
        <>
          <Cloud x={-1} y={-8} scale={1} tone="dark" />
          <Hail />
          <Bolt />
        </>
      );
  }
}

interface Props {
  code: number;
  isDay: boolean;
  size?: number;
  animated?: boolean;
  /** Accessible name; omit when the condition is written next to the icon. */
  label?: string;
}

export function WeatherIcon({ code, isDay, size = 32, animated = false, label }: Props) {
  const kind = condition(code).icon;
  return (
    <svg
      className={`wi wi-${kind}${animated ? " wi-animated" : ""}`}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {shapes(kind, isDay)}
    </svg>
  );
}
