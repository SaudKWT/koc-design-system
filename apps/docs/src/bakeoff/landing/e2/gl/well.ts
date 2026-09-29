/**
 * The illustrative well — every number the scene is built from, in one place.
 *
 * ILLUSTRATIVE, NOT A KOC WELL. The engineering is real (a build–hold–build
 * horizontal profile with realistic dogleg severities, a standard telescoping
 * casing programme, a conventional 8½″ rotary-steerable BHA on 5″ drill pipe);
 * the specific depths are made up so the shape reads well on screen.
 *
 * Formation names and their order are Greater Burgan's, from GeoExpro's
 * "The Great Burgan field, Kuwait" (Ahmadi cap rock; Wara, first sand at
 * ~1,120 m ≈ 3,675 ft; Mauddud; Burgan Third and Fourth Sands). Every top depth
 * other than Wara's is illustrative.
 *
 * Units: feet, measured depth (MD) and true vertical depth (TVD) from the
 * rotary table (RKB). World axes: y up; the well walks along +x.
 */

import { type V3, DEG } from "./math";

/** Rotary table above ground, ft. MD 0 is here. */
export const RKB = 30;

type Segment = { md0: number; md1: number; inc0: number; inc1: number };

/** Build–hold–build to horizontal. Inclination in radians. */
const PLAN: Segment[] = [
  { md0: 0, md1: 3000, inc0: 0, inc1: 0 }, //               vertical to KOP
  { md0: 3000, md1: 4500, inc0: 0, inc1: 60 * DEG }, //     build 1 — 4°/100 ft
  { md0: 4500, md1: 4650, inc0: 60 * DEG, inc1: 60 * DEG }, // hold (tangent)
  { md0: 4650, md1: 5150, inc0: 60 * DEG, inc1: 90 * DEG }, // build 2 — 6°/100 ft, lands
  { md0: 5150, md1: 8150, inc0: 90 * DEG, inc1: 90 * DEG }, // 3,000 ft lateral
];

export const KOP_MD = 3000;
export const LANDING_MD = 5150;
export const TD = 8150;

/** Horizontal direction of the well (azimuth). The well is planar, so frames are analytic. */
export const H: V3 = [1, 0, 0];

export interface Station {
  md: number;
  inc: number;
  tvd: number;
  /** Horizontal displacement from surface, ft. */
  disp: number;
  pos: V3;
  /** Dogleg severity, °/100 ft. */
  dls: number;
}

export function station(mdIn: number): Station {
  // Above the rotary table (the stand in the derrick) the string is vertical.
  if (mdIn < 0) return { md: mdIn, inc: 0, tvd: mdIn, disp: 0, dls: 0, pos: [0, RKB - mdIn, 0] };
  const md = Math.min(TD, mdIn);
  let tvd = 0;
  let disp = 0;
  let inc = 0;
  let dls = 0;
  for (const s of PLAN) {
    const L = Math.min(md, s.md1) - s.md0;
    if (L <= 0) break;
    const dInc = ((s.inc1 - s.inc0) * L) / (s.md1 - s.md0);
    const i1 = s.inc0 + dInc;
    if (Math.abs(s.inc1 - s.inc0) < 1e-9) {
      tvd += L * Math.cos(s.inc0);
      disp += L * Math.sin(s.inc0);
    } else {
      const R = (s.md1 - s.md0) / (s.inc1 - s.inc0);
      tvd += R * (Math.sin(i1) - Math.sin(s.inc0));
      disp += R * (Math.cos(s.inc0) - Math.cos(i1));
      if (md <= s.md1) dls = ((s.inc1 - s.inc0) / DEG / (s.md1 - s.md0)) * 100;
    }
    inc = i1;
  }
  return { md, inc, tvd, disp, dls, pos: [H[0] * disp, RKB - tvd, H[2] * disp] };
}

/** Along-hole direction for an inclination (points downhole). */
export const tangent = (inc: number): V3 => [H[0] * Math.sin(inc), -Math.cos(inc), H[2] * Math.sin(inc)];
/** Low-side direction: perpendicular to the hole, pointing down. Continuous at inc = 0. */
export const lowSide = (inc: number): V3 => [-H[0] * Math.cos(inc), -Math.sin(inc), -H[2] * Math.cos(inc)];

/* ------------------------------------------------------------------------ */

export interface CasingString {
  name: string;
  /** Casing OD and the hole it was run in, inches. */
  od: number;
  hole: number;
  /** Coupling OD, inches (buttress). */
  couplingOd: number;
  /** Hole section top (MD) and shoe (MD). Casing runs from ground to shoe. */
  holeTop: number;
  shoe: number;
}

export const CASING: CasingString[] = [
  { name: "20″ conductor", od: 20, hole: 26, couplingOd: 21, holeTop: RKB, shoe: 250 },
  { name: "13⅜″ surface", od: 13.375, hole: 17.5, couplingOd: 14.375, holeTop: 250, shoe: 1600 },
  { name: "9⅝″ intermediate", od: 9.625, hole: 12.25, couplingOd: 10.625, holeTop: 1600, shoe: 5140 },
];

/** The open-hole section below the last shoe. */
export const OPEN_HOLE = { hole: 8.5, top: 5140, bottom: TD };

/* ------------------------------------------------------------------------ */

export type BhaKind =
  | "bit"
  | "rss"
  | "stab"
  | "lwd"
  | "mwd"
  | "nmdc"
  | "xo"
  | "jar"
  | "hwdp";

export interface BhaPart {
  kind: BhaKind;
  label: string;
  length: number;
  /** Nominal OD, inches. */
  od: number;
  /** Filled in below: MD of the top (up-hole end) and bottom. */
  top: number;
  bottom: number;
}

const BHA_FROM_BIT: Omit<BhaPart, "top" | "bottom">[] = [
  { kind: "bit", label: "8½″ PDC bit", length: 1.05, od: 8.5 },
  { kind: "rss", label: "Rotary steerable", length: 13.5, od: 6.75 },
  { kind: "stab", label: "String stabiliser", length: 6, od: 8.375 },
  { kind: "lwd", label: "LWD", length: 22, od: 6.75 },
  { kind: "mwd", label: "MWD", length: 28, od: 6.75 },
  { kind: "nmdc", label: "Non-mag collar", length: 30, od: 6.75 },
  { kind: "stab", label: "String stabiliser", length: 6, od: 8.375 },
  { kind: "xo", label: "Float sub", length: 3, od: 6.5 },
  { kind: "jar", label: "Drilling jar", length: 32, od: 6.5 },
  ...Array.from({ length: 6 }, () => ({ kind: "hwdp" as const, label: "5″ HWDP", length: 31, od: 5 })),
];

export const BHA: BhaPart[] = (() => {
  let md = TD;
  return BHA_FROM_BIT.map((p) => {
    const part = { ...p, bottom: md, top: md - p.length };
    md -= p.length;
    return part;
  });
})();

/** Top of the BHA: 5″ drill pipe runs from here to surface. */
export const BHA_TOP = BHA[BHA.length - 1].top;
export const DP_JOINT = 31;

/* ------------------------------------------------------------------------ */

export interface Formation {
  name: string;
  /** Top, TVD ft. Illustrative except Wara (see header). */
  top: number;
}

export const FORMATIONS: Formation[] = [
  { name: "Ahmadi Shale", top: 3560 },
  { name: "Wara", top: 3675 },
  { name: "Mauddud", top: 3880 },
  { name: "Burgan · 3rd Sand", top: 4010 },
  { name: "Burgan · 4th Sand", top: 4640 },
];

export const fmtFt = (v: number) => `${Math.round(v).toLocaleString("en-GB")} ft`;
