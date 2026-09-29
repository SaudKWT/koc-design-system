/**
 * A 2,000 hp land rig, modelled from typical dimensions: 30 ft box-on-box
 * substructure, a 142 ft two-legged cantilever mast with a racking board at
 * 88 ft, crown block, traveling block and top drive on a torque track,
 * drawworks, driller's cabin, a 13⅝″ BOP stack (annular over double and
 * single rams), V-door ramp and catwalk, pipe racks, three mud tanks with
 * shakers, three triplex pumps, four generator houses, water and fuel tanks,
 * and four guy lines.
 *
 * Built from instanced unit boxes and cylinders — about 1,500 members — plus
 * a few swept tubes (the rotary hose, the flow line). Units: ft, y up, the
 * well at the origin. The V-door faces −x; the well walks away along +x.
 */

import { Geo } from "./geometry";
import { type V3, add, basis, cross, len, norm, scale, sub } from "./math";
import { RKB } from "./well";
import { STRING_TOP_MD } from "./downhole";

export type RigMat = "struct" | "accent" | "steel" | "dark" | "glass" | "cable";
export const RIG_MATS: RigMat[] = ["struct", "accent", "steel", "dark", "glass", "cable"];

export interface Rig {
  box: Record<RigMat, number[]>;
  cyl: Record<RigMat, number[]>;
  tubes: Record<RigMat, Geo>;
  /** Anchors for on-screen labels. */
  anchors: { crown: V3; board: V3; floor: V3; bop: V3; pumps: V3; tanks: V3 };
}

export function buildRig(): Rig {
  const box = Object.fromEntries(RIG_MATS.map((m) => [m, [] as number[]])) as Record<RigMat, number[]>;
  const cyl = Object.fromEntries(RIG_MATS.map((m) => [m, [] as number[]])) as Record<RigMat, number[]>;
  const tubes = Object.fromEntries(RIG_MATS.map((m) => [m, new Geo()])) as Record<RigMat, Geo>;

  const push = (arr: number[], m: Float32Array) => {
    for (let i = 0; i < 16; i++) arr.push(m[i]);
  };

  /** Axis-aligned block by min/max corners. */
  const block = (mat: RigMat, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
    push(box[mat], basis([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [(x1 - x0) / 2, 0, 0], [0, (y1 - y0) / 2, 0], [0, 0, (z1 - z0) / 2]));

  /** A member of section w × w from p0 to p1. */
  const beam = (mat: RigMat, p0: V3, p1: V3, w: number, h = w) => {
    const d = sub(p1, p0);
    const l = len(d);
    if (l < 1e-4) return;
    const x = norm(d);
    const ref: V3 = Math.abs(x[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    const z = norm(cross(x, ref));
    const y = cross(z, x);
    push(box[mat], basis(scale(add(p0, p1), 0.5), scale(x, l / 2), scale(y, h / 2), scale(z, w / 2)));
  };

  /** A round member of radius r from p0 to p1. */
  const pipe = (mat: RigMat, p0: V3, p1: V3, r: number) => {
    const d = sub(p1, p0);
    if (len(d) < 1e-4) return;
    const y = d;
    const ref: V3 = Math.abs(norm(d)[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    const x = norm(cross(ref, y));
    const z = norm(cross(x, y));
    push(cyl[mat], basis(p0, scale(x, r), y, scale(z, r)));
  };

  /** Swept tube through world points (parallel-transport frames). */
  const tube = (mat: RigMat, pts: V3[], r: number, segs = 16) => {
    const g = tubes[mat];
    let prevN: V3 | null = null;
    const rings: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const t = norm(sub(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]));
      let n: V3 = prevN ? norm(sub(prevN, scale(t, prevN[0] * t[0] + prevN[1] * t[1] + prevN[2] * t[2]))) : norm(cross(t, Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
      if (!isFinite(n[0])) n = [1, 0, 0];
      prevN = n;
      const b = cross(t, n);
      rings.push(g.count);
      for (let k = 0; k < segs; k++) {
        const a = (k / segs) * Math.PI * 2;
        const dir = add(scale(n, Math.cos(a)), scale(b, Math.sin(a)));
        g.vert(add(pts[i], scale(dir, r)), dir, 0);
      }
    }
    for (let i = 0; i < rings.length - 1; i++)
      for (let k = 0; k < segs; k++) {
        const k1 = (k + 1) % segs;
        g.tri(rings[i] + k, rings[i + 1] + k, rings[i + 1] + k1);
        g.tri(rings[i] + k, rings[i + 1] + k1, rings[i] + k1);
      }
  };

  const catenary = (a: V3, b: V3, sag: number, n = 32): V3[] =>
    Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n;
      const p = add(a, scale(sub(b, a), t));
      return [p[0], p[1] - sag * 4 * t * (1 - t), p[2]] as V3;
    });

  const floor = RKB;

  /* Substructure — two side boxes, floor beams, X-bracing. */
  const X0 = -22;
  const X1 = 26;
  for (const zs of [-1, 1]) {
    const zi = 12 * zs;
    const zo = 18 * zs;
    for (const z of [zi, zo]) {
      beam("struct", [X0, 0.6, z], [X1, 0.6, z], 1.1, 1.2);
      beam("struct", [X0, floor - 1.5, z], [X1, floor - 1.5, z], 1.1, 1.6);
      beam("struct", [X0, 12, z], [X1, 12, z], 0.8);
      for (let x = X0; x <= X1 + 0.01; x += 8) beam("struct", [x, 0, z], [x, floor - 1, z], 1.1);
      for (let x = X0; x < X1 - 0.01; x += 8) {
        beam("struct", [x, 0.8, z], [x + 8, 12, z], 0.55);
        beam("struct", [x + 8, 0.8, z], [x, 12, z], 0.55);
        beam("struct", [x, 12, z], [x + 8, floor - 2.2, z], 0.55);
        beam("struct", [x + 8, 12, z], [x, floor - 2.2, z], 0.55);
      }
    }
    for (let x = X0; x <= X1 + 0.01; x += 8) {
      beam("struct", [x, 0.6, zi], [x, 0.6, zo], 0.9);
      beam("struct", [x, floor - 1.5, zi], [x, floor - 1.5, zo], 0.9);
      beam("struct", [x, 12, zi], [x, 12, zo], 0.6);
    }
  }
  for (let x = X0; x <= X1 + 0.01; x += 4) beam("struct", [x, floor - 1.2, -18], [x, floor - 1.2, 18], 0.7, 1.2);

  /* Drill floor, with a hole at the rotary. */
  block("struct", X0, floor - 0.6, -18, -3.2, floor, 18);
  block("struct", 3.2, floor - 0.6, -18, X1, floor, 18);
  block("struct", -3.2, floor - 0.6, -18, 3.2, floor, -3.2);
  block("struct", -3.2, floor - 0.6, 3.2, 3.2, floor, 18);
  pipe("steel", [0, floor - 0.4, 0], [0, floor + 0.9, 0], 2.6);
  pipe("dark", [0, floor + 0.9, 0], [0, floor + 1.1, 0], 1.2);
  // Handrails along the long edges.
  for (const z of [-18, 18]) {
    for (let x = X0; x <= X1 + 0.01; x += 6) beam("struct", [x, floor, z], [x, floor + 3.5, z], 0.18);
    beam("struct", [X0, floor + 3.5, z], [X1, floor + 3.5, z], 0.18);
    beam("struct", [X0, floor + 1.8, z], [X1, floor + 1.8, z], 0.14);
  }

  /* Mast — two lattice legs, open to the V-door. */
  const H = 142;
  const top = floor + H;
  const legBase = (zs: number): V3 => [7, floor, 10.5 * zs];
  const legTop = (zs: number): V3 => [2.5, top, 4.2 * zs];
  const panels = 20;
  for (const zs of [-1, 1]) {
    const b0 = legBase(zs);
    const b1 = legTop(zs);
    const corner = (t: number, cx: number, cz: number): V3 => {
      const c = add(b0, scale(sub(b1, b0), t));
      const w = (4 - 1.8 * t) / 2;
      return [c[0] + cx * w, c[1], c[2] + cz * w];
    };
    const corners: [number, number][] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (const [cx, cz] of corners) beam("struct", corner(0, cx, cz), corner(1, cx, cz), 0.55);
    for (let p = 0; p <= panels; p++) {
      const t = p / panels;
      for (let k = 0; k < 4; k++) {
        const [ax, az] = corners[k];
        const [bx, bz] = corners[(k + 1) % 4];
        beam("struct", corner(t, ax, az), corner(t, bx, bz), 0.3);
        if (p < panels) {
          const t1 = (p + 1) / panels;
          if ((p + k) % 2) beam("struct", corner(t, ax, az), corner(t1, bx, bz), 0.24);
          else beam("struct", corner(t, bx, bz), corner(t1, ax, az), 0.24);
        }
      }
    }
  }
  // Back girts and X-bracing between the legs.
  for (let p = 0; p <= 10; p++) {
    const t = p / 10;
    const a = add(legBase(-1), scale(sub(legTop(-1), legBase(-1)), t));
    const b = add(legBase(1), scale(sub(legTop(1), legBase(1)), t));
    const w = (4 - 1.8 * t) / 2;
    const pa: V3 = [a[0] + w, a[1], a[2] + w];
    const pb: V3 = [b[0] + w, b[1], b[2] - w];
    beam("struct", pa, pb, 0.45);
    if (p < 10) {
      const t1 = (p + 1) / 10;
      const a1 = add(legBase(-1), scale(sub(legTop(-1), legBase(-1)), t1));
      const b1 = add(legBase(1), scale(sub(legTop(1), legBase(1)), t1));
      const w1 = (4 - 1.8 * t1) / 2;
      beam("struct", pa, [b1[0] + w1, b1[1], b1[2] - w1], 0.3);
      beam("struct", pb, [a1[0] + w1, a1[1], a1[2] + w1], 0.3);
    }
  }
  // Crown frame, sheaves and gin pole.
  block("struct", -1.5, top, -6, 6.5, top + 2.6, 6);
  for (let i = 0; i < 7; i++) {
    const z = -3.6 + i * 1.2;
    pipe("steel", [0.2, top + 3.4, z - 0.22], [0.2, top + 3.4, z + 0.22], 2.4);
  }
  pipe("steel", [0.2, top + 3.4, -4.4], [0.2, top + 3.4, 4.4], 0.35);
  for (const zs of [-1, 1]) beam("struct", [5, top + 2.6, 5 * zs], [1.5, top + 11, 0], 0.4);
  beam("struct", [1.5, top + 11, -0.6], [1.5, top + 11, 0.6], 0.5);

  /* Racking board at 88 ft, on the V-door side. */
  const board = floor + 88;
  block("struct", -11, board - 0.5, -9, 1, board, 9);
  for (let z = -8; z <= 8.01; z += 1.45) beam("struct", [-11, board + 0.3, z], [-2.5, board + 0.3, z], 0.22);
  for (const z of [-9, 9]) beam("struct", [-11, board + 3.5, z], [1, board + 3.5, z], 0.18);
  beam("struct", [-11, board + 3.5, -9], [-11, board + 3.5, 9], 0.18);
  for (const zs of [-1, 1]) beam("struct", [-11, board, 9 * zs], [legBase(zs)[0] - 2, board - 14, legBase(zs)[2] * 0.62], 0.35);

  /* Torque track, top drive, traveling block, drilling line. */
  const stringTop = RKB - STRING_TOP_MD;
  for (const z of [-1.2, 1.2]) beam("steel", [4.6, floor + 4, z], [3.2, top - 6, z], 0.6);
  const tdBottom = stringTop + 0.3;
  pipe("steel", [0, stringTop - 0.2, 0], [0, tdBottom + 1.4, 0], 0.32);
  block("accent", -1.4, tdBottom + 1.4, -1.5, 1.8, tdBottom + 5.2, 1.5); // gearbox
  block("accent", -1.2, tdBottom + 5.2, -1.3, 1.6, tdBottom + 12.5, 1.3); // motor housing
  block("dark", 1.6, tdBottom + 6, -0.9, 2.1, tdBottom + 11.5, 0.9); // cooling fan cowl
  pipe("accent", [0.2, tdBottom + 12.5, 0], [0.2, tdBottom + 13.6, 0], 1.1);
  beam("steel", [1.8, tdBottom + 3, -0.9], [3.4, tdBottom + 3, -1.2], 0.35); // dolly arms
  beam("steel", [1.8, tdBottom + 10, 0.9], [3.4, tdBottom + 10, 1.2], 0.35);
  block("steel", 3.1, tdBottom + 1.5, -1.6, 4.1, tdBottom + 12, 1.6); // guide dolly
  for (const z of [-0.9, 0.9]) beam("steel", [0.2, tdBottom + 13.6, z], [0.2, tdBottom + 18.5, z * 1.2], 0.3); // bails
  const block0 = tdBottom + 19;
  pipe("accent", [0.2, block0, -2.1], [0.2, block0, 2.1], 2.3);
  block("accent", -0.9, block0 - 2.6, -2.5, 1.3, block0 + 2.8, -2.1);
  block("accent", -0.9, block0 - 2.6, 2.1, 1.3, block0 + 2.8, 2.5);
  pipe("dark", [0.2, block0 - 3.4, 0], [0.2, block0 - 2.2, 0], 0.9);
  for (let i = 0; i < 12; i++) {
    const zc = -3.5 + (i * 7) / 11;
    const zb = -1.8 + (i * 3.6) / 11;
    pipe("cable", [0.2 + (i % 2 ? 2.2 : -2.2), top + 3.4, zc], [0.2 + (i % 2 ? 2.1 : -2.1), block0, zb], 0.07);
  }
  pipe("cable", [2.6, top + 3.4, 3.6], [17, floor + 6.2, 2.5], 0.09); // fast line to the drum
  pipe("cable", [-2.2, top + 3.4, -3.6], [10, floor + 1, -8], 0.09); // deadline to its anchor
  block("steel", 9, floor, -9, 11, floor + 2, -7);

  /* Standpipe and rotary hose. */
  pipe("steel", [9.5, floor, -9], [9.5, floor + 64, -9], 0.3);
  tube("dark", catenary([9.5, floor + 64, -9], [1.2, tdBottom + 12.8, -1.4], 14), 0.28);
  tube("steel", [
    [9.5, floor + 62, -9],
    [9.5, floor + 64.8, -9],
    [9.5, floor + 65.4, -8.6],
    [9.5, floor + 65, -8],
  ], 0.32);

  /* Drawworks. */
  block("accent", 12, floor, -7, 24, floor + 6.5, 7);
  pipe("dark", [17, floor + 6.3, -5.5], [17, floor + 6.3, 5.5], 2.2);
  for (const zs of [-1, 1]) pipe("accent", [20, floor + 3.2, 7 * zs], [20, floor + 3.2, 10.5 * zs], 2.4);
  block("dark", 22, floor + 6.5, -6, 25, floor + 8, 6);

  /* Driller's cabin, windows facing the well. */
  block("dark", -8, floor, -18, 2, floor + 9, -11);
  block("glass", -7.6, floor + 3.5, -11.1, 1.6, floor + 7.8, -10.9);
  block("struct", -8.4, floor + 9, -18.4, 2.4, floor + 9.5, -10.6);

  /* BOP stack under the floor: wellhead, double ram, single ram, annular, bell nipple. */
  pipe("steel", [0, 0, 0], [0, 3, 0], 1.3);
  pipe("steel", [0, 3, 0], [0, 4, 0], 1.9);
  const ram = (y: number, h: number) => {
    block("accent", -1.7, y, -3.4, 1.7, y + h, 3.4);
    for (const zs of [-1, 1]) pipe("accent", [0, y + h / 2, 3.4 * zs], [0, y + h / 2, 5.8 * zs], h * 0.34);
    for (const zs of [-1, 1]) pipe("steel", [0, y + h / 2, 5.8 * zs], [0, y + h / 2, 6.8 * zs], 0.3);
  };
  ram(4, 4.6);
  pipe("steel", [0, 8.6, 0], [0, 9.2, 0], 1.9);
  ram(9.2, 2.6);
  pipe("steel", [0, 11.8, 0], [0, 12.4, 0], 1.9);
  pipe("accent", [0, 12.4, 0], [0, 16.4, 0], 2.5);
  pipe("accent", [0, 16.4, 0], [0, 17.6, 0], 1.9);
  pipe("steel", [0, 17.6, 0], [0, floor - 1.6, 0], 1.05);
  tube("steel", [
    [0, 24, -1],
    [0, 23.4, -6],
    [0, 16, -22],
    [0, 13, -26.5],
  ], 0.55);
  block("struct", -30, 0, 22, -20, 6, 28);
  for (let i = 0; i < 6; i++) pipe("steel", [-29 + i * 1.6, 6, 25], [-29 + i * 1.6, 9.5, 25], 0.55);

  /* V-door ramp, catwalk, pipe racks. */
  const ramp0: V3 = [X0, floor, 0];
  const ramp1: V3 = [-58, 5.4, 0];
  for (const z of [-3, 3]) beam("struct", [ramp0[0], ramp0[1], z], [ramp1[0], ramp1[1], z], 0.7, 1.1);
  for (let t = 0; t <= 1.001; t += 0.125) {
    const p = add(ramp0, scale(sub(ramp1, ramp0), t));
    beam("struct", [p[0], p[1] - 0.2, -3], [p[0], p[1] - 0.2, 3], 0.4);
    if (t > 0.2) beam("struct", [p[0], 0, -2.6], [p[0], p[1] - 0.4, -2.6], 0.4);
    if (t > 0.2) beam("struct", [p[0], 0, 2.6], [p[0], p[1] - 0.4, 2.6], 0.4);
  }
  block("struct", -118, 0, -3, -58, 5, 3);
  for (const zs of [-1, 1]) {
    for (const x of [-112, -98, -84, -70]) block("struct", x - 0.4, 0, 6 * zs, x + 0.4, 3.4, 20 * zs);
    for (let layer = 0; layer < 3; layer++)
      for (let i = 0; i < 24; i++) {
        const z = zs * (6.8 + i * 0.56 + (layer % 2) * 0.28);
        const y = 3.62 + layer * 0.46;
        pipe("steel", [-112, y, z], [-81, y, z], 0.22);
      }
  }

  /* Mud system: shakers, three tanks, three pumps. */
  for (const x of [-6, 2]) {
    block("struct", x, 4, -32, x + 6, 9.5, -25);
    beam("dark", [x + 0.4, 10.8, -31.6], [x + 5.6, 9.2, -31.6], 0.2);
  }
  const tanks: [number, number][] = [
    [-34, -14],
    [-12, 8],
    [10, 30],
  ];
  for (const [x0, x1] of tanks) {
    block("struct", x0, 0, -48, x1, 8.5, -36);
    for (let x = x0 + 4; x < x1; x += 6) {
      pipe("accent", [x, 8.5, -42], [x, 10.6, -42], 0.9);
      pipe("dark", [x, 10.6, -42], [x, 11.1, -42], 0.6);
    }
    for (const z of [-48, -36]) beam("struct", [x0, 12, z], [x1, 12, z], 0.15);
  }
  for (const x of [-30, -6, 18]) {
    block("accent", x, 0, -76, x + 14, 6.8, -68);
    block("dark", x - 4, 0.5, -75, x, 6, -69);
    for (let i = 0; i < 3; i++) pipe("steel", [x - 4.6, 3.4, -73.8 + i * 2.2], [x - 3.8, 3.4, -73.8 + i * 2.2], 0.9);
  }

  /* Power: four generator houses; water and fuel tanks. */
  for (const z0 of [-106, -94])
    for (const x0 of [-44, 2]) {
      block("dark", x0, 0, z0, x0 + 40, 9.5, z0 + 8);
      block("accent", x0, 9.5, z0 + 3, x0 + 40, 9.9, z0 + 5);
      for (let x = x0 + 6; x < x0 + 38; x += 10) pipe("steel", [x, 9.5, z0 + 6], [x, 13, z0 + 6], 0.45);
    }
  for (const [x0, x1] of [
    [-44, -14],
    [2, 32],
  ] as const) {
    pipe("struct", [x0, 5.4, -126], [x1, 5.4, -126], 5);
    for (const x of [x0 + 4, x1 - 4]) block("struct", x - 0.5, 0, -129, x + 0.5, 2, -123);
  }

  /* Guy lines. */
  for (const zs of [-1, 1]) {
    const anchorTop = add(legTop(zs), [0, -30, 0]);
    pipe("cable", anchorTop, [-78, 0, 96 * zs], 0.06);
    pipe("cable", anchorTop, [92, 0, 96 * zs], 0.06);
  }

  return {
    box,
    cyl,
    tubes,
    anchors: {
      crown: [0, top + 6, 0],
      board: [-11, board + 2, 9],
      floor: [X0 + 4, floor + 2, 18],
      bop: [0, 10, 6.8],
      pumps: [-6, 7, -72],
      tanks: [-2, 9, -48],
    },
  };
}
