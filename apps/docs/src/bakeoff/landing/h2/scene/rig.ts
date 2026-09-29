/**
 * A land drilling rig, built member by member at true proportions (feet).
 *
 * The shape is a generic 1,500–2,000 hp land rig of the kind contracted in
 * Kuwait — not any particular rig:
 *   - box substructure, drill floor at 30 ft
 *   - cantilever mast, 142 ft from floor to crown, legs tapering from a
 *     22 × 11 ft base to a 7 ft square crown, girts every 10 ft, zig-zag bracing
 *   - racking board ("monkey board") at 88 ft with fingers and racked stands
 *   - crown block, travelling block and top drive on torque rails
 *   - BOP stack (wellhead spool, double ram, annular) and bell nipple under the floor
 *   - drawworks, doghouse, V-door slide, catwalk, pipe racks with tubulars
 *   - mud tanks, shakers, triplex mud pumps, generator houses, fuel tank
 *
 * Origin: ground level on the well centre. +x is the "back" of the rig
 * (drawworks and mud system), −x the V-door side where pipe comes up.
 */

import { boxMatrix, memberMatrix, trs, multiply, type Mat4, type Vec3 } from "./math";

export type RigMaterial = "clay" | "steel" | "dark" | "accent" | "pad";

export interface Part {
  mesh: "cube" | "cyl";
  m: Mat4;
  mat: RigMaterial;
}

export const RIG = {
  floor: 30,
  mast: 142,
  board: 88,
  /** The rig's footprint, for framing and shadows. */
  extent: { x0: -96, x1: 98, z0: -44, z1: 44, y1: 30 + 142 + 8 },
} as const;

const F = RIG.floor;

function member(out: Part[], a: Vec3, b: Vec3, w: number, mat: RigMaterial = "clay", d = w) {
  out.push({ mesh: "cube", m: memberMatrix(a, b, w, d), mat });
}
function rod(out: Part[], a: Vec3, b: Vec3, dia: number, mat: RigMaterial = "steel") {
  out.push({ mesh: "cyl", m: memberMatrix(a, b, dia, dia), mat });
}
function block(out: Part[], min: Vec3, max: Vec3, mat: RigMaterial = "clay") {
  out.push({ mesh: "cube", m: boxMatrix(min, max), mat });
}
/** Cylinder lying along an axis, by centre, radius and length. */
function drum(out: Part[], c: Vec3, axis: "x" | "z", r: number, len: number, mat: RigMaterial = "clay") {
  const h = len / 2;
  const a: Vec3 = axis === "x" ? [c[0] - h, c[1], c[2]] : [c[0], c[1], c[2] - h];
  const b: Vec3 = axis === "x" ? [c[0] + h, c[1], c[2]] : [c[0], c[1], c[2] + h];
  rod(out, a, b, r * 2, mat);
}

/** Mast leg positions at height t (0 = floor, 1 = crown). */
function legs(t: number): Vec3[] {
  const y = F + RIG.mast * t;
  // Base: 22 ft wide (z) by 11 ft deep (x), front legs ahead of the well centre.
  const hw = 11 + (3.5 - 11) * t;
  const xf = -5.5 + (-3.5 + 5.5) * t;
  const xb = 5.5 + (3.5 - 5.5) * t;
  return [
    [xf, y, -hw],
    [xf, y, hw],
    [xb, y, hw],
    [xb, y, -hw],
  ];
}

/** Everything that does not move. */
export function rigStatic(): Part[] {
  const P: Part[] = [];

  // ── Pad and cellar ────────────────────────────────────────────────────
  block(P, [-100, -1.2, -46], [102, 0, 46], "pad");

  // ── Substructure: two box sides, 8 ft wide, 44 ft long, 30 ft high ────
  for (const side of [-1, 1]) {
    const zi = side * 6;
    const zo = side * 14;
    const xs = [-20, -10, 0, 10, 20];
    for (const x of xs) {
      for (const z of [zi, zo]) member(P, [x, 0, z], [x, F - 1.5, z], 1.1);
    }
    for (const y of [0.6, F / 2, F - 2]) {
      for (const z of [zi, zo]) member(P, [-20, y, z], [20, y, z], 1.0);
      for (const x of xs) member(P, [x, y, zi], [x, y, zo], 0.8);
    }
    // X-bracing on the outer face of each side, two tiers.
    for (let k = 0; k < xs.length - 1; k++) {
      const x0 = xs[k], x1 = xs[k + 1];
      member(P, [x0, 0.6, zo], [x1, F / 2, zo], 0.55);
      member(P, [x1, 0.6, zo], [x0, F / 2, zo], 0.55);
      member(P, [x0, F / 2, zo], [x1, F - 2, zo], 0.55);
      member(P, [x1, F / 2, zo], [x0, F - 2, zo], 0.55);
    }
  }

  // ── Drill floor, rotary table ─────────────────────────────────────────
  block(P, [-20, F - 1.5, -16], [22, F, 16]);
  P.push({ mesh: "cyl", m: multiply(trs([0, F + 0.35, 0]), boxMatrix([-0, 0, 0], [5, 0.7, 5])), mat: "steel" });
  // Handrails round the floor edge.
  for (const [a, b] of [
    [[-20, F + 3.5, -16], [22, F + 3.5, -16]],
    [[-20, F + 3.5, 16], [22, F + 3.5, 16]],
    [[22, F + 3.5, -16], [22, F + 3.5, 16]],
  ] as [Vec3, Vec3][]) rod(P, a, b, 0.25, "steel");

  // ── Mast ──────────────────────────────────────────────────────────────
  const top = legs(1);
  const base = legs(0);
  for (let k = 0; k < 4; k++) member(P, base[k], top[k], 1.25);
  const levels = 14;
  for (let l = 1; l <= levels; l++) {
    const t = l / levels;
    const L = legs(t);
    const Lp = legs((l - 1) / levels);
    // Girts: back (2–3) and both sides (0–1 is the open V-door front; girt it above the board only).
    member(P, L[2], L[3], 0.6);
    member(P, L[0], L[3], 0.6);
    member(P, L[1], L[2], 0.6);
    if (F + RIG.mast * t > F + RIG.board + 4) member(P, L[0], L[1], 0.6);
    // Zig-zag diagonals, alternating per panel.
    const flip = l % 2 === 0;
    member(P, flip ? Lp[2] : Lp[3], flip ? L[3] : L[2], 0.45);
    member(P, flip ? Lp[0] : Lp[3], flip ? L[3] : L[0], 0.45);
    member(P, flip ? Lp[1] : Lp[2], flip ? L[2] : L[1], 0.45);
  }

  // ── Crown ─────────────────────────────────────────────────────────────
  const yc = F + RIG.mast;
  block(P, [-4.2, yc, -4.2], [4.2, yc + 1.2, 4.2]);
  for (let s = -2; s <= 2; s++) drum(P, [s * 1.1, yc + 2.9, 0], "x", 2.3, 0.55, "steel");
  block(P, [-3.6, yc + 1.2, -2.8], [3.6, yc + 5.6, -2.3]);
  block(P, [-3.6, yc + 1.2, 2.3], [3.6, yc + 5.6, 2.8]);
  rod(P, [-4, yc + 6.2, 0], [4, yc + 6.2, 0], 0.6, "steel"); // gin pole beam

  // ── Racking board with fingers, and the stands racked against it ──────
  const yb = F + RIG.board;
  const Lb = legs(RIG.board / RIG.mast);
  block(P, [Lb[0][0] - 9, yb - 0.6, -9], [Lb[0][0] + 0.5, yb, 9]);
  for (let z = -8; z <= 8.01; z += 1.35) {
    if (Math.abs(z) < 2.2) continue; // the gap the stands come through
    member(P, [Lb[0][0] - 9, yb + 0.2, z], [Lb[0][0] - 2, yb + 0.2, z], 0.35);
  }
  // Racked stands: ~93 ft triples, standing on the setback, leaning into the fingers.
  for (const side of [-1, 1]) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        const z = side * (3 + c * 1.3);
        const xFloor = -3.5 - r * 1.2;
        const xBoard = Lb[0][0] - 3 - r * 1.3;
        rod(P, [xFloor, F + 0.1, z], [xBoard, F + 93, z * 0.98], 0.42, "steel");
      }
    }
  }

  // ── Torque rails the top drive rides ──────────────────────────────────
  for (const z of [-1.8, 1.8]) member(P, [2.4, F + 6, z], [2.4, yc - 6, z], 0.45, "steel");

  // ── Standpipe up the back-right leg, gooseneck at 70 ft ──────────────
  const sp0: Vec3 = [6, F, 9.5];
  const sp1: Vec3 = [4.8, F + 70, 8.2];
  rod(P, sp0, sp1, 0.55, "steel");

  // ── Drawworks, behind the mast on the floor ──────────────────────────
  block(P, [8, F, -8], [18, F + 7.5, 8]);
  drum(P, [13, F + 7.8, 0], "z", 2.2, 12, "steel");

  // ── Doghouse, cantilevered off the driller's side ────────────────────
  block(P, [2, F - 1.5, -30], [16, F + 9, -16]);
  block(P, [1.5, F + 9, -30.5], [16.5, F + 9.6, -15.5], "steel");
  // Driller's window band.
  block(P, [1.9, F + 4.5, -29], [2.05, F + 7.5, -17], "dark");

  // ── Stairs to the floor ───────────────────────────────────────────────
  for (let k = 0; k < 12; k++) {
    const x = 24 + k * 2.1;
    const y = F - 2 - k * 2.4;
    block(P, [x - 1, y - 0.3, 16.4], [x + 1.1, y, 20.4], "steel");
  }
  rod(P, [23, F + 2, 20.6], [49, 3, 20.6], 0.3, "steel");

  // ── V-door slide, catwalk, pipe racks with tubulars ──────────────────
  member(P, [-20, F - 0.6, 0], [-50, 4.6, 0], 0.8, "steel", 4.5);
  block(P, [-96, 0, -2.6], [-48, 4.2, 2.6]);
  for (const side of [-1, 1]) {
    // Rack beams across the pipe.
    for (const x of [-90, -76, -62]) block(P, [x - 0.6, 0, side * 5], [x + 0.6, 3, side * 22], "steel");
    for (const x of [-90, -76, -62]) block(P, [x - 0.6, 0, side * 22 - 0.6], [x + 0.6, 3.6, side * 22 + 0.6], "steel");
    // Two tiers of 31 ft range-2 joints, ~5" OD, drawn at 0.65 ft for legibility.
    for (let tier = 0; tier < 2; tier++) {
      for (let k = 0; k < 13; k++) {
        const z = side * (6.2 + k * 1.2 + tier * 0.6);
        rod(P, [-93, 3.35 + tier * 0.62, z], [-60, 3.35 + tier * 0.62, z], 0.62, "steel");
      }
    }
  }

  // ── Mud system, behind the rig ────────────────────────────────────────
  // Three active tanks with grating and agitator motors.
  for (let k = 0; k < 3; k++) {
    const z0 = -34 + k * 11.5;
    block(P, [28, 0, z0], [72, 8, z0 + 10]);
    block(P, [28, 8, z0], [72, 8.3, z0 + 10], "steel");
    for (let a = 0; a < 3; a++) drum(P, [36 + a * 13, 9.6, z0 + 5], "z", 1.1, 2.4, "dark");
  }
  // Shale shakers on the first tank.
  block(P, [30, 8.3, -35], [40, 13, -30], "steel");
  // Flowline from the bell nipple to the shakers.
  rod(P, [3, F - 6, -2], [34, 13, -32], 0.9, "steel");
  // Two triplex pumps with their fluid ends.
  for (let k = 0; k < 2; k++) {
    const z0 = 8 + k * 12;
    block(P, [76, 0, z0], [96, 7.5, z0 + 8]);
    drum(P, [95, 4.2, z0 + 4], "z", 2.2, 8.6, "steel");
    drum(P, [80, 8.3, z0 + 4], "x", 1.4, 7, "dark");
  }
  // Generator houses.
  for (let k = 0; k < 3; k++) block(P, [76, 0, -44 + k * 11.5], [98, 10, -34 + k * 11.5]);
  // Diesel tank.
  drum(P, [52, 5.2, 38], "x", 5, 30);
  block(P, [38, 0, 34], [66, 1.2, 42], "steel");
  // Water tank.
  block(P, [-44, 0, -44], [-14, 9, -34]);

  // ── Completed wells' trees on the same pad ────────────────────────────
  return P;
}

/**
 * The moving parts, for a travelling-block height `h` in feet above the floor.
 * Drill lines are re-strung from the crown to the block each frame.
 */
export function rigDynamic(h: number): Part[] {
  const P: Part[] = [];
  const yc = F + RIG.mast;
  const yb = F + h;
  // Top drive: motor housing, gearbox, guide dolly to the torque rails.
  block(P, [-2.4, yb, -2.4], [2.4, yb + 9, 2.4], "accent");
  drum(P, [0, yb + 11.5, 0], "x", 2.2, 4.2, "accent");
  block(P, [2.1, yb + 1, -2.2], [2.9, yb + 8, 2.2], "steel");
  rod(P, [0, yb - 5.5, 0], [0, yb, 0], 0.9, "steel"); // saver sub / quill
  // Travelling block above it.
  const ytb = yb + 14;
  block(P, [-2.2, ytb, -1.8], [2.2, ytb + 7, 1.8], "clay");
  for (let s = -2; s <= 2; s++) drum(P, [s * 0.8, ytb + 5.4, 0], "x", 1.8, 0.35, "steel");
  // Ten lines strung between crown and travelling block.
  for (let s = -2; s <= 2; s++) {
    for (const z of [-0.9, 0.9]) rod(P, [s * 1.1, yc + 0.5, z * 1.2], [s * 0.8, ytb + 7, z], 0.14, "dark");
  }
  // Drill string going down through the rotary into the hole.
  rod(P, [0, F - 20, 0], [0, yb - 5.5, 0], 0.42, "steel");
  return P;
}

/** Points of the kelly hose (rotary hose) from the standpipe gooseneck to the top drive. */
export function kellyHose(h: number, samples = 96): Vec3[] {
  const a: Vec3 = [4.8, F + 70, 8.2];
  const b: Vec3 = [0.5, F + h + 10, 2.2];
  const pts: Vec3[] = [];
  // A hanging loop: straight-line blend plus a catenary-ish sag that grows as
  // the ends come together, so the hose never goes taut or through the mast.
  const span = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const slack = Math.max(8, 78 - span) * 0.9;
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const sag = Math.sin(Math.PI * t) * slack;
    pts.push([
      a[0] + (b[0] - a[0]) * t + Math.sin(Math.PI * t) * 3.5,
      a[1] + (b[1] - a[1]) * t - sag,
      a[2] + (b[2] - a[2]) * t + Math.sin(Math.PI * t) * 2,
    ]);
  }
  return pts;
}

/** Christmas-tree profile for a completed well (lathe, [r, y]). */
export const TREE_PROFILE: [number, number][] = [
  [0, 0], [1.4, 0], [1.4, 0.6], [1.4, 0.6], [0.9, 0.6], [0.9, 1.6], [1.25, 1.6], [1.25, 2.1],
  [0.7, 2.1], [0.7, 3.6], [1.1, 3.6], [1.1, 4.1], [0.62, 4.1], [0.62, 5.6], [0.9, 5.6],
  [0.9, 6.0], [0.45, 6.0], [0.45, 6.8], [0.6, 6.8], [0.6, 7.2], [0, 7.2],
];

/** BOP stack and bell nipple under the rotary: wellhead, spool, annular. [r, y] */
export const BOP_PROFILE: [number, number][] = [
  [0, 0], [1.9, 0], [1.9, 1.2], [1.9, 1.2], [1.3, 1.2], [1.3, 2.6], [2.1, 2.6], [2.1, 3.1],
  [1.6, 3.1], [1.6, 3.4], [2.3, 3.4], [2.3, 3.9], // flange up to the rams (rams are boxes)
  [1.8, 3.9], [1.8, 9.4], [2.5, 9.4], [2.5, 9.9],
  // Annular preventer: the domed body.
  [2.7, 9.9], [2.95, 10.6], [3.0, 11.4], [2.85, 12.2], [2.4, 12.9], [1.8, 13.3], [1.2, 13.5],
  [1.2, 13.9], [1.6, 13.9], [1.6, 14.3], [0.95, 14.3],
  // Bell nipple to the floor.
  [0.95, 27.5], [1.4, 27.5], [1.4, 28.2], [0, 28.2],
];

/** Ram preventer bodies, sitting on the BOP profile between 4 and 9 ft. */
export function ramBodies(): Part[] {
  const P: Part[] = [];
  block(P, [-3.4, 4.2, -1.9], [3.4, 6.4, 1.9], "accent");
  block(P, [-3.4, 6.7, -1.9], [3.4, 8.9, 1.9], "accent");
  for (const x of [-3.9, 3.9]) {
    drum(P, [x, 5.3, 0], "x", 1.1, 1.2, "steel");
    drum(P, [x, 7.8, 0], "x", 1.1, 1.2, "steel");
  }
  return P;
}
