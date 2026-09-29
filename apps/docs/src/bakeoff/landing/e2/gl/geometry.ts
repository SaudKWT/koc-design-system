/**
 * Mesh builders. Everything in the scene is made here, from code — no model
 * files (Saud's call, 2026-09-28): lathe profiles for anything turned on a
 * lathe (which is most of a drill string), swept sections for blades, and
 * boxes and cylinders for the rig.
 *
 * Downhole parts are built in a LOCAL frame: x = along-hole (downhole +),
 * y/z = the cross-section. The vertex shader maps that onto the well path and
 * applies the radial exaggeration, so the same mesh reads both as a line on a
 * 5,000 ft well plan and as a true-proportion tool at arm's length.
 */

import { type V3, add, cross, dot, norm, scale, sub } from "./math";

/** Material slot per vertex. The renderer binds four materials per draw. */
export type Mat = 0 | 1 | 2 | 3;

export class Geo {
  pos: number[] = [];
  nrm: number[] = [];
  mat: number[] = [];
  idx: number[] = [];

  get count() {
    return this.pos.length / 3;
  }

  vert(p: V3, n: V3, m: number) {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.mat.push(m);
    return this.count - 1;
  }

  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }

  append(g: Geo) {
    const base = this.count;
    this.pos.push(...g.pos);
    this.nrm.push(...g.nrm);
    this.mat.push(...g.mat);
    for (const i of g.idx) this.idx.push(i + base);
    return this;
  }

  /**
   * Surface of revolution about local x. `profile` is [axial, radius, mat?,
   * smooth?] — a point marked smooth shares its normal with both neighbours
   * (curves); every other point is a machined corner and gets a hard edge.
   */
  lathe(profile: [number, number, number?, number?][], segs: number, phase = 0) {
    const segNormal = (i: number) => {
      const [a0, r0] = profile[i];
      const [a1, r1] = profile[i + 1];
      const l = Math.hypot(a1 - a0, r1 - r0) || 1;
      return [-(r1 - r0) / l, (a1 - a0) / l] as [number, number];
    };
    const last = profile.length - 2;
    for (let i = 0; i <= last; i++) {
      const [a0, r0, m0 = 0] = profile[i];
      const [a1, r1] = profile[i + 1];
      if (Math.hypot(a1 - a0, r1 - r0) < 1e-7) continue;
      const n = segNormal(i);
      const avg = (j: number, k: number) => {
        const p = segNormal(j);
        const q = segNormal(k);
        const l = Math.hypot(p[0] + q[0], p[1] + q[1]) || 1;
        return [(p[0] + q[0]) / l, (p[1] + q[1]) / l] as [number, number];
      };
      const nStart = i > 0 && profile[i][3] ? avg(i - 1, i) : n;
      const nEnd = i < last && profile[i + 1][3] ? avg(i, i + 1) : n;
      const ring = (a: number, r: number, nn: [number, number]) => {
        const start = this.count;
        for (let k = 0; k < segs; k++) {
          const t = phase + (k / segs) * Math.PI * 2;
          const c = Math.cos(t);
          const s = Math.sin(t);
          this.vert([a, r * c, r * s], [nn[0], nn[1] * c, nn[1] * s], m0);
        }
        return start;
      };
      const s0 = ring(a0, r0, nStart);
      const s1 = ring(a1, r1, nEnd);
      for (let k = 0; k < segs; k++) {
        const k1 = (k + 1) % segs;
        this.tri(s0 + k, s1 + k, s1 + k1);
        this.tri(s0 + k, s1 + k1, s0 + k1);
      }
    }
    return this;
  }

  /**
   * Sweep a closed polygon through `sections` (each the same number of
   * points, in order). Every polygon edge becomes its own strip, smooth along
   * the sweep and hard across it — the look of a milled blade. Normals point
   * away from each section's centroid, so winding never matters.
   */
  sweep(sections: V3[][], m: number, caps = true) {
    const K = sections.length;
    const M = sections[0].length;
    const centroid = sections.map((sec) => scale(sec.reduce((acc, p) => add(acc, p), [0, 0, 0] as V3), 1 / M));
    for (let e = 0; e < M; e++) {
      const e1 = (e + 1) % M;
      // Face normal of quad j (between section j and j+1) on this edge.
      const faceN: V3[] = [];
      for (let j = 0; j < K - 1; j++) {
        const p00 = sections[j][e];
        const p01 = sections[j][e1];
        const p10 = sections[j + 1][e];
        let n = norm(cross(sub(p10, p00), sub(p01, p00)));
        const mid = scale(add(add(p00, p01), add(p10, sections[j + 1][e1])), 0.25);
        if (dot(n, sub(mid, scale(add(centroid[j], centroid[j + 1]), 0.5))) < 0) n = scale(n, -1);
        faceN.push(n);
      }
      const start = this.count;
      for (let j = 0; j < K; j++) {
        const n = norm(add(faceN[Math.max(0, j - 1)], faceN[Math.min(K - 2, j)]));
        this.vert(sections[j][e], n, m);
        this.vert(sections[j][e1], n, m);
      }
      for (let j = 0; j < K - 1; j++) {
        const a = start + j * 2;
        this.tri(a, a + 2, a + 3);
        this.tri(a, a + 3, a + 1);
      }
    }
    if (caps) {
      for (const j of [0, K - 1]) {
        const sec = sections[j];
        const other = centroid[j === 0 ? Math.min(1, K - 1) : Math.max(0, K - 2)];
        let n = norm(cross(sub(sec[1], sec[0]), sub(sec[2], sec[0])));
        if (dot(n, sub(centroid[j], other)) < 0) n = scale(n, -1);
        const c = this.vert(centroid[j], n, m);
        const s = this.count;
        for (const p of sec) this.vert(p, n, m);
        for (let e = 0; e < M; e++) this.tri(c, s + e, s + ((e + 1) % M));
      }
    }
    return this;
  }

  /** A capped cylinder from `base` along unit `axis`. */
  cylinder(base: V3, axis: V3, radius: number, length: number, segs: number, m: number, chamfer = 0) {
    const ax = norm(axis);
    const ref: V3 = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = norm(cross(ax, ref));
    const v = cross(ax, u);
    const at = (a: number, r: number, t: number): V3 =>
      add(add(base, scale(ax, a)), add(scale(u, r * Math.cos(t)), scale(v, r * Math.sin(t))));
    const side = this.count;
    for (let k = 0; k <= segs; k++) {
      const t = (k / segs) * Math.PI * 2;
      const n = add(scale(u, Math.cos(t)), scale(v, Math.sin(t)));
      this.vert(at(0, radius, t), n, m);
      this.vert(at(length - chamfer, radius, t), n, m);
    }
    for (let k = 0; k < segs; k++) {
      const a = side + k * 2;
      this.tri(a, a + 2, a + 3);
      this.tri(a, a + 3, a + 1);
    }
    if (chamfer > 0) {
      const s = this.count;
      for (let k = 0; k <= segs; k++) {
        const t = (k / segs) * Math.PI * 2;
        const n = norm(add(add(scale(u, Math.cos(t)), scale(v, Math.sin(t))), ax));
        this.vert(at(length - chamfer, radius, t), n, m);
        this.vert(at(length, radius - chamfer, t), n, m);
      }
      for (let k = 0; k < segs; k++) {
        const a = s + k * 2;
        this.tri(a, a + 2, a + 3);
        this.tri(a, a + 3, a + 1);
      }
    }
    for (const [a, r, sign] of [
      [0, radius, -1],
      [length, radius - chamfer, 1],
    ] as const) {
      const n = scale(ax, sign);
      const c = this.vert(at(a, 0, 0), n, m);
      const s = this.count;
      for (let k = 0; k < segs; k++) this.vert(at(a, r, (k / segs) * Math.PI * 2), n, m);
      for (let k = 0; k < segs; k++) this.tri(c, s + k, s + ((k + 1) % segs));
    }
    return this;
  }

  /** An axis-aligned or oriented box: centre plus three half-extent vectors. */
  box(c: V3, hx: V3, hy: V3, hz: V3, m: number) {
    const faces: [V3, V3, V3][] = [
      [hx, hy, hz],
      [scale(hx, -1), hz, hy],
      [hy, hz, hx],
      [scale(hy, -1), hx, hz],
      [hz, hx, hy],
      [scale(hz, -1), hy, hx],
    ];
    for (const [n, a, b] of faces) {
      const nn = norm(n);
      const fc = add(c, n);
      const s = this.count;
      this.vert(add(fc, add(scale(a, -1), scale(b, -1))), nn, m);
      this.vert(add(fc, add(a, scale(b, -1))), nn, m);
      this.vert(add(fc, add(a, b)), nn, m);
      this.vert(add(fc, add(scale(a, -1), b)), nn, m);
      this.tri(s, s + 1, s + 2);
      this.tri(s, s + 2, s + 3);
    }
    return this;
  }
}

/** Unit box (±1) and unit cylinder (radius 1, y from 0 to 1) for instancing on the rig. */
export const unitBox = () => new Geo().box([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], 0);
export const unitCylinder = (segs = 24) => new Geo().cylinder([0, 0, 0], [0, 1, 0], 1, 1, segs, 0);
