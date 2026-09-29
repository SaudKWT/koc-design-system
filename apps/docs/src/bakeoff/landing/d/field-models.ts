/**
 * The drilling models the particle field re-forms into. Every one is built from code — no GLB,
 * OBJ or image sampling — as procedural geometry handed to the stipple sampler.
 *
 * Proportions are real, in each model's natural unit, and only normalised at the end:
 *
 *   rig       metres. A 1,500 hp class land rig: rig floor 9 m (≈30 ft) up on a 12 × 12 m box
 *             substructure with the BOP stack under it; a 43 m (≈142 ft) four-leg derrick tapering
 *             from 8 m to 2.5 m square, X-braced, the V-door face open for the lower panels; crown
 *             block and sheaves; racking (monkey) board at 26.5 m above the floor with the racked
 *             stands leaning into it; travelling block, top drive, drill line and fast line to the
 *             drawworks drum; standpipe and rotary hose; doghouse; pipe ramp, catwalk and two pipe
 *             racks of 13 m range-3 joints; two mud tanks and the pumps behind.
 *   earth     kilometres. A 4 × 2 km block cut on the plane of the well, 2.5 km deep. Six layers
 *             over a gentle anticline (the trap), drawn in the standard lithology patterns — dots
 *             for sand and sandstone, laminated dashes for shale, brick for limestone. The well:
 *             vertical to a 0.95 km kick-off, a 0.5 km radius build, and a 2.5 km lateral steered
 *             along the middle of the reservoir; surface and intermediate casing; one multilateral
 *             leg turning into the block; an older vertical producer for context.
 *   bit       inches. An 8½-inch PDC bit standing on its API 4½-in REG pin: tapered threaded pin,
 *             make-up shoulder, shank with two breaker-slot flats, six spiral blades (three primary
 *             reaching the cone, three secondary) over a cone–nose–shoulder–gauge profile, 16 mm
 *             cutters on every blade's leading edge, gauge pads, and a nozzle in each junk slot.
 *   wellhead  inches. A 3-1/16-in 5K Christmas tree on its wellhead: casing head and tubing head
 *             spools with side outlets, adapter, lower and upper master valves, flow cross, two
 *             wing valves, choke and flowline, swab valve, tree cap and gauge. Every flanged joint
 *             carries its ring of studs and nuts; every valve its handwheel.
 *
 * `buildModel(id, n)` returns n particles (x, y, z, w) in normalised model space: w is the baked
 * shade (+2 for an accent point, −1 for a particle this model does not use; those sit near the
 * model and are drawn transparent). The share of particles a model uses is biased towards the
 * front of the buffer, so the lower density tiers — which draw only a prefix — still get enough
 * points to read.
 */

import { Shape, add, basis, cross, makeRng, mul, norm, type Rng, type V3 } from "./field-sampler";

export type ModelId = "rig" | "earth" | "bit" | "wellhead";
export const MODEL_IDS: readonly ModelId[] = ["rig", "earth", "bit", "wellhead"];

/** How a model is framed and how it idles. Angles in radians; distances in normalised units. */
export interface ModelView {
  /** Camera azimuth around the model's vertical axis (0 looks from +z). */
  yaw: number;
  /** Camera elevation above the horizon. */
  pitch: number;
  dist: number;
  fov: number;
  /** Width / height of the model's framing box. The stage frame is fitted to it. */
  aspect: number;
  /** Look-at point, normalised model space. */
  target: V3;
  /** Idle: continuous turn, rad/s (the bit), or… */
  spin: number;
  /** …a slow sway of this amplitude, rad (everything else). */
  sway: number;
}

export interface ModelInfo {
  label: string;
  /** One factual line, for a caption if the page wants one. */
  caption: string;
}

export const MODEL_INFO: Record<ModelId, ModelInfo> = {
  rig: { label: "Land drilling rig", caption: "1,500 hp class · 43 m mast · rig floor 9 m" },
  earth: { label: "Horizontal well", caption: "Kick-off 950 m · 500 m build radius · 2.5 km lateral in the reservoir" },
  bit: { label: "PDC bit", caption: "8½-in · six blades · 16 mm cutters · API 4½-in REG pin" },
  wellhead: { label: "Wellhead and tree", caption: "3-1/16-in 5K · master, wing and swab valves" },
};

interface ModelDef {
  view: ModelView;
  /** Share of particles used, before the front-of-buffer bias. */
  use: number;
  /** Normalisation: centre (model units) and scale (normalised units per model unit). */
  centre: V3;
  scale: number;
  seed: number;
  build: (r: Rng) => Shape;
}

const TAU = Math.PI * 2;
const deg = (d: number) => (d * Math.PI) / 180;
const Y: V3 = [0, 1, 0];
const X: V3 = [1, 0, 0];
const Z: V3 = [0, 0, 1];
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const frac = (x: number) => x - Math.floor(x);

// ── Rig (metres) ───────────────────────────────────────────────────────────────────────────
function buildRig(): Shape {
  const s = new Shape();
  const F = 9; // rig floor elevation
  const MAST = 43; // floor to crown
  const TOP = F + MAST;
  const B0 = 4, B1 = 1.25; // derrick half-width at the floor and at the crown
  const hw = (y: number) => B0 + ((B1 - B0) * (y - F)) / MAST;
  const strut = { r: 0.09, w: 1 };
  const brace = { r: 0.07, w: 0.75 };

  // Substructure: a 12 × 12 m box frame, X-braced, under the rig floor.
  const SX = 6, SZ = 6;
  for (const x of [-SX, 0, SX]) for (const z of [-SZ, SZ]) s.tube([x, 0, z], [x, F, z], 0.22, { w: 1.1 });
  for (const y of [0.3, 4.6, F - 0.35]) {
    for (const z of [-SZ, SZ]) s.line([-SX, y, z], [SX, y, z], { r: 0.14, w: 1 });
    for (const x of [-SX, SX]) s.line([x, y, -SZ], [x, y, SZ], { r: 0.14, w: 1 });
  }
  for (const z of [-SZ, SZ])
    for (const [x0, x1] of [
      [-SX, 0],
      [0, SX],
    ])
      for (const [y0, y1] of [
        [0.3, 4.6],
        [4.6, F - 0.35],
      ]) {
        s.line([x0, y0, z], [x1, y1, z], brace);
        s.line([x1, y0, z], [x0, y1, z], brace);
      }
  for (const x of [-SX, SX])
    for (const [y0, y1] of [
      [0.3, 4.6],
      [4.6, F - 0.35],
    ]) {
      s.line([x, y0, -SZ], [x, y1, SZ], brace);
      s.line([x, y0, SZ], [x, y1, -SZ], brace);
    }

  // BOP stack under the rotary: spool, double ram, annular, bell nipple.
  s.tube([0, 0, 0], [0, 1.6, 0], 0.38, { w: 1.2 });
  s.disc([0, 1.6, 0], Y, 0, 0.6, { w: 1.2 });
  for (const y of [2.4, 3.55]) {
    s.box([0, y, 0], [2.4, 0.95, 1.1], { w: 1.1 });
    for (const sx of [-1, 1]) s.tube([sx * 1.2, y, 0], [sx * 1.85, y, 0], 0.36, { w: 1.1 });
  }
  s.cone([0, 4.1, 0], [0, 5.5, 0], 0.95, 0.6, { w: 1.2 });
  s.tube([0, 5.5, 0], [0, F, 0], 0.3, { w: 0.9 });

  // Rig floor, its edge, handrails (open on the V-door side, +x).
  s.quad([-8, F, -7], [15, 0, 0], [0, 0, 14], { w: 0.1, tone: 0.8 });
  s.path(
    [
      [7, F, -7],
      [-8, F, -7],
      [-8, F, 7],
      [7, F, 7],
      [7, F, -7],
    ],
    { r: 0.08, w: 1.2 },
  );
  for (const z of [-7, 7]) {
    s.line([-8, F + 1.1, z], [7, F + 1.1, z], { r: 0.04, w: 0.7 });
    for (let x = -8; x <= 7; x += 2.5) s.line([x, F, z], [x, F + 1.1, z], { r: 0.03, w: 0.5 });
  }
  s.line([-8, F + 1.1, -7], [-8, F + 1.1, 7], { r: 0.04, w: 0.7 });
  s.disc([0, F + 0.05, 0], Y, 0, 1.0, { w: 1.4 }); // rotary table
  s.ring([0, F + 0.1, 0], Y, 1.0, { r: 0.06, w: 1.4 });

  // Derrick: four tapering legs, a girt at every panel, X-bracing on three faces; the V-door face
  // (+x) is open for the three lowest panels.
  const levels = 11;
  const yL = (k: number) => F + (MAST * k) / levels;
  const corner = (y: number, sx: number, sz: number): V3 => [sx * hw(y), y, sz * hw(y)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) s.tube(corner(F, sx, sz), corner(TOP, sx, sz), 0.26, { w: 1.3 });
  for (let k = 1; k <= levels; k++) {
    const y = yL(k);
    s.path([corner(y, -1, -1), corner(y, 1, -1), corner(y, 1, 1), corner(y, -1, 1), corner(y, -1, -1)], strut);
  }
  for (let k = 0; k < levels; k++) {
    const y0 = yL(k), y1 = yL(k + 1);
    // faces: −z, +z (sx varies), −x, +x (sz varies)
    for (const sz of [-1, 1]) {
      s.line(corner(y0, -1, sz), corner(y1, 1, sz), brace);
      s.line(corner(y0, 1, sz), corner(y1, -1, sz), brace);
    }
    for (const sx of [-1, 1]) {
      if (sx === 1 && k < 3) continue; // V-door
      s.line(corner(y0, sx, -1), corner(y1, sx, 1), brace);
      s.line(corner(y0, sx, 1), corner(y1, sx, -1), brace);
    }
  }
  // The V-door frame: an inverted V over the opening.
  s.line(corner(F, 1, -1), [hw(yL(3)), yL(3), 0], { r: 0.1, w: 1 });
  s.line(corner(F, 1, 1), [hw(yL(3)), yL(3), 0], { r: 0.1, w: 1 });

  // Crown block, sheaves, gin pole.
  s.box([0, TOP + 0.8, 0], [3.4, 1.6, 3.4], { w: 1.4 });
  s.edges([0, TOP + 0.8, 0], [3.4, 1.6, 3.4], { r: 0.06, w: 1.4 });
  for (const z of [-1.05, -0.35, 0.35, 1.05]) s.ring([0, TOP + 2.1, z], Z, 0.62, { r: 0.08, w: 1.5 });
  s.line([0, TOP + 1.6, -1.6], [0, TOP + 4.6, 0], { r: 0.08, w: 1 });
  s.line([0, TOP + 1.6, 1.6], [0, TOP + 4.6, 0], { r: 0.08, w: 1 });

  // Racking board (monkey board) on the V-door side, and the racked stands leaning into it.
  const MB = F + 26.5, hb = hw(MB);
  s.path(
    [
      [hb, MB, -1.8],
      [hb + 2.6, MB, -1.8],
      [hb + 2.6, MB, 1.8],
      [hb, MB, 1.8],
    ],
    { r: 0.07, w: 1.2 },
  );
  for (let z = -1.6; z <= 1.61; z += 0.4) s.line([hb, MB, z], [hb + 2.6, MB, z], { r: 0.04, w: 0.8 });
  s.line([hb + 2.6, MB + 1.1, -1.8], [hb + 2.6, MB + 1.1, 1.8], { r: 0.04, w: 0.6 });
  for (const side of [-1, 1])
    for (let i = 0; i < 11; i++) {
      const zf = side * (0.3 + i * 0.14);
      const x0 = 1.4 + (i % 4) * 0.45, z0 = side * (1.3 + Math.floor(i / 4) * 0.55 + (i % 2) * 0.2);
      s.line([x0, F + 0.1, z0], [hb + 0.9 + (i % 3) * 0.5, MB + 1.4, zf], { r: 0.045, w: 0.45 });
    }

  // Travelling block, top drive, drill string, drill line and fast line.
  s.box([0, 34.2, 0], [1.1, 2.4, 1.6], { w: 1.2 });
  for (const z of [-0.45, 0, 0.45]) s.ring([0, 35.0, z], Z, 0.5, { r: 0.05, w: 1 });
  s.line([-0.35, 33.0, 0], [-0.35, 31.6, 0], { r: 0.06, w: 0.8 });
  s.line([0.35, 33.0, 0], [0.35, 31.6, 0], { r: 0.06, w: 0.8 });
  s.box([0, 29.6, 0], [1.5, 4.0, 1.3], { w: 1.2 });
  s.edges([0, 29.6, 0], [1.5, 4.0, 1.3], { r: 0.04, w: 1 });
  s.line([-1.6, F + 3, 0], [-1.35, TOP - 2, 0], { r: 0.1, w: 0.9 }); // top-drive guide rail
  s.line([0, 27.6, 0], [0, F, 0], { r: 0.07, w: 0.9 });
  for (const x of [-0.42, -0.25, -0.08, 0.08, 0.25, 0.42]) s.line([x, TOP, 0], [x * 0.7, 35.4, 0], { r: 0.015, w: 0.35 });
  s.line([-0.6, TOP, 0.4], [-5.3, F + 2.4, 0.8], { r: 0.03, w: 0.5 }); // fast line to the drum

  // Standpipe up the back leg, and the rotary hose hanging to the top drive.
  const sp = (y: number): V3 => [-hw(y) + 0.45, y, -hw(y) + 0.45];
  s.line(sp(F), sp(F + 16), { r: 0.1, w: 1 });
  const g0 = sp(F + 16), g1: V3 = [0.2, 31.4, 0.1];
  const hose: V3[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    hose.push(add(add(g0, mul(add(g1, mul(g0, -1)), t)), [0, -4.5 * 4 * t * (1 - t), 0]));
  }
  s.path(hose, { r: 0.1, w: 1 });

  // Drawworks and drum; doghouse.
  s.box([-6.3, F + 1.4, 0], [2.6, 2.8, 4.6], { w: 0.45 });
  s.edges([-6.3, F + 1.4, 0], [2.6, 2.8, 4.6], { r: 0.05, w: 1 });
  s.tube([-5.3, F + 2.3, -1.9], [-5.3, F + 2.3, 1.9], 0.85, { w: 0.9 });
  s.box([-2.5, F + 1.6, -9.0], [6, 3.2, 3.2], { w: 0.3 });
  s.edges([-2.5, F + 1.6, -9.0], [6, 3.2, 3.2], { r: 0.05, w: 1 });
  s.quad([-4.6, F + 1.4, -7.39], [4.2, 0, 0], [0, 1.2, 0], { w: 0.5 }); // window band

  // Pipe ramp (V-door slide) down to the catwalk, catwalk, pipe racks.
  const R0: V3 = [7, F, -0.9], RU: V3 = [13, 1.2 - F, 0], RV: V3 = [0, 0, 1.8];
  s.quad(R0, RU, RV, { w: 0.3 });
  s.line(R0, add(R0, RU), { r: 0.1, w: 1.1 });
  s.line(add(R0, RV), add(add(R0, RU), RV), { r: 0.1, w: 1.1 });
  for (const t of [0.25, 0.5, 0.75]) {
    const p = add(R0, mul(RU, t));
    s.line([p[0], p[1], 0], [p[0], 0, 0], { r: 0.06, w: 0.7 });
  }
  s.box([27.5, 0.6, 0], [15, 1.2, 2.0], { w: 0.35 });
  s.edges([27.5, 0.6, 0], [15, 1.2, 2.0], { r: 0.05, w: 1 });
  for (const side of [-1, 1]) {
    for (const x of [21.5, 25.5, 29.5, 33.5]) {
      s.line([x, 0.9, side * 2.0], [x, 0.9, side * 6.4], { r: 0.1, w: 0.9 });
      s.line([x, 0, side * 2.2], [x, 0.9, side * 2.2], { r: 0.06, w: 0.6 });
      s.line([x, 0, side * 6.2], [x, 0.9, side * 6.2], { r: 0.06, w: 0.6 });
    }
    for (let j = 0; j < 14; j++) s.line([20.8, 1.02, side * (2.4 + j * 0.28)], [34.2, 1.02, side * (2.4 + j * 0.28)], { r: 0.06, w: 0.3 });
    for (let j = 0; j < 13; j++) s.line([20.8, 1.26, side * (2.54 + j * 0.28)], [34.2, 1.26, side * (2.54 + j * 0.28)], { r: 0.06, w: 0.3 });
  }

  // Behind the rig: two mud tanks with agitators and a shaker, two triplex pumps.
  for (const z of [-13.4, -9.8]) {
    s.box([-15, 1.4, z], [12, 2.8, 3.2], { w: 0.12, tone: 0.8 });
    s.edges([-15, 1.4, z], [12, 2.8, 3.2], { r: 0.05, w: 0.7, tone: 0.8 });
    for (const x of [-19, -15, -11]) s.box([x, 3.1, z], [0.8, 0.6, 0.8], { w: 0.5, tone: 0.8 });
  }
  s.box([-8.2, 3.3, -11.6], [2.2, 1.6, 2.6], { w: 0.4, tone: 0.8 });
  for (const z of [-3.4, 0.4]) {
    s.box([-17, 1.2, z], [5, 2.4, 2.4], { w: 0.2, tone: 0.8 });
    s.edges([-17, 1.2, z], [5, 2.4, 2.4], { r: 0.05, w: 0.7, tone: 0.8 });
  }

  // The pad: a sparse ground plane that falls away from the rig, so it stands on something.
  s.custom(
    700,
    (r, emit) => {
      const a = r() * TAU, d = Math.sqrt(-2 * Math.log(1 - r() * 0.98));
      emit([4 + Math.cos(a) * d * 16, 0, -2 + Math.sin(a) * d * 9], Y);
    },
    { w: 0.2, tone: 0.55 },
  );
  return s;
}

// ── Earth block (kilometres) ───────────────────────────────────────────────────────────────
function buildEarth(): Shape {
  const s = new Shape();
  s.light = norm([-0.35, 0.8, 0.6]);
  const X0 = -2, X1 = 2, Z0 = -2, Y0 = -2.5;
  const dome = (x: number, z: number) => 0.2 * Math.exp(-((x - 0.35) ** 2) / 1.5 - ((z + 0.7) ** 2) / 1.3);
  const BASE = [0, -0.36, -0.74, -1.1, -1.38, -1.72];
  const horizon = (k: number, x: number, z: number) =>
    k === 0
      ? 0.012 * Math.sin(2.3 * x + 0.7) * Math.cos(1.7 * z)
      : k >= BASE.length
        ? Y0
        : BASE[k] + dome(x, z) * (0.3 + (0.7 * k) / 5) - 0.035 * x + 0.018 * Math.sin(3.1 * x + 1.3 * z + k);
  type Litho = "sand" | "shale" | "lime" | "sandstone";
  const LAYERS: { litho: Litho; d: number }[] = [
    { litho: "sand", d: 0.75 },
    { litho: "shale", d: 1 },
    { litho: "lime", d: 1 },
    { litho: "shale", d: 1.25 },
    { litho: "sandstone", d: 1.05 },
    { litho: "lime", d: 0.8 },
  ];
  const layerAt = (x: number, y: number, z: number) => {
    for (let k = 0; k < LAYERS.length; k++) if (y >= horizon(k + 1, x, z)) return k;
    return LAYERS.length - 1;
  };
  // Acceptance for a point on a cut face at horizontal coordinate u, depth y.
  const pattern = (litho: Litho, u: number, y: number, k: number) => {
    switch (litho) {
      case "sand":
        return 0.55;
      case "sandstone":
        return 0.7;
      case "shale": {
        const row = Math.floor(y / 0.034);
        const onLine = Math.abs(frac(y / 0.034) - 0.5) < 0.16;
        const dash = frac(u * 7 + row * 0.618 + k) < 0.72;
        return onLine && dash ? 1 : 0.06;
      }
      case "lime": {
        const rowH = 0.085, row = Math.floor(y / rowH);
        const bed = Math.abs(frac(y / rowH) - 0.5) > 0.4;
        const joint = Math.abs(frac(u / 0.2 + (row & 1) * 0.5) - 0.5) > 0.46;
        return bed || joint ? 1 : 0.05;
      }
    }
  };
  // A cut face: points (u, y) on the face, layered and patterned. `at(u)` maps to (x, z).
  const face = (u0: number, u1: number, at: (u: number) => [number, number], normal: V3, w: number) => {
    // Estimate the accepted area once, so the face gets its fair share of points.
    let hit = 0;
    const est = makeRng(91);
    const trials = 4000;
    const top = 0.05;
    for (let i = 0; i < trials; i++) {
      const u = u0 + (u1 - u0) * est(), y = Y0 + (top - Y0) * est();
      const [x, z] = at(u);
      if (y > horizon(0, x, z)) continue;
      const k = layerAt(x, y, z);
      if (est() < pattern(LAYERS[k].litho, u, y, k) * LAYERS[k].d) hit++;
    }
    const area = (u1 - u0) * (top - Y0) * (hit / trials);
    s.custom(
      area,
      (r, emit) => {
        for (let tries = 0; tries < 64; tries++) {
          const u = u0 + (u1 - u0) * r(), y = Y0 + (top - Y0) * r();
          const [x, z] = at(u);
          if (y > horizon(0, x, z)) continue;
          const k = layerAt(x, y, z);
          if (r() < pattern(LAYERS[k].litho, u, y, k) * LAYERS[k].d) return emit([x, y, z], normal);
        }
        const u = u0 + (u1 - u0) * r();
        const [x, z] = at(u);
        emit([x, Y0 + (horizon(0, x, z) - Y0) * r(), z], normal);
      },
      { w },
    );
  };
  face(X0, X1, (u) => [u, 0], Z, 1); // the section through the well
  face(Z0, 0, (u) => [X1, u], X, 0.8); // right side
  // Top: the desert surface, sparse.
  s.custom((X1 - X0) * -Z0, (r, emit) => {
    const x = X0 + (X1 - X0) * r(), z = Z0 * r();
    emit([x, horizon(0, x, z), z], Y);
  }, { w: 0.013, tone: 0.55 });
  // Horizons traced along the cut faces, and the reservoir top as a faint sheet inside.
  for (let k = 1; k < BASE.length; k++) {
    const wk = k === 4 || k === 5 ? 0.06 : 0.04;
    s.custom(X1 - X0, (r, emit) => {
      const x = X0 + (X1 - X0) * r();
      emit([x, horizon(k, x, 0) + (r() - 0.5) * 0.012, 0], Z);
    }, { w: wk * 1.1 });
    s.custom(-Z0, (r, emit) => {
      const z = Z0 * r();
      emit([X1, horizon(k, X1, z) + (r() - 0.5) * 0.012, z], X);
    }, { w: wk });
  }
  s.custom((X1 - X0) * -Z0, (r, emit) => {
    const x = X0 + (X1 - X0) * r(), z = Z0 * r();
    emit([x, horizon(4, x, z), z], Y);
  }, { w: 0.03, tone: 0.8 });
  // Block edges: the visible ones strong, the far ones faint.
  const topAt = (x: number, z: number): V3 => [x, horizon(0, x, z), z];
  const edge = (a: (t: number) => V3, w: number) =>
    s.custom(1, (r, emit) => emit(a(r()), null), { w: w * 0.03 });
  edge((t) => topAt(X0 + (X1 - X0) * t, 0), 2.6);
  edge((t) => topAt(X0 + (X1 - X0) * t, Z0), 2);
  edge((t) => topAt(X0, Z0 * t), 1.2);
  edge((t) => topAt(X1, Z0 * t), 2);
  edge((t) => [X0 + (X1 - X0) * t, Y0, 0], 2.4);
  edge((t) => [X1, Y0, Z0 * t], 1.6);
  edge((t) => [X0, Y0 + (horizon(0, X0, 0) - Y0) * t, 0], 1.6);
  edge((t) => [X1, Y0 + (horizon(0, X1, 0) - Y0) * t, 0], 1.6);
  edge((t) => [X1, Y0 + (horizon(0, X1, Z0) - Y0) * t, Z0], 1.2);

  // The well, in the section plane (z = 0, drawn just in front of it).
  const zf = 0.01, SX = -1.3, KOP = 0.95, R = 0.5;
  const mid = (x: number, z: number) => (horizon(4, x, z) + horizon(5, x, z)) / 2;
  const well: V3[] = [];
  for (let d = 0; d < KOP; d += 0.02) well.push([SX, -d, zf]);
  for (let i = 0; i <= 30; i++) {
    const th = (i / 30) * (Math.PI / 2);
    well.push([SX + R * (1 - Math.cos(th)), -KOP - R * Math.sin(th), zf]);
  }
  const xh = SX + R, yh = -KOP - R;
  for (let x = xh; x <= 1.75; x += 0.02) well.push([x, yh + (mid(x, 0) - yh) * smooth(xh, xh + 0.55, x), zf]);
  s.path(well, { r: 0.005, w: 0.17, accent: true });
  // Casing: surface and intermediate strings, as walls either side of the hole, with shoes.
  for (const [half, depth] of [
    [0.04, 0.34],
    [0.026, 0.8],
  ] as const) {
    for (const sx of [-1, 1]) s.line([SX + sx * half, 0, zf], [SX + sx * half, -depth, zf], { r: 0.003, w: 0.05, accent: true, tone: 0.7 });
    s.line([SX - half - 0.02, -depth, zf], [SX + half + 0.02, -depth, zf], { r: 0.004, w: 0.05, accent: true, tone: 0.7 });
  }
  // A multilateral leg from the heel, turning into the block along the reservoir.
  const leg: V3[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60, a = deg(-42) * smooth(0, 0.35, t);
    const x = -0.45 + 2.0 * t * Math.cos(a * 0.9), z = 2.0 * t * Math.sin(a) * 0.95;
    leg.push([x, mid(x, z), z]);
  }
  s.path(leg, { r: 0.005, w: 0.12, accent: true, tone: 0.8 });
  // An older vertical producer further along, for context.
  s.line([1.15, 0, -0.9], [1.15, mid(1.15, -0.9), -0.9], { r: 0.004, w: 0.06, tone: 0.8 });
  // The rig on the surface location: a small derrick, as struts.
  const rigAt: V3 = [SX, 0, zf];
  const h = 0.3;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) s.line(add(rigAt, [sx * 0.07, 0, sz * 0.05]), add(rigAt, [sx * 0.018, h, sz * 0.014]), { r: 0.003, w: 0.1 });
  for (const f of [0.33, 0.66]) {
    const w = 0.07 + (0.018 - 0.07) * f;
    s.line(add(rigAt, [-w, h * f, 0]), add(rigAt, [w, h * f, 0]), { r: 0.003, w: 0.08 });
  }
  s.line(add(rigAt, [-0.07, 0, 0]), add(rigAt, [0.018, h * 0.5, 0]), { r: 0.002, w: 0.06 });
  s.line(add(rigAt, [0.07, 0, 0]), add(rigAt, [-0.018, h * 0.5, 0]), { r: 0.002, w: 0.06 });
  return s;
}

// ── PDC bit (inches) ───────────────────────────────────────────────────────────────────────
function buildBit(): Shape {
  const s = new Shape();
  s.light = norm([-0.5, 0.85, 0.35]);
  const RG = 4.25; // gauge radius (8½-in)
  const RB = 3.3; // body radius in the junk slots
  const BH = 1.35; // blade height above the junk-slot floor
  const GAUGE_BOT = 5.1;
  // Face profile: a shallow cone to the nose, then shoulder down to gauge.
  const face = (r: number) =>
    r < 1.5 ? 8.9 - 0.3 * (1.5 - r) : 8.9 - 1.55 * Math.pow((Math.min(r, RG) - 1.5) / (RG - 1.5), 2.1);
  const faceSlope = (r: number) => (face(r + 0.01) - face(r - 0.01)) / 0.02;
  const floorY = (r: number) => face(r) - BH;
  const BLADES = 6;
  const bladeStart = (k: number) => (k % 2 === 0 ? 0.35 : 1.45);
  const theta = (k: number, r: number) => (k * TAU) / BLADES + 0.34 * Math.pow(r / RG, 1.3);
  const W = 1.45; // blade width, tangential
  const dth = (r: number) => W / Math.max(r, 0.9);
  const P = (r: number, th: number, y: number): V3 => [r * Math.cos(th), y, r * Math.sin(th)];

  // Pin: API 4½-in REG, tapered 3 in/ft on diameter, 5 threads per inch, drawn as a helix.
  const PIN_TIP = -4.5;
  const pinR = (y: number) => 2.18 - (0 - y) * 0.125;
  s.custom(TAU * 1.9 * 4.5, (r, emit) => {
    for (let t = 0; t < 32; t++) {
      const y = PIN_TIP + 0.25 + r() * 4.0, th = r() * TAU;
      const tri = Math.abs(frac((y + (th / TAU) * 0.2) / 0.2) * 2 - 1);
      if (r() < (tri < 0.3 ? 1 : 0.22)) {
        const rr = pinR(y) - 0.09 * tri;
        return emit(P(rr, th, y), [Math.cos(th), 0.12, Math.sin(th)]);
      }
    }
  }, { w: 1.1 });
  s.cone([0, PIN_TIP, 0], [0, PIN_TIP + 0.25, 0], pinR(PIN_TIP) - 0.2, pinR(PIN_TIP), { w: 1 });
  s.disc([0, PIN_TIP, 0], [0, -1, 0], 0.75, pinR(PIN_TIP) - 0.2, { w: 1 });
  s.cone([0, -0.25, 0], [0, 0, 0], pinR(-0.25), pinR(0) + 0.05, { w: 0.8 }); // relief groove
  // Make-up shoulder and shank with two breaker-slot flats.
  s.disc([0, 0, 0], [0, -1, 0], pinR(0), 3.1, { w: 1.2 });
  s.ring([0, 0, 0], Y, 3.1, { r: 0.03, w: 0.9 });
  const FLAT = 2.7;
  s.custom(TAU * 3.1 * 3.4, (r, emit) => {
    const y = r() * 3.4, th = r() * TAU;
    let p = P(3.1, th, y);
    let n: V3 = [Math.cos(th), 0, Math.sin(th)];
    if (y > 0.6 && y < 2.8 && Math.abs(p[0]) > FLAT) {
      p = [Math.sign(p[0]) * FLAT, y, p[2]];
      n = [Math.sign(p[0]), 0, 0];
    }
    emit(p, n);
  }, { w: 0.6 });
  for (const sx of [-1, 1]) {
    const hz = Math.sqrt(3.1 * 3.1 - FLAT * FLAT);
    s.line([sx * FLAT, 0.6, -hz], [sx * FLAT, 0.6, hz], { r: 0.03, w: 0.8 });
    s.line([sx * FLAT, 2.8, -hz], [sx * FLAT, 2.8, hz], { r: 0.03, w: 0.8 });
  }
  // Neck up to the body.
  s.cone([0, 3.4, 0], [0, 4.3, 0], 3.1, RB, { w: 0.9 });
  s.ring([0, 3.4, 0], Y, 3.1, { r: 0.03, w: 0.8 });

  const inBlade = (r: number, th: number) => {
    for (let k = 0; k < BLADES; k++) {
      if (r < bladeStart(k) - 0.1) continue;
      const d = Math.atan2(Math.sin(th - theta(k, r)), Math.cos(th - theta(k, r)));
      if (Math.abs(d) < dth(r) / 2) return true;
    }
    return false;
  };
  // Body side and junk-slot floor between the blades.
  s.custom(TAU * RB * (floorY(RB) - 4.3), (r, emit) => {
    for (let t = 0; t < 16; t++) {
      const th = r() * TAU, y = 4.3 + r() * (floorY(RB) - 4.3);
      if (!inBlade(RG * 0.99, th)) return emit(P(RB, th, y), [Math.cos(th), 0, Math.sin(th)]);
    }
  }, { w: 0.25, tone: 0.8 });
  s.custom(Math.PI * RB * RB, (r, emit) => {
    for (let t = 0; t < 16; t++) {
      const rr = RB * Math.sqrt(r()), th = r() * TAU;
      if (!inBlade(rr, th)) {
        const sl = faceSlope(rr);
        return emit(P(rr, th, floorY(rr)), norm([-sl * Math.cos(th), 1, -sl * Math.sin(th)]));
      }
    }
  }, { w: 0.22, tone: 0.75 });

  // Blades: top along the profile, leading and trailing walls, gauge pad and its walls.
  const cutters: { c: V3; n: V3 }[] = [];
  for (let k = 0; k < BLADES; k++) {
    const r0 = bladeStart(k);
    const edgeTh = (r: number, side: number) => theta(k, r) + (side * dth(r)) / 2;
    const gaugeTwist = (y: number) => 0.14 * ((face(RG) - y) / (face(RG) - GAUGE_BOT));
    s.custom((RG - r0) * W * 1.3, (r, emit) => {
      const rr = r0 + (RG - r0) * r(), th = theta(k, rr) + (r() - 0.5) * dth(rr);
      const sl = faceSlope(rr);
      emit(P(rr, th, face(rr)), norm([-sl * Math.cos(th), 1, -sl * Math.sin(th)]));
    }, { w: 2.4 });
    for (const side of [-1, 1]) {
      s.custom((RG - r0) * BH, (r, emit) => {
        const rr = r0 + (RG - r0) * r(), th = edgeTh(rr, side);
        const y = floorY(rr) + BH * r();
        emit(P(rr, th, y), [-Math.sin(th) * side, 0, Math.cos(th) * side]);
      }, { w: side === 1 ? 1.4 : 1.0 });
      // the blade's crest line on each wall — a crisp edge
      s.custom(RG - r0, (r, emit) => {
        const rr = r0 + (RG - r0) * r();
        emit(P(rr, edgeTh(rr, side), face(rr)), Y);
      }, { w: 1.1 });
    }
    // Gauge pad (outer face) and its two walls down to the gauge bottom.
    const gTh = (y: number, side: number) => theta(k, RG) + gaugeTwist(y) + (side * dth(RG)) / 2;
    s.custom(W * (face(RG) - GAUGE_BOT), (r, emit) => {
      const y = GAUGE_BOT + r() * (face(RG) - GAUGE_BOT), th = theta(k, RG) + gaugeTwist(y) + (r() - 0.5) * dth(RG);
      emit(P(RG, th, y), [Math.cos(th), 0, Math.sin(th)]);
    }, { w: 1.8 });
    for (const side of [-1, 1]) {
      s.custom((RG - RB) * (face(RG) - GAUGE_BOT), (r, emit) => {
        const y = GAUGE_BOT + r() * (face(RG) - GAUGE_BOT), rr = RB + (RG - RB) * r(), th = gTh(y, side);
        emit(P(rr, th, y), [-Math.sin(th) * side, 0, Math.cos(th) * side]);
      }, { w: 1.3 });
      s.custom(face(RG) - GAUGE_BOT, (r, emit) => {
        const y = GAUGE_BOT + r() * (face(RG) - GAUGE_BOT);
        emit(P(RG, gTh(y, side), y), null);
      }, { w: 1.3 });
    }
    // Blade foot at the gauge bottom, and the inner end.
    s.custom(W * (RG - RB), (r, emit) => {
      const rr = RB + (RG - RB) * r(), th = gTh(GAUGE_BOT, 0) + (r() - 0.5) * dth(RG);
      emit(P(rr, th, GAUGE_BOT - (rr - RB) * 0.6), [0, -1, 0]);
    }, { w: 0.8 });
    // Cutters: 16 mm discs spaced along the leading edge, following the profile.
    const pitch = k % 2 === 0 ? 0.74 : 0.7;
    let arc = 0;
    let prev: [number, number] = [r0 + 0.25, face(r0 + 0.25)];
    const placeAt = (rr: number, y: number) => {
      const th = edgeTh(rr, 1) - 0.12 / Math.max(rr, 1);
      const tang: V3 = [-Math.sin(th), 0, Math.cos(th)];
      const c = P(rr, th, y - 0.36);
      // back rake 20°: tilt the face up the profile
      const up = norm([-faceSlope(rr) * Math.cos(th), 1, -faceSlope(rr) * Math.sin(th)]);
      cutters.push({ c, n: norm(add(mul(tang, Math.cos(deg(20))), mul(up, Math.sin(deg(20))))) });
    };
    placeAt(prev[0], prev[1]);
    for (let rr = r0 + 0.26; rr <= RG; rr += 0.01) {
      const y = face(rr);
      arc += Math.hypot(rr - prev[0], y - prev[1]);
      prev = [rr, y];
      if (arc >= pitch) {
        placeAt(rr - 0.1, y);
        arc = 0;
      }
    }
    // gauge cutters / inserts down the pad
    for (const y of [face(RG) - 0.7, face(RG) - 1.45]) {
      const th = gTh(y, 0);
      cutters.push({ c: P(RG + 0.02, th, y), n: [Math.cos(th), 0, Math.sin(th)] });
    }
  }
  for (const { c, n } of cutters) {
    s.ring(c, n, 0.315, { r: 0.03, w: 2.6 });
    s.disc(c, n, 0, 0.3, { w: 2.8, tone: 1 });
    s.tube(c, add(c, mul(n, -0.45)), 0.315, { w: 0.5, tone: 0.8 });
  }
  // Nozzles, one per junk slot.
  for (let k = 0; k < BLADES; k++) {
    const rr = k % 2 === 0 ? 2.3 : 1.7, th = theta(k, rr) + TAU / BLADES / 2;
    const sl = faceSlope(rr), n = norm([-sl * Math.cos(th), 1, -sl * Math.sin(th)]);
    const c = add(P(rr, th, floorY(rr)), mul(n, 0.05));
    s.ring(c, n, 0.3, { r: 0.05, w: 3 });
    s.disc(c, n, 0.3, 0.42, { w: 1.5 });
  }
  return s;
}

// ── Wellhead and Christmas tree (inches) ───────────────────────────────────────────────────
function buildWellhead(): Shape {
  const s = new Shape();
  s.light = norm([-0.55, 0.7, 0.55]);
  /** A flanged spool: two flanges with their studs and nuts, and a body between. */
  const flange = (y0: number, y1: number, R: number, bolts: number, axis: V3 = Y, at: V3 = [0, 0, 0]) => {
    const a = norm(axis);
    const [u, v] = basis(a);
    const c0 = add(at, mul(a, y0)), c1 = add(at, mul(a, y1));
    s.tube(c0, c1, R, { w: 0.9 });
    s.disc(c0, mul(a, -1), R * 0.55, R, { w: 0.7 });
    s.disc(c1, a, R * 0.55, R, { w: 0.7 });
    s.ring(c0, a, R, { r: 0.1, w: 3 });
    s.ring(c1, a, R, { r: 0.1, w: 3 });
    const bc = R - 1.05;
    for (let i = 0; i < bolts; i++) {
      const th = ((i + 0.5) / bolts) * TAU;
      const off = add(mul(u, Math.cos(th) * bc), mul(v, Math.sin(th) * bc));
      const b0 = add(c0, add(off, mul(a, -1.3))), b1 = add(c1, add(off, mul(a, 1.3)));
      s.line(b0, b1, { r: 0.42, w: 1.3 });
      s.tube(add(c0, add(off, mul(a, -0.95))), add(c0, off), 0.8, { w: 0.9 });
      s.tube(add(c1, off), add(c1, add(off, mul(a, 0.95))), 0.8, { w: 0.9 });
    }
  };
  /** A handwheel facing `n`, centred at c. */
  const wheel = (c: V3, n: V3, R = 7) => {
    const [u, v] = basis(n);
    s.ring(c, n, R, { r: 0.75, w: 4.6 });
    s.disc(c, n, 0, 1.3, { w: 2 });
    for (let i = 0; i < 4; i++) {
      const th = (i / 4) * TAU + 0.4;
      s.line(add(c, mul(add(mul(u, Math.cos(th)), mul(v, Math.sin(th))), 1.2)), add(c, mul(add(mul(u, Math.cos(th)), mul(v, Math.sin(th))), R)), { r: 0.45, w: 1.6 });
    }
  };
  /** A gate valve on the axis through `at`, body length L, with its bonnet and handwheel toward `stem`. */
  const gate = (at: V3, axis: V3, L: number, stem: V3, R = 6.3) => {
    const a = norm(axis), st = norm(stem);
    const b = cross(a, st);
    flange(-L / 2 - 2.5, -L / 2, R, 8, a, at);
    flange(L / 2, L / 2 + 2.5, R, 8, a, at);
    // body: a box aligned to (a, st, b)
    const hx = L / 2, hs = 4.6, hb = 4.2;
    const corner = (i: number, j: number, k: number) => add(at, add(add(mul(a, i * hx), mul(st, j * hs)), mul(b, k * hb)));
    s.quad(corner(-1, -1, -1), mul(a, L), mul(st, 2 * hs), { w: 0.8 });
    s.quad(corner(-1, -1, 1), mul(a, L), mul(st, 2 * hs), { w: 0.8 });
    s.quad(corner(-1, 1, -1), mul(a, L), mul(b, 2 * hb), { w: 0.8 });
    s.quad(corner(-1, -1, -1), mul(a, L), mul(b, 2 * hb), { w: 0.8 });
    for (const j of [-1, 1]) for (const k of [-1, 1]) s.line(corner(-1, j, k), corner(1, j, k), { r: 0.15, w: 2 });
    // bonnet, stem, wheel
    const bon0 = add(at, mul(st, hs)), bon1 = add(at, mul(st, hs + 4));
    s.tube(bon0, bon1, 3, { w: 1 });
    s.disc(bon1, st, 0, 3, { w: 1 });
    s.ring(bon1, st, 3, { r: 0.15, w: 2.5 });
    const wc = add(at, mul(st, hs + 10));
    s.line(bon1, wc, { r: 0.55, w: 1.5 });
    wheel(wc, st);
  };

  // Ground and the conductor stub.
  s.custom(900, (r, emit) => {
    const a = r() * TAU, d = Math.sqrt(-2 * Math.log(1 - r() * 0.97));
    emit([8 + Math.cos(a) * d * 26, 0, Math.sin(a) * d * 18], Y);
  }, { w: 0.9, tone: 0.55 });
  s.tube([0, -1, 0], [0, 2, 0], 10, { w: 0.6 });

  // Casing head: flanges + body, side outlets (valve one side, blind flange the other).
  flange(2, 5.2, 11.5, 12);
  s.tube([0, 5.2, 0], [0, 15, 0], 8, { w: 0.9 });
  flange(15, 18.4, 11.5, 12);
  s.tube([8, 10, 0], [13, 10, 0], 2.3, { w: 1 });
  gate([19.5, 10, 0], X, 8, Z, 5.2);
  s.tube([-8, 10, 0], [-13, 10, 0], 2.3, { w: 1 });
  s.disc([-13, 10, 0], [-1, 0, 0], 0, 5, { w: 1.2 });
  s.ring([-13, 10, 0], X, 5, { r: 0.1, w: 3 });

  // Tubing head spool with its outlets.
  s.tube([0, 18.4, 0], [0, 30, 0], 7.5, { w: 0.9 });
  flange(30, 33, 9.6, 12);
  s.tube([7.5, 25, 0], [12, 25, 0], 2, { w: 1 });
  s.disc([12, 25, 0], X, 0, 4.2, { w: 1.2 });
  s.ring([12, 25, 0], X, 4.2, { r: 0.1, w: 3 });
  s.tube([-7.5, 25, 0], [-12, 25, 0], 2, { w: 1 });
  s.disc([-12, 25, 0], [-1, 0, 0], 0, 4.2, { w: 1.2 });
  s.ring([-12, 25, 0], X, 4.2, { r: 0.1, w: 3 });
  // Adapter.
  s.cone([0, 33, 0], [0, 36.5, 0], 6.8, 5.2, { w: 0.9 });

  // Lower and upper master valves (wheels to the front), flow cross, swab valve, cap, gauge.
  gate([0, 45.5, 0], Y, 11, Z);
  gate([0, 64.5, 0], Y, 11, Z);
  const CROSS = 80;
  flange(71.5, 74, 6.3, 8);
  s.box([0, CROSS, 0], [10.5, 12, 10], { w: 0.8 });
  s.edges([0, CROSS, 0], [10.5, 12, 10], { r: 0.15, w: 2 });
  flange(86, 88.5, 6.3, 8);
  for (const sx of [-1, 1]) {
    s.tube([sx * 5.25, CROSS, 0], [sx * 9, CROSS, 0], 2.8, { w: 1 });
    // wing valves: horizontal, wheels up
    gate([sx * 17.5, CROSS, 0], X, 11, Z);
  }
  // Choke and flowline on the production wing (+x); a blind flange on the kill wing.
  s.tube([26, CROSS, 0], [33, CROSS, 0], 2.3, { w: 1 });
  s.box([36.5, CROSS, 0], [7, 7, 6.5], { w: 0.9 });
  s.edges([36.5, CROSS, 0], [7, 7, 6.5], { r: 0.15, w: 2 });
  s.tube([36.5, CROSS + 3.5, 0], [36.5, CROSS + 8, 0], 1.6, { w: 1 });
  s.ring([36.5, CROSS + 8.6, 0], Y, 3.6, { r: 0.5, w: 3 });
  s.tube([40, CROSS, 0], [50, CROSS, 0], 1.7, { w: 0.6 });
  s.disc([50, CROSS, 0], X, 0, 4.4, { w: 1 });
  s.ring([50, CROSS, 0], X, 4.4, { r: 0.1, w: 3 });
  s.disc([-26, CROSS, 0], [-1, 0, 0], 0, 6.3, { w: 1.1 });

  gate([0, 97.5, 0], Y, 10, Z);
  s.tube([0, 105, 0], [0, 111, 0], 4.4, { w: 1 });
  s.disc([0, 111, 0], Y, 0, 4.4, { w: 1 });
  s.ring([0, 111, 0], Y, 4.4, { r: 0.12, w: 3 });
  s.line([0, 111, 0], [0, 116, 0], { r: 0.6, w: 1.5 });
  s.disc([0, 119.5, 1.4], Z, 0, 3.4, { w: 1.4 });
  s.ring([0, 119.5, 1.4], Z, 3.4, { r: 0.35, w: 3.5 });
  s.line([0, 119.5, 1.6], [1.8, 121.4, 1.6], { r: 0.18, w: 3 });
  return s;
}

const DEFS: Record<ModelId, ModelDef> = {
  rig: {
    view: { yaw: deg(36), pitch: deg(8), dist: 5.3, fov: deg(24), aspect: 0.95, target: [0, 0, 0], spin: 0, sway: deg(7) },
    use: 0.36,
    centre: [10, 27, -2],
    scale: 1 / 30,
    seed: 11,
    build: buildRig,
  },
  earth: {
    view: { yaw: deg(30), pitch: deg(24), dist: 5.4, fov: deg(26), aspect: 1.18, target: [0.02, -0.02, 0], spin: 0, sway: deg(6) },
    use: 0.44,
    centre: [0, -1.18, -1],
    scale: 1 / 2.25,
    seed: 23,
    build: buildEarth,
  },
  bit: {
    view: { yaw: deg(18), pitch: deg(50), dist: 4.7, fov: deg(26), aspect: 1, target: [0, 0, 0], spin: 0.075, sway: 0 },
    use: 0.46,
    centre: [0, 3.6, 0],
    scale: 1 / 6.9,
    seed: 37,
    build: buildBit,
  },
  wellhead: {
    view: { yaw: deg(24), pitch: deg(12), dist: 5.3, fov: deg(24), aspect: 0.82, target: [0, 0.02, 0], spin: 0, sway: deg(8) },
    use: 0.4,
    centre: [12, 60, 0],
    scale: 1 / 62,
    seed: 53,
    build: buildWellhead,
  },
};

export const modelView = (id: ModelId): ModelView => DEFS[id].view;

/** Tier prefixes the renderer may draw (largest first). Model usage is biased into the front. */
export const TIERS = [160_000, 90_000, 50_000] as const;
const BOOST = [0.78, 1.18, 1.42]; // usage multiplier for slots in [90k,160k), [50k,90k), [0,50k)

const cache = new Map<string, Float32Array>();

/**
 * n particles for model `id` (n is the renderer's buffer size, a tier count). Cached per (id, n)
 * at module level, so a StrictMode remount does not resample.
 */
export function buildModel(id: ModelId, n: number): Float32Array {
  const key = `${id}:${n}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = DEFS[id];
  const r = makeRng(def.seed * 7919 + n);
  // Which slots this model uses: a share per band, larger towards the front of the buffer.
  const edges = [0, ...[...TIERS].reverse().filter((t) => t < n), n];
  const used: number[] = [];
  const idx: number[] = [];
  for (let b = 0; b < edges.length - 1; b++) {
    const lo = edges[b], hi = edges[b + 1];
    const boost = BOOST[Math.max(0, BOOST.length - 1 - b)];
    const want = Math.round((hi - lo) * Math.min(0.9, def.use * boost));
    idx.length = 0;
    for (let i = lo; i < hi; i++) idx.push(i);
    for (let i = 0; i < want; i++) {
      const j = i + Math.floor(r() * (idx.length - i));
      const t = idx[i];
      idx[i] = idx[j];
      idx[j] = t;
      used.push(idx[i]);
    }
  }
  const pts = def.build(r).fill(used.length, r);
  const out = new Float32Array(n * 4);
  const [cx, cy, cz] = def.centre, k = def.scale;
  // Unused slots rest near a random used point, transparent.
  for (let i = 0; i < n; i++) {
    out[i * 4 + 3] = -2; // mark: unused (filled below)
  }
  used.forEach((slot, i) => {
    out[slot * 4] = (pts[i * 4] - cx) * k;
    out[slot * 4 + 1] = (pts[i * 4 + 1] - cy) * k;
    out[slot * 4 + 2] = (pts[i * 4 + 2] - cz) * k;
    out[slot * 4 + 3] = pts[i * 4 + 3];
  });
  for (let i = 0; i < n; i++) {
    if (out[i * 4 + 3] !== -2) continue;
    const j = used[Math.floor(r() * used.length)];
    out[i * 4] = out[j * 4] + (r() - 0.5) * 0.05;
    out[i * 4 + 1] = out[j * 4 + 1] + (r() - 0.5) * 0.05;
    out[i * 4 + 2] = out[j * 4 + 2] + (r() - 0.5) * 0.05;
    out[i * 4 + 3] = -1;
  }
  cache.set(key, out);
  return out;
}
