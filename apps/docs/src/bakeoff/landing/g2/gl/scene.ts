/**
 * The scene container every model function writes into, and the packed formats
 * the renderer consumes. Kept apart from the model so the model reads as a
 * drawing brief ("a 60-inch sheave here") rather than as buffer bookkeeping.
 */

import { box, cylinder, extractEdges, type EdgeData, type MeshData } from "./geometry";
import { m4, member, type Mat4, type Vec3 } from "./math";

/** Which DWEG team a piece of equipment belongs to — see PART_TEAMS in rig.ts. */
export const PART = {
  site: 0,
  office: 1,
  rig: 2,
  logistics: 3,
  wellControl: 4,
  well: 5,
  materials: 6,
  producer: 7,
  /** Annotation: dimension lines. Never highlighted. */
  note: 9,
} as const;
export type PartId = (typeof PART)[keyof typeof PART];

/** `fine`: members thinner than a line at this scale (racked pipe) draw at a lighter weight, as a drafter hatches them. */
export const MAT = { solid: 0, ground: 1, hatch: 2, dark: 3, fine: 4 } as const;
export const ROLE = { ink: 0, primary: 1, faint: 2 } as const;

export interface Template {
  name: string;
  mesh: MeshData;
  edges: EdgeData;
  bmin: Vec3;
  bmax: Vec3;
}

/**
 * Instance record, eight vec4s: mat4 (16) | part, material, moving, 0 |
 * the normal matrix's three columns (inverse-transpose, up to scale), padded.
 * The normal matrix is precomputed here so no vertex shader inverts a matrix.
 */
export const INST_STRIDE = 32;

/** Pack one instance record into `out` at record `k`. */
export function writeInstance(out: Float32Array | number[], k: number, m: Mat4, part: number, mat: number, moving: number) {
  const o = k * INST_STRIDE;
  for (let i = 0; i < 16; i++) out[o + i] = m[i];
  out[o + 16] = part;
  out[o + 17] = mat;
  out[o + 18] = moving;
  out[o + 19] = 0;
  const r = m4.normalMatrix(m); // rows of the cofactor matrix
  for (let c = 0; c < 3; c++) {
    out[o + 20 + c * 4] = r[c];
    out[o + 21 + c * 4] = r[3 + c];
    out[o + 22 + c * 4] = r[6 + c];
    out[o + 23 + c * 4] = 0;
  }
}
/**
 * Free line segment: a.xyz role | b.xyz alpha | width dash flow dist0 |
 * part moveMask lift 0 — four vec4s. `moveMask` bit 1 moves `a` with the
 * travelling block, bit 2 moves `b`. `lift` pulls the line toward the camera by
 * that many feet, so a flow dash drawn on a pipe's centreline sits on its skin.
 */
export const SEG_STRIDE = 16;

export interface Batch {
  template: Template;
  data: Float32Array;
  count: number;
}

export interface LineStyle {
  role?: number;
  alpha?: number;
  width?: number;
  dash?: number;
  flow?: number;
  part?: number;
  move?: number;
  lift?: number;
}

export class Scene {
  templates = new Map<string, Template>();
  private inst = new Map<string, number[]>();
  segs: number[] = [];
  anchors: Record<string, Vec3> = {};
  partMin = new Map<number, Vec3>();
  partMax = new Map<number, Vec3>();

  constructor() {
    this.define("box", box, 20);
    for (const n of [12, 16, 24, 32, 48, 64, 96, 128, 256]) this.define(`cyl${n}`, () => cylinder(n), 30);
  }

  define(name: string, make: () => MeshData, crease = 28): string {
    if (this.templates.has(name)) return name;
    const mesh = make();
    const bmin: Vec3 = [Infinity, Infinity, Infinity];
    const bmax: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < mesh.positions.length; k += 3)
      for (let a = 0; a < 3; a++) {
        bmin[a] = Math.min(bmin[a], mesh.positions[k + a]);
        bmax[a] = Math.max(bmax[a], mesh.positions[k + a]);
      }
    this.templates.set(name, { name, mesh, edges: extractEdges(mesh, crease), bmin, bmax });
    return name;
  }

  /** A one-off mesh already in world coordinates. */
  mesh(name: string, make: () => MeshData, part: number, mat = 0, moving = 0, crease = 28) {
    this.define(name, make, crease);
    this.put(name, m4.identity(), part, mat, moving);
  }

  put(name: string, m: Mat4, part: number, mat = 0, moving = 0) {
    const t = this.templates.get(name);
    if (!t) throw new Error(`no template ${name}`);
    let list = this.inst.get(name);
    if (!list) this.inst.set(name, (list = []));
    writeInstance(list, list.length / INST_STRIDE, m, part, mat, moving);
    if (!moving) {
      // part bounds from the template's box corners, for thumbnail framing
      for (let c = 0; c < 8; c++) {
        const p = m4.point(m, [
          c & 1 ? t.bmax[0] : t.bmin[0],
          c & 2 ? t.bmax[1] : t.bmin[1],
          c & 4 ? t.bmax[2] : t.bmin[2],
        ]);
        this.grow(part, p);
      }
    }
  }

  grow(part: number, p: Vec3) {
    const lo = this.partMin.get(part) ?? [Infinity, Infinity, Infinity];
    const hi = this.partMax.get(part) ?? [-Infinity, -Infinity, -Infinity];
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], p[a]);
      hi[a] = Math.max(hi[a], p[a]);
    }
    this.partMin.set(part, lo);
    this.partMax.set(part, hi);
  }

  /** Axis-aligned box between two corners. */
  box(lo: Vec3, hi: Vec3, part: number, mat = 0, moving = 0) {
    this.put(
      "box",
      m4.compose(
        m4.translate((lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2),
        m4.scale(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]),
      ),
      part,
      mat,
      moving,
    );
  }

  /** Structural member p0→p1 with a w×d section. */
  beam(p0: Vec3, p1: Vec3, w: number, d: number, part: number, roll?: Vec3, moving = 0) {
    this.put("box", member(p0, p1, w, d, roll), part, 0, moving);
  }

  /** Round bar / pipe body p0→p1, radius r. */
  rod(p0: Vec3, p1: Vec3, r: number, part: number, segments = 32, moving = 0) {
    this.put(`cyl${segments}`, member(p0, p1, 2 * r, 2 * r), part, 0, moving);
  }

  seg(a: Vec3, b: Vec3, s: LineStyle = {}, dist0 = 0) {
    this.segs.push(
      a[0], a[1], a[2], s.role ?? ROLE.ink,
      b[0], b[1], b[2], s.alpha ?? 0.8,
      s.width ?? 1, s.dash ?? 0, s.flow ?? 0, dist0,
      s.part ?? PART.site, s.move ?? 0, s.lift ?? 0, 0,
    );
  }

  /** Polyline; dash phase runs continuously along it. */
  poly(pts: Vec3[], s: LineStyle = {}) {
    let d = 0;
    for (let k = 0; k < pts.length - 1; k++) {
      this.seg(pts[k], pts[k + 1], s, d);
      d += Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1], pts[k + 1][2] - pts[k][2]);
    }
  }

  batches(): Batch[] {
    const out: Batch[] = [];
    for (const [name, list] of this.inst) {
      out.push({ template: this.templates.get(name)!, data: new Float32Array(list), count: list.length / INST_STRIDE });
    }
    return out;
  }
}

/** Write one free segment into a Float32Array at record `k` (for per-frame lines). */
export function writeSeg(out: Float32Array, k: number, a: Vec3, b: Vec3, s: LineStyle, dist0 = 0) {
  const o = k * SEG_STRIDE;
  out[o] = a[0]; out[o + 1] = a[1]; out[o + 2] = a[2]; out[o + 3] = s.role ?? ROLE.ink;
  out[o + 4] = b[0]; out[o + 5] = b[1]; out[o + 6] = b[2]; out[o + 7] = s.alpha ?? 0.8;
  out[o + 8] = s.width ?? 1; out[o + 9] = s.dash ?? 0; out[o + 10] = s.flow ?? 0; out[o + 11] = dist0;
  out[o + 12] = s.part ?? PART.site; out[o + 13] = s.move ?? 0; out[o + 14] = s.lift ?? 0; out[o + 15] = 0;
}
