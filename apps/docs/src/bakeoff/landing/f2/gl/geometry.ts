/**
 * Procedural geometry: every model in the diorama is built from these calls.
 * No GLB/OBJ, no images standing in for models.
 *
 * Vertex layout (interleaved, 8 floats): position xyz · normal xyz · material
 * (tone, accent). `tone` is albedo lightness 0–1 between two token colours;
 * `accent` mixes toward --primary. Colour itself never lives here — the
 * renderer reads it from KOC tokens at runtime, so geometry is theme-free.
 */

import { m4, v3, type M4, type V3 } from "./math";

export type Mat = [tone: number, accent: number];

export interface MeshData {
  vertices: Float32Array;
  indices: Uint32Array;
}

const I = m4.identity();

function xfPoint(m: M4, x: number, y: number, z: number): V3 {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

/** Normal transform for R·S matrices (no shear): R·S⁻¹ n = M·(n / s²). */
function xfNormal(m: M4, x: number, y: number, z: number): V3 {
  const s0 = m[0] * m[0] + m[1] * m[1] + m[2] * m[2];
  const s1 = m[4] * m[4] + m[5] * m[5] + m[6] * m[6];
  const s2 = m[8] * m[8] + m[9] * m[9] + m[10] * m[10];
  const a = x / s0, b = y / s1, c = z / s2;
  return v3.norm([
    m[0] * a + m[4] * b + m[8] * c,
    m[1] * a + m[5] * b + m[9] * c,
    m[2] * a + m[6] * b + m[10] * c,
  ]);
}

export class MeshBuilder {
  v: number[] = [];
  i: number[] = [];

  get count() {
    return this.v.length / 8;
  }

  vert(p: V3, n: V3, mat: Mat) {
    this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], mat[0], mat[1]);
    return this.count - 1;
  }

  tri(a: number, b: number, c: number) {
    this.i.push(a, b, c);
  }

  /** Append another mesh under a transform. */
  append(d: MeshData, m: M4 = I, mat?: Mat) {
    const base = this.count;
    const vv = d.vertices;
    for (let k = 0; k < vv.length; k += 8) {
      const p = xfPoint(m, vv[k], vv[k + 1], vv[k + 2]);
      const n = xfNormal(m, vv[k + 3], vv[k + 4], vv[k + 5]);
      this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], mat ? mat[0] : vv[k + 6], mat ? mat[1] : vv[k + 7]);
    }
    for (let k = 0; k < d.indices.length; k++) this.i.push(d.indices[k] + base);
  }

  build(): MeshData {
    return { vertices: new Float32Array(this.v), indices: new Uint32Array(this.i) };
  }
}

// ── Primitives ──────────────────────────────────────────────────────────────

/** Axis-aligned box, centred on x/z, spanning y 0→1 when `base` (for segments), else centred. */
export function box(b: MeshBuilder, m: M4, mat: Mat, base = false) {
  const y0 = base ? 0 : -0.5, y1 = base ? 1 : 0.5;
  const faces: [V3, V3[]][] = [
    [[1, 0, 0], [[0.5, y0, -0.5], [0.5, y1, -0.5], [0.5, y1, 0.5], [0.5, y0, 0.5]]],
    [[-1, 0, 0], [[-0.5, y0, 0.5], [-0.5, y1, 0.5], [-0.5, y1, -0.5], [-0.5, y0, -0.5]]],
    [[0, 1, 0], [[-0.5, y1, -0.5], [-0.5, y1, 0.5], [0.5, y1, 0.5], [0.5, y1, -0.5]]],
    [[0, -1, 0], [[-0.5, y0, 0.5], [-0.5, y0, -0.5], [0.5, y0, -0.5], [0.5, y0, 0.5]]],
    [[0, 0, 1], [[0.5, y0, 0.5], [0.5, y1, 0.5], [-0.5, y1, 0.5], [-0.5, y0, 0.5]]],
    [[0, 0, -1], [[-0.5, y0, -0.5], [-0.5, y1, -0.5], [0.5, y1, -0.5], [0.5, y0, -0.5]]],
  ];
  for (const [n, q] of faces) {
    const nn = xfNormal(m, n[0], n[1], n[2]);
    const idx = q.map((p) => b.vert(xfPoint(m, p[0], p[1], p[2]), nn, mat));
    b.tri(idx[0], idx[1], idx[2]);
    b.tri(idx[0], idx[2], idx[3]);
  }
}

/** Convenience: a box from its centre and full size, optionally rotated about Y. */
export function boxAt(b: MeshBuilder, c: V3, size: V3, mat: Mat, rotY = 0, parent: M4 = I) {
  box(b, m4.compose(parent, m4.translation(c[0], c[1], c[2]), m4.rotY(rotY), m4.scaling(size[0], size[1], size[2])), mat);
}

/**
 * Surface of revolution about +Y. `profile` is [radius, y] from bottom to top.
 * Repeat a point to make a crease (hard edge); otherwise normals are smooth.
 */
export function lathe(b: MeshBuilder, profile: [number, number][], segs: number, m: M4, mat: Mat, arc = Math.PI * 2) {
  const n = profile.length;
  const pn: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const p = profile[k];
    const prev = profile[k - 1];
    const next = profile[k + 1];
    const same = (a?: [number, number]) => !!a && a[0] === p[0] && a[1] === p[1];
    // A repeated point is a crease: each copy takes the tangent of its own side only.
    const t0: [number, number] = next && !same(next) ? [next[0] - p[0], next[1] - p[1]] : [0, 0];
    const t1: [number, number] = prev && !same(prev) ? [p[0] - prev[0], p[1] - prev[1]] : [0, 0];
    const l0 = Math.hypot(t0[0], t0[1]) || 1, l1 = Math.hypot(t1[0], t1[1]) || 1;
    const tx = t0[0] / l0 + t1[0] / l1, ty = t0[1] / l0 + t1[1] / l1;
    const l = Math.hypot(tx, ty) || 1;
    pn.push([ty / l, -tx / l]);
  }
  const full = Math.abs(arc - Math.PI * 2) < 1e-6;
  const cols = full ? segs : segs + 1;
  const base = b.count;
  for (let s = 0; s < cols; s++) {
    const a = (s / segs) * arc;
    const c = Math.cos(a), sn = Math.sin(a);
    for (let k = 0; k < n; k++) {
      const [r, y] = profile[k];
      const [nr, ny] = pn[k];
      b.vert(xfPoint(m, r * c, y, r * sn), xfNormal(m, nr * c, ny, nr * sn), mat);
    }
  }
  for (let s = 0; s < segs; s++) {
    const s1 = full ? (s + 1) % segs : s + 1;
    for (let k = 0; k < n - 1; k++) {
      if (profile[k][0] === profile[k + 1][0] && profile[k][1] === profile[k + 1][1]) continue;
      const a = base + s * n + k, bb = base + s1 * n + k;
      b.tri(a, a + 1, bb + 1);
      b.tri(a, bb + 1, bb);
    }
  }
}

/** Closed cylinder along +Y from 0 to h. */
export function cylinder(b: MeshBuilder, r: number, h: number, segs: number, m: M4, mat: Mat, caps = true) {
  const p: [number, number][] = caps
    ? [[0, 0], [r, 0], [r, 0], [r, h], [r, h], [0, h]]
    : [[r, 0], [r, h]];
  lathe(b, p, segs, m, mat);
}

/** Ellipsoid centred at the origin, radii rx, ry, rz. */
export function ellipsoid(b: MeshBuilder, rx: number, ry: number, rz: number, segs: number, m: M4, mat: Mat) {
  const rings = Math.max(8, segs >> 1);
  const prof: [number, number][] = [];
  for (let k = 0; k <= rings; k++) {
    const t = -Math.PI / 2 + (k / rings) * Math.PI;
    prof.push([Math.cos(t), Math.sin(t)]);
  }
  lathe(b, prof, segs, m4.mul(m, m4.scaling(rx, ry, rz)), mat);
}

/**
 * A tube swept along a polyline with parallel-transport frames (no twist
 * flips). `radius` may vary along the curve.
 */
export function tube(
  b: MeshBuilder,
  pts: V3[],
  radius: number | ((t: number) => number),
  radial: number,
  m: M4,
  mat: Mat,
  caps = true,
) {
  const n = pts.length;
  const R = typeof radius === "number" ? () => radius : radius;
  const T: V3[] = pts.map((_, k) => v3.norm(v3.sub(pts[Math.min(n - 1, k + 1)], pts[Math.max(0, k - 1)])));
  let N: V3 = Math.abs(T[0][1]) < 0.9 ? v3.norm(v3.cross(T[0], [0, 1, 0])) : v3.norm(v3.cross(T[0], [1, 0, 0]));
  const frames: [V3, V3][] = [];
  for (let k = 0; k < n; k++) {
    if (k > 0) {
      const axis = v3.cross(T[k - 1], T[k]);
      const s = v3.len(axis);
      if (s > 1e-6) {
        const ax = v3.scale(axis, 1 / s);
        const ang = Math.acos(Math.max(-1, Math.min(1, v3.dot(T[k - 1], T[k]))));
        N = rotAxis(N, ax, ang);
      }
    }
    frames.push([N, v3.cross(T[k], N)]);
  }
  const base = b.count;
  for (let k = 0; k < n; k++) {
    const r = R(k / (n - 1));
    const [nn, bn] = frames[k];
    for (let s = 0; s < radial; s++) {
      const a = (s / radial) * Math.PI * 2;
      const dir = v3.add(v3.scale(nn, Math.cos(a)), v3.scale(bn, Math.sin(a)));
      const p = v3.add(pts[k], v3.scale(dir, r));
      b.vert(xfPoint(m, p[0], p[1], p[2]), xfNormal(m, dir[0], dir[1], dir[2]), mat);
    }
  }
  for (let k = 0; k < n - 1; k++)
    for (let s = 0; s < radial; s++) {
      const s1 = (s + 1) % radial;
      const a = base + k * radial + s, c = base + k * radial + s1;
      const a2 = a + radial, c2 = c + radial;
      b.tri(a, a2, c2);
      b.tri(a, c2, c);
    }
  if (caps) {
    for (const [k, sign] of [[0, -1], [n - 1, 1]] as const) {
      const t = v3.scale(T[k], sign);
      const cn = xfNormal(m, t[0], t[1], t[2]);
      const c = b.vert(xfPoint(m, pts[k][0], pts[k][1], pts[k][2]), cn, mat);
      const ring: number[] = [];
      for (let s = 0; s < radial; s++) {
        const src = (base + k * radial + s) * 8;
        ring.push(b.vert([b.v[src], b.v[src + 1], b.v[src + 2]], cn, mat));
      }
      for (let s = 0; s < radial; s++) {
        const s1 = (s + 1) % radial;
        if (sign > 0) b.tri(c, ring[s], ring[s1]);
        else b.tri(c, ring[s1], ring[s]);
      }
    }
  }
}

function rotAxis(v: V3, k: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a);
  const kv = v3.cross(k, v);
  const kd = v3.dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
}

/** Catmull–Rom through control points, `per` samples per span. */
export function spline(ctrl: V3[], per: number): V3[] {
  const out: V3[] = [];
  const P = (k: number) => ctrl[Math.max(0, Math.min(ctrl.length - 1, k))];
  for (let k = 0; k < ctrl.length - 1; k++) {
    const p0 = P(k - 1), p1 = P(k), p2 = P(k + 1), p3 = P(k + 2);
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map(
        (i) =>
          0.5 *
          (2 * p1[i] + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 +
            (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3),
      ) as V3);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

/**
 * Extrude a closed 2D outline (x, y) along +Z by `depth`, flat-shaded sides
 * and fan-triangulated caps (outline must be convex or star-shaped from its
 * first point's centroid). Used for hull decks, cab sides, sign boards.
 */
export function extrude(b: MeshBuilder, outline: [number, number][], depth: number, m: M4, mat: Mat) {
  const n = outline.length;
  for (let k = 0; k < n; k++) {
    const [x0, y0] = outline[k];
    const [x1, y1] = outline[(k + 1) % n];
    const nx = y1 - y0, ny = -(x1 - x0);
    const nn = xfNormal(m, nx, ny, 0);
    const a = b.vert(xfPoint(m, x0, y0, 0), nn, mat);
    const c = b.vert(xfPoint(m, x1, y1, 0), nn, mat);
    const d = b.vert(xfPoint(m, x1, y1, depth), nn, mat);
    const e = b.vert(xfPoint(m, x0, y0, depth), nn, mat);
    b.tri(a, d, c);
    b.tri(a, e, d);
  }
  const cx = outline.reduce((s, p) => s + p[0], 0) / n;
  const cy = outline.reduce((s, p) => s + p[1], 0) / n;
  for (const [z, sgn] of [[0, -1], [depth, 1]] as const) {
    const nn = xfNormal(m, 0, 0, sgn);
    const c = b.vert(xfPoint(m, cx, cy, z), nn, mat);
    const ring = outline.map(([x, y]) => b.vert(xfPoint(m, x, y, z), nn, mat));
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      if (sgn > 0) b.tri(c, ring[k], ring[k1]);
      else b.tri(c, ring[k1], ring[k]);
    }
  }
}

// ── Signed distance fields → mesh (naive surface nets) ─────────────────────
//
// Organic forms — the camel, the people — are modelled as smooth unions of
// capsules and ellipsoids and polygonised here. One continuous skin with true
// smooth normals, which primitives glued together can never give.

export type SDF = (x: number, y: number, z: number) => number;

export function sdfMesh(b: MeshBuilder, f: SDF, min: V3, max: V3, cell: number, m: M4, mat: Mat) {
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1;
  const ny = Math.ceil((max[1] - min[1]) / cell) + 1;
  const nz = Math.ceil((max[2] - min[2]) / cell) + 1;
  const vals = new Float32Array(nx * ny * nz);
  const at = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  // Narrow band: sample a coarse grid first, and evaluate the field exactly
  // only where the coarse estimate is within reach of the surface. Far from
  // it the trilinear estimate is exact enough — only its sign is ever used.
  const S = 3;
  const cx = Math.ceil((nx - 1) / S) + 1, cy = Math.ceil((ny - 1) / S) + 1, cz = Math.ceil((nz - 1) / S) + 1;
  const coarse = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++)
    for (let j = 0; j < cy; j++)
      for (let i = 0; i < cx; i++)
        coarse[i + cx * (j + cy * k)] = f(min[0] + i * S * cell, min[1] + j * S * cell, min[2] + k * S * cell);
  const band = S * cell * 1.6;
  for (let k = 0; k < nz; k++) {
    const fk = k / S, k0 = Math.min(cz - 2, Math.floor(fk)), tk = fk - k0;
    for (let j = 0; j < ny; j++) {
      const fj = j / S, j0 = Math.min(cy - 2, Math.floor(fj)), tj = fj - j0;
      for (let i = 0; i < nx; i++) {
        const fi = i / S, i0 = Math.min(cx - 2, Math.floor(fi)), ti = fi - i0;
        const c = (a: number, bb: number, d: number) => coarse[i0 + a + cx * (j0 + bb + cy * (k0 + d))];
        const e0 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * ti;
        const e1 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * ti;
        const e2 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * ti;
        const e3 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * ti;
        const g0 = e0 + (e1 - e0) * tj, g1 = e2 + (e3 - e2) * tj;
        const est = g0 + (g1 - g0) * tk;
        vals[at(i, j, k)] = Math.abs(est) > band ? est : f(min[0] + i * cell, min[1] + j * cell, min[2] + k * cell);
      }
    }
  }

  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cat = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
  const corners: V3[] = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const edges: [number, number][] = [
    [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const e = cell * 0.5;
  const grad = (x: number, y: number, z: number): V3 =>
    v3.norm([f(x + e, y, z) - f(x - e, y, z), f(x, y + e, z) - f(x, y - e, z), f(x, y, z + e) - f(x, y, z - e)]);

  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const [di, dj, dk] = corners[c];
          cv[c] = vals[at(i + di, j + dj, k + dk)];
          if (cv[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, cnt = 0;
        for (const [a, c] of edges) {
          const va = cv[a], vc = cv[c];
          if (va < 0 === vc < 0) continue;
          const t = va / (va - vc);
          const pa = corners[a], pc = corners[c];
          sx += pa[0] + (pc[0] - pa[0]) * t;
          sy += pa[1] + (pc[1] - pa[1]) * t;
          sz += pa[2] + (pc[2] - pa[2]) * t;
          cnt++;
        }
        const x = min[0] + (i + sx / cnt) * cell;
        const y = min[1] + (j + sy / cnt) * cell;
        const z = min[2] + (k + sz / cnt) * cell;
        const g = grad(x, y, z);
        cellVert[cat(i, j, k)] = b.vert(xfPoint(m, x, y, z), xfNormal(m, g[0], g[1], g[2]), mat);
      }

  const quad = (a: number, c: number, d: number, e2: number, flip: boolean) => {
    if (a < 0 || c < 0 || d < 0 || e2 < 0) return;
    if (flip) {
      b.tri(a, d, c);
      b.tri(a, e2, d);
    } else {
      b.tri(a, c, d);
      b.tri(a, d, e2);
    }
  };
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const v0 = vals[at(i, j, k)] < 0;
        if (i < nx - 1 && j > 0 && k > 0 && j < ny - 1 && k < nz - 1 && v0 !== vals[at(i + 1, j, k)] < 0)
          quad(cellVert[cat(i, j - 1, k - 1)], cellVert[cat(i, j, k - 1)], cellVert[cat(i, j, k)], cellVert[cat(i, j - 1, k)], v0);
        if (j < ny - 1 && i > 0 && k > 0 && i < nx - 1 && k < nz - 1 && v0 !== vals[at(i, j + 1, k)] < 0)
          quad(cellVert[cat(i - 1, j, k - 1)], cellVert[cat(i - 1, j, k)], cellVert[cat(i, j, k)], cellVert[cat(i, j, k - 1)], v0);
        if (k < nz - 1 && i > 0 && j > 0 && i < nx - 1 && j < ny - 1 && v0 !== vals[at(i, j, k + 1)] < 0)
          quad(cellVert[cat(i - 1, j - 1, k)], cellVert[cat(i, j - 1, k)], cellVert[cat(i, j, k)], cellVert[cat(i - 1, j, k)], v0);
      }
}

// SDF helpers — allocation-free; they run a million times per model.
export const sd = {
  capsule(p: V3, a: V3, b: V3, r: number) {
    const pax = p[0] - a[0], pay = p[1] - a[1], paz = p[2] - a[2];
    const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
    const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
    const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
  },
  /** Capsule with radius tapering from ra (at a) to rb (at b). */
  cone(p: V3, a: V3, b: V3, ra: number, rb: number) {
    const pax = p[0] - a[0], pay = p[1] - a[1], paz = p[2] - a[2];
    const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
    const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
    const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * h);
  },
  ellipsoid(p: V3, c: V3, r: V3) {
    const qx = (p[0] - c[0]) / r[0], qy = (p[1] - c[1]) / r[1], qz = (p[2] - c[2]) / r[2];
    const k0 = Math.sqrt(qx * qx + qy * qy + qz * qz);
    const ux = qx / r[0], uy = qy / r[1], uz = qz / r[2];
    const k1 = Math.sqrt(ux * ux + uy * uy + uz * uz);
    return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(r[0], r[1], r[2]);
  },
  box(p: V3, c: V3, h: V3) {
    const qx = Math.abs(p[0] - c[0]) - h[0], qy = Math.abs(p[1] - c[1]) - h[1], qz = Math.abs(p[2] - c[2]) - h[2];
    const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
    return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0);
  },
  smin(a: number, b: number, k: number) {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
  },
};
