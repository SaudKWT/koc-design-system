/**
 * What a desktop without hardware WebGL sees — VDI/Citrix sessions included
 * (see createContext in gl.ts for why software GL is refused).
 *
 * Not an apology: the same section A–A′, flat, as a geologist would draw it —
 * the same strata table, the same fold, the same surveyed well, the same
 * lithology conventions, at the same 1:1 scale. And the rig as an elevation
 * drawn from the same constants the 3D model is built from.
 */

import { useId } from "react";

import { BLOCK, CONTACTS, FORMATIONS, owcFor, topDepthAt, type Lithology } from "./strata";
import { ACTIVE_SURVEY } from "./surveys";
import { RIG } from "./rig";

const TINT: Record<Lithology, string> = {
  sand: "var(--chart-2) 20%",
  sandstone: "var(--chart-2) 12%",
  shale: "var(--foreground) 12%",
  limestone: "var(--chart-5) 13%",
  dolomite: "var(--chart-4) 10%",
  anhydrite: "var(--chart-1) 6%",
};

/** Section A–A′ along the face of the cut (z = 0), 10 ft per unit both ways. */
export function SectionFallback() {
  const uid = useId().replace(/:/g, "");
  const { x0, x1, depth } = BLOCK;
  const U = 10; // ft per SVG unit
  const W = (x1 - x0) / U;
  const H = depth / U;
  const top = 40; // headroom for the rig and pad
  const sx = (x: number) => (x - x0) / U;
  const sy = (d: number) => top + d / U;
  const xs = Array.from({ length: 101 }, (_, i) => x0 + ((x1 - x0) * i) / 100);
  const curve = (t: number) => xs.map((x) => [sx(x), sy(Math.min(depth, topDepthAt(t, x, 0)))] as const);

  const bands = FORMATIONS.filter((f) => f.top < depth).map((f, i, arr) => {
    const next = arr[i + 1];
    const a = curve(f.top);
    const b = next ? curve(next.top) : xs.map((x) => [sx(x), sy(depth)] as const);
    const d = `M${a.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")}L${b
      .slice()
      .reverse()
      .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
      .join("L")}Z`;
    return { f, d, owc: owcFor(f), mid: (a[a.length - 1][1] + b[b.length - 1][1]) / 2 };
  });

  const drilledTo = 0.74;
  const pts = ACTIVE_SURVEY.points;
  const cut = Math.round(pts.length * drilledTo);
  const path = (from: number, to: number) =>
    pts
      .slice(from, to)
      .filter((_, i) => i % 4 === 0)
      .map((p, i) => `${i ? "L" : "M"}${sx(p[0]).toFixed(1)},${sy(-p[1]).toFixed(1)}`)
      .join("");
  const bit = pts[cut];
  const padX = sx(ACTIVE_SURVEY.plan.surface[0]);

  return (
    <svg viewBox={`-8 0 ${W + 250} ${H + top + 12}`} className="h-full w-full" aria-hidden="true">
      <defs>
        <Patterns uid={uid} />
        {bands
          .filter((b) => b.owc > 0)
          .map((b) => (
            <clipPath key={b.f.name} id={`${uid}-oil-${b.f.name.replace(/\W/g, "")}`}>
              <rect x={0} y={0} width={W} height={sy(b.owc)} />
            </clipPath>
          ))}
      </defs>

      {bands.map(({ f, d }) => (
        <g key={f.name}>
          <path d={d} style={{ fill: `color-mix(in oklab, ${TINT[f.lith]}, var(--card))` }} />
          <path d={d} fill={`url(#${uid}-${f.lith})`} className="text-foreground/25" />
        </g>
      ))}
      {bands
        .filter((b) => b.owc > 0)
        .map(({ f, d }) => (
          <path
            key={`oil-${f.name}`}
            d={d}
            clipPath={`url(#${uid}-oil-${f.name.replace(/\W/g, "")})`}
            style={{ fill: "color-mix(in oklab, var(--chart-2) 62%, var(--card))" }}
          />
        ))}
      {bands.map(({ f, d }) => (
        <path key={`c-${f.name}`} d={d} className="fill-none stroke-foreground/35" strokeWidth={0.6} />
      ))}
      {CONTACTS.filter((c) => c.owc < depth).map((c) => (
        <line key={c.owc} x1={0} x2={W} y1={sy(c.owc)} y2={sy(c.owc)} className="stroke-chart-2" strokeWidth={0.8} strokeDasharray="6 4" opacity={0.7} />
      ))}

      {/* Ground, pad, rig (true scale: 172 ft is 17 units here). */}
      <line x1={0} x2={W} y1={top} y2={top} className="stroke-foreground/60" strokeWidth={1} />
      <rect x={padX - 19} y={top - 1.2} width={38} height={1.2} className="fill-foreground/50" />
      <path
        d={`M${padX - 2},${top} L${padX - 0.55},${top - (RIG.floor + RIG.mast) / U} L${padX + 0.55},${top - (RIG.floor + RIG.mast) / U} L${padX + 2},${top} Z`}
        className="fill-foreground"
      />
      <rect x={padX - 5} y={top - 3} width={10} height={3} className="fill-foreground" />
      <text x={padX + 10} y={top - 14} className="fill-primary font-mono text-[20px] font-semibold">
        Pad A
      </text>

      {/* The active well: drilled solid, plan ahead dashed. */}
      <path d={path(0, cut + 1)} className="fill-none stroke-primary" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      <path d={path(cut, pts.length)} className="fill-none stroke-primary/60" strokeWidth={4} strokeDasharray="10 8" />
      <circle cx={sx(bit[0])} cy={sy(-bit[1])} r={6} className="fill-primary stroke-background" strokeWidth={2} />

      <rect x={0} y={top} width={W} height={H} className="fill-none stroke-foreground/50" strokeWidth={1} />

      {/* Formation names down the right edge. */}
      {(() => {
        let prev = -Infinity;
        return bands
          .filter((b) => b.f.labelled)
          .map(({ f, mid }) => {
            const y = Math.max(mid + 7, prev + 28);
            prev = y;
            return (
              <g key={`l-${f.name}`}>
                <path d={`M${W},${mid} L${W + 14},${y - 7} L${W + 20},${y - 7}`} className="fill-none stroke-muted-foreground/60" strokeWidth={1} />
                <text x={W + 26} y={y} className="fill-foreground text-[22px]">
                  {f.label}
                </text>
              </g>
            );
          });
      })()}
    </svg>
  );
}

/** Lithology fills, to the conventions the 3D shader draws. */
function Patterns({ uid }: { uid: string }) {
  const s = { stroke: "currentColor", strokeWidth: 0.7, fill: "none" } as const;
  return (
    <>
      <pattern id={`${uid}-sand`} width="15" height="15" patternUnits="userSpaceOnUse">
        <circle cx="4" cy="5" r="1.6" {...s} />
        <circle cx="11" cy="11" r="2" {...s} />
      </pattern>
      <pattern id={`${uid}-sandstone`} width="7" height="7" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="0.7" fill="currentColor" />
        <circle cx="5.5" cy="5" r="0.7" fill="currentColor" />
      </pattern>
      <pattern id={`${uid}-shale`} width="15" height="6.4" patternUnits="userSpaceOnUse">
        <line x1="0" y1="3.2" x2="8" y2="3.2" {...s} />
      </pattern>
      <pattern id={`${uid}-limestone`} width="22" height="19.2" patternUnits="userSpaceOnUse">
        <path d="M0,0H22M0,9.6H22M0,0V9.6M11,9.6V19.2" {...s} />
      </pattern>
      <pattern id={`${uid}-dolomite`} width="22" height="19.2" patternUnits="userSpaceOnUse">
        <path d="M0,0H22M0,9.6H22M3,0L0,9.6M14,9.6L11,19.2" {...s} />
      </pattern>
      <pattern id={`${uid}-anhydrite`} width="8.4" height="8.4" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
        <line x1="0" y1="0" x2="0" y2="8.4" {...s} />
      </pattern>
    </>
  );
}

/**
 * The rig as a side elevation — substructure, mast lattice, board, crown, top
 * drive, V-door slide, catwalk and the mud system — from RIG's own numbers.
 */
export function RigElevation() {
  const F = RIG.floor;
  const M = RIG.mast;
  const y = (v: number) => 185 - v;
  const leg = (t: number, side: -1 | 1) => side * (5.5 + (3.5 - 5.5) * t);
  const girts = Array.from({ length: 14 }, (_, i) => (i + 1) / 14);
  return (
    <svg viewBox="-100 0 200 190" className="h-full w-full" aria-hidden="true">
      <g className="fill-none stroke-foreground/70" strokeWidth={0.6} strokeLinejoin="round">
        {/* Substructure with X-bracing. */}
        <rect x={-20} y={y(F)} width={40} height={F} />
        {[-20, -10, 0, 10].map((x) => (
          <path key={x} d={`M${x},${y(0)}L${x + 10},${y(F / 2)}M${x + 10},${y(0)}L${x},${y(F / 2)}M${x},${y(F / 2)}L${x + 10},${y(F)}M${x + 10},${y(F / 2)}L${x},${y(F)}`} strokeWidth={0.35} />
        ))}
        {/* Mast legs, girts and zig-zag bracing. */}
        <path d={`M${leg(0, -1)},${y(F)}L${leg(1, -1)},${y(F + M)}M${leg(0, 1)},${y(F)}L${leg(1, 1)},${y(F + M)}`} strokeWidth={0.9} />
        {girts.map((t, i) => {
          const p = i / 14;
          return (
            <path
              key={t}
              d={`M${leg(t, -1)},${y(F + M * t)}H${leg(t, 1)}M${i % 2 ? leg(p, -1) : leg(p, 1)},${y(F + M * p)}L${i % 2 ? leg(t, 1) : leg(t, -1)},${y(F + M * t)}`}
              strokeWidth={0.35}
            />
          );
        })}
        {/* Crown, racking board, top drive, drill line. */}
        <rect x={-4.2} y={y(F + M + 6)} width={8.4} height={6} className="fill-foreground/20" />
        <path d={`M${leg(RIG.board / M, -1)},${y(F + RIG.board)}H-15`} strokeWidth={1.2} />
        <line x1={0} y1={y(F + M)} x2={0} y2={y(F + 74)} strokeWidth={0.3} />
        <rect x={-2.4} y={y(F + 72)} width={4.8} height={12} className="fill-primary stroke-primary" />
        {/* Floor, V-door slide, catwalk, pipe rack. */}
        <line x1={-22} y1={y(F)} x2={22} y2={y(F)} strokeWidth={1.2} />
        <line x1={-20} y1={y(F - 0.6)} x2={-50} y2={y(4.6)} strokeWidth={0.9} />
        <rect x={-96} y={y(4.2)} width={48} height={4.2} />
        {/* Mud tanks, pumps, gensets behind the rig. */}
        <rect x={28} y={y(8)} width={44} height={8} className="fill-foreground/10" />
        <rect x={76} y={y(10)} width={22} height={10} className="fill-foreground/10" />
        <line x1={-100} y1={y(0)} x2={100} y2={y(0)} strokeWidth={0.8} />
      </g>
    </svg>
  );
}

