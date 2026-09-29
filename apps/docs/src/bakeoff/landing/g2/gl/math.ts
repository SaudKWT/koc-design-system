/**
 * Just enough linear algebra for one orthographic drawing. Column-major, like GL.
 * Written here rather than imported: zero new dependencies is a hard rule.
 */

export type Vec3 = [number, number, number];
export type Mat4 = Float32Array;

export const v3 = {
  add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  len: (a: Vec3) => Math.hypot(a[0], a[1], a[2]),
  norm(a: Vec3): Vec3 {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a: Vec3, b: Vec3, t: number): Vec3 => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ],
};

export const m4 = {
  identity(): Mat4 {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  },
  mul(a: Mat4, b: Mat4): Mat4 {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
    return o;
  },
  /** compose(A, B, C) = A·B·C — read right to left: C applies first. */
  compose(...ms: Mat4[]): Mat4 {
    return ms.reduce((acc, m) => m4.mul(acc, m), m4.identity());
  },
  translate(x: number, y: number, z: number): Mat4 {
    const m = m4.identity();
    m[12] = x;
    m[13] = y;
    m[14] = z;
    return m;
  },
  scale(x: number, y: number, z: number): Mat4 {
    const m = m4.identity();
    m[0] = x;
    m[5] = y;
    m[10] = z;
    return m;
  },
  rotX(r: number): Mat4 {
    const m = m4.identity();
    const c = Math.cos(r), s = Math.sin(r);
    m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
    return m;
  },
  rotY(r: number): Mat4 {
    const m = m4.identity();
    const c = Math.cos(r), s = Math.sin(r);
    m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
    return m;
  },
  rotZ(r: number): Mat4 {
    const m = m4.identity();
    const c = Math.cos(r), s = Math.sin(r);
    m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
    return m;
  },
  /** Columns are the images of the unit axes; `t` is the translation. */
  basis(x: Vec3, y: Vec3, z: Vec3, t: Vec3): Mat4 {
    return new Float32Array([
      x[0], x[1], x[2], 0,
      y[0], y[1], y[2], 0,
      z[0], z[1], z[2], 0,
      t[0], t[1], t[2], 1,
    ]);
  },
  ortho(l: number, r: number, b: number, t: number, n: number, f: number): Mat4 {
    const m = new Float32Array(16);
    m[0] = 2 / (r - l);
    m[5] = 2 / (t - b);
    m[10] = -2 / (f - n);
    m[12] = -(r + l) / (r - l);
    m[13] = -(t + b) / (t - b);
    m[14] = -(f + n) / (f - n);
    m[15] = 1;
    return m;
  },
  lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
    const zAxis = v3.norm(v3.sub(eye, target));
    const xAxis = v3.norm(v3.cross(up, zAxis));
    const yAxis = v3.cross(zAxis, xAxis);
    return new Float32Array([
      xAxis[0], yAxis[0], zAxis[0], 0,
      xAxis[1], yAxis[1], zAxis[1], 0,
      xAxis[2], yAxis[2], zAxis[2], 0,
      -v3.dot(xAxis, eye), -v3.dot(yAxis, eye), -v3.dot(zAxis, eye), 1,
    ]);
  },
  point(m: Mat4, p: Vec3): Vec3 {
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15] || 1;
    return [
      (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w,
      (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w,
      (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w,
    ];
  },
  /** Direction transform (no translation). */
  dir(m: Mat4, d: Vec3): Vec3 {
    return [
      m[0] * d[0] + m[4] * d[1] + m[8] * d[2],
      m[1] * d[0] + m[5] * d[1] + m[9] * d[2],
      m[2] * d[0] + m[6] * d[1] + m[10] * d[2],
    ];
  },
  /** Inverse-transpose of the upper 3×3, for normals under non-uniform scale. */
  normalMatrix(m: Mat4): number[] {
    const a = m[0], b = m[4], c = m[8];
    const d = m[1], e = m[5], f = m[9];
    const g = m[2], h = m[6], i = m[10];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C || 1;
    // inverse-transpose == cofactor matrix / det
    return [
      A / det, B / det, C / det,
      -(b * i - c * h) / det, (a * i - c * g) / det, -(a * h - b * g) / det,
      (b * f - c * e) / det, -(a * f - c * d) / det, (a * e - b * d) / det,
    ];
  },
};

/**
 * A member running from `p0` to `p1` — maps the unit box/cylinder template
 * (x,z ∈ [-½,½], y ∈ [0,1]) onto it, with a `w`×`d` cross-section.
 * `roll` picks which way the section's width faces.
 */
export function member(p0: Vec3, p1: Vec3, w: number, d = w, roll: Vec3 = [0, 1, 0]): Mat4 {
  const axis = v3.sub(p1, p0);
  const dir = v3.norm(axis);
  let ref = roll;
  if (Math.abs(v3.dot(dir, ref)) > 0.98) ref = Math.abs(dir[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
  const x = v3.norm(v3.cross(ref, dir));
  const z = v3.norm(v3.cross(x, dir));
  return m4.basis(v3.scale(x, w), axis, v3.scale(z, d), p0);
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
