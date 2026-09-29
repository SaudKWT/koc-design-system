/**
 * The models. Every one is built in code, to real proportions (metres).
 *
 * Sources for proportions are noted per model. Where a form cannot be done
 * procedurally at full fidelity (the camel, people) it is a signed-distance
 * sculpt polygonised by surface nets — one smooth skin, not glued primitives.
 *
 * `Kit` collects one chapter's geometry into as few draws as possible:
 *   static   — merged, per-vertex material
 *   members  — lattice members, instanced (an L-angle unit mesh)
 *   rods     — round members (pipe, rungs, cables), instanced (unit cylinder)
 */

import {
  MeshBuilder,
  box,
  boxAt,
  cylinder,
  ellipsoid,
  extrude,
  lathe,
  sd,
  sdfMesh,
  spline,
  tube,
  type Mat,
  type MeshData,
} from "./geometry";
import { m4, v3, rng, type M4, type V3 } from "./math";

// ── Materials (tone, accent) ───────────────────────────────────────────────
export const MAT = {
  steel: [0.5, 0] as Mat,
  steelLight: [0.66, 0] as Mat,
  timber: [0.42, 0] as Mat,
  canvas: [0.9, 0] as Mat,
  white: [0.96, 0] as Mat,
  paint: [0.82, 0] as Mat,
  dark: [0.14, 0] as Mat,
  rubber: [0.1, 0] as Mat,
  glass: [0.28, 0.08] as Mat,
  hide: [0.72, 0] as Mat,
  cloth: [0.93, 0] as Mat,
  koc: [0.55, 0.62] as Mat, // KOC blue, the modern rig's paint
  kocLight: [0.8, 0.32] as Mat,
  mud: [0.32, 0] as Mat,
};

// ── Shared unit meshes ─────────────────────────────────────────────────────

/** L-section angle iron, y 0→1, unit flange width, 16% flange thickness. */
export const UNIT_ANGLE: MeshData = (() => {
  const b = new MeshBuilder();
  const t = 0.16;
  box(b, m4.compose(m4.translation(0, 0, -0.5 + t / 2), m4.scaling(1, 1, t)), MAT.steel, true);
  box(b, m4.compose(m4.translation(-0.5 + t / 2, 0, 0), m4.scaling(t, 1, 1)), MAT.steel, true);
  return b.build();
})();

/** Unit round bar, y 0→1, radius 0.5 (so segment() w = diameter). 24 sides reads as round at any size it is drawn. */
export const UNIT_ROD: MeshData = (() => {
  const b = new MeshBuilder();
  cylinder(b, 0.5, 1, 24, m4.identity(), MAT.steel, false);
  return b.build();
})();

/** 5" drill pipe joint, Range 2: 31 ft (9.45 m) body, 5.0" OD (0.127 m), 6⅝" tool joints. 128 sides. */
export const DRILL_PIPE: MeshData = (() => {
  const b = new MeshBuilder();
  const r = 0.127 / 2, tj = 0.168 / 2, L = 9.45;
  lathe(
    b,
    [
      [0, 0], [tj * 0.85, 0], [tj, 0.02], [tj, 0.33], [tj * 0.9, 0.38], [r, 0.46],
      [r, L - 0.36], [tj * 0.9, L - 0.3], [tj, L - 0.26], [tj, L - 0.02], [tj * 0.85, L], [0, L],
    ],
    128,
    m4.identity(),
    MAT.steelLight,
  );
  return b.build();
})();

export class Kit {
  s = new MeshBuilder();
  members: number[] = [];
  rods: number[] = [];

  /** An angle-iron member from a to b. */
  member(a: V3, b: V3, w: number, parent?: M4, roll?: V3) {
    const m = m4.segment(a, b, w, w, roll);
    this.members.push(...(parent ? m4.mul(parent, m) : m));
  }
  rod(a: V3, b: V3, d: number, parent?: M4) {
    const m = m4.segment(a, b, d, d);
    this.rods.push(...(parent ? m4.mul(parent, m) : m));
  }
}

const T = (x: number, y: number, z: number) => m4.translation(x, y, z);
const S = (x: number, y: number, z: number) => m4.scaling(x, y, z);
const ft = (x: number) => x * 0.3048;
const inch = (x: number) => x * 0.0254;

// ── 1930s standard steel derrick ───────────────────────────────────────────
//
// API standard derricks of the period: 122 ft tall on a 24 ft square base,
// tapering to a ~5½ ft water table; 136 ft on 24–26 ft for deeper work.
// Angle-iron legs, horizontal girts, X-braced panels on all four faces.

export interface DerrickOpts {
  height: number;
  base: number;
  top: number;
  panels: number;
  floor: number;
  /** Radians about Y. */
  rot: number;
  /** Stage of the build — a derrick "being drilled" has its kelly and block rigged. */
  rigged?: boolean;
}

export function derrick1930s(k: Kit, at: V3, o: DerrickOpts) {
  const P = m4.compose(T(at[0], at[1], at[2]), m4.rotY(o.rot));
  const H = o.height, fl = o.floor;
  const half = (y: number) => (o.base + (o.top - o.base) * (y / H)) / 2;
  // Panel heights shrink toward the top (ratio 0.93), as on period drawings.
  const ratio = 0.93;
  const first = (H * (1 - ratio)) / (1 - Math.pow(ratio, o.panels));
  const levels = [0];
  for (let p = 0, h = first; p < o.panels; p++, h *= ratio) levels.push(levels[p] + h);
  const cornersAt = (y: number): V3[] => {
    const hw = half(y);
    return [[hw, fl + y, hw], [-hw, fl + y, hw], [-hw, fl + y, -hw], [hw, fl + y, -hw]];
  };
  // Legs — oriented so the angle's heel points outward.
  const bot = cornersAt(0), top = cornersAt(H);
  for (let c = 0; c < 4; c++) k.member(bot[c], top[c], inch(6), P, [bot[c][0], 0, bot[c][2]]);
  // Girts and X braces.
  for (let p = 0; p < levels.length; p++) {
    const ring = cornersAt(levels[p]);
    const w = p === 0 ? inch(5) : inch(4) * (1 - (p / levels.length) * 0.3);
    for (let c = 0; c < 4; c++) k.member(ring[c], ring[(c + 1) % 4], w, P);
    if (p === levels.length - 1) continue;
    const nxt = cornersAt(levels[p + 1]);
    for (let c = 0; c < 4; c++) {
      const c1 = (c + 1) % 4;
      // The V-door face (c === 0) is left open at the bottom two panels.
      if (c === 0 && p < 2) continue;
      k.member(ring[c], nxt[c1], inch(3), P);
      k.member(ring[c1], nxt[c], inch(3), P);
    }
  }
  // Water table and crown block.
  const wt = fl + H;
  const tw = o.top / 2;
  for (const s of [-1, 1]) {
    k.member([-tw, wt + 0.25, s * tw * 0.5], [tw, wt + 0.25, s * tw * 0.5], inch(8), P);
  }
  boxAt(k.s, [0, wt + 0.7, 0], [o.top * 0.8, 0.8, 0.9], MAT.steel, 0, P);
  // Gin pole: an A-frame above the crown.
  for (const s of [-1, 1]) k.member([s * tw * 0.8, wt, 0], [0, wt + 3.2, 0], inch(4), P);
  k.member([0, wt + 3.2, -0.3], [0, wt + 3.2, 0.3], inch(4), P);

  // Rig floor on timber sills, over a cellar.
  const floorW = o.base + 2.6;
  boxAt(k.s, [0, fl - 0.12, 0], [floorW, 0.24, floorW], MAT.timber, 0, P);
  for (const s of [-1, 0, 1]) boxAt(k.s, [s * (floorW / 2 - 0.4), fl / 2 - 0.12, 0], [0.4, fl - 0.24, floorW], MAT.timber, 0, P);
  // Stair up to the floor on the V-door side.
  const stepN = Math.ceil(fl / 0.2);
  for (let s = 0; s < stepN; s++)
    boxAt(k.s, [floorW / 2 + 0.3 + s * 0.26, fl - (s + 1) * (fl / stepN), -floorW / 2 + 0.7], [0.3, 0.05, 1.0], MAT.timber, 0, P);
  // Monkey board (racking platform) at ~85 ft.
  const mb = fl + ft(85);
  const mhw = half(ft(85));
  boxAt(k.s, [0, mb, -mhw - 0.4], [mhw * 1.6, 0.08, 1.4], MAT.timber, 0, P);
  for (let f = -3; f <= 3; f++) k.member([f * 0.35, mb + 0.02, -mhw], [f * 0.35, mb + 0.02, -mhw + 1.6], 0.05, P);
  // Ladder up the back-right leg: rails + rungs every 0.3 m.
  const lb = bot[3], lt = top[3];
  const off = (p: V3, d: number): V3 => [p[0] - d, p[1], p[2] + 0.35];
  k.rod(off(lb, 0.25), off(lt, 0.25), 0.05, P);
  k.rod(off(lb, 0.65), off(lt, 0.65), 0.05, P);
  const rungs = Math.floor(H / 0.3);
  for (let r = 0; r < rungs; r++) {
    const t = r / rungs;
    const a = v3.lerp(off(lb, 0.25), off(lt, 0.25), t);
    const b = v3.lerp(off(lb, 0.65), off(lt, 0.65), t);
    k.rod(a, b, 0.025, P);
  }

  if (o.rigged) {
    // Drill lines, travelling block, hook, swivel and kelly over the rotary.
    const blockY = fl + H * 0.58;
    for (let l = 0; l < 6; l++) {
      const x = (l - 2.5) * 0.09;
      k.rod([x, wt + 0.3, 0], [x * 0.6, blockY + 0.9, 0], 0.028, P);
    }
    const tb = m4.compose(P, T(0, blockY, 0));
    lathe(k.s, [[0, -0.5], [0.34, -0.45], [0.42, 0], [0.34, 0.9], [0, 1.0]], 64, m4.mul(tb, S(1, 1, 0.55)), MAT.steel);
    k.rod([0, blockY - 1.4, 0], [0, blockY - 0.5, 0], 0.12, P);
    lathe(k.s, [[0, 0], [0.22, 0.05], [0.24, 0.6], [0.12, 0.8], [0, 0.8]], 64, m4.compose(P, T(0, blockY - 2.2, 0)), MAT.steel);
    // Kelly: square, ~40 ft.
    boxAt(k.s, [0, fl + (blockY - 2.2 - fl) / 2, 0], [0.13, blockY - 2.2 - fl, 0.13], MAT.steelLight, Math.PI / 4, P);
    // Rotary table.
    cylinder(k.s, 0.75, 0.35, 96, m4.compose(P, T(0, fl, 0)), MAT.steel);
  }
}

// ── Riveted storage tank ───────────────────────────────────────────────────
// Period field tank: welded/riveted courses ~8 ft high, cone roof, spiral stair.
export function storageTank(k: Kit, at: V3, dia: number, height: number, rot = 0, mat: Mat = MAT.paint) {
  const P = m4.compose(T(at[0], at[1], at[2]), m4.rotY(rot));
  const R = dia / 2;
  const courses = Math.max(2, Math.round(height / 2.44));
  const prof: [number, number][] = [[0, 0], [R + 0.08, 0], [R + 0.08, 0.12], [R, 0.14], [R, 0.14]];
  for (let c = 1; c < courses; c++) {
    const y = (c / courses) * height;
    prof.push([R, y - 0.02], [R + 0.01, y], [R, y + 0.02]);
  }
  const roofRise = R * 0.12;
  prof.push([R, height], [R, height], [R + 0.05, height + 0.02], [R + 0.05, height + 0.02], [R * 0.5, height + roofRise * 0.55], [0.4, height + roofRise], [0, height + roofRise + 0.05]);
  lathe(k.s, prof, 192, P, mat);
  // Spiral stair: 40 treads and an outer handrail.
  const turns = 0.32;
  const n = Math.ceil(height / 0.22);
  const rail: V3[] = [];
  for (let s = 0; s < n; s++) {
    const t = s / (n - 1);
    const a = t * turns * Math.PI * 2;
    const y = t * height;
    const c = Math.cos(a), sn = Math.sin(a);
    box(k.s, m4.compose(P, T(c * (R + 0.45), y, sn * (R + 0.45)), m4.rotY(-a), S(0.8, 0.04, 0.26)), MAT.steel);
    rail.push([c * (R + 0.88), y + 1.0, sn * (R + 0.88)]);
    if (s % 3 === 0) k.rod([c * (R + 0.88), y, sn * (R + 0.88)], [c * (R + 0.88), y + 1.0, sn * (R + 0.88)], 0.04, P);
  }
  tube(k.s, rail, 0.025, 8, P, MAT.steel);
}

// ── Combination rig gear (Bahra 1936, Burgan 1937–38) ──────────────────────
// Bahra No. 1 was drilled with a gasoline-powered combination rig — water was
// too scarce for steam — and the rig moved to Burgan (Petroleum Engineer, Oct
// 1938; OPEC Bulletin, 1988). A combination rig carries cable-tool gear beside
// the rotary: samson post, walking beam, pitman, band wheel, bull wheels.
// Proportions after period cable-tool rigs: beam ~26 ft, band wheel ~11 ft.
export function combinationRigGear(k: Kit, at: V3, rot: number, floor: number, half: number) {
  const P = m4.compose(T(at[0], at[1], at[2]), m4.rotY(rot));
  const b = k.s;
  // Samson post: two heavy timbers in an A, 4 m back from well centre.
  const sx = -4.2, top = floor + 3.6;
  for (const z of [-0.45, 0.45]) {
    k.member([sx - 0.9, floor, z], [sx, top, z * 0.4], 0.32, P);
    k.member([sx + 0.9, floor, z], [sx, top, z * 0.4], 0.32, P);
  }
  // Walking beam: 8 m, the well end over the hole, the far end over the band wheel.
  const beam = m4.segment([0.3, top + 0.55, 0], [sx - 3.6, top + 0.15, 0], 0.34, 0.5);
  box(b, m4.mul(P, beam), MAT.timber, true);
  // Pitman down to the crank.
  const bwx = sx - 3.4, bwy = floor + 1.9;
  k.member([bwx, top + 0.2, 0], [bwx + 0.2, bwy + 0.6, 0.55], 0.2, P);
  // Band wheel (3.4 m) on its shaft, belted to the engine house.
  const BW = m4.compose(P, T(bwx, bwy, 0.55), m4.rotX(Math.PI / 2));
  lathe(b, [[1.62, -0.28], [1.7, -0.28], [1.7, 0.28], [1.62, 0.28]], 192, BW, MAT.timber);
  for (let sp = 0; sp < 8; sp++) {
    const a = (sp / 8) * Math.PI * 2;
    k.rod([bwx, bwy, 0.55], [bwx + Math.cos(a) * 1.62, bwy + Math.sin(a) * 1.62, 0.55], 0.1, P);
  }
  k.rod([bwx, bwy, -0.3], [bwx, bwy, 1.3], 0.16, P);
  // Bull wheels on the far side of the derrick, a pair on one shaft.
  const bux = 0, buz = half + 1.6;
  for (const dx of [-1.1, 1.1]) {
    const BU = m4.compose(P, T(bux + dx, floor + 1.25, buz), m4.rotZ(Math.PI / 2));
    lathe(b, [[1.15, -0.12], [1.2, -0.12], [1.2, 0.12], [1.15, 0.12]], 160, BU, MAT.timber);
    for (let sp = 0; sp < 6; sp++) {
      const a = (sp / 6) * Math.PI * 2;
      k.rod([bux + dx, floor + 1.25, buz], [bux + dx, floor + 1.25 + Math.sin(a) * 1.15, buz + Math.cos(a) * 1.15], 0.08, P);
    }
  }
  k.rod([bux - 1.6, floor + 1.25, buz], [bux + 1.6, floor + 1.25, buz], 0.22, P);
  // Engine house: timber and corrugated iron, gasoline engines inside, exhausts out.
  const ex = bwx - 5.2;
  boxAt(b, [ex, at[1] * 0 + 1.45, 0.6], [5.2, 2.9, 4.2], MAT.timber, 0, P);
  const roof: [number, number][] = [[-2.3, 0], [2.3, 0], [0, 0.9]];
  extrude(b, roof, 5.6, m4.compose(P, T(ex + 2.8, 2.9, 0.6), m4.rotY(-Math.PI / 2)), MAT.steel);
  for (const dz of [-0.8, 0.9]) k.rod([ex - 1.4, 2.6, 0.6 + dz], [ex - 1.4, 5.4, 0.6 + dz], 0.14, P);
  // Drive belt from engine house to band wheel.
  k.member([ex + 2.6, 1.3, 0.55], [bwx - 1.5, bwy - 0.4, 0.55], 0.04, P);
  // Fuel drums.
  for (let i = 0; i < 6; i++) {
    const D = m4.compose(P, T(ex - 3.6 + (i % 3) * 0.66, 0, 2.9 + Math.floor(i / 3) * 0.66));
    lathe(b, [[0, 0], [0.285, 0], [0.29, 0.02], [0.29, 0.28], [0.3, 0.3], [0.29, 0.32], [0.29, 0.53], [0.3, 0.55], [0.29, 0.57], [0.29, 0.83], [0.285, 0.85], [0, 0.85]], 64, D, MAT.steelLight);
  }
}

// ── A 1930s 1½-ton stake truck ─────────────────────────────────────────────
// Proportions of the Ford BB / Chevrolet of 1932–35: 157" wheelbase, ~6.1 m
// long, ~2.0 m wide, 32×6 tyres (~0.84 m) with duals at the rear.
function wheel(b: MeshBuilder, P: M4, r: number, w: number, dual = false) {
  const tyre: [number, number][] = [];
  const n = 24;
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI;
    tyre.push([r - 0.1 + Math.sin(a) * 0.1, -w / 2 + (1 - Math.cos(a)) * (w / 2)]);
  }
  const axis = m4.mul(P, m4.rotX(Math.PI / 2));
  const place = (dz: number) => {
    const A = m4.mul(axis, T(0, dz, 0));
    lathe(b, [[r - 0.2, -w / 2 + 0.02], ...tyre, [r - 0.2, w / 2 - 0.02]], 256, A, MAT.rubber);
    lathe(b, [[0, -w * 0.3], [r * 0.4, -w * 0.3], [r - 0.18, -w * 0.18], [r - 0.18, w * 0.1], [r * 0.3, w * 0.28], [0.06, w * 0.34], [0, w * 0.34]], 128, A, MAT.dark);
  };
  place(0);
  if (dual) place(-w - 0.02);
}

export function truck1930s(k: Kit, at: V3, rot: number, load: "barrels" | "pipe" | "none" = "barrels") {
  const P = m4.compose(T(at[0], at[1], at[2]), m4.rotY(rot));
  const b = k.s;
  const wb = inch(157), tr = 0.42, track = 1.55;
  const fx = wb / 2, rx = -wb / 2;
  // Chassis rails.
  for (const z of [-0.42, 0.42]) boxAt(b, [0, 0.62, z], [6.0, 0.18, 0.08], MAT.dark, 0, P);
  // Wheels (front singles, rear duals).
  for (const s of [-1, 1]) {
    wheel(b, m4.compose(P, T(fx, tr, s * (track / 2))), tr, 0.17);
    wheel(b, m4.compose(P, T(rx, tr, s * (track / 2 + 0.05))), tr, 0.17, true);
  }
  // Axles.
  k.rod([fx, tr, -track / 2], [fx, tr, track / 2], 0.08, P);
  k.rod([rx, tr, -track / 2], [rx, tr, track / 2], 0.11, P);
  // Hood: rounded section extruded forward from the cowl.
  const hood: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI;
    hood.push([Math.cos(a) * 0.36, 0.26 + Math.sin(a) * 0.14]);
  }
  hood.push([-0.36, -0.2], [0.36, -0.2]);
  extrude(b, hood, 1.35, m4.compose(P, T(fx + 0.35, 1.1, 0), m4.rotY(Math.PI / 2)), MAT.paint);
  // Radiator shell and grille bars.
  boxAt(b, [fx + 1.05, 1.18, 0], [0.12, 0.95, 0.78], MAT.paint, 0, P);
  for (let g = -5; g <= 5; g++) boxAt(b, [fx + 1.12, 1.16, g * 0.06], [0.03, 0.78, 0.018], MAT.dark, 0, P);
  // Fenders: swept arcs over each front wheel, running boards to the rear.
  for (const s of [-1, 1]) {
    const F = m4.compose(P, T(fx, tr, s * (track / 2)), m4.rotX(-Math.PI / 2), m4.rotY(-Math.PI * 0.02));
    lathe(b, [[tr + 0.1, -0.16], [tr + 0.13, -0.16], [tr + 0.15, -0.12], [tr + 0.15, 0.12], [tr + 0.13, 0.16], [tr + 0.1, 0.16]], 96, F, MAT.paint, Math.PI * 0.95);
    boxAt(b, [(fx + rx) / 2 + 0.25, 0.55, s * (track / 2 + 0.02)], [2.2, 0.04, 0.3], MAT.dark, 0, P);
    // Headlamp on its stalk.
    const hl = m4.compose(P, T(fx + 0.95, 1.52, s * 0.42), m4.rotZ(-Math.PI / 2));
    lathe(b, [[0, 0], [0.1, 0.02], [0.12, 0.12], [0.11, 0.16], [0, 0.16]], 48, hl, MAT.steelLight);
    k.rod([fx + 0.9, 0.95, s * 0.42], [fx + 0.9, 1.5, s * 0.42], 0.03, P);
  }
  // Cab: lower body, pillars, roof — the windows are open, as they read in fog.
  const cx = fx - 0.45;
  boxAt(b, [cx - 0.35, 1.05, 0], [1.3, 0.9, 1.72], MAT.paint, 0, P);
  for (const s of [-1, 1]) {
    k.member([cx + 0.28, 1.5, s * 0.84], [cx + 0.2, 2.18, s * 0.82], 0.07, P);
    k.member([cx - 0.98, 1.5, s * 0.84], [cx - 0.98, 2.18, s * 0.84], 0.08, P);
    k.member([cx - 0.35, 1.5, s * 0.85], [cx - 0.35, 2.15, s * 0.85], 0.05, P);
  }
  const roof: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI;
    roof.push([Math.cos(a) * 0.88, Math.sin(a) * 0.08]);
  }
  extrude(b, roof, 1.32, m4.compose(P, T(cx + 0.3, 2.16, 0), m4.rotY(-Math.PI / 2)), MAT.paint);
  boxAt(b, [cx + 0.24, 1.84, 0], [0.04, 0.62, 1.6], MAT.glass, 0, P);
  boxAt(b, [cx - 1.0, 1.84, 0], [0.04, 0.66, 1.66], MAT.paint, 0, P);
  // Steering wheel, seen through the windscreen.
  const sw = m4.compose(P, T(cx - 0.05, 1.55, 0.35), m4.rotZ(Math.PI * 0.35));
  lathe(b, [[0.17, -0.012], [0.19, 0], [0.17, 0.012]], 48, sw, MAT.dark);
  // Stake bed.
  const bedL = 3.3, bedX = rx + 0.25;
  boxAt(b, [bedX, 0.88, 0], [bedL, 0.12, 2.0], MAT.timber, 0, P);
  for (let s = 0; s <= 6; s++) {
    const x = bedX - bedL / 2 + (s / 6) * bedL;
    for (const z of [-0.98, 0.98]) boxAt(b, [x, 1.3, z], [0.07, 0.8, 0.06], MAT.timber, 0, P);
  }
  for (const y of [1.15, 1.55]) for (const z of [-0.99, 0.99]) boxAt(b, [bedX, y, z], [bedL, 0.12, 0.03], MAT.timber, 0, P);
  boxAt(b, [bedX - bedL / 2, 1.3, 0], [0.05, 0.8, 1.98], MAT.timber, 0, P);
  if (load === "barrels") {
    // 55-gal drums: 22.5" × 33.5".
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const D = m4.compose(P, T(bedX - 1.1 + i * 0.66, 0.94, -0.62 + j * 0.62));
        lathe(b, [[0, 0], [0.285, 0], [0.29, 0.02], [0.29, 0.28], [0.3, 0.3], [0.29, 0.32], [0.29, 0.53], [0.3, 0.55], [0.29, 0.57], [0.29, 0.83], [0.285, 0.85], [0, 0.85]], 64, D, MAT.steelLight);
      }
  } else if (load === "pipe") {
    for (let i = 0; i < 9; i++) k.rod([bedX - bedL / 2 - 1.5, 1.0 + (i % 3) * 0.12, -0.5 + Math.floor(i / 3) * 0.3], [bedX + bedL / 2 + 0.6, 1.0 + (i % 3) * 0.12, -0.5 + Math.floor(i / 3) * 0.3], 0.114, P);
  }
}

// ── Modern pickup (for the rig pad) ────────────────────────────────────────
// A full-size double-cab pickup: 5.3 m × 1.9 m × 1.85 m, 3.1 m wheelbase.
export function pickup(k: Kit, at: V3, rot: number) {
  const P = m4.compose(T(at[0], at[1], at[2]), m4.rotY(rot));
  const b = k.s;
  for (const s of [-1, 1])
    for (const x of [1.55, -1.55]) wheel(b, m4.compose(P, T(x, 0.39, s * 0.8)), 0.39, 0.27);
  // Lower body, sculpted in profile.
  const side: [number, number][] = [[-2.65, 0.55], [2.55, 0.55], [2.65, 0.75], [2.6, 1.05], [1.1, 1.18], [-2.65, 1.12]];
  extrude(b, side, 1.86, m4.compose(P, T(0, 0, -0.93)), MAT.white);
  // Cab greenhouse.
  const cab: [number, number][] = [[1.0, 1.15], [0.4, 1.78], [-1.0, 1.82], [-1.2, 1.15]];
  extrude(b, cab, 1.7, m4.compose(P, T(0, 0, -0.85)), MAT.glass);
  boxAt(b, [-0.3, 1.83, 0], [1.3, 0.05, 1.66], MAT.white, 0, P);
  // Bed well (dark inside).
  boxAt(b, [-2.0, 1.1, 0], [1.2, 0.05, 1.6], MAT.dark, 0, P);
  // Light bar.
  boxAt(b, [0.2, 1.9, 0], [0.18, 0.08, 1.2], MAT.kocLight, 0, P);
}

// ── Canvas ridge tent (1930s camp) ─────────────────────────────────────────
export function ridgeTent(k: Kit, at: V3, rot: number, L = 4.3, W = 3.0, H = 2.6) {
  const P = m4.compose(T(at[0], at[1], at[2]), m4.rotY(rot));
  const wall = 0.9;
  const sag = 0.06;
  const outline: [number, number][] = [
    [-W / 2, 0], [W / 2, 0], [W / 2, wall], [W / 4 + sag, (wall + H) / 2 - sag], [0, H], [-W / 4 - sag, (wall + H) / 2 - sag], [-W / 2, wall],
  ];
  extrude(k.s, outline, L, m4.compose(P, T(0, 0, -L / 2)), MAT.canvas);
  // Door flap and poles, guy ropes.
  boxAt(k.s, [0, 0.8, L / 2 + 0.02], [0.9, 1.6, 0.02], MAT.dark, 0, P);
  for (const z of [-L / 2 - 0.1, L / 2 + 0.1]) k.rod([0, 0, z], [0, H + 0.3, z], 0.05, P);
  for (const s of [-1, 1])
    for (const z of [-L / 2 + 0.3, 0, L / 2 - 0.3]) k.rod([s * (W / 2), wall, z], [s * (W / 2 + 1.1), 0, z], 0.012, P);
}

// ── Camels (dromedary), SDF sculpt ─────────────────────────────────────────
// Shoulder ~1.9 m, hump crest ~2.15 m, nose-to-rump ~2.9 m.
const camelCache = new Map<string, MeshData>();
const NECK = spline([[0.62, 1.5, 0], [0.98, 1.3, 0], [1.25, 1.45, 0], [1.36, 1.8, 0], [1.42, 2.02, 0]], 2);
export function camelMesh(pose: "stand" | "couch", loaded: boolean): MeshData {
  const key = `${pose}-${loaded}`;
  const hit = camelCache.get(key);
  if (hit) return hit;
  const f = (x: number, y: number, z: number) => {
    const p: V3 = [x, y, Math.abs(z)];
    const c = pose === "couch" ? -0.95 : 0;
    const q: V3 = [x, y - c, z];
    let d = sd.ellipsoid(q, [0, 1.45, 0], [0.74, 0.37, 0.33]);
    d = sd.smin(d, sd.ellipsoid(q, [0.08, 1.3, 0], [0.55, 0.3, 0.31]), 0.2);
    d = sd.smin(d, sd.ellipsoid(q, [-0.08, 1.8, 0], [0.44, 0.34, 0.25]), 0.28);
    d = sd.smin(d, sd.ellipsoid(q, [0.55, 1.38, 0], [0.3, 0.34, 0.27]), 0.18);
    d = sd.smin(d, sd.ellipsoid(q, [-0.6, 1.44, 0], [0.3, 0.32, 0.28]), 0.18);
    // Neck: forward, dipping, then rising to the poll.
    for (let i = 0; i < NECK.length - 1; i++) {
      const t = i / (NECK.length - 1);
      d = sd.smin(d, sd.cone(q, NECK[i], NECK[i + 1], 0.2 - t * 0.1, 0.2 - (t + 1 / NECK.length) * 0.1), 0.1);
    }
    // Head and muzzle.
    d = sd.smin(d, sd.ellipsoid(q, [1.52, 2.03, 0], [0.19, 0.12, 0.1]), 0.08);
    d = sd.smin(d, sd.cone(q, [1.55, 2.0, 0], [1.8, 1.92, 0], 0.09, 0.065), 0.06);
    d = sd.smin(d, sd.capsule([q[0], q[1], Math.abs(q[2])], [1.42, 2.12, 0.06], [1.37, 2.2, 0.09], 0.02), 0.03);
    // Tail.
    d = sd.smin(d, sd.cone(q, [-0.85, 1.55, 0], [-0.93, 0.95, 0], 0.05, 0.03), 0.06);
    // Legs.
    if (pose === "stand") {
      const leg = (hx: number, hy: number, kx: number, ky: number, fx: number) => {
        let l = sd.cone(p, [hx, hy, 0.16], [kx, ky, 0.16], 0.12, 0.065);
        l = sd.smin(l, sd.cone(p, [kx, ky, 0.16], [fx, 0.1, 0.16], 0.065, 0.048), 0.05);
        l = sd.smin(l, sd.ellipsoid(p, [kx, ky, 0.16], [0.075, 0.08, 0.07]), 0.03);
        l = sd.smin(l, sd.ellipsoid(p, [fx + 0.04, 0.05, 0.16], [0.13, 0.05, 0.1]), 0.05);
        return l;
      };
      d = sd.smin(d, leg(0.46, 1.3, 0.48, 0.66, 0.45), 0.12);
      d = sd.smin(d, leg(-0.55, 1.35, -0.62, 0.62, -0.55), 0.14);
      // Hind thigh mass.
      d = sd.smin(d, sd.ellipsoid(p, [-0.56, 1.15, 0.18], [0.16, 0.3, 0.1]), 0.1);
    } else {
      // Couched: legs folded flat beneath, knees forward.
      d = sd.smin(d, sd.capsule(p, [0.45, 0.2, 0.22], [0.9, 0.12, 0.2], 0.08), 0.12);
      d = sd.smin(d, sd.capsule(p, [-0.5, 0.25, 0.26], [0.1, 0.12, 0.28], 0.09), 0.12);
      d = sd.smin(d, sd.ellipsoid(q, [0, 1.25, 0], [0.8, 0.3, 0.36]), 0.2);
    }
    if (loaded) {
      // Saddle frame and two slung bundles.
      d = Math.min(d, sd.box(q, [-0.05, 2.13, 0], [0.3, 0.05, 0.3]) - 0.02);
      d = Math.min(d, sd.ellipsoid([q[0], q[1], Math.abs(q[2])], [-0.05, 1.72, 0.42], [0.42, 0.28, 0.14]));
      d = Math.min(d, sd.capsule(q, [-0.3, 2.22, -0.2], [0.2, 2.22, -0.2], 0.08));
    }
    return d;
  };
  const b = new MeshBuilder();
  const ymin = pose === "couch" ? -0.02 : -0.02;
  sdfMesh(b, f, [-1.05, ymin, -0.62], [1.95, pose === "couch" ? 1.35 : 2.4, 0.62], 0.028, m4.identity(), MAT.hide);
  const mesh = b.build();
  camelCache.set(key, mesh);
  return mesh;
}

// ── People, SDF sculpt ─────────────────────────────────────────────────────
// 1.75 m. "robe": dishdasha and ghutra, 1930s–40s. "worker": coveralls and a
// hard hat, today.
const personCache = new Map<string, MeshData>();
export function personMesh(kind: "robe" | "worker", arms: "down" | "gesture" = "down"): MeshData {
  const key = `${kind}-${arms}`;
  const hit = personCache.get(key);
  if (hit) return hit;
  const f = (x: number, y: number, z: number) => {
    const p: V3 = [x, y, z];
    const pz: V3 = [x, y, Math.abs(z)];
    let d: number;
    if (kind === "robe") {
      const e: V3 = [x, y, z * 1.35];
      d = sd.cone(e, [0, 0.04, 0], [0, 1.42, 0], 0.27, 0.19);
      d = sd.smin(d, sd.capsule(pz, [0, 1.42, 0.0], [0, 1.4, 0.18], 0.085), 0.08);
      d = sd.smin(d, sd.ellipsoid(p, [0, 1.62, 0], [0.095, 0.115, 0.1]), 0.04);
      // Ghutra: a cloth cone from the crown to the shoulders.
      d = sd.smin(d, sd.cone(p, [0, 1.76, 0], [-0.03, 1.4, 0], 0.07, 0.19), 0.05);
    } else {
      d = sd.capsule(pz, [0, 0.08, 0.1], [0, 0.88, 0.1], 0.07);
      d = sd.smin(d, sd.ellipsoid(p, [0, 1.2, 0], [0.13, 0.3, 0.2]), 0.1);
      d = sd.smin(d, sd.capsule(pz, [0, 1.42, 0], [0, 1.41, 0.19], 0.075), 0.07);
      d = sd.smin(d, sd.ellipsoid(p, [0, 1.62, 0], [0.095, 0.115, 0.1]), 0.04);
      // Hard hat: dome and brim.
      d = Math.min(d, sd.ellipsoid(p, [0.01, 1.7, 0], [0.13, 0.085, 0.12]));
      d = Math.min(d, sd.ellipsoid(p, [0.02, 1.68, 0], [0.17, 0.018, 0.15]));
      d = sd.smin(d, sd.ellipsoid(pz, [0.03, 0.05, 0.1], [0.13, 0.05, 0.06]), 0.03);
    }
    // Arms.
    if (arms === "down") d = sd.smin(d, sd.cone(pz, [0, 1.4, 0.21], [0.05, 0.84, 0.24], 0.06, 0.045), 0.04);
    else {
      d = sd.smin(d, sd.cone([x, y, z], [0, 1.4, 0.21], [0.05, 0.84, 0.24], 0.06, 0.045), 0.04);
      d = sd.smin(d, sd.cone([x, y, z], [0, 1.4, -0.21], [0.45, 1.5, -0.3], 0.06, 0.045), 0.04);
    }
    return d;
  };
  const b = new MeshBuilder();
  sdfMesh(b, f, [-0.5, -0.02, -0.45], [0.55, 1.86, 0.45], 0.017, m4.identity(), kind === "robe" ? MAT.cloth : MAT.koc);
  const mesh = b.build();
  personCache.set(key, mesh);
  return mesh;
}

export function place(k: Kit, mesh: MeshData, at: V3, rot: number, scale = 1) {
  k.s.append(mesh, m4.compose(T(at[0], at[1], at[2]), m4.rotY(rot), S(scale, scale, scale)));
}

// ── Pipe rack: stacked joints of 5" drill pipe on steel trestles ───────────
/** Returns pipe instance matrices (for DRILL_PIPE) — the caller batches them. */
export function pipeRack(k: Kit, at: V3, rot: number, cols: number, rows: number, pipes: number[]) {
  const P = m4.compose(T(at[0], at[1], at[2]), m4.rotY(rot));
  const L = 9.45, od = 0.168;
  for (const x of [-L * 0.36, 0, L * 0.36]) {
    boxAt(k.s, [x, 0.45, 0], [0.25, 0.9, cols * od + 0.6], MAT.steel, 0, P);
  }
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols - (r % 2); c++) {
      const z = -((cols - 1) * od) / 2 + c * od + (r % 2) * (od / 2);
      const y = 0.9 + od / 2 + r * od * 0.87;
      const m = m4.compose(P, T(-L / 2, y, z), m4.rotZ(-Math.PI / 2));
      pipes.push(...m);
    }
}

// ── Tanker, 1940s three-island type ────────────────────────────────────────
// Parameterised by length / beam / depth; the hull is lofted from sections so
// the bow flares and the cruiser stern rounds under.
export function tanker(k: Kit, at: V3, rot: number, L: number, B: number, D: number, draft: number) {
  const P = m4.compose(T(at[0], at[1] - draft, at[2]), m4.rotY(rot));
  const b = k.s;
  const nu = 220, nv = 40;
  const base = b.count;
  // Half-breadth factor along the length (x from stern 0 → bow 1).
  const hb = (u: number) => {
    if (u > 0.78) return Math.pow(Math.max(0, 1 - (u - 0.78) / 0.22), 0.72);
    if (u < 0.1) return 0.55 + 0.45 * Math.sin((u / 0.1) * Math.PI * 0.5);
    return 1;
  };
  // Sheer: deck rises toward the ends.
  const sheer = (u: number) => D + 0.9 * Math.pow(Math.abs(u - 0.45) / 0.55, 2);
  // Keel rises at the stern (cut-up) and the stem rakes.
  const keel = (u: number) => (u < 0.08 ? (1 - u / 0.08) * D * 0.55 : 0);
  const rake = (u: number, h: number) => (u > 0.97 ? (h / D) * 2.5 * ((u - 0.97) / 0.03) : 0);
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    const x = u * L;
    const hw = (B / 2) * hb(u);
    const top = sheer(u), bot = keel(u);
    for (let j = 0; j <= nv; j++) {
      // Section: deck edge → side → bilge → keel centre. Mirror for port side.
      const t = j / nv;
      let px: number, py: number;
      const bilgeR = Math.min(1.8, hw);
      if (t < 0.55) {
        const s = t / 0.55;
        px = hw;
        py = top - s * (top - bot - bilgeR);
      } else if (t < 0.85) {
        const a = ((t - 0.55) / 0.3) * Math.PI * 0.5;
        px = hw - bilgeR + Math.cos(a) * bilgeR;
        py = bot + bilgeR - Math.sin(a) * bilgeR;
      } else {
        px = (hw - bilgeR) * (1 - (t - 0.85) / 0.15);
        py = bot;
      }
      const xs = x + rake(u, py - bot);
      const nx = t < 0.55 ? 1 : t < 0.85 ? Math.cos(((t - 0.55) / 0.3) * Math.PI * 0.5) : 0;
      const ny = t < 0.55 ? 0 : t < 0.85 ? -Math.sin(((t - 0.55) / 0.3) * Math.PI * 0.5) : -1;
      b.vert(m4.transformPoint(P, [xs, py, px]), v3.norm(tn(P, [0, ny, nx])), MAT.steel);
    }
  }
  const row = nv + 1;
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a = base + i * row + j;
      b.tri(a, a + row, a + row + 1);
      b.tri(a, a + row + 1, a + 1);
    }
  // Port side: mirror the same loft.
  const base2 = b.count;
  for (let i = 0; i < (nu + 1) * row; i++) {
    const s = (base + i) * 8;
    const w = b.v.slice(s, s + 8);
    const local = m4.transformPoint(m4.invert(P), [w[0], w[1], w[2]]);
    const pw = m4.transformPoint(P, [local[0], local[1], -local[2]]);
    const nl = tn(m4.invert(P), [w[3], w[4], w[5]]);
    b.vert(pw, v3.norm(tn(P, [nl[0], nl[1], -nl[2]])), MAT.steel);
  }
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a = base2 + i * row + j;
      b.tri(a, a + row + 1, a + row);
      b.tri(a, a + 1, a + row + 1);
    }
  // Deck: a thin plate following the sheer.
  for (let i = 0; i < nu; i += 4) {
    const u0 = i / nu, u1 = Math.min(1, (i + 4) / nu);
    const um = (u0 + u1) / 2;
    const w = B * hb(um) - 0.1;
    if (w < 0.2) continue;
    boxAt(b, [um * L, sheer(um) - 0.05, 0], [(u1 - u0) * L + 0.05, 0.1, w], MAT.steelLight, 0, P);
  }
  // Forecastle, bridge house (three tiers), poop and engine casing, funnel.
  boxAt(b, [L * 0.9, sheer(0.9) + 1.2, 0], [L * 0.12, 2.4, B * 0.62], MAT.steelLight, 0, P);
  const mid = L * 0.47;
  boxAt(b, [mid, D + 1.4, 0], [L * 0.1, 2.8, B * 0.7], MAT.paint, 0, P);
  boxAt(b, [mid, D + 3.6, 0], [L * 0.075, 1.8, B * 0.55], MAT.paint, 0, P);
  boxAt(b, [mid + 1, D + 5.1, 0], [L * 0.045, 1.3, B * 0.75], MAT.paint, 0, P);
  for (let w = -4; w <= 4; w++) boxAt(b, [mid + 1 + L * 0.0226, D + 5.2, w * 1.2], [0.05, 0.6, 0.7], MAT.glass, 0, P);
  boxAt(b, [L * 0.1, sheer(0.1) + 1.4, 0], [L * 0.17, 2.8, B * 0.8], MAT.paint, 0, P);
  boxAt(b, [L * 0.09, sheer(0.1) + 3.8, 0], [L * 0.1, 2.2, B * 0.5], MAT.paint, 0, P);
  const fun = m4.compose(P, T(L * 0.085, sheer(0.1) + 4.8, 0), S(1.35, 1, 1));
  lathe(b, [[0, 0], [1.6, 0], [1.6, 5.6], [1.7, 5.7], [1.7, 6.3], [1.2, 6.3], [0, 6.2]], 96, fun, MAT.dark);
  // Masts with cross-trees, and the catwalk (flying bridge) fore-and-aft.
  for (const [u, h] of [[0.72, 18], [0.3, 17]] as const) {
    k.rod([u * L, sheer(u), 0], [u * L, sheer(u) + h, 0], 0.45, P);
    k.rod([u * L, sheer(u) + h * 0.7, -2.2], [u * L, sheer(u) + h * 0.7, 2.2], 0.18, P);
    // Derrick posts and booms.
    k.rod([u * L - 1.5, sheer(u), 0], [u * L - 7, sheer(u) + 5.5, 0], 0.22, P);
  }
  for (const [a, c] of [[0.2, 0.42], [0.52, 0.84]] as const) {
    boxAt(b, [((a + c) / 2) * L, D + 2.4, B * 0.12], [(c - a) * L, 0.12, 1.2], MAT.steelLight, 0, P);
    for (let s = 0; s <= 8; s++) {
      const u = a + ((c - a) * s) / 8;
      k.rod([u * L, sheer(u), B * 0.12], [u * L, D + 2.4, B * 0.12], 0.14, P);
    }
  }
  // Deck piping runs.
  for (const z of [-B * 0.18, -B * 0.24, B * 0.3]) k.rod([L * 0.18, D + 0.3, z], [L * 0.84, D + 0.3, z], 0.3, P);
  // Lifeboats in davits.
  for (const s of [-1, 1])
    for (const x of [L * 0.14, L * 0.06]) {
      ellipsoid(b, 3.3, 0.55, 1.0, 48, m4.compose(P, T(x, sheer(0.1) + 3.4, s * (B * 0.44))), MAT.white);
    }
  // Cargo tank hatches.
  for (let h = 0; h < 9; h++) {
    const u = 0.2 + h * 0.07;
    if (Math.abs(u - 0.47) < 0.05) continue;
    lathe(b, [[0, 0], [0.55, 0], [0.55, 0.45], [0, 0.5]], 32, m4.compose(P, T(u * L, D, -B * 0.05)), MAT.steel);
  }
}
function tn(m: M4, n: V3): V3 {
  return [m[0] * n[0] + m[4] * n[1] + m[8] * n[2], m[1] * n[0] + m[5] * n[1] + m[9] * n[2], m[2] * n[0] + m[6] * n[1] + m[10] * n[2]];
}

// ── Modern land rig, ~2,000 hp class ───────────────────────────────────────
// Mast 142 ft (43.3 m) clear height; box substructure, 30 ft (9.1 m) floor;
// racking board at ~88 ft; Range 2 stands (3 × 31 ft ≈ 93 ft) set back.
export interface RigParts {
  /** Travelling block + top drive, animated separately. */
  block: MeshData;
  /** The drill-line band, unit height — stretched between block and crown. */
  lines: MeshData;
  blockBase: V3;
  floorY: number;
  mastTop: number;
}
export function modernRig(k: Kit, at: V3, rot: number, pipes: number[]): RigParts {
  const P = m4.compose(T(at[0], at[1], at[2]), m4.rotY(rot));
  const fl = ft(30), H = ft(142);
  // Substructure: two boxes of lattice, 14 m × 3 m each, with a spreader.
  for (const z of [-3.2, 3.2]) {
    boxAt(k.s, [0, 0.4, z], [14, 0.8, 2.6], MAT.koc, 0, P);
    boxAt(k.s, [0, fl - 0.6, z], [14, 1.2, 2.6], MAT.koc, 0, P);
    for (let i = 0; i <= 7; i++) {
      const x = -7 + i * 2;
      k.member([x, 0.8, z - 1.2], [x, fl - 1.2, z - 1.2], 0.3, P);
      k.member([x, 0.8, z + 1.2], [x, fl - 1.2, z + 1.2], 0.3, P);
      if (i < 7) {
        k.member([x, 0.8, z + 1.3], [x + 2, fl - 1.2, z + 1.3], 0.2, P);
        k.member([x, 0.8, z - 1.3], [x + 2, fl - 1.2, z - 1.3], 0.2, P);
      }
    }
  }
  // Drill floor.
  boxAt(k.s, [0, fl, 0], [14.5, 0.35, 9.6], MAT.steel, 0, P);
  // Handrails round the floor.
  for (const [a, b] of [[[-7.2, 4.7], [7.2, 4.7]], [[-7.2, -4.7], [7.2, -4.7]], [[-7.2, -4.7], [-7.2, 4.7]]] as const) {
    k.rod([a[0], fl + 1.1, a[1]], [b[0], fl + 1.1, b[1]], 0.05, P);
    k.rod([a[0], fl + 0.55, a[1]], [b[0], fl + 0.55, b[1]], 0.04, P);
  }
  // BOP stack beneath the rotary: annular over double ram over single ram.
  const bop = m4.compose(P, T(0, 0, 0));
  cylinder(k.s, 0.45, 1.2, 64, bop, MAT.steel);
  boxAt(k.s, [0, 1.8, 0], [2.4, 1.0, 1.0], MAT.kocLight, 0, P);
  boxAt(k.s, [0, 2.9, 0], [2.4, 1.0, 1.0], MAT.kocLight, 0, P);
  lathe(k.s, [[0, 0], [0.7, 0], [0.85, 0.3], [0.85, 1.2], [0.5, 1.6], [0.3, 1.6], [0, 1.6]], 96, m4.compose(P, T(0, 3.4, 0)), MAT.kocLight);
  // Mast: open-front cantilever, 4 legs tapering 6.4 × 3.2 m → 2.4 × 2.4 m.
  const base = (x: number, z: number, y: number): V3 => {
    const t = y / H;
    const hx = 3.2 + (1.2 - 3.2) * t;
    const hz = 1.6 + (1.2 - 1.6) * t;
    // Centre drifts from −1.4 m at the floor to 0 at the crown: the crown
    // block must sit plumb over well centre.
    return [x * hx - 1.4 * (1 - t), fl + y, z * hz];
  };
  const legs: [number, number][] = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  for (const [x, z] of legs) k.member(base(x, z, 0), base(x, z, H), 0.42, P, [x, 0, z]);
  const panels = 16;
  for (let p = 0; p <= panels; p++) {
    const y = (p / panels) * H;
    const y2 = ((p + 1) / panels) * H;
    // Back face (x = -1) and both sides (z = ±1) are laced; the front (x = +1) is the V-door, open.
    k.member(base(-1, -1, y), base(-1, 1, y), 0.2, P);
    for (const z of [-1, 1]) k.member(base(-1, z, y), base(1, z, y), 0.2, P);
    if (p === panels) break;
    k.member(base(-1, -1, y), base(-1, 1, y2), 0.14, P);
    k.member(base(-1, 1, y), base(-1, -1, y2), 0.14, P);
    for (const z of [-1, 1]) {
      k.member(base(-1, z, y), base(1, z, y2), 0.14, P);
      if (p % 2 === 0) k.member(base(1, z, y), base(-1, z, y2), 0.12, P);
    }
  }
  // Front struts at intervals, leaving the V-door clear below 12 m.
  for (let p = 4; p <= panels; p += 3) {
    const y = (p / panels) * H;
    k.member(base(1, -1, y), base(1, 1, y), 0.2, P);
  }
  // Crown cluster and crown frame.
  const ct = fl + H;
  boxAt(k.s, [0, ct + 0.5, 0], [3.2, 1.0, 3.0], MAT.koc, 0, P);
  for (let s = -2; s <= 2; s++) {
    const sh = m4.compose(P, T(s * 0.35, ct + 1.3, 0), m4.rotZ(Math.PI / 2));
    cylinder(k.s, 0.65, 0.12, 64, m4.mul(sh, T(0, -0.06, 0)), MAT.steel);
  }
  for (const [x, z] of legs) k.rod([x * 1.5, ct + 1.0, z * 1.4], [x * 1.5, ct + 2.1, z * 1.4], 0.06, P);
  k.rod([-1.5, ct + 2.1, -1.4], [1.5, ct + 2.1, -1.4], 0.06, P);
  k.rod([-1.5, ct + 2.1, 1.4], [1.5, ct + 2.1, 1.4], 0.06, P);
  // Racking board at ~88 ft, fingers toward well centre.
  const rb = fl + ft(88);
  boxAt(k.s, [-2.6, rb, 0], [2.2, 0.12, 4.6], MAT.steel, 0, P);
  for (let f = -6; f <= 6; f++) k.member([-2.2, rb + 0.05, f * 0.33], [-0.3, rb + 0.05, f * 0.33], 0.06, P);
  // Stands set back on the floor, leaning into the fingers: 5" pipe, 93 ft.
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 9; c++) {
      const zb = -2.2 + c * 0.22 + (r % 2) * 0.11;
      const xb = -3.8 + r * 0.24;
      const top: V3 = [-2.1 + r * 0.24, rb + 0.4, zb * 0.9];
      const bot: V3 = [xb, fl + 0.2, zb];
      const len = v3.len(v3.sub(top, bot));
      // One stand = three joints; draw as a single scaled joint series.
      for (let j = 0; j < 3; j++) {
        const a = v3.lerp(bot, top, j / 3);
        const d = v3.norm(v3.sub(top, bot));
        const m = m4.segment(a, v3.add(a, v3.scale(d, len / 3)), 1, 1);
        // DRILL_PIPE is 9.45 m along +Y; rescale Y to one third of the stand.
        const sc = m4.mul(m, S(1, 1 / 9.45, 1));
        pipes.push(...m4.mul(P, sc));
      }
    }
  // Drill lines from crown to block (visible band of ten).
  // (The block itself is animated — see RigParts.block.)
  // Standpipe and rotary hose.
  k.rod([2.3, fl, -1.7], [2.3, fl + 18, -1.7], 0.18, P);
  tube(k.s, spline([[2.3, fl + 18, -1.7], [1.8, fl + 19.5, -1.0], [0.6, fl + 16, -0.4], [0.2, fl + 13, -0.2]], 8), 0.07, 16, P, MAT.dark);
  // Drawworks and driller's cabin.
  boxAt(k.s, [-4.8, fl + 1.3, 0], [2.6, 2.3, 5.2], MAT.koc, 0, P);
  cylinder(k.s, 0.8, 3.8, 96, m4.compose(P, T(-4.8, fl + 1.6, -1.9), m4.rotX(Math.PI / 2)), MAT.steel);
  boxAt(k.s, [2.8, fl + 1.55, 3.4], [3.2, 2.9, 2.4], MAT.white, 0, P);
  boxAt(k.s, [2.8, fl + 2.0, 2.18], [2.6, 1.0, 0.05], MAT.glass, 0, P);
  // Doghouse on the off-driller side.
  boxAt(k.s, [2.2, fl + 1.5, -3.8], [4.0, 2.8, 2.2], MAT.white, 0, P);
  // V-door ramp down to the catwalk.
  boxAt(k.s, [7.5 + 7.5, 0.5, 0], [15, 1.0, 1.9], MAT.steel, 0, P);
  const ramp = m4.segment([12.5, 1.0, 0], [7.1, fl, 0], 1.3, 0.25);
  box(k.s, m4.mul(P, ramp), MAT.steel, true);
  // Stairs from ground to floor (two flights).
  for (let s = 0; s < 26; s++) {
    boxAt(k.s, [-6.8, fl - (s + 1) * (fl / 26), -5.6 - s * 0.25], [1.1, 0.05, 0.28], MAT.steel, 0, P);
  }
  k.rod([-6.3, fl + 1, -5.6], [-6.3, 1, -12.1], 0.05, P);

  // Block + top drive, built separately so it can move on the drill line.
  const bb = new MeshBuilder();
  lathe(bb, [[0, -0.8], [0.5, -0.7], [0.62, 0], [0.5, 1.2], [0, 1.3]], 64, S(1, 1, 0.7), MAT.kocLight);
  boxAt(bb, [0, -2.0, 0], [1.2, 2.2, 1.0], MAT.koc);
  cylinder(bb, 0.1, 1.4, 32, T(0, -4.5, 0), MAT.steel);
  boxAt(bb, [-0.9, -1.6, 0], [0.3, 4.0, 0.5], MAT.steel);
  // Drill lines: unit height, stretched block → crown each frame.
  const lb = new MeshBuilder();
  for (let l = 0; l < 10; l++) {
    const x = (l - 4.5) * 0.075;
    lb.append(UNIT_ROD, m4.segment([x * 0.9, 0, 0], [x * 1.3, 1, 0], 0.032, 0.032), MAT.steel);
  }
  return { block: bb.build(), lines: lb.build(), blockBase: [at[0], at[1] + fl, at[2]], floorY: fl, mastTop: at[1] + ct };
}

// ── Mud system, power, camp, and the other kit of a pad ────────────────────
export function container(k: Kit, c: V3, L: number, W: number, H: number, rot: number, mat: Mat = MAT.white, parent?: M4) {
  const P = parent ?? m4.identity();
  boxAt(k.s, [c[0], c[1] + H / 2, c[2]], [L, H, W], mat, rot, P);
  // Corrugation hint: shallow ribs along the side.
  const ribs = Math.floor(L / 0.6);
  for (let r = 0; r < ribs; r++) {
    const x = -L / 2 + (r + 0.5) * (L / ribs);
    const lx = Math.cos(rot) * x, lz = -Math.sin(rot) * x;
    for (const s of [-1, 1]) {
      const ox = Math.sin(rot) * (W / 2) * s, oz = Math.cos(rot) * (W / 2) * s;
      boxAt(k.s, [c[0] + lx + ox, c[1] + H / 2, c[2] + lz + oz], [0.08, H * 0.92, 0.05], mat, rot, P);
    }
  }
}

export function mudTank(k: Kit, c: V3, rot: number) {
  const P = m4.compose(T(c[0], c[1], c[2]), m4.rotY(rot));
  boxAt(k.s, [0, 1.3, 0], [12, 2.6, 3.0], MAT.koc, 0, P);
  // Walkway grating and handrails.
  boxAt(k.s, [0, 2.65, 0], [12, 0.06, 3.0], MAT.steel, 0, P);
  for (const z of [-1.5, 1.5]) {
    k.rod([-6, 3.7, z], [6, 3.7, z], 0.05, P);
    for (let i = 0; i <= 8; i++) k.rod([-6 + i * 1.5, 2.65, z], [-6 + i * 1.5, 3.7, z], 0.045, P);
  }
  // Agitator motors.
  for (const x of [-3.5, 0, 3.5]) {
    cylinder(k.s, 0.35, 0.9, 48, m4.compose(P, T(x, 2.7, 0)), MAT.steel);
  }
}

export function shaleShaker(k: Kit, c: V3, rot: number) {
  const P = m4.compose(T(c[0], c[1], c[2]), m4.rotY(rot));
  boxAt(k.s, [0, 0.9, 0], [2.8, 1.8, 1.9], MAT.steel, 0, P);
  const bed = m4.compose(P, T(0, 2.1, 0), m4.rotZ(-0.08));
  box(k.s, m4.mul(bed, S(2.9, 0.35, 1.8)), MAT.steelLight);
}

export function mudPump(k: Kit, c: V3, rot: number) {
  const P = m4.compose(T(c[0], c[1], c[2]), m4.rotY(rot));
  boxAt(k.s, [0, 0.3, 0], [7.2, 0.6, 2.8], MAT.steel, 0, P);
  boxAt(k.s, [0.8, 1.6, 0], [3.2, 2.0, 2.4], MAT.koc, 0, P);
  for (const z of [-0.8, 0, 0.8]) {
    const m = m4.compose(P, T(-1.2, 1.3, z), m4.rotZ(Math.PI / 2));
    cylinder(k.s, 0.28, 1.6, 48, m, MAT.steelLight);
  }
  boxAt(k.s, [-2.6, 1.4, 0], [1.4, 1.6, 2.2], MAT.steel, 0, P);
}

export function horizontalTank(k: Kit, c: V3, dia: number, L: number, rot: number, mat: Mat = MAT.paint) {
  const P = m4.compose(T(c[0], c[1], c[2]), m4.rotY(rot));
  const r = dia / 2;
  const prof: [number, number][] = [[0, 0]];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI * 0.5;
    prof.push([Math.sin(a) * r, (1 - Math.cos(a)) * r * 0.35]);
  }
  for (let i = 8; i >= 0; i--) {
    const a = (i / 8) * Math.PI * 0.5;
    prof.push([Math.sin(a) * r, L - (1 - Math.cos(a)) * r * 0.35]);
  }
  lathe(k.s, prof, 128, m4.compose(P, T(-L / 2, r + 0.4, 0), m4.rotZ(-Math.PI / 2)), mat);
  for (const x of [-L * 0.32, L * 0.32]) boxAt(k.s, [x, 0.4, 0], [0.4, 0.8, dia * 0.8], MAT.steel, 0, P);
}

export function coiledTubingUnit(k: Kit, c: V3, rot: number) {
  const P = m4.compose(T(c[0], c[1], c[2]), m4.rotY(rot));
  // Trailer deck on wheels.
  boxAt(k.s, [0, 1.1, 0], [12.5, 0.3, 2.5], MAT.steel, 0, P);
  for (const s of [-1, 1]) for (const x of [-4.6, -3.4]) wheel(k.s, m4.compose(P, T(x, 0.5, s * 1.05)), 0.5, 0.3);
  // Reel: drum 2.4 m, flanges 3.6 m, 2.5 m wide, wound with tubing.
  const R = m4.compose(P, T(-1.5, 3.1, 0), m4.rotX(Math.PI / 2));
  lathe(k.s, [[0, -1.3], [1.8, -1.3], [1.8, -1.2], [1.55, -1.2], [1.55, 1.2], [1.8, 1.2], [1.8, 1.3], [0, 1.3]], 192, R, MAT.koc);
  // Tubing wraps (ribs) visible on the drum.
  for (let w = -10; w <= 10; w++) cylinder(k.s, 1.56, 0.1, 192, m4.mul(R, T(0, w * 0.11 - 0.05, 0)), MAT.steelLight, false);
  boxAt(k.s, [-1.5, 1.95, 0], [3.8, 1.4, 0.5], MAT.steel, 0, P);
  // Level-wind and gooseneck arch to the injector head.
  k.rod([0.6, 3.6, -1.1], [0.6, 3.6, 1.1], 0.14, P);
  const arch = spline([[0.6, 4.4, 0], [2.5, 6.4, 0], [4.8, 7.1, 0], [5.8, 6.6, 0]], 16);
  tube(k.s, arch, 0.05, 12, P, MAT.steelLight);
  // Injector head on its stand.
  boxAt(k.s, [5.8, 5.4, 0], [1.2, 2.0, 1.2], MAT.kocLight, 0, P);
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) k.member([5.8 + x * 1.2, 1.25, z * 1.1], [5.8 + x * 0.55, 4.4, z * 0.55], 0.14, P);
}

export function windsock(c: V3): { pole: MeshData; sock: MeshData; top: V3 } {
  const b = new MeshBuilder();
  cylinder(b, 0.06, 7.5, 24, T(c[0], c[1], c[2]), MAT.steel);
  const s = new MeshBuilder();
  lathe(s, [[0.42, 0], [0.4, 0.5], [0.34, 1.2], [0.26, 2.0], [0.2, 2.6]], 48, m4.rotZ(-Math.PI / 2), MAT.kocLight);
  return { pole: b.build(), sock: s.build(), top: [c[0], c[1] + 7.3, c[2]] };
}

/** Low desert scrub (arfaj), instanced. Returns matrices for a unit shrub. */
export const SHRUB: MeshData = (() => {
  const b = new MeshBuilder();
  const r = rng(7);
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2, d = r() * 0.25;
    ellipsoid(b, 0.22 + r() * 0.12, 0.16 + r() * 0.1, 0.22 + r() * 0.12, 16, T(Math.cos(a) * d, 0.08 + r() * 0.08, Math.sin(a) * d), [0.38, 0]);
  }
  return b.build();
})();
