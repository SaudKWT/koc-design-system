/**
 * Well trajectories, built the way a directional plan is: a vertical to the
 * kick-off point, builds at a stated dogleg (°/100 ft), holds, drops, and a
 * lateral. Integrated along measured depth in 2 ft steps (circular arcs at a
 * constant build rate — the minimum-curvature shape), then resampled evenly.
 *
 * Every number the page prints about a well (KOP, landing TVD, lateral length,
 * TD) is READ BACK from the integrated path — never typed in beside it — so a
 * caption cannot drift from the geometry it describes.
 */

import { DEG, type Vec3 } from "./math";

export type Section =
  | { kind: "hold"; md: number }
  | { kind: "build"; rate: number; to: number } // rate °/100 ft, to = target inclination °
  | { kind: "holdTo"; tvd: number }; // hold at current inclination until a TVD

export interface WellPlan {
  id: string;
  /** Surface location, ft (x east, z south). */
  surface: [number, number];
  /** Azimuth in the x–z plane, radians from +x toward +z. */
  azimuth: number;
  sections: Section[];
  status: "drilling" | "completed" | "deep";
  /** Draw it on the x-ray pass only: it lies inside the solid block. */
  buried?: boolean;
}

export interface Survey {
  plan: WellPlan;
  /** Evenly resampled centreline, world coordinates (y = −TVD). */
  points: Vec3[];
  /** Measured depth at each resampled point. */
  md: number[];
  kop: number;
  maxInc: number;
  maxBuild: number;
  tdMd: number;
  tdTvd: number;
  /** Where inclination first reached 88°, if it did. */
  landing?: { md: number; tvd: number };
  lateral: number;
}

const STEP = 2;

export function survey(plan: WellPlan, samples = 640): Survey {
  let x = plan.surface[0];
  let z = plan.surface[1];
  let tvd = 0;
  let inc = 0;
  let md = 0;
  let kop = -1;
  let maxBuild = 0;
  let landing: Survey["landing"];
  const ca = Math.cos(plan.azimuth);
  const sa = Math.sin(plan.azimuth);
  const raw: { p: Vec3; md: number }[] = [{ p: [x, 0, z], md: 0 }];

  const advance = (dInc: number) => {
    const i0 = inc;
    const i1 = inc + dInc;
    // Chord of a circular arc: average direction is the mid-inclination.
    const im = (i0 + i1) / 2;
    tvd += STEP * Math.cos(im * DEG);
    const h = STEP * Math.sin(im * DEG);
    x += h * ca;
    z += h * sa;
    inc = i1;
    md += STEP;
    if (!landing && inc >= 88) landing = { md, tvd };
    raw.push({ p: [x, -tvd, z], md });
  };

  for (const s of plan.sections) {
    if (s.kind === "hold") {
      for (let d = 0; d < s.md; d += STEP) advance(0);
    } else if (s.kind === "holdTo") {
      let guard = 0;
      while (tvd < s.tvd && guard++ < 100000) advance(0);
    } else {
      if (kop < 0 && s.to > inc) kop = md;
      maxBuild = Math.max(maxBuild, Math.abs(s.rate));
      const dir = Math.sign(s.to - inc);
      const per = (s.rate / 100) * STEP;
      let guard = 0;
      while ((dir > 0 ? inc < s.to : inc > s.to) && guard++ < 100000) {
        advance(dir * Math.min(per, Math.abs(s.to - inc)));
      }
    }
  }

  // Resample evenly in MD so the tube's segments are uniform.
  const points: Vec3[] = [];
  const mds: number[] = [];
  let j = 0;
  for (let i = 0; i < samples; i++) {
    const target = (md * i) / (samples - 1);
    while (j < raw.length - 2 && raw[j + 1].md < target) j++;
    const a = raw[j];
    const b = raw[j + 1] ?? a;
    const t = b.md > a.md ? (target - a.md) / (b.md - a.md) : 0;
    points.push([
      a.p[0] + (b.p[0] - a.p[0]) * t,
      a.p[1] + (b.p[1] - a.p[1]) * t,
      a.p[2] + (b.p[2] - a.p[2]) * t,
    ]);
    mds.push(target);
  }

  let maxInc = 0;
  for (const s of plan.sections) if (s.kind === "build") maxInc = Math.max(maxInc, s.to);

  return {
    plan,
    points,
    md: mds,
    kop: Math.max(0, kop),
    maxInc,
    maxBuild,
    tdMd: md,
    tdTvd: tvd,
    landing,
    lateral: landing ? md - landing.md : 0,
  };
}

/** Radius the bores are DRAWN at, ft. A 8½" hole is 0.35 ft across; at block
 *  scale that is a hundredth of a pixel, so the drawing is wider by design. */
export const BORE_DRAW_RADIUS = 34;

/**
 * The five wells. Placement: the section face is the plane z = 0 (facing +z),
 * the second exposed face is x = −1500 (facing +x). A well drawn on a face sits
 * one drawn-radius in front of it, so the cut runs through its axis — the
 * cutaway convention.
 */
const ON_Z = BORE_DRAW_RADIUS * 1.08;
const ON_X = -1500 + BORE_DRAW_RADIUS * 1.08;

export const WELL_PLANS: WellPlan[] = [
  {
    // The active well: a horizontal producer into the Burgan sands at the crest.
    id: "active",
    surface: [-1000, ON_Z],
    azimuth: 0,
    status: "drilling",
    sections: [
      { kind: "hold", md: 1500 }, // vertical to KOP
      { kind: "build", rate: 3, to: 50 }, // 3°/100 ft
      { kind: "holdTo", tvd: 3140 }, // tangent
      { kind: "build", rate: 4, to: 90 }, // land at 4°/100 ft
      { kind: "hold", md: 2500 }, // lateral
    ],
  },
  {
    // J-type (build and hold) into the Mauddud, on the east-facing face.
    id: "j-well",
    surface: [ON_X, 600],
    azimuth: Math.PI / 2,
    status: "completed",
    sections: [
      { kind: "hold", md: 1200 },
      { kind: "build", rate: 2.5, to: 32 },
      { kind: "holdTo", tvd: 3520 },
    ],
  },
  {
    // Deep vertical exploration well to the Jurassic, runs out of the block's base.
    id: "deep",
    surface: [ON_X, 3000],
    azimuth: 0,
    status: "deep",
    sections: [{ kind: "hold", md: 11600 }],
  },
  {
    // S-type from the active well's pad, back into the block: build, hold, drop.
    id: "s-well",
    surface: [-1060, -80],
    azimuth: -Math.PI / 2 - 0.35,
    status: "completed",
    buried: true,
    sections: [
      { kind: "hold", md: 1000 },
      { kind: "build", rate: 2, to: 24 },
      { kind: "hold", md: 1400 },
      { kind: "build", rate: 1.5, to: 0 },
      { kind: "holdTo", tvd: 5400 },
    ],
  },
  {
    // Vertical to the Minagish from a pad on the west of the block.
    id: "vertical",
    surface: [-3500, -2500],
    azimuth: 0,
    status: "completed",
    buried: true,
    sections: [{ kind: "hold", md: 7250 }],
  },
];

/** Pads: gravel rectangles on the surface, ft. `rig` marks the one the rig stands on;
 *  `label` is which side of its marker the overlay writes the name. */
export const PADS: { id: string; x0: number; x1: number; z0: number; z1: number; rig?: boolean; label: "left" | "right" }[] = [
  { id: "A", x0: -1180, x1: -800, z0: -320, z1: 0, rig: true, label: "right" },
  { id: "B", x0: -1820, x1: -1500, z0: 430, z1: 760, label: "left" },
  { id: "C", x0: -1820, x1: -1500, z0: 2830, z1: 3160, label: "left" },
  { id: "D", x0: -3700, x1: -3300, z0: -2700, z1: -2320, label: "right" },
];
