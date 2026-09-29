/**
 * The smallest linear-algebra kit the diorama needs. Column-major, like GLSL.
 * Written here rather than installed: zero new dependencies (KOC approves a
 * library once and the approval freezes it).
 */

export type V3 = [number, number, number];
export type M4 = Float32Array;

export const v3 = {
  add: (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: V3, b: V3): V3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  len: (a: V3) => Math.hypot(a[0], a[1], a[2]),
  norm: (a: V3): V3 => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a: V3, b: V3, t: number): V3 => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ],
};

export const m4 = {
  identity(): M4 {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  },

  mul(a: M4, b: M4): M4 {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++)
        o[c * 4 + r] =
          a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  },

  perspective(fovY: number, aspect: number, near: number, far: number): M4 {
    const f = 1 / Math.tan(fovY / 2);
    const m = new Float32Array(16);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = (far + near) / (near - far);
    m[11] = -1;
    m[14] = (2 * far * near) / (near - far);
    return m;
  },

  ortho(l: number, r: number, b: number, t: number, n: number, f: number): M4 {
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

  lookAt(eye: V3, target: V3, up: V3 = [0, 1, 0]): M4 {
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
  },

  /** General 4×4 inverse (cofactor expansion). */
  invert(a: M4): M4 {
    const o = new Float32Array(16);
    const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = a;
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06 || 1e-12;
    const d = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d;
    o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d;
    o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d;
    o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d;
    o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d;
    o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d;
    o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d;
    o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d;
    o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d;
    return o;
  },

  translation(x: number, y: number, z: number): M4 {
    const m = m4.identity();
    m[12] = x; m[13] = y; m[14] = z;
    return m;
  },

  scaling(x: number, y: number, z: number): M4 {
    const m = new Float32Array(16);
    m[0] = x; m[5] = y; m[10] = z; m[15] = 1;
    return m;
  },

  rotY(a: number): M4 {
    const c = Math.cos(a), s = Math.sin(a);
    const m = m4.identity();
    m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
    return m;
  },

  rotX(a: number): M4 {
    const c = Math.cos(a), s = Math.sin(a);
    const m = m4.identity();
    m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
    return m;
  },

  rotZ(a: number): M4 {
    const c = Math.cos(a), s = Math.sin(a);
    const m = m4.identity();
    m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
    return m;
  },

  /** Compose left-to-right: compose(T, R, S) = T·R·S. */
  compose(...ms: M4[]): M4 {
    return ms.reduce((acc, x) => m4.mul(acc, x), m4.identity());
  },

  /**
   * A matrix that maps the unit segment (0,0,0)→(0,1,0) onto a→b, with the
   * cross-section scaled to `w × d`. How every lattice member is placed.
   */
  segment(a: V3, b: V3, w: number, d = w, roll: V3 = [0, 0, 1]): M4 {
    const y = v3.sub(b, a);
    const len = v3.len(y) || 1e-6;
    const yn = v3.scale(y, 1 / len);
    let ref = roll;
    if (Math.abs(v3.dot(ref, yn)) > 0.95) ref = [1, 0, 0];
    const x = v3.norm(v3.cross(yn, ref));
    const z = v3.cross(x, yn);
    const m = new Float32Array(16);
    m[0] = x[0] * w; m[1] = x[1] * w; m[2] = x[2] * w;
    m[4] = y[0]; m[5] = y[1]; m[6] = y[2];
    m[8] = z[0] * d; m[9] = z[1] * d; m[10] = z[2] * d;
    m[12] = a[0]; m[13] = a[1]; m[14] = a[2]; m[15] = 1;
    return m;
  },

  transformPoint(m: M4, p: V3): V3 {
    const x = p[0], y = p[1], z = p[2];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
    return [
      (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
      (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
      (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
    ];
  },
};

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Deterministic PRNG so the diorama is the same on every load (screenshots reproduce). */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
