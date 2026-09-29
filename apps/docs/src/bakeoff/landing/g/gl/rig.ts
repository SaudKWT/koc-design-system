/**
 * The wellsite, modelled in feet. 1 unit = 1 ft; y is up; the well is at the
 * origin; the V-door faces +z; the camera sits in the +x/+z quadrant.
 *
 * WHAT IS REAL (proportions, from public rig and equipment data):
 *   - A 2,000 HP-class land rig: 142 ft mast (floor to crown), 30 ft
 *     substructure, racking board 88 ft above the floor so 93 ft triples of
 *     range-2 drill pipe lean into it.
 *   - 5" drill pipe with 6⅝" tool joints; 60" crown and block sheaves, 7 over 6,
 *     strung with 12 lines, a fast line to the drum and a dead line to its anchor.
 *   - A 13⅝" stack: annular, single ram, double ram, drilling spool, casing
 *     head, with a 15 ft span across the ram operators.
 *   - Casing sizes 30" / 18⅝" / 13⅜" / 9⅝".
 * WHAT IS NOT:
 *   - The layout of the pad is plausible, not a surveyed KOC location.
 *   - Everything below grade is a schematic: casing shoe depths are compressed
 *     to fit the drawing, and a drafting break line says so.
 *   - Which team "owns" which piece of equipment (PART_TEAMS) is an editorial
 *     mapping for this landing page, not an org fact.
 */

import { arc, extrude, lathe, MeshBuilder, pipe, route, tube, type MeshData } from "./geometry";
import { m4, member, type Vec3 } from "./math";
import { MAT, PART, ROLE, Scene, type Batch } from "./scene";

export const FLOOR = 30;
export const MAST_H = 142;
export const CROWN_Y = FLOOR + MAST_H;
export const STAND_FT = 93;
/** Crown shaft height: sheave centres. */
const CROWN_SHAFT = CROWN_Y + 4.2;
/** Block sheave centre, relative to the quill bottom (the moving frame). */
const BLOCK_SHEAVE = 21.6;
/** Rotary hose, standpipe gooseneck outlet and length. */
export const HOSE_FROM: Vec3 = [-4.6, 104.6, -3.9];
export const HOSE_LEN = 75;
/** TD gooseneck outlet, in the moving frame. */
export const HOSE_TO_LOCAL: Vec3 = [0, 12.6, -1.3];

/** The eight teams, mapped to where they live on the wellsite. Editorial. */
export const PART_TEAMS: Record<string, number> = {
  EN01: PART.office,
  EN11: PART.rig,
  EN31: PART.logistics,
  EN41: PART.wellControl,
  EN51: PART.well,
  EN61: PART.well,
  EN71: PART.materials,
  EN81: PART.producer,
};

export interface Model {
  batches: Batch[];
  segs: Float32Array;
  anchors: Record<string, Vec3>;
  partMin: Map<number, Vec3>;
  partMax: Map<number, Vec3>;
  bmin: Vec3;
  bmax: Vec3;
  templates: Scene["templates"];
}

const P = PART;

// ── shared profiles ─────────────────────────────────────────────────────────

/** 60" sheave: hub, web, rim and a grooved tread. Axis +y, centred on y=0. */
function sheaveProfile(): [number, number][] {
  const t = 0.275;
  const groove = arc([2.5, 0, 0], [-1, 0, 0], [0, 1, 0], 0.28, -Math.PI / 2.4, Math.PI / 2.4, 5).map(
    ([r, y]) => [r, y] as [number, number],
  );
  return [
    [0.3, -t], [0.72, -t], [0.72, -0.1], [2.0, -0.1], [2.0, -t], [2.5, -t],
    ...groove.map(([r, y]) => [Math.min(r, 2.5), y] as [number, number]),
    [2.5, t], [2.0, t], [2.0, 0.1], [0.72, 0.1], [0.72, t], [0.3, t], [0.3, -t],
  ];
}

/** A horizontal vessel with 2:1 ellipsoidal heads, axis +y from 0 to 2h + shell. */
function vesselProfile(R: number, shell: number, samples = 10): [number, number][] {
  const h = R / 2;
  const out: [number, number][] = [];
  for (let k = 0; k <= samples; k++) {
    const t = (k / samples) * (Math.PI / 2);
    out.push([R * Math.sin(t), h * (1 - Math.cos(t))]);
  }
  for (let k = 0; k <= samples; k++) {
    const t = (k / samples) * (Math.PI / 2);
    out.push([R * Math.cos(t), h + shell + h * Math.sin(t)]);
  }
  return out;
}

/**
 * Tool-jointed drill pipe along +y, `joints` × 31 ft, normalised to y ∈ [0,1].
 * 5" body, 6⅝" tool joints (pin 1 ft, box 1.4 ft) with 18° shoulders. The
 * upset is folded into the shoulder: at ~1 px across it cannot be drawn.
 */
function drillPipeProfile(joints: number): [number, number][] {
  const TJ = 0.276, BODY = 0.208, L = 31;
  const out: [number, number][] = [[0, 0]];
  for (let j = 0; j < joints; j++) {
    const y0 = j * L;
    out.push([TJ, y0], [TJ, y0 + 1.0], [BODY, y0 + 1.5], [BODY, y0 + L - 1.9], [TJ, y0 + L - 1.4], [TJ, y0 + L]);
  }
  out.push([0, joints * L]);
  const total = joints * L;
  return out.map(([r, y]) => [r, y / total]);
}

/** A round handwheel: a torus, axis +y. */
function wheelProfile(R: number, rho: number): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k <= 10; k++) {
    const t = -Math.PI / 2 + (k / 10) * Math.PI * 2;
    out.push([R + rho * Math.cos(t), rho * Math.sin(t)]);
  }
  return out;
}

/** 2" gate valve with bonnet and handwheel; `axis` is the flow direction. */
function gateValve(S: Scene, c: Vec3, axis: "x" | "y" | "z", stem: Vec3, part: number, size = 1) {
  const s = size;
  const half: Vec3 = [0.45 * s, 0.55 * s, 0.45 * s];
  S.box([c[0] - half[0], c[1] - half[1], c[2] - half[2]], [c[0] + half[0], c[1] + half[1], c[2] + half[2]], part);
  const ax: Vec3 = axis === "x" ? [1, 0, 0] : axis === "y" ? [0, 1, 0] : [0, 0, 1];
  for (const sg of [-1, 1]) {
    const f0: Vec3 = [c[0] + ax[0] * sg * 0.55 * s, c[1] + ax[1] * sg * 0.55 * s, c[2] + ax[2] * sg * 0.55 * s];
    const f1: Vec3 = [f0[0] + ax[0] * sg * 0.18 * s, f0[1] + ax[1] * sg * 0.18 * s, f0[2] + ax[2] * sg * 0.18 * s];
    S.rod(f0, f1, 0.62 * s, part, 32);
  }
  const b0: Vec3 = [c[0] + stem[0] * 0.45 * s, c[1] + stem[1] * 0.45 * s, c[2] + stem[2] * 0.45 * s];
  const b1: Vec3 = [c[0] + stem[0] * 1.1 * s, c[1] + stem[1] * 1.1 * s, c[2] + stem[2] * 1.1 * s];
  const b2: Vec3 = [c[0] + stem[0] * 1.6 * s, c[1] + stem[1] * 1.6 * s, c[2] + stem[2] * 1.6 * s];
  S.rod(b0, b1, 0.3 * s, part, 24);
  S.rod(b1, b2, 0.05 * s, part, 12);
  S.define("wheel", () => lathe(wheelProfile(0.6, 0.05), 32, 35), 35);
  S.put("wheel", m4.compose(member(b2, [b2[0] + stem[0], b2[1] + stem[1], b2[2] + stem[2]], s, 1), m4.scale(1, 1, 1)), part);
}

function railing(S: Scene, pts: Vec3[], part: number, h = 3.5, spacing = 4.5, alpha = 0.7) {
  const st = { part, alpha, width: 1 };
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = Math.max(1, Math.round(len / spacing));
    for (let i = 0; i <= n; i++) {
      if (i === n && k < pts.length - 2) continue;
      const t = i / n;
      const p: Vec3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      S.seg(p, [p[0], p[1] + h, p[2]], st);
    }
    S.seg([a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], st);
    S.seg([a[0], a[1] + h / 2, a[2]], [b[0], b[1] + h / 2, b[2]], { ...st, alpha: alpha * 0.8 });
  }
}

function rectLines(S: Scene, c: Vec3, u: Vec3, v: Vec3, w: number, h: number, part: number, alpha = 0.75) {
  const p = (a: number, b: number): Vec3 => [c[0] + u[0] * a + v[0] * b, c[1] + u[1] * a + v[1] * b, c[2] + u[2] * a + v[2] * b];
  S.poly([p(-w / 2, 0), p(w / 2, 0), p(w / 2, h), p(-w / 2, h), p(-w / 2, 0)], { part, alpha, width: 1 });
}

// ── the pad ─────────────────────────────────────────────────────────────────

const PAD = { x0: -78, x1: 54, z0: -80, z1: 52 };
const EXT = { x0: -24, x1: 33, z1: 96 };
const CELLAR = 4.5;
const PAD_T = 3;

/**
 * Points the camera must keep in frame: pad corners, gin pole, dimension line,
 * and the casing only to -78 ft — below that it runs off the stage's bottom
 * edge, as Petronex's wellbore runs off its card: the well carries on.
 */
export const FIT_POINTS: Vec3[] = [
  ...[0, -PAD_T].flatMap((y) =>
    ([[PAD.x0, PAD.z0], [PAD.x1, PAD.z0], [PAD.x1, PAD.z1], [EXT.x1, EXT.z1], [EXT.x0, EXT.z1], [PAD.x0, PAD.z1]] as const).map(
      ([x, z]) => [x, y, z] as Vec3,
    ),
  ),
  [0, CROWN_Y + 15.5, -4.2],
  [0, -78, 0],
  [-31.4, CROWN_Y + 1, 31.4],
];

function pad(S: Scene) {
  S.mesh(
    "padTop",
    () => {
      const b = new MeshBuilder();
      const up: Vec3 = [0, 1, 0];
      const rect = (x0: number, x1: number, z0: number, z1: number) =>
        b.quad([x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0], up);
      rect(PAD.x0, -CELLAR, PAD.z0, PAD.z1);
      rect(CELLAR, PAD.x1, PAD.z0, PAD.z1);
      rect(-CELLAR, CELLAR, PAD.z0, -CELLAR);
      rect(-CELLAR, CELLAR, CELLAR, PAD.z1);
      rect(EXT.x0, EXT.x1, PAD.z1, EXT.z1);
      return b.build();
    },
    P.site,
    MAT.ground,
  );
  S.mesh(
    "padSide",
    () => {
      const b = new MeshBuilder();
      const loop: [number, number][] = [
        [PAD.x0, PAD.z0], [PAD.x1, PAD.z0], [PAD.x1, PAD.z1], [EXT.x1, PAD.z1],
        [EXT.x1, EXT.z1], [EXT.x0, EXT.z1], [EXT.x0, PAD.z1], [PAD.x0, PAD.z1],
      ];
      for (let k = 0; k < loop.length; k++) {
        const [x0, z0] = loop[k];
        const [x1, z1] = loop[(k + 1) % loop.length];
        const l = Math.hypot(x1 - x0, z1 - z0);
        b.quad([x0, -PAD_T, z0], [x1, -PAD_T, z1], [x1, 0, z1], [x0, 0, z0], [(z1 - z0) / l, 0, -(x1 - x0) / l]);
      }
      return b.build();
    },
    P.site,
    MAT.hatch,
  );
  // Cellar: a concrete box under the hole, tops a hair below grade so the
  // pad owns the rim line.
  const C = CELLAR, W = 0.8, D = -6, top = -0.03;
  S.box([-C - W, D - 0.5, -C - W], [C + W, D, C + W], P.site);
  S.box([-C - W, D, -C - W], [-C, top, C + W], P.site);
  S.box([C, D, -C - W], [C + W, top, C + W], P.site);
  S.box([-C, D, -C - W], [C, top, -C], P.site);
  S.box([-C, D, C], [C, top, C + W], P.site);
}

function grid(S: Scene) {
  const st = { role: ROLE.faint, alpha: 0.28, width: 1, part: P.site };
  const y = 0.03;
  for (let x = -70; x <= 50; x += 10) {
    const zEnd = x >= EXT.x0 && x <= EXT.x1 ? EXT.z1 : PAD.z1;
    if (x === 0) {
      S.seg([x, y, PAD.z0], [x, y, -CELLAR], st);
      S.seg([x, y, CELLAR], [x, y, zEnd], st);
    } else S.seg([x, y, PAD.z0], [x, y, zEnd], st);
  }
  for (let z = -70; z <= 90; z += 10) {
    if (z <= PAD.z1) {
      if (z === 0) {
        S.seg([PAD.x0, y, z], [-CELLAR, y, z], st);
        S.seg([CELLAR, y, z], [PAD.x1, y, z], st);
      } else S.seg([PAD.x0, y, z], [PAD.x1, y, z], st);
    } else S.seg([EXT.x0, y, z], [EXT.x1, y, z], st);
  }
}

// ── substructure and floor ──────────────────────────────────────────────────

const SUB_X = [-20, -11, 11, 20];
const SUB_Z = [-24, -8, 8, 24];
const SUB_TOP = 27.4;
const LEVELS = [0.6, 14, 26.8];

function substructure(S: Scene) {
  const r = P.rig;
  for (const x of SUB_X) for (const z of SUB_Z) S.beam([x, 0, z], [x, SUB_TOP, z], 1.2, 1.2, r);
  for (const x of SUB_X)
    for (const L of LEVELS)
      for (let k = 0; k < 3; k++) S.beam([x, L - 0.55, SUB_Z[k]], [x, L - 0.55, SUB_Z[k + 1]], 0.9, 1.1, r, [0, 0, 1]);
  for (const [a, b] of [[-20, -11], [11, 20]])
    for (const z of SUB_Z) for (const L of LEVELS) S.beam([a, L - 0.55, z], [b, L - 0.55, z], 0.9, 1.1, r, [1, 0, 0]);
  // bracing: X on the outer faces, N on the inner, X on the ends
  for (const x of [-20, 20])
    for (let k = 0; k < 3; k++)
      for (let l = 0; l < 2; l++) {
        const y0 = LEVELS[l] + 0.4, y1 = LEVELS[l + 1] - 0.9;
        S.beam([x, y0, SUB_Z[k] + 0.6], [x, y1, SUB_Z[k + 1] - 0.6], 0.55, 0.55, r);
        S.beam([x, y0, SUB_Z[k + 1] - 0.6], [x, y1, SUB_Z[k] + 0.6], 0.55, 0.55, r);
      }
  for (const x of [-11, 11])
    for (let k = 0; k < 3; k++)
      for (let l = 0; l < 2; l++)
        S.beam([x, LEVELS[l] + 0.4, SUB_Z[k] + 0.6], [x, LEVELS[l + 1] - 0.9, SUB_Z[k + 1] - 0.6], 0.5, 0.5, r);
  for (const z of [-24, 24])
    for (const [a, b] of [[-20, -11], [11, 20]])
      for (let l = 0; l < 2; l++) {
        const y0 = LEVELS[l] + 0.4, y1 = LEVELS[l + 1] - 0.9;
        S.beam([a + 0.6, y0, z], [b - 0.6, y1, z], 0.5, 0.5, r);
        S.beam([b - 0.6, y0, z], [a + 0.6, y1, z], 0.5, 0.5, r);
      }
  // spreaders across the back only — the front stays open for the BOP
  S.beam([-11, 0.05, -24], [11, 0.05, -24], 0.9, 1.1, r, [1, 0, 0]);
  S.beam([-11, 26.25, -24], [11, 26.25, -24], 0.9, 1.1, r, [1, 0, 0]);
  // floor framing, deck, rotary
  S.box([-20.5, SUB_TOP, -24.5], [20.5, 29.6, -23.5], r);
  S.box([-20.5, SUB_TOP, 23.5], [20.5, 29.6, 24.5], r);
  S.box([-20.5, SUB_TOP, -23.5], [-19.5, 29.6, 23.5], r);
  S.box([19.5, SUB_TOP, -23.5], [20.5, 29.6, 23.5], r);
  for (const z of [-2.6, 2.6]) S.box([-19.5, SUB_TOP, z - 0.7], [19.5, 29.6, z + 0.7], r);
  S.box([-20.5, 29.6, -24.5], [20.5, FLOOR, 24.5], r);
  S.define(
    "rotary",
    () =>
      lathe(
        [[0.45, 0], [4.2, 0], [4.2, 1.1], [3.7, 1.22], [3.3, 1.3], [1.9, 1.3], [1.9, 1.48], [0.45, 1.48], [0.45, 0]],
        256,
      ),
    30,
  );
  S.put("rotary", m4.translate(0, FLOOR, 0), r);
  S.box([4.4, FLOOR, -1.4], [7.6, FLOOR + 1.6, 1.4], r);
  S.rod([4.6, FLOOR - 1, 5.5], [4.6, FLOOR + 1.2, 5.5], 0.42, r, 48); // mouse hole
  // floor railing, with gaps for the V-door, the stair and the doghouse
  const y = FLOOR;
  railing(S, [[-3.5, y, 24.5], [-20.5, y, 24.5], [-20.5, y, -24.5], [20.5, y, -24.5], [20.5, y, -13]], r);
  railing(S, [[20.5, y, 3], [20.5, y, 6]], r);
  railing(S, [[20.5, y, 10], [20.5, y, 24.5], [3.5, y, 24.5]], r);
  S.anchors.floor = [20.5, FLOOR, 24.5];
}

// ── the mast ────────────────────────────────────────────────────────────────

const PANELS = 14;
function legPt(sx: number, sz: number, y: number): Vec3 {
  const t = (y - FLOOR) / MAST_H;
  return [sx * (10 - 5.5 * t), y, sz * (7 - 2.5 * t)];
}

function mast(S: Scene) {
  const r = P.rig;
  const ys = Array.from({ length: PANELS + 1 }, (_, k) => FLOOR + (k * MAST_H) / PANELS);
  const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of corners) {
    for (let k = 0; k < PANELS; k++) S.beam(legPt(sx, sz, ys[k]), legPt(sx, sz, ys[k + 1]), 0.9, 0.9, r);
    const b = legPt(sx, sz, FLOOR);
    S.box([b[0] - 1.1, FLOOR, b[2] - 1.1], [b[0] + 1.1, FLOOR + 1.3, b[2] + 1.1], r);
  }
  // faces: back (sz=-1), sides (sx=±1) fully braced; front (V-door) open below the board
  const faces: { a: [number, number]; b: [number, number]; from: number }[] = [
    { a: [-1, -1], b: [1, -1], from: 0 },
    { a: [-1, -1], b: [-1, 1], from: 0 },
    { a: [1, -1], b: [1, 1], from: 0 },
    { a: [-1, 1], b: [1, 1], from: 9 },
  ];
  for (const f of faces) {
    for (let k = Math.max(1, f.from); k <= PANELS; k++)
      S.beam(legPt(f.a[0], f.a[1], ys[k]), legPt(f.b[0], f.b[1], ys[k]), 0.5, 0.5, r);
    for (let k = f.from; k < PANELS; k++) {
      const y0 = ys[k] + 0.5, y1 = ys[k + 1] - 0.5;
      S.beam(legPt(f.a[0], f.a[1], y0), legPt(f.b[0], f.b[1], y1), 0.36, 0.36, r);
      S.beam(legPt(f.b[0], f.b[1], y0), legPt(f.a[0], f.a[1], y1), 0.36, 0.36, r);
    }
  }
  // ladder up the right face, with rungs every foot
  const lad = (y: number, dz: number): Vec3 => {
    const p = legPt(1, -1, y);
    return [p[0] + 0.9, y, p[2] + 1.6 + dz];
  };
  const st = { part: r, alpha: 0.55, width: 1 };
  S.seg(lad(FLOOR, 0), lad(CROWN_Y, 0), st);
  S.seg(lad(FLOOR, 1.35), lad(CROWN_Y, 1.35), st);
  for (let y = FLOOR + 1; y < CROWN_Y; y += 1) S.seg(lad(y, 0), lad(y, 1.35), { ...st, alpha: 0.35 });
}

function crown(S: Scene) {
  const r = P.rig, Y = CROWN_Y;
  for (const [a, b] of [[[-5, -5], [5, -5]], [[-5, 5], [5, 5]], [[-5, -5], [-5, 5]], [[5, -5], [5, 5]]] as [number, number][][])
    S.beam([a[0], Y - 0.4, a[1]], [b[0], Y - 0.4, b[1]], 0.9, 1.2, r);
  for (const z of [-1.6, 1.6]) S.beam([-5, Y - 0.4, z], [5, Y - 0.4, z], 0.8, 1.2, r, [1, 0, 0]);
  S.box([-6.5, Y + 0.6, -6.5], [6.5, Y + 0.85, 6.5], r);
  railing(S, [[-6.5, Y + 0.85, -6.5], [6.5, Y + 0.85, -6.5], [6.5, Y + 0.85, 6.5], [-6.5, Y + 0.85, 6.5], [-6.5, Y + 0.85, -6.5]], r, 3.5, 3.3);
  for (const x of [-3.75, 3.35]) S.box([x, Y + 0.85, -3], [x + 0.4, Y + 7.2, 3], r);
  S.rod([-3.75, CROWN_SHAFT, 0], [3.75, CROWN_SHAFT, 0], 0.35, r, 48);
  S.define("sheave", () => lathe(sheaveProfile(), 64, 32), 32);
  for (let k = 0; k < 7; k++)
    S.put("sheave", m4.compose(m4.translate(-2.7 + 0.9 * k, CROWN_SHAFT, 0), m4.rotZ(-Math.PI / 2)), r);
  S.box([-3.35, Y + 7.0, -2.2], [3.35, Y + 7.4, 2.2], r);
  // gin pole
  const apex: Vec3 = [0, Y + 15, -4.2];
  S.beam([-2.8, Y + 0.85, -5.6], apex, 0.45, 0.45, r);
  S.beam([2.8, Y + 0.85, -5.6], apex, 0.45, 0.45, r);
  S.beam([-1.6, Y + 7.6, -5.0], [1.6, Y + 7.6, -5.0], 0.3, 0.3, r);
  S.put("sheave", m4.compose(m4.translate(0, apex[1] - 0.2, apex[2] + 0.5), m4.rotZ(-Math.PI / 2), m4.scale(0.26, 1, 0.26)), r);
  S.anchors.crown = [0, Y + 7.4, 0];
}

const RB_Y = FLOOR + 88;

function rackingBoard(S: Scene) {
  const r = P.rig, y = RB_Y;
  const face = legPt(1, 1, y); // x half-width and z at this height
  S.beam([-11, y, face[2]], [-11, y, 15.6], 0.5, 0.7, r, [0, 0, 1]);
  S.beam([11, y, face[2]], [11, y, 15.6], 0.5, 0.7, r, [0, 0, 1]);
  S.beam([-11, y, 15.6], [11, y, 15.6], 0.5, 0.7, r, [1, 0, 0]);
  S.beam([-11, y, face[2]], [-face[0], y, face[2]], 0.5, 0.7, r, [1, 0, 0]);
  S.beam([face[0], y, face[2]], [11, y, face[2]], 0.5, 0.7, r, [1, 0, 0]);
  for (let k = 0; k < 13; k++) {
    const x = 3.5 + 0.6 * k;
    for (const sx of [-1, 1]) S.beam([sx * x, y + 0.05, face[2] + 0.4], [sx * x, y + 0.05, 14.2], 0.2, 0.36, r, [0, 0, 1]);
  }
  S.box([-11, y - 0.2, 14.1], [11, y + 0.2, 15.6], r);
  railing(S, [[-11, y + 0.2, face[2]], [-11, y + 0.2, 15.6], [11, y + 0.2, 15.6], [11, y + 0.2, face[2]]], r, 3.5, 3.5);
  for (const sx of [-1, 1]) {
    const up = legPt(sx, 1, y + 12);
    S.beam([sx * 11, y + 0.3, 15.2], up, 0.3, 0.3, r);
  }
  S.anchors.rackingBoard = [11, y + 3.5, 15.6];
}

/**
 * Stand slots in the setback: x between fingers, z rows. While drilling most of
 * the string is in the hole, so the setback is only partly racked — and a full
 * one, at the real 7" finger pitch, prints as a solid slab at this scale.
 */
const STAND_X = Array.from({ length: 7 }, (_, i) => 3.8 + 0.6 * i);
const STAND_Z = Array.from({ length: 3 }, (_, j) => 7.2 + 0.9 * j);
/** Setback slot the swinging stand leaves from. */
export const PICKUP_BOTTOM: Vec3 = [-3.8, FLOOR + 0.3, 8.1];

function stands(S: Scene) {
  S.define("stand", () => lathe(drillPipeProfile(3), 8, 30), 30);
  for (const sx of [-1, 1])
    for (const x of STAND_X)
      for (const zt of STAND_Z) {
        const xs = sx * x;
        if (sx === -1 && x === 3.8 && zt === 7.2) continue; // the one on its way to the well
        S.put("stand", member([xs, FLOOR + 0.3, zt + 0.9], [xs, FLOOR + 0.3 + STAND_FT, zt], 1, 1), P.rig, MAT.fine);
      }
}

function guideRails(S: Scene) {
  const r = P.rig;
  for (const x of [-1.3, 1.3]) {
    S.beam([x, FLOOR + 6, -3.9], [x, CROWN_Y - 7, -3.9], 0.55, 0.8, r, [1, 0, 0]);
    for (let k = 1; k < PANELS; k++) {
      const y = FLOOR + (k * MAST_H) / PANELS;
      if (y < FLOOR + 6 || y > CROWN_Y - 7) continue;
      const bz = legPt(1, -1, y)[2];
      S.beam([x, y, -4.3], [x, y, bz + 0.3], 0.3, 0.3, r);
    }
  }
}

// ── the travelling equipment (moves with u_offset.y = quill height) ──────────

function travelling(S: Scene) {
  const r = P.rig, mv = 1;
  S.rod([0, 0, 0], [0, 2.2, 0], 0.33, r, 48, mv);
  S.box([-1.6, 2.2, -1.7], [1.6, 6.6, 1.5], r, 0, mv);
  for (const x of [-1.05, 1.05]) {
    S.rod([x, 6.6, -0.2], [x, 10.9, -0.2], 1.0, r, 96, mv);
    S.rod([x, 10.9, -0.2], [x, 11.4, -0.2], 0.72, r, 64, mv);
  }
  S.rod([0, 6.6, 0.25], [0, 12.3, 0.25], 0.62, r, 64, mv);
  S.mesh("tdGoose", () => tube(route([[0, 12.1, 0.25], [0, 13.8, 0.25], [0, 13.8, -1.3], [0, 12.6, -1.3]], 0.7, 24), 0.2, 24), r, 0, mv);
  S.mesh(
    "tdBail",
    () => tube(route([[-1.35, 11.8, 0.25], [-1.35, 16.6, 0.25], [1.35, 16.6, 0.25], [1.35, 11.8, 0.25]], 1.3, 32), 0.25, 24),
    r, 0, mv,
  );
  S.box([-1.9, 1.2, -3.4], [1.9, 11.4, -1.7], r, 0, mv);
  for (const y of [2.0, 10.5]) for (const sx of [-1, 1]) S.rod([sx * 1.0, y, -3.75], [sx * 1.65, y, -3.75], 0.3, r, 32, mv);
  for (const sx of [-1, 1]) {
    S.box([sx * 1.55 - 0.2, 4.1, -0.3], [sx * 1.55 + 0.2, 5.3, 0.7], r, 0, mv);
    S.beam([sx * 1.45, 4.6, 0.25], [sx * 1.45, -3.2, 0.25], 0.22, 0.22, r, undefined, mv);
  }
  S.box([-1.6, -4.15, -0.8], [1.6, -3.1, 0.95], r, 0, mv);
  // traveling block
  S.define(
    "hook",
    () => lathe([[0, 0], [0.55, 0], [0.9, 0.5], [0.9, 1.4], [0.7, 1.7], [0, 1.7]], 64, 30),
    30,
  );
  S.put("hook", m4.translate(0, 15.5, 0.25), r, 0, mv);
  for (const sx of [-1, 1]) S.box([sx * 2.35 - (sx < 0 ? 0.35 : 0), 17.2, -2.6], [sx * 2.35 + (sx > 0 ? 0.35 : 0), 25.4, 2.6], r, 0, mv);
  for (let j = 0; j < 6; j++)
    S.put(
      "sheave",
      m4.compose(m4.translate(-1.9 + 0.76 * j, BLOCK_SHEAVE, 0), m4.rotZ(-Math.PI / 2), m4.scale(0.94, 1, 0.94)),
      r, 0, mv,
    );
  S.rod([-2.7, BLOCK_SHEAVE, 0], [2.7, BLOCK_SHEAVE, 0], 0.32, r, 48, mv);
  S.box([-2.7, 25.2, -1.3], [2.7, 25.7, 1.3], r, 0, mv);
  S.box([-2.7, 17.0, -1.4], [2.7, 17.4, 1.4], r, 0, mv);
}

function drillLines(S: Scene) {
  const st = { part: P.rig, alpha: 0.7, width: 1 };
  const xc = (k: number) => -2.7 + 0.9 * k;
  const xb = (j: number) => -1.9 + 0.76 * j;
  for (let j = 0; j < 6; j++) {
    S.seg([xc(j), CROWN_SHAFT, 2.3], [xb(j), BLOCK_SHEAVE, 2.2], { ...st, move: 2 });
    S.seg([xc(j + 1), CROWN_SHAFT, -2.3], [xb(j), BLOCK_SHEAVE, -2.2], { ...st, move: 2 });
  }
  S.seg([xc(0), CROWN_SHAFT, -2.3], [-2.2, FLOOR + 8.2, -16.6], st); // fast line to the drum
  S.seg([xc(6), CROWN_SHAFT, 2.3], [8.5, FLOOR + 1.6, -12], st); // dead line to its anchor
}

// ── rig floor equipment ─────────────────────────────────────────────────────

function drawworks(S: Scene) {
  const r = P.rig, y = FLOOR, zc = -17, yc = y + 6.5;
  S.box([-11.5, y, -23.5], [11.5, y + 0.8, -12.5], r);
  S.box([-7, y + 0.8, -21], [7, y + 5.8, -13], r);
  S.define(
    "drum",
    () => lathe([[0.9, -3.0], [2.6, -3.0], [2.6, -2.6], [1.5, -2.6], [1.5, 2.6], [2.6, 2.6], [2.6, 3.0], [0.9, 3.0], [0.9, -3.0]], 256, 30),
    30,
  );
  S.put("drum", m4.compose(m4.translate(0, yc, zc), m4.rotZ(-Math.PI / 2)), r);
  for (const sx of [-1, 1]) {
    S.rod([sx * 3.1, yc, zc], [sx * 3.45, yc, zc], 2.75, r, 128);
    S.box([sx * 4.2 - (sx < 0 ? 3 : 0), y + 0.8, -19.5], [sx * 4.2 + (sx > 0 ? 3 : 0), y + 6, -14.5], r);
    S.rod([sx * 7.2, y + 2.9, zc], [sx * 11.6, y + 2.9, zc], 1.7, r, 128);
    S.rod([sx * 11.6, y + 2.9, zc], [sx * 12.1, y + 2.9, zc], 1.2, r, 96);
    S.box([sx * 9.4 - 0.9, y + 4.6, zc - 0.8], [sx * 9.4 + 0.9, y + 5.6, zc + 0.8], r);
  }
  // drill line wraps on the barrel
  const wraps: Vec3[] = [];
  for (let k = 0; k <= 14 * 64; k++) {
    const t = (k / 64) * Math.PI * 2;
    wraps.push([-2.55 + (5.1 * k) / (14 * 64), yc + 1.62 * Math.cos(t), zc + 1.62 * Math.sin(t)]);
  }
  S.poly(wraps, { part: r, alpha: 0.4, width: 1 });
  // dead-line anchor
  S.box([7.3, y, -13], [9.7, y + 1.2, -11], r);
  S.rod([7.4, y + 1.6, -12], [9.6, y + 1.6, -12], 0.55, r, 64);
}

function doghouse(S: Scene) {
  const r = P.rig, y = FLOOR;
  S.box([20.5, y, -13], [30, y + 9.5, 3], r);
  S.box([20.2, y + 9.5, -13.3], [30.3, y + 9.9, 3.3], r);
  S.box([23.5, y + 9.9, -9], [27, y + 11.2, -5.5], r);
  for (const z of [-12, -5, 2]) {
    S.beam([29.6, y - 0.1, z], [21, y - 9, z], 0.45, 0.45, r);
    S.beam([20.5, y - 0.4, z], [30, y - 0.4, z], 0.5, 0.8, r, [1, 0, 0]);
  }
  // windows and door, drawn on the faces the camera sees
  rectLines(S, [30.03, y + 4.2, -8.5], [0, 0, 1], [0, 1, 0], 4.2, 2.8, r);
  rectLines(S, [30.03, y + 4.2, -2.5], [0, 0, 1], [0, 1, 0], 4.2, 2.8, r);
  rectLines(S, [24.2, y + 0.3, 3.03], [1, 0, 0], [0, 1, 0], 3, 7, r);
  rectLines(S, [28.2, y + 4.2, 3.03], [1, 0, 0], [0, 1, 0], 2.4, 2.8, r);
  S.anchors.doghouse = [30, y + 9.9, 3];
}

function vdoor(S: Scene) {
  const r = P.rig;
  const top: Vec3 = [0, FLOOR, 24.6], bot: Vec3 = [0, 4.7, 44.2];
  S.beam(top, bot, 5.4, 0.45, r);
  for (const sx of [-1, 1])
    S.seg([sx * 2.7, FLOOR + 1.1, 24.6], [sx * 2.7, 5.8, 44.2], { part: r, alpha: 0.7 });
  S.beam([-2, 0, 36], [-2, 14.9, 36], 0.4, 0.4, r);
  S.beam([2, 0, 36], [2, 14.9, 36], 0.4, 0.4, r);
}

function catwalkAndRacks(S: Scene) {
  const m = P.materials;
  S.box([-3, 0, 44], [3, 4.6, 92], m);
  for (const x of [-1.2, 1.2]) S.beam([x, 4.6, 44.5], [x, 4.6, 91.5], 0.35, 0.5, m, [0, 1, 0]);
  S.box([-2.2, 4.6, 88], [2.2, 6.2, 91.5], m);
  S.define("joint", () => lathe(drillPipeProfile(1), 10, 30), 30);
  // drill pipe racks either side of the catwalk
  for (const sx of [-1, 1]) {
    for (const z of [51, 64, 77]) {
      S.beam([sx * 5, 3.1, z], [sx * 17.5, 3.1, z], 0.45, 0.55, m, [1, 0, 0]);
      for (const x of [5.4, 11.2, 17.1]) S.beam([sx * x, 0, z], [sx * x, 3.1, z], 0.45, 0.45, m);
    }
    for (let layer = 0; layer < 2; layer++) {
      const y = 3.6 + layer * 0.652;
      for (let i = 0; i < 18 - layer; i++) {
        const x = sx * (6.0 + 0.62 * i + layer * 0.31);
        S.put("joint", member([x, y, 48.4], [x, y, 79.4], 1, 1), m, MAT.fine);
      }
      if (layer === 0) for (const z of [51, 64, 77]) S.beam([sx * 5.6, 3.926, z], [sx * 17, 3.926, z], 0.1, 0.3, m, [1, 0, 0]);
    }
  }
  // 9⅝" casing, range 3, on its own rack
  S.define(
    "casing958",
    () => lathe([[0, 0], [0.401, 0], [0.401, 39.1 / 40], [0.443, 39.1 / 40], [0.443, 1], [0, 1]], 24, 30),
    30,
  );
  for (const z of [50, 67, 84]) {
    S.beam([20.5, 3.1, z], [31.5, 3.1, z], 0.45, 0.55, m, [1, 0, 0]);
    for (const x of [21, 31]) S.beam([x, 0, z], [x, 3.1, z], 0.45, 0.45, m);
  }
  for (let layer = 0; layer < 2; layer++)
    for (let i = 0; i < 11 - layer; i++) {
      const x = 21.3 + 0.92 * i + layer * 0.46;
      const y = 3.77 + layer * 0.757;
      S.put("casing958", member([x, y, 46.5], [x, y, 86.5], 1, 1), m, MAT.fine);
    }
  S.anchors.materials = [17.5, 4.6, 70];
}

function stairs(S: Scene) {
  const r = P.rig;
  const flight = (z0: number, y0: number, z1: number, y1: number) => {
    for (const x of [21, 25]) {
      S.beam([x, y0, z0], [x, y1, z1], 0.9, 0.25, r, [1, 0, 0]);
      S.seg([x, y0 + 3.2, z0], [x, y1 + 3.2, z1], { part: r, alpha: 0.7 });
    }
    const n = Math.round((y1 - y0) / 0.75);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const z = z0 + (z1 - z0) * t, y = y0 + (y1 - y0) * t;
      S.box([21.1, y - 0.1, z - 0.45], [24.9, y + 0.05, z + 0.45], r);
    }
  };
  flight(44, 0, 29, 15);
  S.box([20.8, 14.6, 25], [25.2, 15, 29], r);
  for (const [x, z] of [[21, 25], [25, 25], [21, 29], [25, 29]]) S.beam([x, 0, z], [x, 14.6, z], 0.35, 0.35, r);
  flight(25, 15, 10, FLOOR);
  S.box([20.5, FLOOR - 0.4, 6], [25.2, FLOOR, 10], r);
  railing(S, [[25.2, FLOOR, 6], [25.2, FLOOR, 10]], r);
}

// ── well control ────────────────────────────────────────────────────────────

function bop(S: Scene) {
  const w = P.wellControl;
  const flange = (y: number, h = 0.4, R = 1.55) => S.rod([0, y, 0], [0, y + h, 0], R, w, 128);
  // casing head, drilling spool
  S.define("csgHead", () => lathe([[0.72, 0], [1.1, 0], [1.1, 2.0], [1.55, 2.0], [1.55, 2.8], [0.72, 2.8], [0.72, 0]], 128), 30);
  S.put("csgHead", m4.translate(0, -5.2, 0), w);
  S.rod([0, -2.4, 0], [0, 0.2, 0], 1.0, w, 128);
  flange(-2.4, 0.35);
  flange(-0.15, 0.35);
  for (const sx of [-1, 1]) {
    S.rod([sx * 1.0, -1.05, 0], [sx * 2.45, -1.05, 0], 0.26, w, 32);
    gateValve(S, [sx * 1.9, -1.05, 0], "x", [0, 0, 1], w, 0.8);
    S.rod([sx * 1.1, -4.1, 0], [sx * 2.0, -4.1, 0], 0.2, w, 24);
    gateValve(S, [sx * 1.7, -4.1, 0], "x", [0, 0, 1], w, 0.6);
  }
  // double ram
  S.box([-2.8, 0.6, -1.7], [2.8, 5.0, 1.7], w);
  flange(0.2);
  flange(5.0);
  const ram = (y: number) => {
    for (const sx of [-1, 1]) {
      S.box([sx * 2.8 - (sx < 0 ? 1.2 : 0), y - 0.8, -1.5], [sx * 2.8 + (sx > 0 ? 1.2 : 0), y + 0.8, 1.5], w);
      S.rod([sx * 4.0, y, 0], [sx * 6.6, y, 0], 1.05, w, 128);
      S.rod([sx * 6.6, y, 0], [sx * 6.8, y, 0], 0.8, w, 64);
      S.rod([sx * 6.8, y, 0], [sx * 7.6, y, 0], 0.17, w, 24);
    }
  };
  ram(1.85);
  ram(3.8);
  // single ram
  flange(5.4);
  S.box([-2.8, 5.8, -1.7], [2.8, 7.6, 1.7], w);
  flange(7.6);
  ram(6.7);
  // annular
  S.define(
    "annular",
    () => {
      // body flares out of the bottom flange, then an elliptical head closes to the top flange
      const dome: [number, number][] = [];
      for (let k = 1; k <= 10; k++) {
        const t = (k / 10) * (Math.PI / 2);
        dome.push([1.45 + 0.97 * Math.cos(t), 2.9 + 1.4 * Math.sin(t)]);
      }
      return lathe(
        [[0.55, 0], [1.55, 0], [1.55, 0.4], [2.2, 0.75], [2.42, 1.3], [2.42, 2.9], ...dome, [1.45, 4.7], [0.55, 4.7], [0.55, 0]],
        256,
        24,
      );
    },
    24,
  );
  S.put("annular", m4.translate(0, 8.0, 0), w);
  // bell nipple and flow outlet
  S.define("bellNipple", () => pipe(96, 0.8), 30);
  S.put("bellNipple", m4.compose(m4.translate(0, 12.7, 0), m4.scale(1.7, 13.8, 1.7)), w);
  S.rod([0, 26.2, 0], [0, 26.8, 0], 1.25, w, 96);
  // studs on every flanged connection
  S.define("stud", () => lathe([[0, 0], [0.07, 0], [0.07, 1], [0, 1]], 8, 40), 40);
  for (const yc of [-2.4, 0.2, 5.4, 8.0]) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      S.put("stud", m4.compose(m4.translate(1.32 * Math.cos(a), yc - 0.5, 1.32 * Math.sin(a)), m4.scale(1, 1.0, 1)), w);
    }
  }
  // choke and kill lines out of the cellar
  S.mesh("chokeLine", () => tube(route([[2.45, -1.05, 0], [3.6, -1.05, 0], [3.6, 2.2, 0], [27.2, 2.2, 0], [27.2, 2.2, -1]], 0.9, 20), 0.2, 20), w);
  S.mesh("killLine", () => tube(route([[-2.45, -1.05, 0], [-3.6, -1.05, 0], [-3.6, 2.2, 0], [-10.5, 2.2, 0]], 0.9, 20), 0.2, 20), w);
  gateValve(S, [-10.9, 2.2, 0], "x", [0, 1, 0], w, 0.7);
  S.anchors.bop = [7.6, 3.8, 0];
}

function accumulator(S: Scene) {
  const w = P.wellControl;
  S.box([31, 0, 21.5], [45, 0.7, 31], w);
  for (const [x, z] of [[31.3, 21.8], [44.7, 21.8], [31.3, 26.6], [44.7, 26.6]]) S.beam([x, 0.7, z], [x, 6, z], 0.3, 0.3, w);
  S.beam([31.3, 6, 21.8], [44.7, 6, 21.8], 0.3, 0.3, w);
  S.beam([31.3, 6, 26.6], [44.7, 6, 26.6], 0.3, 0.3, w);
  const R = 0.46;
  S.define(
    "bottle",
    () => {
      const pr: [number, number][] = [];
      for (let k = 0; k <= 5; k++) {
        const t = (k / 5) * (Math.PI / 2);
        pr.push([R * Math.sin(t), R - R * Math.cos(t)]);
      }
      for (let k = 0; k <= 5; k++) {
        const t = (k / 5) * (Math.PI / 2);
        pr.push([Math.max(0.12, R * Math.cos(t)), 4.4 - R + R * Math.sin(t)]);
      }
      pr.push([0.12, 4.75], [0, 4.75]);
      return lathe(pr, 16, 28);
    },
    28,
  );
  for (let i = 0; i < 11; i++) for (const z of [23.1, 25.3]) S.put("bottle", m4.translate(32.2 + 1.15 * i, 0.7, z), w);
  S.box([33, 0.7, 27.4], [43, 5.8, 30.6], w);
  for (const x of [35, 38, 41]) S.rod([x, 4.6, 30.6], [x, 4.6, 30.8], 0.38, w, 64);
  // hydraulic hoses to the stack
  for (let k = 0; k < 4; k++) {
    const o = k * 0.35;
    const pts: Vec3[] = [];
    const a: Vec3 = [33 + o, 1.4, 21.5], b: Vec3 = [11.2, 0.35, 3.2 + o], c: Vec3 = [3.0, 1.9 + o * 0.5, 1.0 + o * 0.3];
    for (let s = 0; s <= 24; s++) {
      const t = s / 24;
      pts.push([
        (1 - t) * (1 - t) * a[0] + 2 * t * (1 - t) * 18 + t * t * b[0],
        (1 - t) * (1 - t) * a[1] + 2 * t * (1 - t) * 0.2 + t * t * b[1],
        (1 - t) * (1 - t) * a[2] + 2 * t * (1 - t) * 14 + t * t * b[2],
      ]);
    }
    pts.push(c);
    S.poly(pts, { part: w, alpha: 0.55 });
  }
  S.anchors.wellControl = [38, 6, 26.6];
}

function chokeAndDegasser(S: Scene) {
  const w = P.wellControl;
  S.box([26.5, 0, -4.5], [34, 0.5, 2.5], w);
  S.rod([28.5, 2.4, -3.8], [28.5, 2.4, 1.8], 0.28, w, 32);
  for (const z of [-3.2, -1, 1.2]) {
    S.rod([28.5, 0.5, z], [28.5, 2.4, z], 0.22, w, 24);
    gateValve(S, [28.5, 1.3, z], "y", [1, 0, 0], w, 0.55);
  }
  for (const z of [-2.2, 0.4]) {
    S.box([30.6, 1.6, z - 0.5], [32, 2.9, z + 0.5], w);
    S.rod([31.3, 2.9, z], [31.3, 3.6, z], 0.06, w, 12);
  }
  // mud-gas separator
  S.define("mgs", () => lathe(vesselProfile(2, 14), 128, 25), 25);
  S.put("mgs", m4.translate(38, 3, 9), w);
  for (const [dx, dz] of [[-1.5, -1.5], [1.5, -1.5], [1.5, 1.5], [-1.5, 1.5]]) S.beam([38 + dx, 0, 9 + dz], [38 + dx * 0.9, 4, 9 + dz * 0.9], 0.3, 0.3, w);
  S.rod([38, 19, 9], [38, 29, 9], 0.25, w, 24);
  S.mesh("mgsIn", () => tube(route([[33.8, 2.4, 0.4], [35.6, 2.4, 0.4], [35.6, 10, 7.6]], 0.8, 16), 0.18, 16), w);
}

// ── below grade: the casing programme (schematic) ───────────────────────────

export const SHOES = { conductor: -34, surface: -58, intermediate: -84, production: -108 } as const;
const BREAK_Y = -108;

function casing(S: Scene) {
  const wl = P.well;
  const str = (name: string, ro: number, ri: number, top: number, shoe: number, collars: number[], nose: boolean) => {
    S.define(
      name,
      () => {
        const pr: [number, number][] = [];
        if (nose) {
          // rounded guide shoe
          pr.push([ri * 0.6, shoe - 0.95]);
          for (let k = 0; k <= 8; k++) {
            const t = (k / 8) * (Math.PI / 2);
            pr.push([ri * 0.6 + (ro - ri * 0.6) * Math.sin(t), shoe - 0.95 * Math.cos(t)]);
          }
        } else pr.push([ri, shoe], [ro, shoe]);
        for (const c of collars.slice().sort((a, b) => a - b)) {
          const co = ro * 1.07;
          pr.push([ro, c - 0.45], [co, c - 0.4], [co, c + 0.4], [ro, c + 0.45]);
        }
        pr.push([ro, top], [ri, top], [ri, nose ? shoe - 0.95 : shoe], pr[0]);
        return lathe(pr, 128, 30);
      },
      30,
    );
    S.put(name, m4.identity(), wl);
  };
  str("conductor", 1.25, 1.17, -5.9, SHOES.conductor, [-18], false);
  S.define("driveShoe", () => pipe(128, 0.9), 30);
  S.put("driveShoe", m4.compose(m4.translate(0, SHOES.conductor - 0.2, 0), m4.scale(2.62, 1.2, 2.62)), wl);
  str("surface", 0.776, 0.73, -5.2, SHOES.surface, [-22, -40], true);
  str("intermediate", 0.557, 0.52, -5.0, SHOES.intermediate, [-30, -52, -70], true);
  str("production", 0.401, 0.37, -4.8, BREAK_Y, [-38, -60, -82, -100], false);
  S.put("stand", member([0, BREAK_Y, 0], [0, BREAK_Y + STAND_FT, 0], 1, 1), wl);
  // drafting break line across the strings
  const u: Vec3 = [Math.SQRT1_2, 0, -Math.SQRT1_2];
  const at = (s: number, dy: number): Vec3 => [u[0] * s, BREAK_Y - 0.6 + dy, u[2] * s];
  S.poly([at(-2.4, 0), at(-0.6, 0), at(-0.3, 0.55), at(0.3, -0.55), at(0.6, 0), at(2.4, 0)], { part: wl, alpha: 0.9 });
  S.anchors.well = [0, -56, 0];
  S.anchors.shoeConductor = [1.3, SHOES.conductor, 0];
  S.anchors.shoeSurface = [0.8, SHOES.surface, 0];
  S.anchors.shoeIntermediate = [0.58, SHOES.intermediate, 0];
  S.anchors.shoeProduction = [0.42, BREAK_Y + 2, 0];
}

// ── circulating system ──────────────────────────────────────────────────────

function mudSystem(S: Scene) {
  const s = P.site;
  for (const [z0, z1] of [[-30, -0.5], [0.5, 30]]) {
    for (const x of [-45, -35]) S.box([x - 0.5, 0, z0], [x + 0.5, 0.6, z1], s);
    S.box([-46, 0.6, z0], [-34, 8.6, z1], s);
    railing(S, [[-46, 8.6, z0], [-34, 8.6, z0], [-34, 8.6, z1], [-46, 8.6, z1], [-46, 8.6, z0]], s, 3.5, 5, 0.55);
  }
  for (const z of [-24, -15, -6, 19, 26]) {
    S.box([-40.3, 8.6, z - 0.7], [-38.7, 9.9, z + 0.7], s);
    S.rod([-38.7, 9.3, z], [-36.9, 9.3, z], 0.55, s, 48);
  }
  // shale shakers
  for (const zc of [2.6, 7.3, 12.0]) {
    S.box([-44, 8.6, zc - 2.1], [-37, 10.4, zc + 2.1], s);
    S.beam([-37.2, 12.1, zc], [-44.2, 10.8, zc], 4.0, 1.5, s);
    for (const sz of [-1, 1]) S.rod([-41, 11.8, zc + sz * 2.05], [-41, 11.8, zc + sz * 2.55], 0.45, s, 48);
  }
  S.box([-37, 10.4, 0.8], [-34.2, 14.8, 14.2], s);
  // desander and desilter
  S.define("cone10", () => lathe([[0.05, 0], [0.42, 2.4], [0.42, 3.1], [0.3, 3.3], [0, 3.3]], 32, 28), 28);
  S.define("cone4", () => lathe([[0.03, 0], [0.18, 1.3], [0.18, 1.7], [0, 1.8]], 20, 28), 28);
  S.rod([-40, 12.2, -13.5], [-40, 12.2, -6.5], 0.3, s, 32);
  for (const z of [-11.6, -8.4]) S.put("cone10", m4.translate(-40, 9.2, z), s);
  S.rod([-41, 11.3, -21.5], [-41, 11.3, -16.5], 0.2, s, 24);
  for (let k = 0; k < 8; k++) S.put("cone4", m4.translate(-41 + (k % 2 ? 0.6 : -0.6), 9.4, -21 + Math.floor(k / 2) * 1.3), s);
  // flowline from the bell nipple to the possum belly
  const fl = route([[-0.85, 24.4, 0], [-6, 24.4, 0], [-19, 22.8, 2.5], [-34.4, 14.4, 6.5]], 2.2, 24);
  S.mesh("flowline", () => tube(fl, 0.42, 24), s);
  S.poly(fl, { role: ROLE.primary, alpha: 0.95, width: 2, dash: 9, flow: 24, part: s, lift: 0.45 });
  // mud pumps
  S.define("dampener", () => {
    const pr: [number, number][] = [[0, 0], [0.35, 0], [0.35, 0.6], [0.62, 0.6], [0.62, 0.8]];
    for (let k = 0; k <= 12; k++) {
      const t = -Math.PI / 2 + (k / 12) * Math.PI;
      pr.push([Math.max(0.12, 1.05 * Math.cos(t)), 1.85 + 1.05 * Math.sin(t)]);
    }
    pr.push([0.12, 3.1], [0, 3.1]);
    return lathe(pr, 64, 28);
  }, 28);
  for (const zc of [-36, -18]) {
    S.box([-70, 0, zc - 6], [-52, 1, zc + 6], s);
    S.box([-63, 1, zc - 4], [-56, 7.4, zc + 4], s);
    S.rod([-59.5, 5.4, zc - 4], [-59.5, 5.4, zc + 4], 3.2, s, 128);
    S.box([-56, 1.6, zc - 3.6], [-53.2, 5.4, zc + 3.6], s);
    for (const dz of [-2.4, 0, 2.4]) {
      S.rod([-54.6, 5.4, zc + dz], [-54.6, 5.9, zc + dz], 0.5, s, 48);
      S.rod([-53.2, 3.5, zc + dz], [-52.6, 3.5, zc + dz], 0.5, s, 48);
    }
    S.box([-54.4, 5.9, zc - 3.6], [-53.4, 6.5, zc + 3.6], s);
    S.put("dampener", m4.translate(-53.9, 6.5, zc + 2.9), s);
    S.rod([-70, 4.4, zc], [-64.2, 4.4, zc], 1.8, s, 128);
    S.rod([-70.5, 4.4, zc], [-70, 4.4, zc], 1.4, s, 96);
    S.box([-68, 6.1, zc - 0.8], [-66, 7.1, zc + 0.8], s);
    S.box([-64.2, 1, zc - 3.2], [-63, 8.6, zc + 3.2], s);
    S.mesh(`suction${zc}`, () => tube([[-46, 1.5, zc + 1], [-55.4, 1.5, zc + 1]], 0.35, 32), s);
  }
  // discharge: pumps → header → riser → standpipe → gooseneck
  const dis2 = route([[-53.4, 6.1, -18], [-49, 6.1, -18], [-49, 1.3, -18], [-49, 1.3, -6.4], [-9.6, 1.3, -6.4], [-9.6, 30.6, -6.4]], 1.0, 20);
  const dis1 = route([[-53.4, 6.1, -36], [-49, 6.1, -36], [-49, 1.3, -36], [-49, 1.3, -18.4]], 1.0, 20);
  S.mesh("discharge2", () => tube(dis2, 0.22, 24), s);
  S.mesh("discharge1", () => tube(dis1, 0.22, 24), s);
  const sp0: Vec3 = [-9.6, 30.6, -6.4], sp1: Vec3 = [-6.07, 103, -4.72];
  S.mesh("standpipe", () => tube([sp0, sp1], 0.2, 24), P.rig);
  const goose = route([sp1, [-6.07, 106.2, -4.72], [HOSE_FROM[0], 106.2, HOSE_FROM[2]], HOSE_FROM], 0.7, 20);
  S.mesh("spGoose", () => tube(goose, 0.2, 24), P.rig);
  for (let y = 40; y < 100; y += 12) {
    const t = (y - sp0[1]) / (sp1[1] - sp0[1]);
    const p: Vec3 = [sp0[0] + (sp1[0] - sp0[0]) * t, y, sp0[2] + (sp1[2] - sp0[2]) * t];
    const leg = legPt(-1, -1, y);
    S.beam(p, leg, 0.25, 0.25, P.rig);
  }
  const flowSt = { role: ROLE.primary, alpha: 0.95, width: 2, dash: 9, flow: 24, part: s, lift: 0.3 };
  const supply = [...dis2, sp1, ...goose.slice(1)];
  S.poly(supply, flowSt);
  let len = 0;
  for (let k = 0; k < supply.length - 1; k++)
    len += Math.hypot(supply[k + 1][0] - supply[k][0], supply[k + 1][1] - supply[k][1], supply[k + 1][2] - supply[k][2]);
  // where the hose's dashes pick up, so the flow reads as one stream
  S.anchors.hoseDist0 = [len, 0, 0];
  S.poly(dis1, flowSt);
}

// ── power and logistics ─────────────────────────────────────────────────────

function containerBox(S: Scene, x0: number, x1: number, z0: number, z1: number, h: number, part: number, corrugate = true) {
  S.box([x0, 0, z0], [x1, 0.6, z1], part);
  S.box([x0 + 0.1, 0.6, z0 + 0.1], [x1 - 0.1, h, z1 - 0.1], part);
  if (!corrugate) return;
  for (let x = x0 + 1; x < x1 - 0.5; x += 1)
    S.seg([x, 0.9, z1 - 0.06], [x, h - 0.3, z1 - 0.06], { part, alpha: 0.22 });
}

function power(S: Scene) {
  const s = P.site;
  for (const [z0, z1] of [[-76, -68], [-65, -57]]) {
    containerBox(S, -52, -12, z0, z1, 10.1, s);
    for (let y = 2; y < 9.6; y += 0.45) S.seg([-12.06, y, z0 + 0.8], [-12.06, y, z1 - 0.8], { part: s, alpha: 0.3 });
    for (const x of [-42, -37]) {
      S.rod([x, 10.1, (z0 + z1) / 2], [x, 14.2, (z0 + z1) / 2], 0.55, s, 48);
      S.rod([x, 14.2, (z0 + z1) / 2], [x, 14.45, (z0 + z1) / 2], 0.72, s, 48);
    }
    rectLines(S, [-30, 0.8, z1 - 0.04], [1, 0, 0], [0, 1, 0], 3, 7, s, 0.6);
  }
  containerBox(S, -6, 34, -76, -66, 10.4, s, false);
  for (const x of [2, 12, 22]) S.box([x, 10.4, -73.5], [x + 4.5, 12.2, -69.5], s);
  rectLines(S, [0, 0.8, -66.04], [1, 0, 0], [0, 1, 0], 3, 7, s, 0.6);
  // cable tray to the rig
  for (let z = -62; z <= -26; z += 9) S.beam([14, 0, z], [14, 9, z], 0.35, 0.35, s);
  S.beam([14, 9.2, -66], [14, 9.2, -24.5], 1.4, 0.4, s, [1, 0, 0]);
}

function logistics(S: Scene) {
  const L = P.logistics;
  const tank = (name: string, R: number, shell: number, x0: number, yc: number, zc: number) => {
    S.define(name, () => lathe(vesselProfile(R, shell), 256, 25), 25);
    S.put(name, m4.compose(m4.translate(x0, yc, zc), m4.rotZ(-Math.PI / 2)), L);
    const len = R + shell;
    const sad = (): MeshData => {
      const pts: [number, number][] = [[-R * 0.84, 0], [R * 0.84, 0], [R * 0.84, 1.2]];
      const a = Math.asin(0.68);
      for (let k = 0; k <= 24; k++) {
        const t = a - (2 * a * k) / 24;
        pts.push([R * Math.sin(t), yc - R * Math.cos(t)]);
      }
      pts.push([-R * 0.84, 1.2]);
      return extrude(pts);
    };
    S.define(`${name}Saddle`, sad, 25);
    for (const x of [x0 + len * 0.2, x0 + len * 0.8])
      S.put(`${name}Saddle`, m4.basis([0, 0, 1], [0.6, 0, 0], [0, 1, 0], [x - 0.3, 0, zc]), L);
    S.rod([x0 + len * 0.5, yc + R - 0.3, zc], [x0 + len * 0.5, yc + R + 0.7, zc], 1.0, L, 64);
    S.rod([x0 + len * 0.5, yc + R + 0.7, zc], [x0 + len * 0.5, yc + R + 0.95, zc], 1.2, L, 64);
    // side ladder and roof walkway
    const lx = x0 + len * 0.7, lz = zc + R + 0.4;
    S.seg([lx, 0, lz], [lx, yc + R + 3.5, lz], { part: L, alpha: 0.6 });
    S.seg([lx + 1.3, 0, lz], [lx + 1.3, yc + R + 3.5, lz], { part: L, alpha: 0.6 });
    for (let y = 1; y < yc + R; y += 1) S.seg([lx, y, lz], [lx + 1.3, y, lz], { part: L, alpha: 0.4 });
    S.box([x0 + len * 0.25, yc + R, zc - 1], [x0 + len * 0.75, yc + R + 0.2, zc + 1], L);
    railing(S, [[x0 + len * 0.25, yc + R + 0.2, zc + 1], [x0 + len * 0.75, yc + R + 0.2, zc + 1]], L, 3.3, 4);
  };
  tank("waterTank", 5, 29, 18, 6.5, -44);
  tank("fuelTank", 4, 22, 22, 5.3, -31);
  // water truck
  const tx = 6, tz = -56;
  S.box([tx, 1.6, tz - 1.6], [tx + 28, 2.6, tz + 1.6], L);
  S.define(
    "cab",
    () =>
      extrude([[0, 1.5], [7.2, 1.5], [7.2, 9.4], [2.4, 9.4], [0.9, 6.6], [0, 6.2]]),
    25,
  );
  S.put("cab", m4.basis([1, 0, 0], [0, 0, 8], [0, 1, 0], [tx, 0, tz - 4]), L);
  rectLines(S, [tx + 4.1, 5.8, tz + 4.03], [1, 0, 0], [0, 1, 0], 3.4, 2.6, L);
  S.define("truckTank", () => lathe(vesselProfile(3.4, 16.4), 192, 25), 25);
  S.put("truckTank", m4.compose(m4.translate(tx + 8, 6.2, tz), m4.rotZ(-Math.PI / 2)), L);
  S.define(
    "tyre",
    () => {
      // sidewall, rounded shoulders, tread; then the rim and hub
      const pr: [number, number][] = [[0.95, -0.45], [1.45, -0.45]];
      for (let k = 1; k <= 4; k++) {
        const t = -Math.PI / 2 + (k / 4) * (Math.PI / 2);
        pr.push([1.45 + 0.25 * Math.cos(t), -0.2 + 0.25 * Math.sin(t)]);
      }
      for (let k = 0; k <= 4; k++) {
        const t = (k / 4) * (Math.PI / 2);
        pr.push([1.45 + 0.25 * Math.cos(t), 0.2 + 0.25 * Math.sin(t)]);
      }
      pr.push([0.95, 0.45], [0.95, 0.25], [0.4, 0.25], [0.4, -0.25], [0.95, -0.25], [0.95, -0.45]);
      return lathe(pr, 64, 30);
    },
    30,
  );
  for (const x of [tx + 4.5, tx + 21.5, tx + 25.8])
    for (const sz of [-1, 1]) S.put("tyre", m4.compose(m4.translate(x, 1.7, tz + sz * 3.6), m4.rotX(Math.PI / 2)), L);
  S.anchors.logistics = [35, 12.2, -44];
}

// ── site office (EN01) ──────────────────────────────────────────────────────

function office(S: Scene) {
  const o = P.office;
  const x0 = -74, x1 = -34, z0 = 34, z1 = 44;
  for (const z of [z0 + 1, z1 - 1]) S.box([x0 + 0.5, 0, z - 0.4], [x1 - 0.5, 1.2, z + 0.4], o);
  S.box([x0, 1.2, z0], [x1, 11.4, z1], o);
  S.box([x0 - 0.4, 11.4, z0 - 0.4], [x1 + 0.4, 11.9, z1 + 0.4], o);
  for (const x of [-70, -64, -46, -40]) {
    rectLines(S, [x, 5.2, z1 + 0.03], [1, 0, 0], [0, 1, 0], 4.2, 3.2, o);
    S.seg([x, 5.2, z1 + 0.03], [x, 8.4, z1 + 0.03], { part: o, alpha: 0.55 });
  }
  rectLines(S, [-55, 1.5, z1 + 0.03], [1, 0, 0], [0, 1, 0], 3, 7, o);
  for (let k = 0; k < 3; k++) S.box([-57, 0.4 * k, z1 + 0.9 * (2 - k)], [-53, 0.4 * (k + 1), z1 + 0.9 * (3 - k)], o);
  railing(S, [[-57, 1.2, z1 + 2.7], [-57, 1.2, z1]], o, 3, 3);
  for (const x of [-67, -43]) S.box([x - 1.2, 8.8, z1], [x + 1.2, 10.6, z1 + 1.4], o);
  S.beam([-38, 11.9, 38], [-38, 22, 38], 0.18, 0.18, o);
  S.anchors.office = [-54, 11.9, 44];
}

// ── a producing well on the same pad (EN81) ─────────────────────────────────

const TREE: Vec3 = [46, 0, -8];

function producer(S: Scene) {
  const p = P.producer;
  const [X, , Z] = TREE;
  S.box([X - 3.3, 0, Z - 3.3], [X + 3.3, 0.4, Z + 3.3], p);
  S.define("treeHead", () => lathe([[0.4, 0], [0.9, 0], [0.9, 1.2], [1.25, 1.2], [1.25, 1.6], [0.4, 1.6], [0.4, 0]], 64, 30), 30);
  S.put("treeHead", m4.translate(X, 0.4, Z), p);
  S.put("treeHead", m4.compose(m4.translate(X, 2.0, Z), m4.scale(0.95, 1, 0.95)), p);
  for (const sx of [-1, 1]) {
    S.rod([X + sx * 0.85, 2.8, Z], [X + sx * 1.9, 2.8, Z], 0.18, p, 24);
    gateValve(S, [X + sx * 1.6, 2.8, Z], "x", [0, 0, 1], p, 0.5);
  }
  gateValve(S, [X, 4.3, Z], "y", [0, 0, 1], p, 1.1);
  gateValve(S, [X, 5.75, Z], "y", [0, 0, 1], p, 1.1);
  S.box([X - 0.6, 6.45, Z - 0.6], [X + 0.6, 7.55, Z + 0.6], p);
  for (const sx of [-1, 1]) {
    S.rod([X + sx * 0.6, 7.0, Z], [X + sx * 1.1, 7.0, Z], 0.28, p, 32);
    gateValve(S, [X + sx * 1.7, 7.0, Z], "x", [0, 1, 0], p, 0.9);
  }
  gateValve(S, [X, 8.25, Z], "y", [0, 0, 1], p, 1.0);
  S.define("treeCap", () => lathe([[0, 0], [0.7, 0], [0.7, 0.3], [0.5, 0.45], [0.5, 0.9], [0.14, 0.9], [0.14, 1.3], [0, 1.3]], 48, 30), 30);
  S.put("treeCap", m4.translate(X, 9.0, Z), p);
  const fl = route([[X + 2.4, 7.0, Z], [X + 3.4, 7.0, Z], [X + 3.4, 0.6, Z], [PAD.x1, 0.6, Z]], 0.6, 16);
  S.mesh("prodFlowline", () => tube(fl, 0.18, 24), p);
  S.poly(fl, { role: ROLE.primary, alpha: 0.9, width: 1.6, dash: 7, flow: 14, part: p, lift: 0.2 });
  railing(S, [[X - 3, 0.4, Z - 3], [X + 3, 0.4, Z - 3], [X + 3, 0.4, Z + 3], [X - 3, 0.4, Z + 3], [X - 3, 0.4, Z - 3]], p, 4, 3, 0.6);
  S.anchors.producer = [X, 10.3, Z];
}

// ── annotation ──────────────────────────────────────────────────────────────

function dimensions(S: Scene) {
  const st = { role: ROLE.primary, alpha: 0.85, width: 1, part: PART.note };
  const D = (y: number): Vec3 => [-30, y, 30];
  const top = CROWN_Y + 0.85;
  S.seg(D(0), D(top), st);
  const ext = (from: Vec3, y: number) => S.seg(from, [-31.4, y, 31.4], { ...st, alpha: 0.5 });
  ext([-21.5, 0.02, 21.5], 0.02);
  ext([-20.5, FLOOR, 20.5], FLOOR);
  ext([-6.5, top, 6.5], top);
  for (const y of [0.02, FLOOR, top]) S.seg([-30.9, y - 0.9, 30.9], [-29.1, y + 0.9, 29.1], { ...st, alpha: 1 });
  S.anchors.dimFloor = D(FLOOR / 2);
  S.anchors.dimMast = D(FLOOR + MAST_H / 2);
}

// ── assembly ────────────────────────────────────────────────────────────────

let cached: Model | null = null;

export function buildModel(): Model {
  if (cached) return cached;
  const S = new Scene();
  pad(S);
  grid(S);
  substructure(S);
  mast(S);
  crown(S);
  rackingBoard(S);
  stands(S);
  guideRails(S);
  travelling(S);
  drillLines(S);
  drawworks(S);
  doghouse(S);
  vdoor(S);
  catwalkAndRacks(S);
  stairs(S);
  bop(S);
  accumulator(S);
  chokeAndDegasser(S);
  casing(S);
  mudSystem(S);
  power(S);
  logistics(S);
  office(S);
  producer(S);
  dimensions(S);
  S.anchors.rig = [4.6, 150, 4.6];
  const bmin: Vec3 = [Infinity, Infinity, Infinity], bmax: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const [part, lo] of S.partMin) {
    if (part === PART.note) continue;
    const hi = S.partMax.get(part)!;
    for (let a = 0; a < 3; a++) {
      bmin[a] = Math.min(bmin[a], lo[a]);
      bmax[a] = Math.max(bmax[a], hi[a]);
    }
  }
  cached = {
    batches: S.batches(),
    segs: new Float32Array(S.segs),
    anchors: S.anchors,
    partMin: S.partMin,
    partMax: S.partMax,
    bmin,
    bmax,
    templates: S.templates,
  };
  return cached;
}

// ── the drilling cycle ──────────────────────────────────────────────────────

export interface RigState {
  /** Quill (saver-sub bottom) height; the whole travelling assembly offsets by this. */
  quill: number;
  /** Stand hanging from the top drive, bottom → top, or null. */
  attached: [Vec3, Vec3] | null;
  /** Stand left in the slips, bottom → top, or null. */
  stump: [Vec3, Vec3] | null;
  /** Mud pumps running (they stop for every connection). */
  pumping: number;
  phase: "drilling" | "breaking out" | "hoisting" | "picking up" | "making up";
}

export const CYCLE_S = 30;
const Q_LOW = FLOOR + 4;
const Q_HIGH = FLOOR + 99;
const TOP_OFF = 2; // elevator grips 2 ft below the quill

/** Where everything is at time t (seconds). Pure, so a still frame is just a t. */
export function rigState(t: number): RigState {
  const c = ((t % CYCLE_S) + CYCLE_S) % CYCLE_S;
  const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  const hang = (q: number): [Vec3, Vec3] => [[0, q - TOP_OFF - STAND_FT, 0], [0, q - TOP_OFF, 0]];
  const stumpTop = Q_LOW - TOP_OFF;
  const stump: [Vec3, Vec3] = [[0, stumpTop - STAND_FT, 0], [0, stumpTop, 0]];
  if (c < 18) {
    const q = Q_HIGH - 1 - (Q_HIGH - 1 - Q_LOW) * (c / 18);
    return { quill: q, attached: hang(q), stump: null, pumping: Math.min(1, c / 0.8, (18 - c) / 0.8), phase: "drilling" };
  }
  if (c < 19.5) {
    const q = Q_LOW + 3 * ease((c - 18) / 1.5);
    return { quill: q, attached: null, stump, pumping: 0, phase: "breaking out" };
  }
  if (c < 25) {
    const q = Q_LOW + 3 + (Q_HIGH - Q_LOW - 3) * ease((c - 19.5) / 5.5);
    return { quill: q, attached: null, stump, pumping: 0, phase: "hoisting" };
  }
  if (c < 27.5) {
    const u = ease((c - 25) / 2.5);
    const top: Vec3 = [0, Q_HIGH - TOP_OFF, 0];
    const from: Vec3 = [PICKUP_BOTTOM[0] - top[0], PICKUP_BOTTOM[1] - top[1], PICKUP_BOTTOM[2] - top[2]];
    const fl = Math.hypot(from[0], from[1], from[2]);
    const d0: Vec3 = [from[0] / fl, from[1] / fl, from[2] / fl];
    const d: Vec3 = [d0[0] * (1 - u), d0[1] * (1 - u) - u, d0[2] * (1 - u)];
    const dl = Math.hypot(d[0], d[1], d[2]);
    const bottom: Vec3 = [top[0] + (d[0] / dl) * STAND_FT, top[1] + (d[1] / dl) * STAND_FT, top[2] + (d[2] / dl) * STAND_FT];
    return { quill: Q_HIGH, attached: [bottom, top], stump, pumping: 0, phase: "picking up" };
  }
  const q = Q_HIGH - ease((c - 27.5) / 2.5);
  return { quill: q, attached: hang(q), stump: c < 29 ? stump : null, pumping: 0, phase: "making up" };
}

/** A still frame that shows the rig mid-stand, pumps on. */
export const STILL_T = 7.5;

/**
 * The rotary hose as a catenary between the standpipe gooseneck and the top
 * drive, sampled uniformly by arc length so the tight bottom of the U gets as
 * many points as the straight runs.
 */
export function hoseCurve(quill: number, samples = 512): Vec3[] {
  const A = HOSE_FROM;
  const B: Vec3 = [HOSE_TO_LOCAL[0], HOSE_TO_LOCAL[1] + quill, HOSE_TO_LOCAL[2]];
  const dx = B[0] - A[0], dz = B[2] - A[2];
  const h = Math.max(0.5, Math.hypot(dx, dz));
  const ux = dx / h, uz = dz / h;
  const v = B[1] - A[1];
  const L = Math.max(HOSE_LEN, Math.hypot(h, v) + 0.5);
  const target = Math.sqrt(L * L - v * v);
  // solve 2a·sinh(h/2a) = target for a, by bisection in log space
  let lo = 1e-4, hi = 1e5;
  const f = (a: number) => {
    const x = h / (2 * a);
    return x > 600 ? Infinity : 2 * a * Math.sinh(x) - target;
  };
  for (let k = 0; k < 200; k++) {
    const mid = Math.sqrt(lo * hi);
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  const a = Math.sqrt(lo * hi);
  const x0 = h / 2 - a * Math.atanh(Math.max(-0.999999, Math.min(0.999999, v / L)));
  const s0 = a * Math.sinh((0 - x0) / a);
  const c = A[1] - a * Math.cosh((0 - x0) / a);
  const out: Vec3[] = [];
  for (let k = 0; k <= samples; k++) {
    const s = (k / samples) * L;
    const x = x0 + a * Math.asinh((s + s0) / a);
    const y = a * Math.cosh((x - x0) / a) + c;
    out.push([A[0] + ux * x, y, A[2] + uz * x]);
  }
  out[out.length - 1] = B;
  return out;
}
