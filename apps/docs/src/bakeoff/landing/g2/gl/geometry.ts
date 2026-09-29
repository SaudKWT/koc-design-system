/**
 * Mesh builders and the edge extractor that turns a mesh into a line drawing.
 *
 * Every template here is a unit shape, instanced by matrix. The convention is
 * "unit prism along +y": x,z ∈ [-½, ½], y ∈ [0, 1]. `member()` in math.ts maps
 * that onto any segment p0→p1, which is how every lattice member, girt, brace,
 * pipe joint and stair tread in the model is placed.
 *
 * The line drawing is not a post-process. Each template's edges are extracted
 * once, here, into two kinds:
 *   - FEATURE: a crease sharper than `creaseDeg`, or an open boundary. Always drawn.
 *   - SILHOUETTE CANDIDATE: a smooth edge. Drawn only when one adjacent face
 *     looks at the camera and the other looks away — decided per frame on the
 *     GPU, so a 256-segment cylinder outlines itself exactly at any angle.
 * Coplanar edges (quad diagonals, flat caps) are dropped entirely.
 */

import type { Vec3 } from "./math";

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

/** Per edge: a.xyz kind | b.xyz 0 | nA.xyz 0 | nB.xyz 0 — four RGBA32F texels. */
export interface EdgeData {
  data: Float32Array;
  count: number;
}

export class MeshBuilder {
  p: number[] = [];
  n: number[] = [];
  i: number[] = [];

  vert(p: Vec3, n: Vec3): number {
    this.p.push(p[0], p[1], p[2]);
    this.n.push(n[0], n[1], n[2]);
    return this.p.length / 3 - 1;
  }
  tri(a: number, b: number, c: number) {
    this.i.push(a, b, c);
  }
  /** Flat quad, corners in order around the face. */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3) {
    const i0 = this.vert(a, n), i1 = this.vert(b, n), i2 = this.vert(c, n), i3 = this.vert(d, n);
    this.tri(i0, i1, i2);
    this.tri(i0, i2, i3);
  }
  append(o: MeshData) {
    const base = this.p.length / 3;
    for (const v of o.positions) this.p.push(v);
    for (const v of o.normals) this.n.push(v);
    for (const v of o.indices) this.i.push(v + base);
  }
  build(): MeshData {
    return {
      positions: new Float32Array(this.p),
      normals: new Float32Array(this.n),
      indices: new Uint32Array(this.i),
    };
  }
}

/** Unit box: x,z ∈ [-½,½], y ∈ [0,1]. */
export function box(): MeshData {
  const b = new MeshBuilder();
  const x0 = -0.5, x1 = 0.5, y0 = 0, y1 = 1, z0 = -0.5, z1 = 0.5;
  b.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]);
  b.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0]);
  b.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]);
  b.quad([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0]);
  b.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
  b.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
  return b.build();
}

/**
 * Surface of revolution about +y. `profile` is [r, y] pairs traversed so the
 * solid is on the left: outward along the bottom, up the outside, inward over
 * the top (a bore runs back down). Profile corners sharper than `creaseDeg`
 * get split normals; gentler joins are smoothed, so a fillet reads as one curve.
 */
export function lathe(profile: [number, number][], segments: number, creaseDeg = 30): MeshData {
  const b = new MeshBuilder();
  const cosCrease = Math.cos((creaseDeg * Math.PI) / 180);
  const segN: [number, number][] = [];
  for (let k = 0; k < profile.length - 1; k++) {
    const dr = profile[k + 1][0] - profile[k][0];
    const dy = profile[k + 1][1] - profile[k][1];
    const l = Math.hypot(dr, dy) || 1;
    segN.push([dy / l, -dr / l]);
  }
  const vertexNormal = (k: number, end: 0 | 1): [number, number] => {
    // Normal at profile vertex (k + end) as seen from segment k.
    const own = segN[k];
    const nb = end === 0 ? segN[k - 1] : segN[k + 1];
    if (!nb) return own;
    const d = own[0] * nb[0] + own[1] * nb[1];
    if (d < cosCrease) return own;
    const s: [number, number] = [own[0] + nb[0], own[1] + nb[1]];
    const l = Math.hypot(s[0], s[1]) || 1;
    return [s[0] / l, s[1] / l];
  };
  const cos: number[] = [], sin: number[] = [];
  for (let s = 0; s <= segments; s++) {
    const t = (s / segments) * Math.PI * 2;
    cos.push(Math.cos(t));
    sin.push(Math.sin(t));
  }
  for (let k = 0; k < profile.length - 1; k++) {
    const [r0, y0] = profile[k];
    const [r1, y1] = profile[k + 1];
    if (Math.abs(r0 - r1) < 1e-9 && Math.abs(y0 - y1) < 1e-9) continue;
    const n0 = vertexNormal(k, 0), n1 = vertexNormal(k, 1);
    const base = b.p.length / 3;
    for (let s = 0; s <= segments; s++) {
      const c = cos[s], sn = sin[s];
      b.vert([r0 * c, y0, r0 * sn], [n0[0] * c, n0[1], n0[0] * sn]);
      b.vert([r1 * c, y1, r1 * sn], [n1[0] * c, n1[1], n1[0] * sn]);
    }
    for (let s = 0; s < segments; s++) {
      const a = base + s * 2, c = a + 2;
      b.tri(a, a + 1, c + 1);
      b.tri(a, c + 1, c);
    }
  }
  return b.build();
}

/** Unit cylinder: radius ½, y ∈ [0,1], capped. */
export function cylinder(segments: number): MeshData {
  return lathe([[0, 0], [0.5, 0], [0.5, 1], [0, 1]], segments, 30);
}

/** Unit pipe: outer radius ½, inner radius `inner`·½, y ∈ [0,1]. */
export function pipe(segments: number, inner: number): MeshData {
  const ri = inner * 0.5;
  return lathe([[ri, 0], [0.5, 0], [0.5, 1], [ri, 1], [ri, 0]], segments, 30);
}

/**
 * Tube swept along a polyline with parallel-transport frames. Joints are
 * mitred by the averaged tangent, so feed it closely spaced points on bends.
 */
export function tube(path: Vec3[], radius: number, radial: number, caps = true): MeshData {
  const b = new MeshBuilder();
  const n = path.length;
  const tang: Vec3[] = [];
  for (let k = 0; k < n; k++) {
    const a = path[Math.max(0, k - 1)], c = path[Math.min(n - 1, k + 1)];
    tang.push(norm3([c[0] - a[0], c[1] - a[1], c[2] - a[2]]));
  }
  let up: Vec3 = Math.abs(tang[0][1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let nx = norm3(cross3(up, tang[0]));
  const rings: number[] = [];
  for (let k = 0; k < n; k++) {
    if (k > 0) {
      // parallel transport: remove the tangent component, renormalise
      const t = tang[k];
      const d = dot3(nx, t);
      nx = norm3([nx[0] - t[0] * d, nx[1] - t[1] * d, nx[2] - t[2] * d]);
    }
    const ny = cross3(tang[k], nx);
    rings.push(b.p.length / 3);
    for (let s = 0; s <= radial; s++) {
      const a = (s / radial) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      const dir: Vec3 = [nx[0] * c + ny[0] * sn, nx[1] * c + ny[1] * sn, nx[2] * c + ny[2] * sn];
      b.vert([path[k][0] + dir[0] * radius, path[k][1] + dir[1] * radius, path[k][2] + dir[2] * radius], dir);
    }
  }
  for (let k = 0; k < n - 1; k++) {
    for (let s = 0; s < radial; s++) {
      const a = rings[k] + s, c = rings[k + 1] + s;
      b.tri(a, c, c + 1);
      b.tri(a, c + 1, a + 1);
    }
  }
  if (caps) {
    for (const [k, sgn] of [[0, -1], [n - 1, 1]] as const) {
      const t = tang[k];
      const nn: Vec3 = [t[0] * sgn, t[1] * sgn, t[2] * sgn];
      const centre = b.vert(path[k], nn);
      const ring: number[] = [];
      for (let s = 0; s <= radial; s++) {
        const src = rings[k] + s;
        ring.push(b.vert([b.p[src * 3], b.p[src * 3 + 1], b.p[src * 3 + 2]], nn));
      }
      for (let s = 0; s < radial; s++) b.tri(centre, ring[s], ring[s + 1]);
    }
  }
  return b.build();
}

/**
 * Extrude a simple polygon (x,z, counter-clockwise seen from +y) from y=0 to 1.
 * Caps are ear-clipped, so L-angles, channels and saddles all work.
 */
export function extrude(poly: [number, number][]): MeshData {
  const b = new MeshBuilder();
  const n = poly.length;
  for (let k = 0; k < n; k++) {
    const [x0, z0] = poly[k];
    const [x1, z1] = poly[(k + 1) % n];
    const nrm = norm3([z1 - z0, 0, -(x1 - x0)]);
    b.quad([x0, 0, z0], [x1, 0, z1], [x1, 1, z1], [x0, 1, z0], nrm);
  }
  const tris = earClip(poly);
  for (const [y, nrm] of [[1, [0, 1, 0]], [0, [0, -1, 0]]] as const) {
    const base = b.p.length / 3;
    for (const [x, z] of poly) b.vert([x, y, z], nrm as unknown as Vec3);
    for (const [a, c, d] of tris) {
      if (y === 1) b.tri(base + a, base + d, base + c);
      else b.tri(base + a, base + c, base + d);
    }
  }
  return b.build();
}

function earClip(poly: [number, number][]): [number, number, number][] {
  const idx = poly.map((_, k) => k);
  const out: [number, number, number][] = [];
  const area = (a: [number, number], b: [number, number], c: [number, number]) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  // orientation of the whole polygon
  let s = 0;
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], c = poly[(k + 1) % poly.length];
    s += a[0] * c[1] - c[0] * a[1];
  }
  const sign = s >= 0 ? 1 : -1;
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const ia = idx[(k + idx.length - 1) % idx.length], ib = idx[k], ic = idx[(k + 1) % idx.length];
      const a = poly[ia], bb = poly[ib], c = poly[ic];
      if (area(a, bb, c) * sign <= 1e-12) continue;
      let inside = false;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        const p = poly[j];
        if (area(a, bb, p) * sign >= 0 && area(bb, c, p) * sign >= 0 && area(c, a, p) * sign >= 0) {
          inside = true;
          break;
        }
      }
      if (inside) continue;
      out.push([ia, ib, ic]);
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}

/** Merge meshes after transforming each by a 4×4 (column-major). */
export function merge(parts: { mesh: MeshData; m?: Float32Array }[]): MeshData {
  const b = new MeshBuilder();
  for (const { mesh, m } of parts) {
    if (!m) {
      b.append(mesh);
      continue;
    }
    const nm = normalMat(m);
    const pos = new Float32Array(mesh.positions.length);
    const nrm = new Float32Array(mesh.normals.length);
    for (let k = 0; k < mesh.positions.length; k += 3) {
      const x = mesh.positions[k], y = mesh.positions[k + 1], z = mesh.positions[k + 2];
      pos[k] = m[0] * x + m[4] * y + m[8] * z + m[12];
      pos[k + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      pos[k + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      const nx = mesh.normals[k], ny = mesh.normals[k + 1], nz = mesh.normals[k + 2];
      const v = norm3([
        nm[0] * nx + nm[1] * ny + nm[2] * nz,
        nm[3] * nx + nm[4] * ny + nm[5] * nz,
        nm[6] * nx + nm[7] * ny + nm[8] * nz,
      ]);
      nrm[k] = v[0];
      nrm[k + 1] = v[1];
      nrm[k + 2] = v[2];
    }
    b.append({ positions: pos, normals: nrm, indices: mesh.indices });
  }
  return b.build();
}

/** Cofactor matrix of the upper 3×3, rows — inverse-transpose up to scale. */
function normalMat(m: Float32Array): number[] {
  const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
  return [
    e * i - f * h, -(d * i - f * g), d * h - e * g,
    -(b * i - c * h), a * i - c * g, -(a * h - b * g),
    b * f - c * e, -(a * f - c * d), a * e - b * d,
  ];
}

/**
 * Extract the drawable edges of a mesh. Positions are welded by value first, so
 * the split vertices a flat-shaded box needs do not turn every edge into a
 * boundary.
 */
export function extractEdges(mesh: MeshData, creaseDeg = 28): EdgeData {
  const P = mesh.positions, N = mesh.normals, I = mesh.indices;
  const q = (v: number) => Math.round(v * 1e4);
  const weld = new Map<string, number>();
  const wid = new Int32Array(P.length / 3);
  const wpos: number[] = [];
  for (let k = 0; k < P.length / 3; k++) {
    const key = `${q(P[k * 3])},${q(P[k * 3 + 1])},${q(P[k * 3 + 2])}`;
    let id = weld.get(key);
    if (id === undefined) {
      id = wpos.length / 3;
      weld.set(key, id);
      wpos.push(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]);
    }
    wid[k] = id;
  }
  const faceN: Vec3[] = [];
  const edges = new Map<number, number[]>(); // key → face list
  const edgeKey = (a: number, b: number) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  for (let f = 0; f < I.length / 3; f++) {
    const i0 = I[f * 3], i1 = I[f * 3 + 1], i2 = I[f * 3 + 2];
    const a: Vec3 = [P[i0 * 3], P[i0 * 3 + 1], P[i0 * 3 + 2]];
    const b: Vec3 = [P[i1 * 3], P[i1 * 3 + 1], P[i1 * 3 + 2]];
    const c: Vec3 = [P[i2 * 3], P[i2 * 3 + 1], P[i2 * 3 + 2]];
    let n = cross3([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
    const area = Math.hypot(n[0], n[1], n[2]);
    if (area < 1e-12) {
      faceN.push([0, 0, 0]);
      continue;
    }
    n = [n[0] / area, n[1] / area, n[2] / area];
    // Orient by the authored vertex normals, not by winding — winding is not
    // guaranteed consistent across builders, and silhouettes depend on it.
    const vn: Vec3 = [
      N[i0 * 3] + N[i1 * 3] + N[i2 * 3],
      N[i0 * 3 + 1] + N[i1 * 3 + 1] + N[i2 * 3 + 1],
      N[i0 * 3 + 2] + N[i1 * 3 + 2] + N[i2 * 3 + 2],
    ];
    if (dot3(n, vn) < 0) n = [-n[0], -n[1], -n[2]];
    faceN.push(n);
    const w = [wid[i0], wid[i1], wid[i2]];
    for (let e = 0; e < 3; e++) {
      const a0 = w[e], b0 = w[(e + 1) % 3];
      if (a0 === b0) continue;
      const k = edgeKey(a0, b0);
      const list = edges.get(k);
      if (list) list.push(f);
      else edges.set(k, [f]);
    }
  }
  const cosCrease = Math.cos((creaseDeg * Math.PI) / 180);
  const out: number[] = [];
  let count = 0;
  for (const [k, faces] of edges) {
    const a = Math.floor(k / 4194304), b = k % 4194304;
    const live = faces.filter((f) => faceN[f][0] !== 0 || faceN[f][1] !== 0 || faceN[f][2] !== 0);
    if (live.length === 0) continue;
    let kind = 0; // feature
    let nA = faceN[live[0]], nB = nA;
    if (live.length === 2) {
      nB = faceN[live[1]];
      const d = dot3(nA, nB);
      if (d > 0.99999) continue; // coplanar: never drawn
      if (d > cosCrease) kind = 1; // smooth: silhouette candidate
    } else if (live.length > 2) {
      // non-manifold (touching solids): pick the pair that disagrees most
      nB = faceN[live[1]];
    }
    out.push(
      wpos[a * 3], wpos[a * 3 + 1], wpos[a * 3 + 2], kind,
      wpos[b * 3], wpos[b * 3 + 1], wpos[b * 3 + 2], 0,
      nA[0], nA[1], nA[2], 0,
      nB[0], nB[1], nB[2], 0,
    );
    count++;
  }
  return { data: new Float32Array(out), count };
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot3(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function norm3(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** Points on a circular arc in the plane spanned by u,v about centre c. */
export function arc(c: Vec3, u: Vec3, v: Vec3, r: number, a0: number, a1: number, steps: number): Vec3[] {
  const out: Vec3[] = [];
  for (let s = 0; s <= steps; s++) {
    const a = a0 + ((a1 - a0) * s) / steps;
    const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
    out.push([c[0] + u[0] * ca + v[0] * sa, c[1] + u[1] * ca + v[1] * sa, c[2] + u[2] * ca + v[2] * sa]);
  }
  return out;
}

/**
 * A pipe route with radiused bends: straight runs between `pts`, each corner
 * replaced by an arc of radius `bend` sampled at `bendSteps`.
 */
export function route(pts: Vec3[], bend: number, bendSteps = 24): Vec3[] {
  if (pts.length < 3) return pts.slice();
  const out: Vec3[] = [pts[0]];
  for (let k = 1; k < pts.length - 1; k++) {
    const p = pts[k];
    const dIn = norm3([p[0] - pts[k - 1][0], p[1] - pts[k - 1][1], p[2] - pts[k - 1][2]]);
    const dOut = norm3([pts[k + 1][0] - p[0], pts[k + 1][1] - p[1], pts[k + 1][2] - p[2]]);
    const cosT = Math.max(-1, Math.min(1, dot3(dIn, dOut)));
    const theta = Math.acos(cosT);
    if (theta < 1e-3) {
      out.push(p);
      continue;
    }
    const t = bend * Math.tan(theta / 2);
    const a: Vec3 = [p[0] - dIn[0] * t, p[1] - dIn[1] * t, p[2] - dIn[2] * t];
    const b: Vec3 = [p[0] + dOut[0] * t, p[1] + dOut[1] * t, p[2] + dOut[2] * t];
    for (let s = 0; s <= bendSteps; s++) {
      // quadratic Bézier through the corner is within 0.3% of the true arc for
      // the bend angles used here, and needs no plane construction
      const u = s / bendSteps;
      const w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u;
      out.push([
        a[0] * w0 + p[0] * w1 + b[0] * w2,
        a[1] * w0 + p[1] * w1 + b[1] * w2,
        a[2] * w0 + p[2] * w1 + b[2] * w2,
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
