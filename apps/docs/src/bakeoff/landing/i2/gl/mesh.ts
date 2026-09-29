/**
 * Mesh construction. Every surface on the plate is a parametric grid — a lathe,
 * a helical thread, a swept blade — so one builder covers all of them, and
 * normals come from the surface itself (central differences across the grid)
 * rather than from averaged facets. That is what keeps a 256-segment lathe
 * reading as turned steel instead of as a faceted polygon.
 *
 * Per vertex:
 *   pos  xyz
 *   nrm  xyz
 *   pnl  uv  — "panel" coordinates in inches, for the blueprint grid the shader
 *              draws over every clay surface (INFRA's signature)
 *   mat  id, ao — material slot, and a baked cavity term
 */

import { cross, norm, rotateVec, sub, type V3 } from "./math";

export interface MeshData {
  pos: Float32Array;
  nrm: Float32Array;
  pnl: Float32Array;
  mat: Float32Array;
  idx: Uint32Array;
}

export const MAT = { clay: 0, primary: 1, face: 2, ink: 3 } as const;

interface GridOpts {
  /** Columns (first parameter) and rows (second), counted as vertices. */
  nu: number;
  nv: number;
  /** First parameter closes on itself (a full revolution). */
  wrapU?: boolean;
  point: (i: number, j: number) => V3;
  panel?: (i: number, j: number, p: V3) => [number, number];
  material?: (i: number, j: number) => number;
  ao?: (i: number, j: number) => number;
  /** Swap the normal's orientation. */
  flip?: boolean;
}

export function grid(o: GridOpts): MeshData {
  const { nu, nv, wrapU = false, flip = false } = o;
  const n = nu * nv;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const pnl = new Float32Array(n * 2);
  const mat = new Float32Array(n * 2);
  const P: V3[] = new Array(n);

  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const k = j * nu + i;
      const p = o.point(i, j);
      P[k] = p;
      pos.set(p, k * 3);
      const pl = o.panel ? o.panel(i, j, p) : [0, 0];
      pnl[k * 2] = pl[0];
      pnl[k * 2 + 1] = pl[1];
      mat[k * 2] = o.material ? o.material(i, j) : 0;
      mat[k * 2 + 1] = o.ao ? o.ao(i, j) : 1;
    }

  const at = (i: number, j: number) => P[j * nu + i];
  const degenerate: number[] = [];
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      // Central differences. With `wrapU` the seam columns are the same point,
      // so step over the duplicate to keep the seam invisible.
      let ia: number, ib: number;
      if (wrapU) {
        ia = i === 0 ? nu - 2 : i - 1;
        ib = i === nu - 1 ? 1 : i + 1;
      } else {
        ia = Math.max(0, i - 1);
        ib = Math.min(nu - 1, i + 1);
      }
      const ja = Math.max(0, j - 1);
      const jb = Math.min(nv - 1, j + 1);
      const du = sub(at(ib, j), at(ia, j));
      const dv = sub(at(i, jb), at(i, ja));
      let c = flip ? cross(du, dv) : cross(dv, du);
      const l = Math.hypot(c[0], c[1], c[2]);
      const k = j * nu + i;
      if (l < 1e-9) {
        degenerate.push(k);
        c = [0, 1, 0];
      } else c = [c[0] / l, c[1] / l, c[2] / l];
      nrm.set(c, k * 3);
    }

  // A pole (every column meeting at one point) has no cross product. Its true
  // normal is the mean of the ring beside it.
  for (const k of degenerate) {
    const j = Math.floor(k / nu);
    const jr = j === 0 ? 1 : j - 1;
    let s: V3 = [0, 0, 0];
    for (let i = 0; i < nu; i++) {
      const q = (jr * nu + i) * 3;
      s = [s[0] + nrm[q], s[1] + nrm[q + 1], s[2] + nrm[q + 2]];
    }
    nrm.set(norm(s), k * 3);
  }

  const idx = new Uint32Array((nu - 1) * (nv - 1) * 6);
  let t = 0;
  for (let j = 0; j < nv - 1; j++)
    for (let i = 0; i < nu - 1; i++) {
      const a = j * nu + i;
      const b = a + 1;
      const c = a + nu;
      const d = c + 1;
      idx[t++] = a; idx[t++] = c; idx[t++] = b;
      idx[t++] = b; idx[t++] = c; idx[t++] = d;
    }
  return { pos, nrm, pnl, mat, idx };
}

export interface ProfilePoint {
  r: number;
  y: number;
  /** Material slot for this ring. */
  m?: number;
  ao?: number;
}

/**
 * Surface of revolution about +y. Walk the profile with the solid on your
 * left (up the outside, down the inside) and the normals face out.
 * Repeat a point to get a crisp crease; the duplicate makes each side of the
 * corner take its own tangent.
 */
export function lathe(profile: ProfilePoint[], segments: number, opts: { flip?: boolean } = {}): MeshData {
  // Arc length along the profile, for the panel grid's second coordinate.
  const s: number[] = [0];
  for (let j = 1; j < profile.length; j++)
    s[j] = s[j - 1] + Math.hypot(profile[j].r - profile[j - 1].r, profile[j].y - profile[j - 1].y);
  return grid({
    nu: segments + 1,
    nv: profile.length,
    wrapU: true,
    flip: opts.flip,
    point: (i, j) => {
      const a = (i / segments) * Math.PI * 2;
      const { r, y } = profile[j];
      return [r * Math.cos(a), y, r * Math.sin(a)];
    },
    panel: (i, j) => [(i / segments) * Math.PI * 2 * Math.max(profile[j].r, 0.5), s[j]],
    material: (_, j) => profile[j].m ?? 0,
    ao: (_, j) => profile[j].ao ?? 1,
  });
}

/** Round every corner of a polyline profile with a short arc of `samples` points. */
export function filleted(pts: ProfilePoint[], radius: number, samples = 4): ProfilePoint[] {
  const out: ProfilePoint[] = [pts[0]];
  for (let k = 1; k < pts.length - 1; k++) {
    const p = pts[k];
    const a = pts[k - 1];
    const b = pts[k + 1];
    const la = Math.hypot(p.r - a.r, p.y - a.y);
    const lb = Math.hypot(b.r - p.r, b.y - p.y);
    const d = Math.min(radius, la / 2.2, lb / 2.2);
    if (d < 1e-4) {
      out.push(p);
      continue;
    }
    const p0 = { r: p.r + ((a.r - p.r) / la) * d, y: p.y + ((a.y - p.y) / la) * d };
    const p1 = { r: p.r + ((b.r - p.r) / lb) * d, y: p.y + ((b.y - p.y) / lb) * d };
    for (let q = 0; q <= samples; q++) {
      const t = q / samples;
      // Quadratic Bézier through the corner — close enough to a circular arc
      // at these radii, and tangent-continuous on both sides.
      const u = 1 - t;
      out.push({
        r: u * u * p0.r + 2 * u * t * p.r + t * t * p1.r,
        y: u * u * p0.y + 2 * u * t * p.y + t * t * p1.y,
        m: p.m,
        ao: p.ao,
      });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function merge(...meshes: MeshData[]): MeshData {
  let nv = 0;
  let ni = 0;
  for (const m of meshes) {
    nv += m.pos.length / 3;
    ni += m.idx.length;
  }
  const out: MeshData = {
    pos: new Float32Array(nv * 3),
    nrm: new Float32Array(nv * 3),
    pnl: new Float32Array(nv * 2),
    mat: new Float32Array(nv * 2),
    idx: new Uint32Array(ni),
  };
  let vo = 0;
  let io = 0;
  for (const m of meshes) {
    out.pos.set(m.pos, vo * 3);
    out.nrm.set(m.nrm, vo * 3);
    out.pnl.set(m.pnl, vo * 2);
    out.mat.set(m.mat, vo * 2);
    for (let k = 0; k < m.idx.length; k++) out.idx[io + k] = m.idx[k] + vo;
    vo += m.pos.length / 3;
    io += m.idx.length;
  }
  return out;
}

/** Rotate then translate a mesh in place (rigid — normals rotate with it). */
export function place(m: MeshData, rot: [V3, V3, V3], t: V3 = [0, 0, 0]): MeshData {
  for (let k = 0; k < m.pos.length; k += 3) {
    const p = rotateVec(rot, [m.pos[k], m.pos[k + 1], m.pos[k + 2]]);
    m.pos[k] = p[0] + t[0];
    m.pos[k + 1] = p[1] + t[1];
    m.pos[k + 2] = p[2] + t[2];
    const n = rotateVec(rot, [m.nrm[k], m.nrm[k + 1], m.nrm[k + 2]]);
    m.nrm[k] = n[0];
    m.nrm[k + 1] = n[1];
    m.nrm[k + 2] = n[2];
  }
  return m;
}

export const vertexCount = (m: MeshData) => m.pos.length / 3;
