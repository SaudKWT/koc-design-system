/**
 * The little linear algebra the two scenes need. Column-major, Float32Array,
 * the layout WebGL's `uniformMatrix4fv(…, false, m)` expects.
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
  norm: (a: Vec3): Vec3 => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a: Vec3, b: Vec3, t: number): Vec3 => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ],
};

export function identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

export function ortho(l: number, r: number, b: number, t: number, n: number, f: number): Mat4 {
  const m = new Float32Array(16);
  m[0] = 2 / (r - l);
  m[5] = 2 / (t - b);
  m[10] = -2 / (f - n);
  m[12] = -(r + l) / (r - l);
  m[13] = -(t + b) / (t - b);
  m[14] = -(f + n) / (f - n);
  m[15] = 1;
  return m;
}

export function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const z = v3.norm(v3.sub(eye, target));
  const x = v3.norm(v3.cross(up, z));
  const y = v3.cross(z, x);
  const m = new Float32Array(16);
  m[0] = x[0]; m[4] = x[1]; m[8] = x[2];
  m[1] = y[0]; m[5] = y[1]; m[9] = y[2];
  m[2] = z[0]; m[6] = z[1]; m[10] = z[2];
  m[12] = -v3.dot(x, eye);
  m[13] = -v3.dot(y, eye);
  m[14] = -v3.dot(z, eye);
  m[15] = 1;
  return m;
}

/** Transform a point by a 4×4 matrix, with the perspective divide. */
export function transformPoint(m: Mat4, p: Vec3): Vec3 {
  const x = p[0], y = p[1], z = p[2];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  ];
}

/**
 * A matrix that maps the unit member (centred on the origin, length 1 along +Y,
 * cross-section 1×1) onto the segment a→b with the given cross-section.
 * `roll` picks the section's orientation about the member axis.
 */
export function memberMatrix(a: Vec3, b: Vec3, w: number, d = w, rollHint: Vec3 = [0, 0, 1]): Mat4 {
  const axis = v3.sub(b, a);
  const len = v3.len(axis) || 1e-6;
  const yv = v3.scale(axis, 1 / len);
  let hint = rollHint;
  if (Math.abs(v3.dot(hint, yv)) > 0.95) hint = Math.abs(yv[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const xv = v3.norm(v3.cross(yv, hint));
  const zv = v3.cross(xv, yv);
  const c = v3.lerp(a, b, 0.5);
  const m = new Float32Array(16);
  m[0] = xv[0] * w; m[1] = xv[1] * w; m[2] = xv[2] * w;
  m[4] = yv[0] * len; m[5] = yv[1] * len; m[6] = yv[2] * len;
  m[8] = zv[0] * d; m[9] = zv[1] * d; m[10] = zv[2] * d;
  m[12] = c[0]; m[13] = c[1]; m[14] = c[2]; m[15] = 1;
  return m;
}

/** Axis-aligned box from min/max corners, for the unit cube centred on the origin. */
export function boxMatrix(min: Vec3, max: Vec3): Mat4 {
  const m = new Float32Array(16);
  m[0] = max[0] - min[0];
  m[5] = max[1] - min[1];
  m[10] = max[2] - min[2];
  m[12] = (min[0] + max[0]) / 2;
  m[13] = (min[1] + max[1]) / 2;
  m[14] = (min[2] + max[2]) / 2;
  m[15] = 1;
  return m;
}

/** Translation × uniform scale × rotation about Y. */
export function trs(t: Vec3, s = 1, yaw = 0): Mat4 {
  const c = Math.cos(yaw) * s;
  const n = Math.sin(yaw) * s;
  const m = new Float32Array(16);
  m[0] = c; m[2] = -n;
  m[5] = s;
  m[8] = n; m[10] = c;
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1;
  return m;
}

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const DEG = Math.PI / 180;
