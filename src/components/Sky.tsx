/**
 * The living sky behind the current reading. Everything in it comes from data:
 * - gradient: the real sun altitude at the place, cloud cover and precipitation;
 * - sun or moon: placed along today's path, the moon drawn at its real phase;
 * - three cloud layers: low, middle and high cloud cover, each at its own height;
 * - stars: only when it's dark and the sky is clear enough;
 * - rain, drizzle, snow or hail at the current intensity, slanted by the wind.
 * Motion stops for people who ask for reduced motion, and while the sky is off screen.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { SkyColors } from "../lib/sky";
import type { ConditionGroup } from "../lib/wmo";

export interface SkyScene {
  colors: SkyColors;
  /**
   * Where the sun sits on today's arc: `progress` runs from rise (0) to set (1) and `height` from
   * the horizon (0) to its highest point today (1). Null below the horizon. CSS maps both onto
   * the screen, so the arc can differ between phone and desktop layouts.
   */
  sun: { progress: number; height: number } | null;
  moon: { progress: number; height: number; fraction: number; waxing: boolean; southern: boolean } | null;
  clouds: { low: number; mid: number; high: number };
  /** Total cloud cover, 0–100. */
  cover: number;
  group: ConditionGroup;
  /** Precipitation now, mm/h. */
  precipitation: number;
  snowing: boolean;
  hail: boolean;
  /** Direction the wind comes from, degrees, and its speed in km/h. */
  windDirection: number;
  windSpeed: number;
  /** 0–1: how visible stars are. */
  stars: number;
  /** 0–1: how much daylight, for coloring clouds. */
  daylight: number;
  fog: number;
  seed: string;
}

/** Small deterministic random generator, so a place always gets the same clouds and stars. */
function random(seedText: string) {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i++) seed = Math.imul(seed ^ seedText.charCodeAt(i), 16777619);
  return () => {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507);
    seed = Math.imul(seed ^ (seed >>> 13), 3266489909);
    seed ^= seed >>> 16;
    return (seed >>> 0) / 4294967296;
  };
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function mixHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

interface Puff {
  cx: number;
  cy: number;
  r: number;
}
interface CloudShape {
  x: number;
  y: number;
  scale: number;
  puffs: Puff[];
  opacity: number;
}

/** A cumulus-like cluster of circles, about 100 units wide. */
function cluster(rand: () => number): Puff[] {
  const count = 4 + Math.floor(rand() * 4);
  const puffs: Puff[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const r = 14 + Math.sin(t * Math.PI) * 14 + rand() * 6;
    puffs.push({ cx: t * 100 - 50 + (rand() - 0.5) * 8, cy: -r * 0.55 + (rand() - 0.5) * 6, r });
  }
  return puffs;
}

function makeLayer(seed: string, cover: number, kind: "low" | "mid" | "high"): CloudShape[] {
  const rand = random(`${seed}:${kind}`);
  const max = kind === "high" ? 7 : kind === "mid" ? 8 : 10;
  const count = Math.round((Math.min(100, Math.max(0, cover)) / 100) * max);
  const band = kind === "high" ? [0.05, 0.32] : kind === "mid" ? [0.18, 0.52] : [0.42, 0.84];
  const size = kind === "high" ? [1.4, 2.6] : kind === "mid" ? [0.8, 1.4] : [1.3, 2.3];
  const shapes: CloudShape[] = [];
  for (let i = 0; i < count; i++) {
    shapes.push({
      x: (i + 0.5) / count + (rand() - 0.5) * (0.9 / count),
      y: band[0] + rand() * (band[1] - band[0]),
      scale: size[0] + rand() * (size[1] - size[0]),
      puffs: kind === "high" ? [{ cx: 0, cy: 0, r: 0 }] : cluster(rand),
      opacity: kind === "high" ? 0.28 + rand() * 0.3 : kind === "mid" ? 0.62 + rand() * 0.25 : 0.82 + rand() * 0.15,
    });
  }
  return shapes;
}

function Stars({ seed, opacity }: { seed: string; opacity: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || opacity <= 0.02) return;
    const draw = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      const rand = random(`${seed}:stars`);
      const count = Math.round((width * height) / 2600);
      for (let i = 0; i < count; i++) {
        const x = rand() * width;
        // Fewer stars near the horizon, where the air is thicker.
        const y = rand() ** 1.6 * height * 0.8;
        const r = 0.35 + rand() ** 3 * 1.3;
        ctx.globalAlpha = 0.35 + rand() * 0.65;
        ctx.fillStyle = rand() > 0.85 ? "#ffe9c4" : "#ffffff";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [seed, opacity]);
  if (opacity <= 0.02) return null;
  return <canvas ref={ref} className="sky-stars" style={{ opacity }} aria-hidden="true" />;
}

interface Particle {
  x: number;
  y: number;
  speed: number;
  size: number;
  sway: number;
}

function Precipitation({ scene, reduced }: { scene: SkyScene; reduced: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { precipitation, snowing, hail, windDirection, windSpeed, group } = scene;
  const active = precipitation >= 0.05 || group === "drizzle" || group === "rain" || group === "snow" || group === "storm";

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !active) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let width = 0;
    let height = 0;
    let frame = 0;
    let last = performance.now();
    let visible = true;
    const rand = random(`${scene.seed}:rain`);
    const rate = Math.max(precipitation, group === "drizzle" ? 0.2 : 0.4);
    const density = snowing ? Math.min(260, 50 + rate * 60) : Math.min(420, 50 + rate * 55);
    // Wind from the west pushes rain to the right. Up to ~25° of slant in strong wind.
    const towardsRight = Math.sin((windDirection * Math.PI) / 180) < 0 ? 1 : -1;
    const slant = towardsRight * Math.min(0.45, windSpeed / 90);
    let particles: Particle[] = [];

    const resize = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const box = canvas.getBoundingClientRect();
      width = box.width;
      height = box.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.round((density * width) / 1200);
      particles = Array.from({ length: count }, () => ({
        x: rand() * width,
        y: rand() * height,
        speed: snowing ? 25 + rand() * 45 : 520 + rand() * 380,
        size: snowing ? 1 + rand() * 2.2 : group === "drizzle" ? 5 + rand() * 4 : 10 + rand() * 10,
        sway: rand() * Math.PI * 2,
      }));
    };

    const draw = (dt: number) => {
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = "round";
      const color = scene.colors.ink === "light" ? "rgba(225, 236, 248, " : "rgba(40, 62, 90, ";
      for (const p of particles) {
        if (snowing) {
          p.sway += dt * 1.4;
          p.y += p.speed * dt;
          p.x += (Math.sin(p.sway) * 18 + slant * 40) * dt;
          ctx.fillStyle = `${color}${0.55 + p.size / 8})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else if (hail) {
          p.y += p.speed * dt * 1.1;
          p.x += slant * p.speed * dt;
          ctx.fillStyle = `${color}0.8)`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
          ctx.fill();
        } else {
          p.y += p.speed * dt;
          p.x += slant * p.speed * dt;
          ctx.strokeStyle = `${color}${group === "drizzle" ? 0.35 : 0.42})`;
          ctx.lineWidth = group === "drizzle" ? 1 : 1.3;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - slant * p.size, p.y - p.size);
          ctx.stroke();
        }
        if (p.y > height + 20) {
          p.y = -20;
          p.x = rand() * width;
        }
        if (p.x > width + 20) p.x = -20;
        if (p.x < -20) p.x = width + 20;
      }
    };

    const loop = (time: number) => {
      const dt = Math.min(0.05, (time - last) / 1000);
      last = time;
      if (visible && !document.hidden) draw(dt);
      frame = requestAnimationFrame(loop);
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const viewObserver = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    viewObserver.observe(canvas);
    if (reduced) draw(0);
    else frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      viewObserver.disconnect();
    };
  }, [active, precipitation, snowing, hail, windDirection, windSpeed, group, reduced, scene.seed, scene.colors.ink]);

  if (!active) return null;
  return <canvas ref={ref} className="sky-precipitation" aria-hidden="true" />;
}

function Clouds({ scene, reduced }: { scene: SkyScene; reduced: boolean }) {
  const layers = useMemo(
    () => ({
      high: makeLayer(scene.seed, scene.clouds.high, "high"),
      mid: makeLayer(scene.seed, scene.clouds.mid, "mid"),
      low: makeLayer(scene.seed, scene.clouds.low, "low"),
    }),
    [scene.seed, scene.clouds.high, scene.clouds.mid, scene.clouds.low],
  );
  const { daylight, colors, group } = scene;
  const wet = group === "rain" || group === "storm" || group === "drizzle";
  const lit = mixHex("#2a3550", "#ffffff", daylight);
  const warm = mixHex(lit, colors.glow, daylight > 0.05 && daylight < 0.75 ? 0.35 : 0.08);
  const base = mixHex(warm, wet ? "#3b4552" : "#8e9aa7", wet ? 0.55 : 0.3 + (1 - daylight) * 0.2);
  const drift = Math.sin((scene.windDirection * Math.PI) / 180) < 0 ? "right" : "left";
  const style = { "--cloud-top": warm, "--cloud-base": base } as CSSProperties;
  const overcast = Math.max(scene.clouds.low, scene.clouds.mid) >= 88;

  return (
    <svg className={`sky-clouds${reduced ? "" : ` drift-${drift}`}`} viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid slice" style={style} aria-hidden="true">
      <defs>
        <filter id="soft-high" x="-50%" y="-200%" width="200%" height="500%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <linearGradient id="cloud-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--cloud-top)" />
          <stop offset="1" stopColor="var(--cloud-base)" />
        </linearGradient>
        <linearGradient id="deck-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--cloud-base)" stopOpacity="0.9" />
          <stop offset="0.7" stopColor="var(--cloud-top)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--cloud-top)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="cloud-layer cloud-high" filter="url(#soft-high)">
        {layers.high.map((cloud, i) => (
          <ellipse
            key={i}
            cx={cloud.x * 1000}
            cy={cloud.y * 500}
            rx={90 * cloud.scale}
            ry={5 + cloud.scale * 2}
            fill="var(--cloud-top)"
            opacity={cloud.opacity}
            transform={`rotate(${-6 + (i % 3) * 4} ${cloud.x * 1000} ${cloud.y * 500})`}
          />
        ))}
      </g>
      {overcast && <rect className="cloud-deck" x="-100" y="-20" width="1200" height="330" fill="url(#deck-fill)" />}
      {(["mid", "low"] as const).map((kind) => (
        <g key={kind} className={`cloud-layer cloud-${kind}`} filter="url(#soft)">
          {layers[kind].map((cloud, i) => (
            <g key={i} transform={`translate(${cloud.x * 1000} ${cloud.y * 500}) scale(${cloud.scale})`} opacity={cloud.opacity}>
              {cloud.puffs.map((puff, j) => (
                <circle key={j} cx={puff.cx} cy={puff.cy} r={puff.r} fill="url(#cloud-fill)" />
              ))}
              <rect x={-52} y={-8} width={104} height={8} rx={4} fill="var(--cloud-base)" />
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}

function MoonDisc({ fraction, waxing }: { fraction: number; waxing: boolean }) {
  // The lit part is a half disc plus (gibbous) or minus (crescent) an ellipse.
  const r = 20;
  const k = Math.abs(1 - 2 * fraction) * r;
  const sweepOuter = waxing ? 1 : 0;
  const sweepInner = fraction > 0.5 ? sweepOuter : 1 - sweepOuter;
  const path = `M 0 ${-r} A ${r} ${r} 0 0 ${sweepOuter} 0 ${r} A ${k} ${r} 0 0 ${sweepInner} 0 ${-r} Z`;
  return (
    <svg viewBox="-24 -24 48 48" className="sky-moon-disc" aria-hidden="true">
      <circle r={r} className="moon-dark" />
      <path d={path} className="moon-lit" />
    </svg>
  );
}

function Lightning({ reduced }: { reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reduced) return;
    let timer = 0;
    const flash = () => {
      const node = ref.current;
      if (node && !document.hidden) {
        node.classList.remove("flash");
        void node.offsetWidth;
        node.classList.add("flash");
      }
      timer = window.setTimeout(flash, 6000 + Math.random() * 9000);
    };
    timer = window.setTimeout(flash, 2500);
    return () => clearTimeout(timer);
  }, [reduced]);
  return <div ref={ref} className="sky-lightning" aria-hidden="true" />;
}

export function Sky({ scene }: { scene: SkyScene }) {
  const reduced = usePrefersReducedMotion();
  const { colors } = scene;
  const style = {
    "--sky-top": colors.top,
    "--sky-middle": colors.middle,
    "--sky-horizon": colors.horizon,
    "--sky-glow": colors.glow,
  } as CSSProperties;

  return (
    <div className="sky" style={style} aria-hidden="true">
      <Stars seed={scene.seed} opacity={scene.stars} />
      {scene.sun && (
        <div
          className="sky-body sky-sun"
          // A full cloud deck hides the disc and leaves only a soft bright patch.
          style={{ "--p": scene.sun.progress, "--h": scene.sun.height, opacity: 1 - 0.8 * Math.min(1, scene.cover / 100) ** 2 } as CSSProperties}
        >
          <span className="sky-sun-disc" />
        </div>
      )}
      {!scene.sun && scene.moon && (
        <div
          className={`sky-body sky-moon${scene.moon.southern ? " is-southern" : ""}`}
          style={{ "--p": scene.moon.progress, "--h": scene.moon.height, opacity: 1 - 0.85 * Math.min(1, scene.cover / 100) ** 2 } as CSSProperties}
        >
          <MoonDisc fraction={scene.moon.fraction} waxing={scene.moon.waxing} />
        </div>
      )}
      <Clouds scene={scene} reduced={reduced} />
      {scene.fog > 0 && <div className="sky-fog" style={{ opacity: scene.fog }} />}
      <Precipitation scene={scene} reduced={reduced} />
      {scene.group === "storm" && <Lightning reduced={reduced} />}
      <div className="sky-horizon" />
    </div>
  );
}
