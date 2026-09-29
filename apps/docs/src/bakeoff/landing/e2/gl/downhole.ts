/**
 * Everything below the rotary table, modelled from dimensions.
 *
 * Every part is built in its local frame: x = distance downhole from the
 * part's top (ft), y/z = the cross-section (ft). Sources for the numbers are
 * standard oilfield dimensions — API 5DP drill pipe with NC50 tool joints,
 * 5″ heavy-weight, 6¾″ collars, buttress casing couplings, an 8½″ six-bladed
 * PDC with 16 mm cutters. Where a number is a judgement (blade spiral, pad
 * size), it is called out.
 *
 * Material slots (the renderer binds them per draw):
 *   0 — the part's steel   1 — its paint or accent   2 — dark: carbide,
 *   hardbanding, antenna covers   3 — bright: polished mandrel, diamond table.
 */

import { Geo } from "./geometry";
import { type V3, add, scale, norm } from "./math";
import { BHA_TOP, DP_JOINT, station, type BhaPart, type CasingString } from "./well";

const inch = (x: number) => x / 12;
type P = [number, number, number?, number?];

/* ------------------------------------------------------------------------ */
/* Drill pipe, heavy-weight                                                  */

/**
 * One 31 ft joint of 5″ 19.5 ppf drill pipe, box up. NC50 tool joints, 6⅝″ OD:
 * box 16″ with an 18° elevator shoulder and a 3″ hardband, pin 11″ with a 35°
 * shoulder; the tube flares to its external upset over the last few inches.
 */
export function dpJoint(): Geo {
  const tj = inch(6.625 / 2);
  const tube = inch(5 / 2);
  const upset = inch(5.125 / 2);
  const box = inch(16);
  const pin = inch(11);
  const L = DP_JOINT;
  const d18 = (tj - upset) / Math.tan((18 * Math.PI) / 180);
  const d35 = (tj - upset) / Math.tan((35 * Math.PI) / 180);
  const profile: P[] = [
    [0, tj - inch(0.4)],
    [inch(0.15), tj],
    [box - inch(4.5), tj],
    [box - inch(4.5), tj + inch(0.06), 2],
    [box - inch(1.5), tj + inch(0.06)],
    [box - inch(1.5), tj],
    [box, tj],
    [box + d18, upset, 0, 1],
    [box + d18 + inch(4), tube, 0, 1],
    [L - pin - d35 - inch(4), tube, 0, 1],
    [L - pin - d35, upset],
    [L - pin, tj],
    [L - inch(0.15), tj],
    [L, tj - inch(0.4)],
  ];
  return new Geo().lathe(profile, 72);
}

/** 5″ heavy-weight drill pipe: 6½″ tool joints, 5½″ centre wear pad, hardbanded. */
export function hwdpJoint(): Geo {
  const tj = inch(6.5 / 2);
  const tube = inch(5 / 2);
  const pad = inch(5.5 / 2);
  const L = 31;
  const box = inch(30);
  const pin = inch(24);
  const mid = L / 2;
  const profile: P[] = [
    [0, tj - inch(0.4)],
    [inch(0.15), tj],
    [inch(3), tj],
    [inch(3), tj + inch(0.06), 2],
    [inch(6), tj + inch(0.06)],
    [inch(6), tj],
    [box, tj],
    [box + inch(1.2), tube],
    [mid - inch(12) - inch(1.4), tube],
    [mid - inch(12), pad],
    [mid - inch(9), pad],
    [mid - inch(9), pad + inch(0.05), 2],
    [mid - inch(5), pad + inch(0.05)],
    [mid - inch(5), pad],
    [mid + inch(5), pad],
    [mid + inch(5), pad + inch(0.05), 2],
    [mid + inch(9), pad + inch(0.05)],
    [mid + inch(9), pad],
    [mid + inch(12), pad],
    [mid + inch(12) + inch(1.4), tube],
    [L - pin - inch(1.6), tube],
    [L - pin, tj],
    [L - inch(0.15), tj],
    [L, tj - inch(0.4)],
  ];
  return new Geo().lathe(profile, 72);
}

/* ------------------------------------------------------------------------ */
/* Collars and tools                                                         */

/** A plain collar with bevelled box and pin shoulders and a stress-relief groove near each end. */
function collarProfile(L: number, r: number, bodyMat = 0): P[] {
  return [
    [0, r - inch(0.5)],
    [inch(0.3), r, bodyMat],
    [inch(9), r],
    [inch(9), r - inch(0.12), 2],
    [inch(10.5), r - inch(0.12)],
    [inch(10.5), r, bodyMat],
    [L - inch(10.5), r],
    [L - inch(10.5), r - inch(0.12), 2],
    [L - inch(9), r - inch(0.12)],
    [L - inch(9), r, bodyMat],
    [L - inch(0.3), r],
    [L, r - inch(0.5)],
  ];
}

/**
 * Spiral stabiliser blades: `n` blades between axial a0..a1 on a body of
 * radius `body`, out to `gauge`, each wrapping `wrap` radians. Ends taper over
 * `taper` ft (the lead-in). Tungsten-carbide inserts dot each blade face.
 */
function spiralBlades(
  g: Geo,
  opts: { n: number; a0: number; a1: number; body: number; gauge: number; wrap: number; width: number; taper: number; phase?: number; inserts?: boolean },
) {
  const { n, a0, a1, body, gauge, wrap, width, taper, phase = 0 } = opts;
  const K = 40;
  for (let b = 0; b < n; b++) {
    const phi0 = phase + (b / n) * Math.PI * 2;
    const sections: V3[][] = [];
    for (let k = 0; k <= K; k++) {
      const u = k / K;
      const a = a0 + (a1 - a0) * u;
      const ramp = Math.min(1, Math.min(a - a0, a1 - a) / taper);
      const h = (gauge - body) * Math.max(0.04, ramp * ramp * (3 - 2 * ramp));
      const phi = phi0 + wrap * u;
      const top = body + h;
      const halfTop = width / 2 / top;
      const halfBase = (width * 1.25) / 2 / body;
      const pt = (r: number, t: number): V3 => [a, r * Math.cos(t), r * Math.sin(t)];
      sections.push([
        pt(body - inch(0.2), phi - halfBase),
        pt(top, phi - halfTop),
        pt(top, phi + halfTop),
        pt(body - inch(0.2), phi + halfBase),
      ]);
    }
    g.sweep(sections, 0);
    if (opts.inserts) {
      // Three columns of carbide inserts across the full-gauge part of the blade.
      for (let k = 0; k < 16; k++) {
        const u = 0.2 + (0.6 * (k + 0.5)) / 16;
        const a = a0 + (a1 - a0) * u;
        for (const c of [-0.28, 0, 0.28]) {
          const phi = phi0 + wrap * u + (c * width) / gauge;
          const radial: V3 = [0, Math.cos(phi), Math.sin(phi)];
          g.cylinder(add([a, 0, 0], scale(radial, gauge - inch(0.08))), radial, inch(0.2), inch(0.11), 10, 3);
        }
      }
    }
  }
}

export function bhaPart(p: BhaPart): Geo {
  const g = new Geo();
  const L = p.length;
  const r = inch(p.od / 2);
  switch (p.kind) {
    case "stab": {
      const body = inch(6.75 / 2);
      g.lathe(collarProfile(L, body), 72);
      spiralBlades(g, {
        n: 3,
        a0: L / 2 - 1.05,
        a1: L / 2 + 1.05,
        body,
        gauge: r,
        wrap: (140 * Math.PI) / 180,
        width: inch(2.6),
        taper: 0.32,
        inserts: true,
      });
      return g;
    }
    case "lwd": {
      // Resistivity antennas: recessed bands under dark covers, two pairs.
      const pr: P[] = [[0, r - inch(0.5)], [inch(0.3), r]];
      for (const c of [5, 7.5, 14.5, 17]) {
        pr.push([c - 0.2, r], [c - 0.2, r - inch(0.25), 2], [c + 0.2, r - inch(0.25)], [c + 0.2, r, 0]);
      }
      pr.push([L - inch(0.3), r], [L, r - inch(0.5)]);
      g.lathe(pr, 96);
      return g;
    }
    case "mwd": {
      // Painted collar (the accent) with steel wear bands.
      const pr: P[] = [
        [0, r - inch(0.5)],
        [inch(0.3), r],
        [1.2, r],
        [1.2, r - inch(0.03), 1],
        [13.4, r - inch(0.03)],
        [13.4, r, 0],
        [14.6, r],
        [14.6, r - inch(0.03), 1],
        [L - 1.2, r - inch(0.03)],
        [L - 1.2, r, 0],
        [L - inch(0.3), r],
        [L, r - inch(0.5)],
      ];
      g.lathe(pr, 96);
      return g;
    }
    case "nmdc":
      return g.lathe(collarProfile(L, r, 3), 96);
    case "xo":
      return g.lathe(collarProfile(L, r), 72);
    case "jar": {
      // The mandrel shows polished between the upper and lower housings.
      const mand = inch(5 / 2);
      const pr: P[] = [
        [0, r - inch(0.5)],
        [inch(0.3), r],
        [1.4, r],
        [1.4 + inch(0.8), mand, 3],
        [3.2, mand],
        [3.2 + inch(0.8), r, 0],
        [12, r],
        [12, r - inch(0.1), 2],
        [12.2, r - inch(0.1)],
        [12.2, r, 0],
        [22, r],
        [22, r - inch(0.1), 2],
        [22.2, r - inch(0.1)],
        [22.2, r, 0],
        [L - inch(0.3), r],
        [L, r - inch(0.5)],
      ];
      return g.lathe(pr, 96);
    }
    case "rss": {
      // Control collar, a short integral stabiliser, then the bias unit whose
      // three pads (separate meshes, see rssPad) push against the wall.
      const pr: P[] = [
        [0, r - inch(0.5)],
        [inch(0.3), r],
        [2.5, r],
        [2.5, r - inch(0.08), 2],
        [2.9, r - inch(0.08)],
        [2.9, r, 0],
        [9.0, r],
        [9.0, r - inch(0.2), 2],
        [9.15, r - inch(0.2)],
        [9.15, r, 0],
        [L - inch(1), r],
        [L, r - inch(0.4)],
      ];
      g.lathe(pr, 96);
      spiralBlades(g, {
        n: 3,
        a0: 5.4,
        a1: 6.6,
        body: r,
        gauge: inch(8.25 / 2),
        wrap: (25 * Math.PI) / 180,
        width: inch(2.2),
        taper: 0.18,
        phase: 0.4,
      });
      // Pad pockets: dark recesses the pads sit in.
      for (let i = 0; i < 3; i++) {
        const t = (i / 3) * Math.PI * 2;
        const pocket: V3[][] = [];
        for (let k = 0; k <= 1; k++) {
          const a = PAD_A0 - inch(0.6) + k * (PAD_A1 - PAD_A0 + inch(1.2));
          const w = PAD_W / 2 / r + 0.03;
          pocket.push([
            [a, (r - inch(0.05)) * Math.cos(t - w), (r - inch(0.05)) * Math.sin(t - w)],
            [a, (r + inch(0.01)) * Math.cos(t - w), (r + inch(0.01)) * Math.sin(t - w)],
            [a, (r + inch(0.01)) * Math.cos(t + w), (r + inch(0.01)) * Math.sin(t + w)],
            [a, (r - inch(0.05)) * Math.cos(t + w), (r - inch(0.05)) * Math.sin(t + w)],
          ]);
        }
        g.sweep(pocket, 2);
      }
      return g;
    }
    default:
      return g.lathe(collarProfile(L, r), 72);
  }
}

const RSS_R = inch(6.75 / 2);
const PAD_A0 = 11.25;
const PAD_A1 = 11.85;
const PAD_W = inch(2.2);

/**
 * One steering pad of a push-the-bit RSS (bias unit), at angle `t` around the
 * tool. Retracted it sits flush; the renderer pushes it out along its own
 * radial as it sweeps past the low side. Pad size is a judgement call.
 */
export function rssPad(t: number): Geo {
  const g = new Geo();
  const r0 = RSS_R - inch(0.25);
  const r1 = RSS_R + inch(0.02);
  const K = 10;
  const sections: V3[][] = [];
  for (let k = 0; k <= K; k++) {
    const u = k / K;
    const a = PAD_A0 + (PAD_A1 - PAD_A0) * u;
    // Rounded ends: the face narrows at the ends like a real pad.
    const w = (PAD_W / 2) * (0.75 + 0.25 * Math.sin(u * Math.PI));
    const top = r1 - inch(0.08) * (1 - Math.sin(u * Math.PI));
    const at = (r: number, off: number): V3 => {
      const c = Math.cos(t);
      const s = Math.sin(t);
      return [a, r * c - off * s, r * s + off * c];
    };
    sections.push([at(r0, -w), at(top - inch(0.06), -w), at(top, -w * 0.7), at(top, w * 0.7), at(top - inch(0.06), w), at(r0, w)]);
  }
  g.sweep(sections, 2);
  // Carbide buttons on the pad face.
  for (let k = 0; k < 4; k++) {
    const a = PAD_A0 + (PAD_A1 - PAD_A0) * ((k + 0.5) / 4);
    for (const off of [-0.35, 0.35]) {
      const o = off * (PAD_W / 2);
      const radial: V3 = [0, Math.cos(t), Math.sin(t)];
      const side: V3 = [0, -Math.sin(t), Math.cos(t)];
      g.cylinder(add(add([a, 0, 0], scale(radial, r1 - inch(0.06))), scale(side, o)), radial, inch(0.16), inch(0.08), 10, 3);
    }
  }
  return g;
}

export const PAD_ANGLES = [0, 1, 2].map((i) => (i / 3) * Math.PI * 2);
export const PAD_MAX_PUSH = inch(0.55);

/* ------------------------------------------------------------------------ */
/* The bit                                                                   */

/**
 * 8½″ PDC, six blades (three primary to the centre, three secondary), 16 mm
 * cutters at 20° back-rake, six nozzles, 2″ gauge pads. Local x runs from the
 * shank (0) to the nose (≈1.05 ft).
 *
 * Crown profile: a shallow inverted cone at the centre, the nose at 1.4″
 * radius, then a quarter-ellipse shoulder out to gauge. Blade spiral and the
 * cutter layout are judgement calls; the dimensions are standard.
 */
export function pdcBit(): Geo {
  const g = new Geo();
  const R = 4.25; // inches
  const rn = 1.4;
  const dNose = 12.6;
  const coneDepth = 0.5;
  const shoulderH = 1.6;
  const crown = (r: number) =>
    r <= rn
      ? dNose - coneDepth * Math.pow(1 - r / rn, 1.3)
      : dNose - shoulderH * (1 - Math.sqrt(Math.max(0, 1 - Math.pow((r - rn) / (R - rn), 2))));
  const bladeH = 1.1;
  const headR = 3.0;
  const shankR = 3.25;

  // Body: shank, neck, junk-slot floor, and the face under the blades.
  const body: P[] = [
    [0, 2.9],
    [0.2, shankR],
    [4.3, shankR],
    [4.3, shankR - 0.12, 2],
    [4.9, shankR - 0.12],
    [4.9, shankR, 0],
    [5.2, shankR, 0, 1],
    [6.0, headR, 0, 1],
  ];
  const faceStart = crown(headR) - bladeH;
  body.push([faceStart, headR, 0, 1]);
  for (let i = 1; i <= 24; i++) {
    const r = headR * (1 - i / 24);
    body.push([crown(r) - bladeH, r, 0, 1]);
  }
  g.lathe(
    body.map(([a, r, m, s]) => [inch(a), inch(r), m, s] as P),
    128,
  );

  // Blades.
  const blades = [
    { phi: 0, start: 0.35, primary: true },
    { phi: 1, start: 1.9, primary: false },
    { phi: 2, start: 0.55, primary: true },
    { phi: 3, start: 2.05, primary: false },
    { phi: 4, start: 0.75, primary: true },
    { phi: 5, start: 1.95, primary: false },
  ].map((b) => ({ ...b, phi: (b.phi / 6) * Math.PI * 2 }));

  // Meridian path (r, d) per blade: face → gauge → top taper into the shank.
  const meridian = (start: number) => {
    const pts: [number, number][] = [];
    const N = 40;
    for (let i = 0; i <= N; i++) {
      const r = start + (R - start) * (1 - Math.pow(1 - i / N, 1.4));
      pts.push([Math.min(r, R - 0.001), crown(Math.min(r, R - 0.001))]);
    }
    const dG = crown(R - 0.001);
    for (let i = 1; i <= 6; i++) pts.push([R, dG - (2.0 * i) / 6]);
    for (let i = 1; i <= 6; i++) pts.push([R - ((R - shankR) * i) / 6, dG - 2.0 - (2.4 * i) / 6]);
    return pts;
  };

  const toLocal = (d: number, r: number, phi: number): V3 => [inch(d), inch(r) * Math.cos(phi), inch(r) * Math.sin(phi)];

  for (const b of blades) {
    const path = meridian(b.start);
    const sections: V3[][] = [];
    const frames: { P: V3; n: V3; tau: V3; u: V3; r: number }[] = [];
    for (let i = 0; i < path.length; i++) {
      const [r, d] = path[i];
      const [rp, dp] = path[Math.max(0, i - 1)];
      const [rq, dq] = path[Math.min(path.length - 1, i + 1)];
      // Meridian tangent and the outward normal (into the rock).
      const tr = rq - rp;
      const td = dq - dp;
      const tl = Math.hypot(tr, td) || 1;
      let nd = -tr / tl;
      let nr = td / tl;
      if (nd * 1 + nr * 0.3 < 0 && i < 41) {
        nd = -nd;
        nr = -nr;
      }
      if (i >= 41 && nr < 0) {
        nd = -nd;
        nr = -nr;
      }
      const phi = b.phi + 0.2 * (Math.min(r, R) / R) + (i > 40 ? 0.012 * (i - 40) : 0);
      const u: V3 = [0, Math.cos(phi), Math.sin(phi)];
      const tau: V3 = [0, -Math.sin(phi), Math.cos(phi)];
      const P = toLocal(d, r, phi);
      const n: V3 = norm([inch(nd), inch(nr) * u[1], inch(nr) * u[2]]);
      const w = inch(0.85 + 0.45 * (Math.min(r, R) / R));
      const depth = inch(bladeH + 0.25);
      sections.push([
        add(P, scale(tau, w / 2)),
        add(add(P, scale(tau, w / 2 + inch(0.08))), scale(n, -inch(0.12))),
        add(add(P, scale(n, -depth)), scale(tau, w * 0.62)),
        add(add(P, scale(n, -depth)), scale(tau, -w * 0.62)),
        add(P, scale(tau, -w / 2)),
      ]);
      frames.push({ P, n, tau, u, r });
    }
    g.sweep(sections, 1);

    // Cutters along the leading edge of the face, staggered between blades so
    // the rows interleave radially.
    const stagger = (b.phi / (Math.PI * 2)) * 0.62;
    let acc = stagger;
    const cutterD = inch(0.63);
    const faceEnd = 41;
    for (let i = 1; i < faceEnd + 4; i++) {
      const f0 = frames[i - 1];
      const f1 = frames[i];
      acc += Math.hypot(f1.P[0] - f0.P[0], f1.P[1] - f0.P[1], f1.P[2] - f0.P[2]);
      if (acc < cutterD * 1.12) continue;
      acc = 0;
      if (f1.r < 0.3) continue;
      const beta = (20 * Math.PI) / 180;
      const axis = norm(add(scale(f1.tau, Math.cos(beta)), scale(f1.n, Math.sin(beta))));
      const w = inch(0.85 + 0.45 * (Math.min(f1.r, R) / R));
      const c = add(add(f1.P, scale(f1.tau, w / 2 - inch(0.02))), scale(f1.n, -inch(0.2)));
      const L = inch(0.51);
      const table = inch(0.09);
      g.cylinder(add(c, scale(axis, -L)), axis, cutterD / 2, L - table, 20, 2);
      g.cylinder(add(c, scale(axis, -table)), axis, cutterD / 2, table, 20, 3, inch(0.025));
    }
    // Gauge inserts.
    for (let k = 0; k < 3; k++) {
      const f = frames[42 + k];
      g.cylinder(add(f.P, scale(f.n, -inch(0.05))), f.n, inch(0.14), inch(0.06), 10, 3);
    }
  }

  // Nozzles, one in each junk slot.
  for (let k = 0; k < 6; k++) {
    const phi = ((k + 0.5) / 6) * Math.PI * 2 + 0.12;
    const r = k % 2 ? 2.0 : 1.35;
    const d = crown(r) - bladeH;
    const base = toLocal(d - 0.2, r, phi);
    const axis = norm([1, 0.25 * Math.cos(phi), 0.25 * Math.sin(phi)]);
    g.cylinder(base, axis, inch(0.42), inch(0.35), 20, 0, inch(0.05));
    g.cylinder(add(base, scale(axis, inch(0.36))), axis, inch(0.2), inch(0.02), 16, 2);
  }
  return g;
}

/* ------------------------------------------------------------------------ */
/* Casing                                                                    */

/** A buttress coupling, centred on x = 0. */
export function coupling(c: CasingString): Geo {
  const r = inch(c.od / 2);
  const rc = inch(c.couplingOd / 2);
  const L = inch(c.od < 12 ? 10.6 : 11.2);
  return new Geo().lathe(
    [
      [-L / 2, r],
      [-L / 2 + inch(0.35), rc],
      [L / 2 - inch(0.35), rc],
      [L / 2, r],
    ],
    96,
  );
}

/** Float shoe on the bottom joint: a coupling-OD body and a rounded cement nose. */
export function floatShoe(c: CasingString): Geo {
  const rc = inch(c.couplingOd / 2);
  const r = inch(c.od / 2);
  const pr: P[] = [[0, r], [inch(0.4), rc], [1.1, rc, 1, 1]];
  for (let i = 1; i <= 10; i++) {
    const t = (i / 10) * (Math.PI / 2);
    pr.push([1.1 + 0.55 * Math.sin(t), rc - (rc - r * 0.38) * (1 - Math.cos(t)), 1, 1]);
  }
  pr.push([1.65, r * 0.3, 2], [1.4, r * 0.3, 2]);
  return new Geo().lathe(pr, 96);
}

/* ------------------------------------------------------------------------ */
/* Placement                                                                 */

/** Instance record: frame origin (x, y, z), inclination, MD. */
export function frameAt(mdTop: number, length: number): number[] {
  const s = station(mdTop);
  const mid = station(mdTop + length / 2);
  return [s.pos[0], s.pos[1], s.pos[2], mid.inc, mdTop];
}

/** Every drill-pipe joint from the top of the BHA to the rotary table. */
export function dpInstances(): Float32Array {
  const out: number[] = [];
  for (let md = BHA_TOP - DP_JOINT; md > STRING_TOP_MD - 1; md -= DP_JOINT) out.push(...frameAt(md, DP_JOINT));
  return new Float32Array(out);
}

/** The top of the string: two joints stand above the rotary table, up to the top drive. */
export const STRING_TOP_MD = BHA_TOP - DP_JOINT * Math.ceil((BHA_TOP + DP_JOINT * 1.4) / DP_JOINT);

export function couplingInstances(c: CasingString): Float32Array {
  const out: number[] = [];
  for (let md = c.shoe - 40; md > 40; md -= 40) {
    const s = station(md);
    out.push(s.pos[0], s.pos[1], s.pos[2], s.inc, md);
  }
  return new Float32Array(out);
}

export const shoeInstance = (c: CasingString) => new Float32Array(frameAt(c.shoe - 1.65, 1.65));

export const partInstance = (p: BhaPart) => new Float32Array(frameAt(p.top, p.length));

