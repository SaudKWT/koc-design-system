/**
 * An 8½ in matrix-body PDC bit, built from its dimensions. Units are inches;
 * +y is the bit axis, cutting face up (the product-shot orientation — in the
 * hole it points down).
 *
 * WHAT IS MODELLED, AND FROM WHAT
 *   Gauge          8.500 in — the bit size
 *   Blades         6: three primary reaching the cone, three secondary starting
 *                  at the nose. Spiralled, thickening from 0.52 to 1.12 in.
 *   Profile        medium parabolic: cone 0.55 in deep, nose at r = 1.75 in,
 *                  elliptical shoulder rolling into a 2.4 in gauge pad
 *   Cutters        16 mm × 13 mm (1613), 2 mm diamond table, 0.018 in 45°
 *                  chamfer, 20° back-rake, interleaved blade to blade so the
 *                  cutting tracks overlap. ~6.5 per primary blade.
 *   Nozzles        6 interchangeable, threaded, 12/32 in bore, set in the junk
 *                  slots on the body face
 *   Junk slots     floor at r = 2.98 in, so 1.25 in deep at the gauge
 *   Connection     API 4½ in REG pin: 4.5 in long, 5 threads per inch, taper
 *                  3 in/ft on diameter, V-0.040 form (0.104 in deep, 0.040 in
 *                  flats), pitch diameter 4.364 in at the gauge point 0.625 in
 *                  from the shoulder. The helix is real geometry, not a texture.
 *   Shank          5¾ in OD with two opposed bit-breaker slots, a 2¼ in bore,
 *                  welded to the matrix crown's steel blank — the exploded view
 *                  separates the assembly at that weld line.
 *
 *   Evaluation-grade, not a manufacturer's design: the proportions and the
 *   parts are real, the exact cutter layout is not any particular bit.
 */

import {
  basis,
  cross,
  dot,
  lerp,
  norm,
  rotation,
  scale,
  smooth,
  sub,
  add,
  type M4,
  type V3,
} from "./math";
import { MAT, filleted, grid, lathe, merge, place, type MeshData, type ProfilePoint } from "./mesh";

// ── Dimensions ──────────────────────────────────────────────────────────────

export const D = {
  R: 4.25, // gauge radius
  ySplit: 7.6, // weld line: steel shank below, matrix crown above
  yGB: 9.2, // gauge pad bottom
  yGT: 11.6, // gauge pad top (end of shoulder)
  rn: 1.75, // radius of the nose
  hProf: 1.55, // profile height, gauge top to nose
  cone: 0.55, // cone depth
  rShank: 2.875, // 5¾ in shank
  rBore: 1.125, // 2¼ in bore
  rCore: 2.98, // junk slot floor
  // API 4½ REG pin
  pinLen: 4.5,
  pinPitchR: 4.364 / 2, // pitch radius at the gauge point
  pinGaugeY: 4.5 - 0.625,
  pinTaper: 3 / 12 / 2, // radius change per inch of length
  pinP: 1 / 5, // 5 TPI
  pinH: 0.104, // V-0.040 thread height
  // Cutters — 1613
  cutterR: 0.63 / 2,
  cutterL: 0.51,
  table: 0.08,
  chamfer: 0.018,
  backRake: (20 * Math.PI) / 180,
  // Nozzles
  nozzleBore: 12 / 32 / 2,
  bladeAngle0: (32 * Math.PI) / 180,
  spiral: -0.34, // radians of lag at the gauge
} as const;

const TAU = Math.PI * 2;
const SEG = 256; // radial segments on every lathe that matters

// ── The cutting profile ─────────────────────────────────────────────────────
// The curve the cutter tips sweep, centre to gauge top. Sampled densely once,
// then looked up by arc length.

const EA = D.R - D.rn; // ellipse semi-axis in r
const EB = D.hProf; // ellipse semi-axis in y
const Y_NOSE = D.yGT + D.hProf;

/** Profile height as a function of radius (valid for r < R). */
export function profileY(r: number): number {
  if (r <= D.rn) return Y_NOSE - D.cone * Math.pow(1 - r / D.rn, 1.6);
  const s = Math.min(1, (r - D.rn) / EA);
  return D.yGT + EB * Math.cos(Math.asin(s));
}

/** The body face under the blades — the floor between them. */
export function coreY(r: number): number {
  const sd = lerp(0.5, 1.25, smooth(0, D.rn, r));
  return profileY(Math.min(r, D.rCore)) - sd;
}

interface PSample {
  r: number;
  y: number;
  nr: number;
  ny: number;
  s: number;
  /** 0 in the cone, 0…π/2 across the shoulder ellipse. */
  alpha: number;
}

const PROFILE: PSample[] = (() => {
  const pts: Omit<PSample, "nr" | "ny" | "s">[] = [];
  const N1 = 500;
  const N2 = 1500;
  for (let k = 0; k < N1; k++) {
    const r = (k / N1) * D.rn;
    pts.push({ r, y: profileY(r), alpha: 0 });
  }
  for (let k = 0; k <= N2; k++) {
    const a = (k / N2) * (Math.PI / 2);
    pts.push({ r: D.rn + EA * Math.sin(a), y: D.yGT + EB * Math.cos(a), alpha: a });
  }
  let s = 0;
  return pts.map((p, k) => {
    const a = pts[Math.max(0, k - 1)];
    const b = pts[Math.min(pts.length - 1, k + 1)];
    if (k > 0) s += Math.hypot(p.r - pts[k - 1].r, p.y - pts[k - 1].y);
    // Outward normal = tangent rotated a quarter-turn toward the rock.
    const tr = b.r - a.r;
    const ty = b.y - a.y;
    const l = Math.hypot(tr, ty) || 1;
    return { ...p, s, nr: -ty / l, ny: tr / l };
  });
})();

export const PROFILE_LEN = PROFILE[PROFILE.length - 1].s;

function atS(s: number): PSample {
  // Binary search; the table is monotonic in s.
  let lo = 0;
  let hi = PROFILE.length - 1;
  if (s <= 0) return PROFILE[0];
  if (s >= PROFILE_LEN) return PROFILE[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (PROFILE[mid].s < s) lo = mid;
    else hi = mid;
  }
  const a = PROFILE[lo];
  const b = PROFILE[hi];
  const t = (s - a.s) / (b.s - a.s || 1);
  const nr = lerp(a.nr, b.nr, t);
  const ny = lerp(a.ny, b.ny, t);
  const l = Math.hypot(nr, ny) || 1;
  return { r: lerp(a.r, b.r, t), y: lerp(a.y, b.y, t), nr: nr / l, ny: ny / l, s, alpha: lerp(a.alpha, b.alpha, t) };
}

// ── Blades ──────────────────────────────────────────────────────────────────

export interface Blade {
  index: number;
  primary: boolean;
  phi0: number;
  /** Where along the profile the blade starts. */
  s0: number;
}

export const BLADES: Blade[] = Array.from({ length: 6 }, (_, k) => ({
  index: k,
  primary: k % 2 === 0,
  phi0: D.bladeAngle0 + (k * TAU) / 6,
  s0: k % 2 === 0 ? 0.3 : 1.55,
}));

const bladePhi = (b: Blade, r: number) => b.phi0 + D.spiral * (r / D.R) ** 2;
const bladeT = (r: number) => 0.52 + 0.6 * (r / D.R);

/** Horizontal unit vector toward rotation (+θ), perpendicular to the blade's centreline. */
function bladePerp(b: Blade, r: number): [number, number] {
  const phi = bladePhi(b, r);
  const dphi = (2 * D.spiral * r) / (D.R * D.R);
  // d/dr of r·(cos φ, sin φ)
  const tx = Math.cos(phi) - r * dphi * Math.sin(phi);
  const tz = Math.sin(phi) + r * dphi * Math.cos(phi);
  const l = Math.hypot(tx, tz) || 1;
  return [-tz / l, tx / l];
}

/** A point on the blade at radius r, lateral position λ (−1 trailing … +1 leading). */
function bladeXZ(b: Blade, r: number, lambda: number): [number, number] {
  const phi = bladePhi(b, r);
  const [px, pz] = bladePerp(b, r);
  const h = (lambda * bladeT(r)) / 2;
  const x = r * Math.cos(phi) + px * h;
  const z = r * Math.sin(phi) + pz * h;
  const l = Math.hypot(x, z) || 1;
  // Pinned to radius r, so the gauge pad is a true 8½ in cylinder, not a flat.
  return [(x / l) * r, (z / l) * r];
}

interface OutlineSample {
  /** Blade top / outer surface. */
  or: number;
  oy: number;
  /** Outward normal of that surface in (r, y). */
  nr: number;
  ny: number;
  /** A point safely inside the body, where the side walls end. */
  ir: number;
  iy: number;
  s: number;
}

/** The blade's outer edge, centre → shoulder → down the gauge pad → tapering out. */
function bladeOutline(b: Blade): OutlineSample[] {
  const out: OutlineSample[] = [];
  const sGT = PROFILE_LEN;
  const N = 300;
  for (let k = 0; k <= N; k++) {
    const s = lerp(b.s0, sGT, k / N);
    const p = atS(s);
    const off = lerp(0.3, 0.02, smooth(1.05, Math.PI / 2, p.alpha));
    let or = p.r - p.nr * off;
    let oy = p.y - p.ny * off;
    const ramp = smooth(b.s0, b.s0 + 0.45, s);
    // The blade rises out of the body face rather than ending in a cut face.
    const cy = coreY(or);
    oy = lerp(cy, oy, ramp);
    const ir = or <= D.rCore - 0.1 ? or : D.rCore - 0.15;
    const iy = or <= D.rCore - 0.1 ? coreY(or) - 0.15 : Math.min(oy, coreY(D.rCore) - 0.2);
    out.push({ or, oy, nr: p.nr, ny: p.ny, ir, iy, s });
  }
  // Down the gauge pad.
  const gauge = D.R - 0.02;
  const sEnd = out[out.length - 1].s;
  const NG = 40;
  for (let k = 1; k <= NG; k++) {
    const y = lerp(D.yGT, D.yGB, k / NG);
    out.push({ or: gauge, oy: y, nr: 1, ny: 0, ir: D.rCore - 0.15, iy: y, s: sEnd + (D.yGT - y) });
  }
  // Taper back into the body below the gauge — ending INSIDE it, so the
  // blade's open cross-section is never visible.
  const NT = 24;
  // 1.35 in of drop over 1.39 in of run: the chamfer faces the shank but
  // mostly outward, so it catches light instead of reading as an undercut.
  const drop = 1.35;
  const run = gauge - (D.rCore - 0.14);
  const tl = Math.hypot(run, drop);
  for (let k = 1; k <= NT; k++) {
    const t = k / NT;
    const r = lerp(gauge, D.rCore - 0.14, t);
    const y = D.yGB - drop * t;
    out.push({
      or: r,
      oy: y,
      nr: drop / tl,
      ny: -run / tl,
      ir: D.rCore - 0.2,
      iy: y,
      s: sEnd + (D.yGT - D.yGB) + t * tl,
    });
  }
  return out;
}

/** The cross-section loop: up the leading wall, across the top, down the trailing wall. */
const LOOP: { lambda: number; f: number; cap: boolean }[] = [
  ...[0, 0.3, 0.6, 0.8, 0.92, 0.975].map((f) => ({ lambda: 1, f, cap: false })),
  ...[1, 0.93, 0.8, 0.55, 0.25, 0, -0.25, -0.55, -0.8, -0.93, -1].map((l) => ({ lambda: l, f: 1, cap: true })),
  ...[0.975, 0.92, 0.8, 0.6, 0.3, 0].map((f) => ({ lambda: -1, f, cap: false })),
];

function bladeMesh(b: Blade): MeshData {
  const ol = bladeOutline(b);
  return grid({
    nu: ol.length,
    nv: LOOP.length,
    flip: true,
    point: (i, j) => {
      const o = ol[i];
      const L = LOOP[j];
      let r: number, y: number;
      if (L.cap) {
        // A slight crown across the top, so it catches light like a machined land.
        const c = 0.03 * (1 - L.lambda * L.lambda);
        r = o.or + o.nr * c;
        y = o.oy + o.ny * c;
      } else {
        r = lerp(o.ir, o.or, L.f);
        y = lerp(o.iy, o.oy, L.f);
      }
      const [x, z] = bladeXZ(b, Math.max(r, 0.05), L.lambda);
      return [x, y, z];
    },
    panel: (i, j) => {
      const L = LOOP[j];
      const t = bladeT(ol[i].or);
      const v = L.cap ? 1 + ((1 - L.lambda) / 2) * t : L.lambda > 0 ? L.f : 2 + t - L.f;
      return [ol[i].s, v];
    },
    ao: (_, j) => {
      const L = LOOP[j];
      return L.cap ? 1 : lerp(0.5, 1, smooth(0, 0.85, L.f));
    },
  });
}

// ── The crown: body core + blades + nozzle ports ────────────────────────────

/** Arc distance from (r, θ) to the nearest blade wall — drives the baked cavity term. */
function wallDistance(r: number, theta: number): number {
  let best = Infinity;
  for (const b of BLADES) {
    if (r < D.rCore && atS(b.s0).r > r + 0.2) continue;
    let d = theta - bladePhi(b, r);
    d = Math.atan2(Math.sin(d), Math.cos(d));
    best = Math.min(best, Math.abs(d) * r - bladeT(r) / 2);
  }
  return Math.max(0, best);
}

function coreProfile(): ProfilePoint[] {
  // Solid on the left: ceiling of the bore → down the bore → out along the
  // weld face → up the junk slot floor → in across the body face to the axis.
  const pts: ProfilePoint[] = [
    { r: 0, y: 9.8 },
    { r: D.rBore, y: 9.8 },
    { r: D.rBore, y: 9.8 },
    { r: D.rBore, y: D.ySplit },
    { r: D.rBore, y: D.ySplit },
    { r: D.rShank - 0.06, y: D.ySplit },
    { r: D.rShank - 0.06, y: D.ySplit },
    { r: D.rShank, y: D.ySplit + 0.06 },
    { r: D.rShank, y: D.ySplit + 0.06 },
    { r: D.rShank, y: 8.0 },
  ];
  const floor: ProfilePoint[] = [
    { r: D.rShank, y: 8.0 },
    { r: D.rCore, y: 8.45 },
    { r: D.rCore, y: coreY(D.rCore) },
    { r: D.rCore - 0.35, y: coreY(D.rCore - 0.35) },
  ];
  const faced = filleted(floor, 0.3, 8).slice(1);
  pts.push(...faced);
  const N = 90;
  for (let k = 1; k <= N; k++) {
    const r = lerp(D.rCore - 0.35, 0, k / N);
    pts.push({ r, y: coreY(r) });
  }
  return pts;
}

function coreMesh(): MeshData {
  const prof = coreProfile();
  const s: number[] = [0];
  for (let j = 1; j < prof.length; j++)
    s[j] = s[j - 1] + Math.hypot(prof[j].r - prof[j - 1].r, prof[j].y - prof[j - 1].y);
  return grid({
    nu: SEG + 1,
    nv: prof.length,
    wrapU: true,
    point: (i, j) => {
      const a = (i / SEG) * TAU;
      return [prof[j].r * Math.cos(a), prof[j].y, prof[j].r * Math.sin(a)];
    },
    panel: (i, j) => [(i / SEG) * TAU * Math.max(prof[j].r, 0.6), s[j]],
    ao: (i, j) => {
      const { r, y } = prof[j];
      if (y < D.ySplit + 0.1 || r < D.rBore + 0.01) return 0.55;
      // Blades only rise above the floor from 1.1 in below the gauge up.
      const inSlot = smooth(D.yGB - 1.2, D.yGB - 0.2, y);
      const d = wallDistance(r, (i / SEG) * TAU);
      return lerp(1, lerp(0.55, 1, smooth(0, 0.55, d)), inSlot);
    },
  });
}

// ── Cutters ─────────────────────────────────────────────────────────────────

export interface CutterSeat {
  blade: number;
  /** Arc length along the profile. */
  s: number;
  /** Seated transform: local +z is the face normal, origin the face centre. */
  m: M4;
  /** Face normal — also the pocket axis, the direction it leaves in. */
  f: V3;
  /** 0…1 ordering for the explode stagger. */
  order: number;
}

function cutterSeats(): CutterSeat[] {
  const pitch = 0.74;
  const phase = [0, 0.12, 0.25, 0.37, 0.5, 0.62];
  const seats: CutterSeat[] = [];
  for (const b of BLADES) {
    const list: number[] = [];
    const sGauge = PROFILE_LEN - D.cutterR * 0.95;
    for (let s = b.s0 + 0.14 + phase[b.index] * pitch; s < sGauge - pitch * 0.6; s += pitch) list.push(s);
    list.push(sGauge); // the gauge cutter holds the hole size
    for (const s of list) {
      const p = atS(s);
      const [lx, lz] = bladeXZ(b, p.r, 1);
      const rho = norm([lx, 0, lz]);
      const N3: V3 = [rho[0] * p.nr, p.ny, rho[2] * p.nr];
      const [px, pz] = bladePerp(b, p.r);
      let T: V3 = [px, 0, pz];
      T = norm(sub(T, scale(N3, dot(T, N3))));
      // Back-rake: the face leans back from the rock, so its normal tips toward it.
      const f = norm(add(scale(T, Math.cos(D.backRake)), scale(N3, Math.sin(D.backRake))));
      const u = norm(sub(N3, scale(f, dot(f, N3))));
      const tip: V3 = [lx, p.y, lz];
      // Tip on the profile; face centre one radius below it; face just proud of the wall.
      const F = add(sub(tip, scale(u, D.cutterR)), scale(T, -0.085));
      const y = cross(f, u);
      seats.push({
        blade: b.index,
        s,
        m: basis(u, y, f, F),
        f,
        order: 0.72 * (s / PROFILE_LEN) + 0.28 * (b.index / 6),
      });
    }
  }
  return seats;
}

function cutterMesh(): MeshData {
  const { cutterR: r, cutterL: L, table: tb, chamfer: ch } = D;
  const P = MAT.primary;
  const F = MAT.face;
  // Around +y, then turned so the face looks down local +z.
  const prof: ProfilePoint[] = [
    { r: 0, y: -L, m: P, ao: 0.6 },
    { r: r - 0.01, y: -L, m: P, ao: 0.6 },
    { r, y: -L + 0.01, m: P, ao: 0.6 },
    { r, y: -L + 0.01, m: P, ao: 0.7 },
    { r, y: -tb, m: P },
    { r, y: -tb, m: F },
    { r, y: -ch, m: F },
    { r: r - ch, y: 0, m: F },
    { r: r - ch, y: 0, m: F },
    { r: 0, y: 0, m: F },
  ];
  return place(lathe(prof, 96), rotation([1, 0, 0], Math.PI / 2));
}

// ── Nozzles ─────────────────────────────────────────────────────────────────

export interface NozzleSeat {
  m: M4;
  axis: V3;
  order: number;
  /** Seat centre, for the port under it. */
  at: V3;
}

function nozzleSeats(): NozzleSeat[] {
  const seats: NozzleSeat[] = [];
  const radii = [1.45, 2.3, 1.45, 2.3, 1.45, 2.3];
  BLADES.forEach((b, k) => {
    const r = radii[k];
    // Mid-slot, following the spiral.
    const phi = bladePhi(b, r) + TAU / 12;
    const rho: V3 = [Math.cos(phi), 0, Math.sin(phi)];
    const e = 0.01;
    const slope = (coreY(r + e) - coreY(r - e)) / (2 * e);
    const n2 = norm([-slope, 1, 0]);
    const axis = norm([rho[0] * n2[0], n2[1], rho[2] * n2[0]]);
    const at: V3 = [rho[0] * r, coreY(r), rho[2] * r];
    const x = norm(cross(axis, [0, 0, 1]));
    const z = cross(x, axis);
    seats.push({ m: basis(x, axis, z, add(at, scale(axis, -0.025))), axis, order: k / 6, at });
  });
  return seats;
}

function nozzleMesh(): MeshData {
  const I = MAT.ink;
  const head: ProfilePoint[] = [
    { r: 0.36, y: -0.42 },
    { r: 0.33, y: -0.4, ao: 0.6 },
    { r: 0.33, y: -0.33, ao: 0.6 },
    { r: 0.39, y: -0.31 },
    { r: 0.39, y: -0.31 },
    { r: 0.39, y: -0.035 },
    { r: 0.375, y: -0.004 },
    { r: 0.36, y: 0 },
    { r: 0.36, y: 0 },
    { r: 0.265, y: 0 },
    { r: 0.265, y: 0 },
    { r: D.nozzleBore, y: -0.075, ao: 0.6 },
    { r: D.nozzleBore, y: -0.075, ao: 0.6 },
    { r: D.nozzleBore, y: -0.95, ao: 0.3 },
    { r: D.nozzleBore, y: -0.95 },
    { r: 0.3, y: -0.95 },
    { r: 0.3, y: -0.95 },
    { r: 0.345, y: -0.905 },
  ].map((p) => ({ ...p, m: I }));
  // 12 threads per inch on the lower body.
  const p = 1 / 12;
  const y0 = -0.905;
  const y1 = -0.42;
  const rows = Math.ceil(((y1 - y0) / p) * 14);
  const thread = grid({
    nu: 97,
    nv: rows + 1,
    wrapU: true,
    point: (i, j) => {
      const a = (i / 96) * TAU;
      const y = lerp(y0, y1, j / rows);
      const ph = (((y / p + a / TAU) % 1) + 1) % 1;
      const e = smooth(y0, y0 + 0.05, y) * (1 - smooth(y1 - 0.05, y1, y));
      const r = 0.345 + threadForm(ph) * 0.017 * e;
      return [r * Math.cos(a), y, r * Math.sin(a)];
    },
    material: () => I,
    ao: (i, j) => {
      const a = (i / 96) * TAU;
      const y = lerp(y0, y1, j / rows);
      const ph = (((y / p + a / TAU) % 1) + 1) % 1;
      return 0.7 + 0.3 * (threadForm(ph) * 0.5 + 0.5);
    },
  });
  return merge(lathe(head, 96), thread);
}

/**
 * V-0.040 thread form over one pitch, −1 (root) … +1 (crest): 0.2 flat crest,
 * 0.3 flank, 0.2 flat root, 0.3 flank. Flanks eased a hair so the corners do
 * not alias.
 */
function threadForm(ph: number): number {
  if (ph < 0.2) return 1;
  if (ph < 0.5) return 1 - 2 * smooth(0, 1, (ph - 0.2) / 0.3);
  if (ph < 0.7) return -1;
  return -1 + 2 * smooth(0, 1, (ph - 0.7) / 0.3);
}

/**
 * The cutter pockets: the half of each seat that is cut into the blade, dark,
 * just behind the cutter's face. Hidden while a cutter sits in it; once the
 * cutters leave, the blades show where every one of them went.
 */
function pocketMesh(seats: CutterSeat[]): MeshData {
  const n = 24;
  return merge(
    ...seats.map((c) => {
      const pos: number[] = [0, 0, 0];
      for (let k = 0; k <= n; k++) {
        const a = Math.PI / 2 + (k / n) * Math.PI; // the lower half: local x ≤ 0
        pos.push(Math.cos(a) * D.cutterR * 0.99, Math.sin(a) * D.cutterR * 0.99, 0);
      }
      const idx: number[] = [];
      for (let k = 1; k <= n; k++) idx.push(0, k, k + 1);
      const count = pos.length / 3;
      const m: MeshData = {
        pos: new Float32Array(pos.length),
        nrm: new Float32Array(pos.length),
        pnl: new Float32Array(count * 2),
        mat: new Float32Array(count * 2),
        idx: new Uint32Array(idx),
      };
      const x: V3 = [c.m[0], c.m[1], c.m[2]];
      const y: V3 = [c.m[4], c.m[5], c.m[6]];
      const F: V3 = [c.m[12], c.m[13], c.m[14]];
      for (let k = 0; k < count; k++) {
        const p = add(add(F, scale(x, pos[k * 3])), add(scale(y, pos[k * 3 + 1]), scale(c.f, -0.03)));
        m.pos.set(p, k * 3);
        m.nrm.set(c.f, k * 3);
        m.mat[k * 2] = MAT.ink;
        m.mat[k * 2 + 1] = k === 0 ? 0.15 : 0.45;
      }
      return m;
    }),
  );
}

/** Dark discs on the body face — the ports, visible once a nozzle is out. */
function portMesh(seats: NozzleSeat[]): MeshData {
  return merge(
    ...seats.map((n) => {
      const m = lathe(
        [
          { r: 0.45, y: 0.012, m: MAT.ink, ao: 0.55 },
          { r: 0.4, y: 0.012, m: MAT.ink, ao: 0.35 },
          { r: 0, y: 0.012, m: MAT.ink, ao: 0.12 },
        ],
        64,
      );
      // Align local +y to the seat axis.
      const x = norm(cross(n.axis, [0, 0, 1]));
      const z = cross(x, n.axis);
      return place(m, [x, n.axis, z], n.at);
    }),
  );
}

// ── The steel shank: API pin, shoulder, breaker slots, weld face ────────────

const pinPitchRadius = (y: number) => D.pinPitchR - D.pinTaper * (D.pinGaugeY - y);

/** The pin's radius at height y and angle a — the helix is solved per vertex. */
function pinRadius(y: number, a: number): number {
  const h = D.pinH;
  // Right-hand: turned clockwise as seen from the shoulder, the helix advances
  // away from you, toward the nose. (Angle a runs clockwise seen from +y.)
  const ph = (((y / D.pinP + a / TAU) % 1) + 1) % 1;
  const d = threadForm(ph) * (h / 2);
  const e = smooth(0.1, 0.32, y) * (1 - smooth(3.82, 4.08, y));
  let r = pinPitchRadius(y) + h / 2 - (h / 2 - d) * e;
  r -= Math.max(0, 0.12 - y); // 45° nose chamfer
  return r;
}

function pinMesh(): MeshData {
  const rows = Math.round(D.pinLen * 80);
  return grid({
    nu: SEG + 1,
    nv: rows + 1,
    wrapU: true,
    point: (i, j) => {
      const a = (i / SEG) * TAU;
      const y = (j / rows) * D.pinLen;
      const r = pinRadius(y, a);
      return [r * Math.cos(a), y, r * Math.sin(a)];
    },
    panel: (i, j) => [(i / SEG) * TAU * 2.2, (j / rows) * D.pinLen],
    ao: (i, j) => {
      const a = (i / SEG) * TAU;
      const y = (j / rows) * D.pinLen;
      const d = pinRadius(y, a) - (pinPitchRadius(y) - D.pinH / 2);
      return 0.62 + 0.38 * Math.min(1, Math.max(0, d / D.pinH));
    },
  });
}

/** Bit-breaker slots: two opposed flats, 4.70 in across, milled into the shank. */
const FLAT = 2.35;
function shankRadius(y: number, a: number): number {
  const w = smooth(4.95, 5.12, y) * (1 - smooth(6.95, 7.12, y));
  const d = D.rShank - (D.rShank - FLAT) * w;
  const s = Math.abs(Math.sin(a));
  return s < 1e-6 ? D.rShank : Math.min(D.rShank, d / s);
}

function shankMesh(): MeshData {
  const y0 = 4.62;
  const y1 = D.ySplit - 0.06;
  const rows = 160;
  const body = grid({
    nu: SEG * 2 + 1,
    nv: rows + 1,
    wrapU: true,
    point: (i, j) => {
      const a = (i / (SEG * 2)) * TAU;
      const y = lerp(y0, y1, j / rows);
      const r = shankRadius(y, a);
      return [r * Math.cos(a), y, r * Math.sin(a)];
    },
    panel: (i, j) => [(i / (SEG * 2)) * TAU * D.rShank, lerp(y0, y1, j / rows)],
    ao: (i, j) => {
      const a = (i / (SEG * 2)) * TAU;
      const y = lerp(y0, y1, j / rows);
      // The slot's inside corners sit in shadow.
      const r = shankRadius(y, a);
      return r < D.rShank - 0.02 ? lerp(0.78, 1, smooth(4.95, 5.4, y) * (1 - smooth(6.7, 7.12, y))) : 1;
    },
  });
  const neck = pinRadius(D.pinLen, 0);
  const shoulder = lathe(
    [
      { r: neck, y: D.pinLen, ao: 0.6 },
      { r: D.rShank - 0.12, y: D.pinLen },
      { r: D.rShank - 0.12, y: D.pinLen },
      { r: D.rShank, y: D.pinLen + 0.12 },
      { r: D.rShank, y: D.pinLen + 0.12 },
      { r: D.rShank, y: y0 },
    ],
    SEG,
  );
  const top = lathe(
    [
      { r: D.rShank, y: y1 },
      { r: D.rShank, y: y1 },
      { r: D.rShank - 0.06, y: D.ySplit },
      { r: D.rShank - 0.06, y: D.ySplit },
      { r: D.rBore + 0.05, y: D.ySplit },
      { r: D.rBore, y: D.ySplit - 0.05, ao: 0.7 },
      { r: D.rBore, y: D.ySplit - 0.05, ao: 0.5 },
      { r: D.rBore, y: 0.05, ao: 0.3 },
      { r: D.rBore, y: 0.05, ao: 0.6 },
      { r: D.rBore + 0.05, y: 0 },
      { r: D.rBore + 0.05, y: 0 },
      { r: pinRadius(0, 0), y: 0 },
    ],
    SEG,
  );
  return merge(pinMesh(), body, shoulder, top);
}

// ── Assembly ────────────────────────────────────────────────────────────────

export type CalloutId = "cutter" | "nozzle" | "gauge" | "breaker" | "pin";

export interface Anchor {
  part: "shank" | "crown" | "cutter" | "nozzle";
  /** Instance index for cutter / nozzle anchors. */
  index?: number;
  /** In the part's local frame (world frame for shank and crown). */
  p: V3;
}

export interface BitModel {
  shank: MeshData;
  crown: MeshData;
  cutter: MeshData;
  nozzle: MeshData;
  cutters: CutterSeat[];
  nozzles: NozzleSeat[];
  anchors: Record<CalloutId, Anchor>;
  /** Drawn per frame (instances counted), and what building it cost on the CPU. */
  stats: { vertices: number; triangles: number; buildMs: number };
}

let cached: BitModel | null = null;

export function buildBit(): BitModel {
  if (cached) return cached;
  const t0 = performance.now();
  const cutters = cutterSeats();
  const nozzles = nozzleSeats();
  const crown = merge(coreMesh(), ...BLADES.map(bladeMesh), portMesh(nozzles), pocketMesh(cutters));
  const shank = shankMesh();
  const cutter = cutterMesh();
  const nozzle = nozzleMesh();

  // Anchors pick parts on the side the camera sees.
  const front = BLADES[0];
  const frontCutters = cutters.filter((c) => c.blade === front.index);
  const cIdx = cutters.indexOf(frontCutters[Math.min(3, frontCutters.length - 1)]);
  let nIdx = 0;
  // Right-front, so its leader reaches the callout column without crossing the crown.
  const score = (n: NozzleSeat) => n.at[0] * 0.8 + n.at[2] * 0.5;
  nozzles.forEach((n, k) => {
    if (score(n) > score(nozzles[nIdx])) nIdx = k;
  });
  const [gx, gz] = bladeXZ(front, D.R, 0.2);
  const anchors: Record<CalloutId, Anchor> = {
    cutter: { part: "cutter", index: cIdx, p: [0, 0, 0] },
    nozzle: { part: "nozzle", index: nIdx, p: [0, 0, 0] },
    gauge: { part: "crown", p: [gx, (D.yGB + D.yGT) / 2, gz] },
    breaker: { part: "shank", p: [0.35, 6.05, FLAT] },
    pin: { part: "shank", p: [pinRadius(2.3, 1.3) * Math.cos(1.3), 2.3, pinRadius(2.3, 1.3) * Math.sin(1.3)] },
  };

  const verts =
    shank.pos.length / 3 +
    crown.pos.length / 3 +
    (cutter.pos.length / 3) * cutters.length +
    (nozzle.pos.length / 3) * nozzles.length;
  const tris =
    (shank.idx.length +
      crown.idx.length +
      cutter.idx.length * cutters.length +
      nozzle.idx.length * nozzles.length) /
    3;
  const buildMs = Math.round(performance.now() - t0);
  cached = { shank, crown, cutter, nozzle, cutters, nozzles, anchors, stats: { vertices: verts, triangles: tris, buildMs } };
  return cached;
}

// ── Explode choreography ────────────────────────────────────────────────────

export const EXPLODE = {
  crownLift: 3.3,
  cutterTravel: 1.25,
  nozzleTravel: 2.1,
  /** Turns a nozzle makes as it backs out. Right-hand thread: counter-clockwise seen from above. */
  nozzleTurns: 1.5,
} as const;

const win = (e: number, a: number, b: number) => smooth(0, 1, (e - a) / (b - a));

/** Part progress for a global explode fraction `e` (0 assembled … 1 exploded). */
export function partProgress(e: number) {
  return {
    crown: win(e, 0, 0.55),
    cutter: (order: number) => win(e, 0.18 + order * 0.4, 0.18 + order * 0.4 + 0.38),
    nozzle: (order: number) => win(e, 0.32 + order * 0.25, 0.32 + order * 0.25 + 0.4),
  };
}

/** The profile outline and the cutter row, for the non-WebGL drawing. */
export function elevation(): {
  profile: [number, number][];
  pinThread: [number, number][];
  cutters: [number, number][];
} {
  const profile: [number, number][] = [];
  for (let k = 0; k <= 120; k++) {
    const p = atS((k / 120) * PROFILE_LEN);
    profile.push([p.r, p.y]);
  }
  const pinThread: [number, number][] = [];
  for (let k = 0; k <= 400; k++) {
    const y = (k / 400) * D.pinLen;
    pinThread.push([pinRadius(y, 0), y]);
  }
  // One blade's cutters as they stand in silhouette: centre one radius inside the profile.
  const cutters: [number, number][] = [];
  for (let s = 0.44; s < PROFILE_LEN - D.cutterR * 0.9; s += 0.74) {
    const p = atS(s);
    cutters.push([p.r - p.nr * D.cutterR, p.y - p.ny * D.cutterR]);
  }
  const g = atS(PROFILE_LEN - D.cutterR * 0.95);
  cutters.push([g.r - g.nr * D.cutterR, g.y - g.ny * D.cutterR]);
  return { profile, pinThread, cutters };
}
