/**
 * The world: one strip of desert, four fog-islands along it, one per chapter.
 * Chapters sit 600 m apart so distance fog hides each from the next — the
 * camera flies between them through the fog, which is the chapter wipe.
 *
 *   I   Bahra, 1936        x = −900   the first well
 *   II  Burgan, 1938       x = −300   discovery
 *   III Mina al-Ahmadi     x = +300   first export, 1946
 *   IV  A rig pad, today   x = +900   the eight teams as hotspots
 */

import { MeshBuilder, type MeshData } from "./geometry";
import { m4, rng, smoothstep, v3, type V3 } from "./math";
import { CENTERS, FOCUS, PAD_Y, TEAM_ANCHORS, rel } from "./anchors";

export { CENTERS, FOCUS, TEAM_ANCHORS };
import {
  DRILL_PIPE,
  Kit,
  MAT,
  SHRUB,
  UNIT_ANGLE,
  UNIT_ROD,
  combinationRigGear,
  camelMesh,
  coiledTubingUnit,
  container,
  derrick1930s,
  horizontalTank,
  modernRig,
  mudPump,
  mudTank,
  personMesh,
  pickup,
  pipeRack,
  place,
  ridgeTent,
  shaleShaker,
  storageTank,
  tanker,
  truck1930s,
  windsock,
} from "./models";
import { boxAt, cylinder, extrude, lathe } from "./geometry";
import type { DrawItem } from "./renderer";
import type { Anim } from "./anims";



const ft = (x: number) => x * 0.3048;

// ── Terrain ────────────────────────────────────────────────────────────────

const BASE = -14;

function superR(dx: number, dz: number, a: number, b: number) {
  return Math.pow(Math.pow(Math.abs(dx) / a, 4) + Math.pow(Math.abs(dz) / b, 4), 0.25);
}

/** Ch III: Ahmadi ridge behind, the shore at z ≈ +18, the Gulf beyond. */
function coastProfile(z: number) {
  if (z < -175) return BASE;
  if (z < -128) return BASE + (16 - BASE) * smoothstep(-175, -128, z);
  if (z < -42) return 16;
  if (z < 18) return 1.2 + (16 - 1.2) * (1 - smoothstep(-42, 18, z));
  if (z < 30) return 1.2 - 1.9 * smoothstep(18, 30, z);
  return -0.7 - 9 * smoothstep(30, 90, z);
}

export function heightAt(x: number, z: number): number {
  // Low swell everywhere, flattened where anything stands.
  let calm = 0;
  for (const c of CENTERS) calm = Math.max(calm, Math.exp(-Math.pow(Math.hypot(x - c[0], z - c[2]) / 70, 4)));
  const swell =
    (1.4 * Math.sin(x * 0.013 + Math.sin(z * 0.02) * 2) * Math.sin(z * 0.017 + 1.3) +
      0.7 * Math.sin(x * 0.041 + z * 0.023) +
      0.35 * Math.sin(x * 0.09 - z * 0.07)) *
    (1 - calm * 0.92);
  let h = BASE + swell;
  // I · Bahra: a flat-topped ridge dome.
  h += 19 * Math.exp(-Math.pow(Math.hypot(x + 900, (z - 5) * 1.25) / 95, 4));
  // II · Burgan: broader, gentler.
  h += 18.5 * Math.exp(-Math.pow(Math.hypot(x + 300, z) / 108, 4));
  // III · the coast.
  const m3 = Math.exp(-Math.pow((x - 300) / 210, 6));
  h += m3 * (coastProfile(z) - BASE);
  // IV · a graded pad on a plateau.
  const r4 = superR(x - 900, z, 100, 82);
  h += (3 - BASE) * (1 - smoothstep(1.0, 1.4, r4));
  return h;
}

function terrainTile(cx: number, halfW: number, z0: number, z1: number, step: number): MeshData {
  const b = new MeshBuilder();
  const nx = Math.round((halfW * 2) / step) + 1;
  const nz = Math.round((z1 - z0) / step) + 1;
  // Heights once, with a one-sample apron, so normals come from neighbours
  // rather than four more evaluations per vertex.
  const W = nx + 2;
  const hts = new Float32Array(W * (nz + 2));
  for (let j = -1; j <= nz; j++)
    for (let i = -1; i <= nx; i++) hts[i + 1 + W * (j + 1)] = heightAt(cx - halfW + i * step, z0 + j * step);
  const H = (i: number, j: number) => hts[i + 1 + W * (j + 1)];
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const n = v3.norm([H(i - 1, j) - H(i + 1, j), 2 * step, H(i, j - 1) - H(i, j + 1)]);
      b.vert([cx - halfW + i * step, H(i, j), z0 + j * step], n, [0.6, 0.04]);
    }
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      b.tri(a, a + nx, a + nx + 1);
      b.tri(a, a + nx + 1, a + 1);
    }
  return b.build();
}

// ── Camera poses ───────────────────────────────────────────────────────────

export interface Pose {
  eye: V3;
  target: V3;
  fov: number; // degrees, at 16:10
}


export const POSES: Pose[] = [
  { eye: rel(CENTERS[0], [-62, 30, 96]), target: rel(CENTERS[0], [-2, 14, -4]), fov: 36 },
  { eye: rel(CENTERS[1], [-58, 26, 92]), target: rel(CENTERS[1], [-4, 17, -6]), fov: 38 },
  { eye: rel(CENTERS[2], [-150, 52, 296]), target: rel(CENTERS[2], [26, 7, 96]), fov: 38 },
  { eye: rel(CENTERS[3], [-84, 34, 104]), target: rel(CENTERS[3], [-4, 20, 0]), fov: 42 },
];

/** "Press to discover": a closer look per chapter. */
export const DISCOVER: Pose[] = [
  { eye: rel(CENTERS[0], [-22, 4.2, 30]), target: rel(CENTERS[0], [-10, 5, 12]), fov: 40 },
  { eye: rel(CENTERS[1], [-10, 7, 26]), target: rel(CENTERS[1], [0, 26, 0]), fov: 50 },
  { eye: rel(CENTERS[2], [-16, 21, -60]), target: rel(CENTERS[2], [4, 14, -38]), fov: 40 },
  { eye: rel(CENTERS[3], [30, 14, 40]), target: rel(CENTERS[3], [0, 22, 0]), fov: 48 },
];





// ── Chapter builders ───────────────────────────────────────────────────────

const groundAt = (x: number, z: number) => heightAt(x, z);

function finish(k: Kit, center: V3, radius: number, extra: DrawItem[] = []): DrawItem[] {
  const out: DrawItem[] = [{ mesh: k.s.build(), center, radius, castShadow: true }];
  if (k.members.length)
    out.push({ mesh: UNIT_ANGLE, instances: new Float32Array(k.members), instMat: MAT.steel, center, radius, castShadow: true });
  if (k.rods.length)
    out.push({ mesh: UNIT_ROD, instances: new Float32Array(k.rods), instMat: MAT.steel, center, radius, castShadow: true });
  return out.concat(extra);
}

function shrubs(center: V3, rMin: number, rMax: number, n: number, seed: number, avoid: (x: number, z: number) => boolean): DrawItem {
  const r = rng(seed);
  const inst: number[] = [];
  let tries = 0;
  while (inst.length / 16 < n && tries++ < n * 20) {
    const a = r() * Math.PI * 2;
    const d = rMin + Math.sqrt(r()) * (rMax - rMin);
    const x = center[0] + Math.cos(a) * d;
    const z = center[2] + Math.sin(a) * d;
    if (avoid(x, z)) continue;
    const y = heightAt(x, z);
    if (y < 0.4 && center === CENTERS[2]) continue;
    const s = 0.45 + r() * 0.8;
    inst.push(...m4.compose(m4.translation(x, y - 0.05, z), m4.rotY(r() * 6.28), m4.scaling(s, s * (0.6 + r() * 0.4), s)));
  }
  return { mesh: SHRUB, instances: new Float32Array(inst), instMat: [0.5, 0.05], center, radius: rMax, castShadow: true };
}

function terrainFor(i: number): DrawItem {
  const c = CENTERS[i];
  return {
    mesh: terrainTile(c[0], 300, i === 2 ? -300 : -300, i === 2 ? 300 : 300, 2.1),
    kind: 1,
    center: c,
    radius: 420,
    castShadow: false,
  };
}

/** I · Bahra, 1936 — the first well, and the survey party that sited it. */
function chapterI(): DrawItem[] {
  const c = CENTERS[0];
  const k = new Kit();
  const y = groundAt(c[0], c[2]);
  derrick1930s(k, [c[0], y, c[2]], { height: ft(122), base: ft(24), top: ft(5.5), panels: 13, floor: 2.3, rot: 0.35, rigged: true });
  combinationRigGear(k, [c[0], y, c[2]], 0.35, 2.3, ft(24) / 2 + 1.3);
  // Camp.
  for (let t = 0; t < 3; t++) {
    const x = c[0] + 18 + t * 6.5, z = c[2] + 14 - t * 2;
    ridgeTent(k, [x, groundAt(x, z), z], 0.2 + t * 0.05);
  }
  const tx = c[0] + 8, tz = c[2] + 20;
  truck1930s(k, [tx, groundAt(tx, tz), tz], -0.5, "barrels");
  // Camels and the party.
  const cam: [number, number, number, "stand" | "couch", boolean][] = [
    [-14, 22, 0.8, "stand", true],
    [-10, 25, 0.95, "stand", false],
    [-17, 17, 1.4, "couch", false],
  ];
  for (const [dx, dz, r, pose, load] of cam) place(k, camelMesh(pose, load), [c[0] + dx, groundAt(c[0] + dx, c[2] + dz), c[2] + dz], r);
  const ppl: [number, number, number][] = [[-11.5, 21, 2.4], [-8, 16, -0.4], [4, 17, 2.0], [5, 18.2, -2.6], [-2, 9, 1.2]];
  for (const [dx, dz, r] of ppl) place(k, personMesh("robe", dx === 4 ? "gesture" : "down"), [c[0] + dx, groundAt(c[0] + dx, c[2] + dz), c[2] + dz], r);
  // Surveyor's theodolite on its tripod.
  const sx = c[0] - 4, sz = c[2] + 24, sy = groundAt(sx, sz);
  for (let l = 0; l < 3; l++) {
    const a = (l / 3) * Math.PI * 2;
    k.rod([sx + Math.cos(a) * 0.5, sy, sz + Math.sin(a) * 0.5], [sx, sy + 1.4, sz], 0.03);
  }
  boxAt(k.s, [sx, sy + 1.55, sz], [0.18, 0.22, 0.14], MAT.dark);
  place(k, personMesh("robe", "gesture"), [sx - 0.7, sy, sz + 0.2], 0.2);
  return finish(k, c, 90, [terrainFor(0), shrubs(c, 26, 85, 320, 11, (x, z) => Math.hypot(x - c[0], z - c[2] - 18) < 14)]);
}

/** II · Burgan No. 1, 1938. */
function chapterII(): DrawItem[] {
  const c = CENTERS[1];
  const k = new Kit();
  const pipes: number[] = [];
  const y = groundAt(c[0], c[2]);
  derrick1930s(k, [c[0], y, c[2]], { height: ft(122), base: ft(24), top: ft(5.5), panels: 13, floor: 2.4, rot: -0.25, rigged: true });
  // The same combination rig, moved from Bahra.
  combinationRigGear(k, [c[0], y, c[2]], -0.25, 2.4, ft(24) / 2 + 1.3);
  // Drilling water was seawater piped from the coast: a water tank and its line.
  const wx = c[0] - 30, wz = c[2] + 6;
  storageTank(k, [wx, groundAt(wx, wz), wz], 5.2, 4.4, 0.9, MAT.steelLight);
  k.rod([wx - 2.6, groundAt(wx - 3, wz) + 0.3, wz], [wx - 120, groundAt(wx - 120, wz - 10) + 0.3, wz - 10], 0.1);
  // Stock tanks.
  const t1: V3 = [c[0] + 18, 0, c[2] - 14];
  storageTank(k, [t1[0], groundAt(t1[0], t1[2]), t1[2]], 9.5, 5.2, 0.4);
  const t2: V3 = [c[0] + 29, 0, c[2] - 6];
  storageTank(k, [t2[0], groundAt(t2[0], t2[2]), t2[2]], 6.6, 4.9, 1.2);
  // Flow line from the well to the tanks.
  k.rod([c[0] + 3, y + 0.4, c[2] - 2], [t1[0] - 4.8, groundAt(t1[0] - 5, t1[2]) + 0.4, t1[2] + 1], 0.11);
  // Pipe rack by the V-door.
  const px = c[0] + 12, pz = c[2] + 8;
  pipeRack(k, [px, groundAt(px, pz), pz], -0.25, 9, 3, pipes);
  const tx = c[0] + 22, tz = c[2] + 14;
  truck1930s(k, [tx, groundAt(tx, tz), tz], 2.6, "pipe");
  for (let t = 0; t < 2; t++) {
    const x = c[0] - 26 + t * 7, z = c[2] + 16 + t;
    ridgeTent(k, [x, groundAt(x, z), z], -0.1);
  }
  const cam: [number, number, number, "stand" | "couch", boolean][] = [
    [-22, 26, 0.25, "stand", true],
    [-13, 30, 1.9, "couch", false],
  ];
  for (const [dx, dz, r, pose, load] of cam) place(k, camelMesh(pose, load), [c[0] + dx, groundAt(c[0] + dx, c[2] + dz), c[2] + dz], r);
  const ppl: [number, number, number, "robe" | "worker"][] = [
    [6, 5, 2.2, "robe"], [7.2, 4, -1.8, "robe"], [-4, 7.5, 0.4, "robe"], [15, 14, 3.0, "robe"], [-19, 24, 0.5, "robe"],
  ];
  for (const [dx, dz, r, kind] of ppl) place(k, personMesh(kind), [c[0] + dx, groundAt(c[0] + dx, c[2] + dz), c[2] + dz], r);
  return finish(k, c, 90, [
    terrainFor(1),
    { mesh: DRILL_PIPE, instances: new Float32Array(pipes), center: c, radius: 60, castShadow: true },
    shrubs(c, 34, 95, 360, 23, (x, z) => Math.hypot(x - c[0] + 18, z - c[2] - 26) < 10),
  ]);
}

/**
 * III · 30 June 1946 — the first cargo. Four tanks on a hilltop above the
 * coast gravity-fed submarine lines to an offshore berth (The Oil Weekly,
 * 20 May 1946); there was no pier yet. The tanker lies offshore.
 */
function chapterIII(): DrawItem[] {
  const c = CENTERS[2];
  const k = new Kit();
  // Four tanks of 139,200 bbl each: ~44 m across, ~14.6 m (48 ft) high.
  const tanks: V3[] = [[-75, 0, -76], [-25, 0, -80], [25, 0, -80], [75, 0, -76]];
  for (const t of tanks) storageTank(k, [c[0] + t[0], groundAt(c[0] + t[0], c[2] + t[2]), c[2] + t[2]], 44, 14.6, 0.3);
  // Manifold at the crest, where the ceremony stands.
  const mx = c[0] + 2, mz = c[2] - 44, my = groundAt(mx, mz);
  boxAt(k.s, [mx, my + 0.35, mz], [6, 0.7, 2.6], MAT.steel);
  for (const dx of [-1.6, 0, 1.6]) k.rod([mx + dx, my + 0.7, mz], [mx + dx, my + 1.3, mz], 0.24);
  // Header from each tank to the manifold.
  for (const t of tanks) {
    const tx = c[0] + t[0], tz = c[2] + t[2] + 22;
    k.rod([tx, groundAt(tx, tz) + 0.5, tz], [mx, my + 0.5, mz - 1], 0.3);
  }
  // The silver wheel on the loading valve.
  const vy = my + 1.95;
  cylinder(k.s, 0.18, 1.3, 48, m4.translation(mx, my + 0.7, mz + 1.4), MAT.steel);
  lathe(k.s, [[0.45, -0.03], [0.5, 0], [0.45, 0.03]], 128, m4.compose(m4.translation(mx, vy, mz + 1.4), m4.rotX(Math.PI / 2)), MAT.white);
  for (let s2 = 0; s2 < 6; s2++) {
    const a = (s2 / 6) * Math.PI * 2;
    k.rod([mx, vy, mz + 1.4], [mx + Math.cos(a) * 0.47, vy + Math.sin(a) * 0.47, mz + 1.4], 0.04);
  }
  // Two submarine lines: down the slope, across the beach, under the sea.
  for (let l = 0; l < 2; l++) {
    const x = mx - 0.6 + l * 1.2;
    let prev: V3 | null = null;
    for (let s2 = 0; s2 <= 40; s2++) {
      const z = mz + 1 + (s2 / 40) * 110;
      const p: V3 = [x, heightAt(x, z) + 0.35, z];
      if (prev) k.rod(prev, p, 0.36);
      prev = p;
    }
  }
  // Offshore berth: mooring buoys and the hose buoy, the tanker between them.
  // Hull centre ~130 m offshore, broadside to the chapter's camera.
  const berthZ = c[2] + 150;
  const bow: V3 = [0.66, 0, 0.75];
  const hullC: V3 = [c[0] - 30, 0, berthZ];
  // Buoys fore and aft of the hull, and the hose buoy on the shore side.
  for (const [along, off] of [[-86, -14], [-86, 14], [86, -14], [86, 14], [-10, -24]] as const) {
    const x = hullC[0] + bow[0] * along + bow[2] * off, z = hullC[2] + bow[2] * along - bow[0] * off;
    lathe(k.s, [[0, -0.6], [1.1, -0.4], [1.3, 0.4], [1.0, 0.9], [0, 1.0]], 48, m4.translation(x, 0, z), along === -10 ? MAT.kocLight : MAT.white);
  }
  tanker(k, [hullC[0] - 70 * bow[0], 0, hullC[2] - 70 * bow[2]], -Math.atan2(bow[2], bow[0]), 140, 18.3, 10.4, 7.6);
  // The party on the crest.
  const ppl: [number, number, number, "down" | "gesture"][] = [
    [-0.8, -41.8, 1.3, "gesture"], [0.6, -40.6, 0.7, "down"], [-2.2, -40.2, 1.1, "down"], [-3.4, -42, 1.2, "down"],
    [3.6, -40.5, 2.2, "down"], [4.6, -41.8, 2.4, "down"], [-4.8, -39.5, 0.9, "down"], [2.2, -39.2, 1.8, "down"],
  ];
  for (const [dx, dz, r, a] of ppl) place(k, personMesh("robe", a), [c[0] + dx, groundAt(c[0] + dx, c[2] + dz), c[2] + dz], r);
  const tx = c[0] - 16, tz = c[2] - 50;
  truck1930s(k, [tx, groundAt(tx, tz), tz], 1.2, "none");
  // Ahmadi, begun that year: the first bungalows going up behind the tanks.
  for (let h = 0; h < 7; h++) {
    const hx = c[0] - 90 + h * 26, hz = c[2] - 118 - (h % 2) * 6;
    const hy = groundAt(hx, hz);
    boxAt(k.s, [hx, hy + 1.6, hz], [10, 3.2, 8], MAT.white, 0.05);
    extrude(k.s, [[-5.4, 0], [5.4, 0], [0, 2.2]], 8.8, m4.compose(m4.translation(hx, hy + 3.2, hz - 4.4), m4.rotY(0.05)), MAT.paint);
  }
  const water: MeshData = (() => {
    const b = new MeshBuilder();
    const n = 2;
    const x0 = c[0] - 560, x1 = c[0] + 560, z0 = c[2] + 8, z1 = c[2] + 1000;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) b.vert([x0 + ((x1 - x0) * i) / n, 0, z0 + ((z1 - z0) * j) / n], [0, 1, 0], [0.5, 0]);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i;
        b.tri(a, a + n + 1, a + n + 2);
        b.tri(a, a + n + 2, a + 1);
      }
    return b.build();
  })();
  return finish(k, [c[0], 0, c[2] + 60], 230, [
    terrainFor(2),
    { mesh: water, kind: 2, center: [c[0], 0, c[2] + 260], radius: 560, castShadow: false },
    shrubs([c[0], 0, c[2] - 30], 20, 140, 170, 31, (x, z) => Math.abs(x - c[0] - 2) < 5 || z > c[2] + 12 || (z < c[2] - 50 && z > c[2] - 104)),
  ]);
}

/** IV · a rig pad today. The eight teams live here as hotspots. */
function chapterIV(): DrawItem[] {
  const c = CENTERS[3];
  const k = new Kit();
  const pipes: number[] = [];
  const y = PAD_Y;
  const rigRot = 0;
  const rig = modernRig(k, [c[0], y, c[2]], rigRot, pipes);
  // Mud system behind the rig (−x), power beyond it.
  for (let t = 0; t < 3; t++) mudTank(k, [c[0] - 14, y, c[2] - 12 + t * 3.4 - 3.4], 0);
  shaleShaker(k, [c[0] - 6, y, c[2] - 8.5], 0);
  shaleShaker(k, [c[0] - 6, y, c[2] - 11.5], 0);
  mudPump(k, [c[0] - 26, y, c[2] + 2], 0);
  mudPump(k, [c[0] - 26, y, c[2] + 6], 0);
  for (let g = 0; g < 3; g++) container(k, [c[0] - 38, y, c[2] - 10 + g * 3.4], 12.2, 2.44, 2.9, 0, MAT.white);
  horizontalTank(k, [c[0] - 38, y, c[2] + 8], 3.0, 12, 0, MAT.paint);
  horizontalTank(k, [c[0] - 38, y, c[2] + 13], 3.0, 12, 0, MAT.white);
  // Pipe racks and catwalk side.
  pipeRack(k, [c[0] + 22, y, c[2] - 6], 0, 16, 4, pipes);
  pipeRack(k, [c[0] + 22, y, c[2] + 6], 0, 16, 3, pipes);
  // Camp: accommodation caravans in a row.
  for (let v = 0; v < 6; v++) container(k, [c[0] + 44 - v * 13.5, y, c[2] - 50], 12, 3.2, 3.0, 0, MAT.white);
  // Company office caravan (EN01's hotspot).
  container(k, [c[0] + 46, y, c[2] - 34], 12, 3.2, 3.0, Math.PI / 2, MAT.kocLight);
  // Water tank and supply truck (operational support).
  storageTank(k, [c[0] - 46, y, c[2] + 34], 7, 5.5, 0, MAT.white);
  pickup(k, [c[0] + 36, y, c[2] + 26], 2.4);
  pickup(k, [c[0] + 44, y, c[2] + 22], 2.2);
  // Coiled tubing unit (well intervention), parked by the pad edge.
  coiledTubingUnit(k, [c[0] + 18, y, c[2] + 36], 0.1);
  // Flare pit berm, downwind.
  boxAt(k.s, [c[0] - 58, y + 0.9, c[2] - 42], [14, 1.8, 1.2], MAT.mud, 0.3);
  // Muster point sign (HSE).
  k.rod([c[0] - 13, y, c[2] + 47], [c[0] - 13, y + 2.4, c[2] + 47], 0.1);
  boxAt(k.s, [c[0] - 13, y + 2.6, c[2] + 47], [1.4, 0.9, 0.08], MAT.kocLight, -0.6);
  // Workers.
  const ppl: [number, number, number][] = [[6, 3, 1.2], [9, -2, 2.8], [-6, -5, 0.4], [20, 1, 1.6], [16, 34, 2.2], [40, 20, 3.1], [-20, -9, 0.6]];
  for (const [dx, dz, r] of ppl) {
    const yy = dx > -8 && dx < 8 && dz > -5 && dz < 5 ? y + rig.floorY + 0.18 : y;
    place(k, personMesh("worker"), [c[0] + dx, yy, c[2] + dz], r);
  }
  const ws = windsock([c[0] - 16, y, c[2] + 44]);

  // Animated parts travel as descriptors (see anims.ts): the build may run in a worker.
  const block: Anim = { kind: "block", a: [...rig.blockBase, rig.mastTop] };
  const sock: Anim = { kind: "sock", a: ws.top };

  return finish(k, c, 110, [
    terrainFor(3),
    { mesh: DRILL_PIPE, instances: new Float32Array(pipes), center: c, radius: 60, castShadow: true },
    { mesh: rig.block, center: c, radius: 60, castShadow: true, anim: block },
    { mesh: rig.lines, center: c, radius: 60, castShadow: true, anim: { ...block, kind: "lines" } },
    { mesh: ws.pole, center: c, radius: 60, castShadow: true },
    { mesh: ws.sock, center: c, radius: 60, castShadow: true, anim: sock },
    shrubs(c, 118, 160, 120, 47, () => false),
  ]);
}

/** Built in reading order: v2 opens the story at chapter I. */
export const BUILD_ORDER = [0, 1, 2, 3];
export const BUILDERS = [chapterI, chapterII, chapterIII, chapterIV];
