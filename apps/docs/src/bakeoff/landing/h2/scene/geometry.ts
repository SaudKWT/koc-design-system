/**
 * Mesh builders. Everything in both scenes is made here from numbers — no model
 * files. Resolution is pushed where the eye can see it: lathes and cylinders at
 * 128–192 radial segments, wells at 640 samples along × 20 around.
 */

import { v3, type Vec3 } from "./math";

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  /** One float per vertex, free for the shader: MD along a well, etc. */
  aux?: Float32Array;
  indices: Uint32Array;
}

class Builder {
  p: number[] = [];
  n: number[] = [];
  a: number[] = [];
  i: number[] = [];
  vert(p: Vec3, n: Vec3, aux = 0) {
    this.p.push(p[0], p[1], p[2]);
    this.n.push(n[0], n[1], n[2]);
    this.a.push(aux);
    return this.p.length / 3 - 1;
  }
  quad(a: number, b: number, c: number, d: number) {
    this.i.push(a, b, c, a, c, d);
  }
  build(withAux = false): MeshData {
    return {
      positions: new Float32Array(this.p),
      normals: new Float32Array(this.n),
      aux: withAux ? new Float32Array(this.a) : undefined,
      indices: new Uint32Array(this.i),
    };
  }
}

/** Unit cube centred on the origin, flat normals. */
export function cube(): MeshData {
  const b = new Builder();
  const faces: [Vec3, Vec3, Vec3][] = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
    [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  for (const [n, u, v] of faces) {
    const c = v3.scale(n, 0.5);
    const q = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ].map(([s, t]) => b.vert(v3.add(c, v3.add(v3.scale(u, s), v3.scale(v, t))), n));
    // Winding: u × v = n for the faces above, so this order is CCW from outside.
    b.quad(q[0], q[1], q[2], q[3]);
  }
  return b.build();
}

/** Unit cylinder: radius 0.5, height 1 along Y, centred. Smooth sides, flat caps. */
export function cylinder(segments = 48, caps = true): MeshData {
  const b = new Builder();
  const ring = (y: number) => {
    const out: number[] = [];
    for (let s = 0; s <= segments; s++) {
      const t = (s / segments) * Math.PI * 2;
      const c = Math.cos(t), n = Math.sin(t);
      out.push(b.vert([c * 0.5, y, n * 0.5], [c, 0, n]));
    }
    return out;
  };
  const r0 = ring(-0.5);
  const r1 = ring(0.5);
  for (let s = 0; s < segments; s++) b.quad(r0[s], r1[s], r1[s + 1], r0[s + 1]);
  if (caps) {
    for (const [y, ny] of [[0.5, 1], [-0.5, -1]] as const) {
      const c = b.vert([0, y, 0], [0, ny, 0]);
      const rim: number[] = [];
      for (let s = 0; s <= segments; s++) {
        const t = (s / segments) * Math.PI * 2;
        rim.push(b.vert([Math.cos(t) * 0.5, y, Math.sin(t) * 0.5], [0, ny, 0]));
      }
      for (let s = 0; s < segments; s++) {
        if (ny > 0) b.i.push(c, rim[s + 1], rim[s]);
        else b.i.push(c, rim[s], rim[s + 1]);
      }
    }
  }
  return b.build();
}

/**
 * Revolve a profile of [radius, y] pairs about Y. Normals come from the profile
 * tangent, so curves shade smoothly; repeat a point to get a crease.
 */
export function lathe(profile: [number, number][], segments = 160): MeshData {
  const b = new Builder();
  const rows: number[][] = [];
  for (let k = 0; k < profile.length; k++) {
    const prev = profile[Math.max(0, k - 1)];
    const next = profile[Math.min(profile.length - 1, k + 1)];
    let dr = next[0] - prev[0];
    let dy = next[1] - prev[1];
    // A repeated point is a crease: take the tangent from the side it belongs to.
    if (k > 0 && profile[k][0] === prev[0] && profile[k][1] === prev[1]) {
      dr = next[0] - profile[k][0];
      dy = next[1] - profile[k][1];
    } else if (k < profile.length - 1 && profile[k][0] === next[0] && profile[k][1] === next[1]) {
      dr = profile[k][0] - prev[0];
      dy = profile[k][1] - prev[1];
    }
    const l = Math.hypot(dr, dy) || 1;
    // Outward normal in the (r, y) plane of a profile running bottom → top.
    const nr = dy / l;
    const ny = -dr / l;
    const row: number[] = [];
    for (let s = 0; s <= segments; s++) {
      const t = (s / segments) * Math.PI * 2;
      const c = Math.cos(t), n = Math.sin(t);
      const [r, y] = profile[k];
      row.push(b.vert([c * r, y, n * r], [c * nr, ny, n * nr]));
    }
    rows.push(row);
  }
  for (let k = 0; k < rows.length - 1; k++) {
    for (let s = 0; s < segments; s++) b.quad(rows[k][s], rows[k + 1][s], rows[k + 1][s + 1], rows[k][s + 1]);
  }
  return b.build();
}

/**
 * A tube swept along a polyline with parallel-transport frames (no twisting at
 * the build sections). `aux` carries each ring's measured depth.
 */
export function tube(points: Vec3[], radius: number, radial = 20, aux?: number[], capEnds = true): MeshData {
  const b = new Builder();
  const n = points.length;
  const tangents: Vec3[] = points.map((_, k) =>
    v3.norm(v3.sub(points[Math.min(n - 1, k + 1)], points[Math.max(0, k - 1)])),
  );
  let normal: Vec3 = Math.abs(tangents[0][1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  normal = v3.norm(v3.cross(v3.cross(tangents[0], normal), tangents[0]));
  const rings: number[][] = [];
  for (let k = 0; k < n; k++) {
    if (k > 0) {
      // Parallel transport: remove the component along the new tangent.
      const t = tangents[k];
      normal = v3.norm(v3.sub(normal, v3.scale(t, v3.dot(normal, t))));
    }
    const binormal = v3.cross(tangents[k], normal);
    const ring: number[] = [];
    for (let s = 0; s <= radial; s++) {
      const a = (s / radial) * Math.PI * 2;
      const dir = v3.add(v3.scale(normal, Math.cos(a)), v3.scale(binormal, Math.sin(a)));
      ring.push(b.vert(v3.add(points[k], v3.scale(dir, radius)), dir, aux?.[k] ?? 0));
    }
    rings.push(ring);
  }
  for (let k = 0; k < n - 1; k++) {
    for (let s = 0; s < radial; s++) b.quad(rings[k][s], rings[k][s + 1], rings[k + 1][s + 1], rings[k + 1][s]);
  }
  if (capEnds) {
    for (const [k, sign] of [[0, -1], [n - 1, 1]] as const) {
      const t = v3.scale(tangents[k], sign);
      const c = b.vert(points[k], t, aux?.[k] ?? 0);
      const binormal = v3.cross(tangents[k], normal);
      const rim: number[] = [];
      for (let s = 0; s <= radial; s++) {
        const a = (s / radial) * Math.PI * 2;
        const dir = v3.add(v3.scale(normal, Math.cos(a)), v3.scale(binormal, Math.sin(a)));
        rim.push(b.vert(v3.add(points[k], v3.scale(dir, radius)), t, aux?.[k] ?? 0));
      }
      for (let s = 0; s < radial; s++) {
        if (sign > 0) b.i.push(c, rim[s], rim[s + 1]);
        else b.i.push(c, rim[s + 1], rim[s]);
      }
    }
  }
  return b.build(true);
}

/** UV sphere, radius 0.5. */
export function sphere(lat = 48, lon = 96): MeshData {
  const b = new Builder();
  const rows: number[][] = [];
  for (let i = 0; i <= lat; i++) {
    const th = (i / lat) * Math.PI;
    const row: number[] = [];
    for (let j = 0; j <= lon; j++) {
      const ph = (j / lon) * Math.PI * 2;
      const n: Vec3 = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
      row.push(b.vert(v3.scale(n, 0.5), n));
    }
    rows.push(row);
  }
  for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) b.quad(rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]);
  return b.build();
}

/** Axis-aligned box from corners, flat normals, with an optional `aux` tag. */
export function box(min: Vec3, max: Vec3, aux = 0, skip: Partial<Record<"px" | "nx" | "py" | "ny" | "pz" | "nz", boolean>> = {}): MeshData {
  const b = new Builder();
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const face = (key: keyof typeof skip, n: Vec3, c: Vec3[]) => {
    if (skip[key]) return;
    const q = c.map((p) => b.vert(p, n, aux));
    b.quad(q[0], q[1], q[2], q[3]);
  };
  face("px", [1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]);
  face("nx", [-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]);
  face("py", [0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]);
  face("ny", [0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]);
  face("pz", [0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
  face("nz", [0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]);
  return b.build(true);
}

export function merge(parts: MeshData[]): MeshData {
  let vc = 0, ic = 0;
  for (const p of parts) {
    vc += p.positions.length;
    ic += p.indices.length;
  }
  const positions = new Float32Array(vc);
  const normals = new Float32Array(vc);
  const aux = new Float32Array(vc / 3);
  const indices = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const p of parts) {
    positions.set(p.positions, vo);
    normals.set(p.normals, vo);
    if (p.aux) aux.set(p.aux, vo / 3);
    for (let k = 0; k < p.indices.length; k++) indices[io + k] = p.indices[k] + vo / 3;
    vo += p.positions.length;
    io += p.indices.length;
  }
  return { positions, normals, aux, indices };
}
