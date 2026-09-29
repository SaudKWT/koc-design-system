/**
 * Stipple sampler — turns procedural geometry into a point cloud.
 *
 * A `Shape` is a list of primitives (thin struts, tubes, cones, discs, rings, quads, boxes, or a
 * custom sampler). Each primitive has a measure (length or area × a density weight). `fill(n)`
 * shares n points between the primitives in proportion to their measure (stratified: every
 * primitive gets exactly its share, so a strut never goes missing by bad luck), samples each
 * uniformly over its own surface, then shuffles the lot.
 *
 * Uniform sampling over a SURFACE is what makes the stipple read as a solid: seen in projection,
 * the density piles up where a surface turns away from the eye, so silhouettes and rims draw
 * themselves (the Anchor AI egg is exactly this).
 *
 * Each point is written as (x, y, z, w), w = shade + 2·code:
 *   shade  a baked Lambert term in [0, 1) from a fixed model-space light;
 *   code   accent (bit 0: drawn in `--primary`) + 2 × ink level (0–7, ink = 1 − level/8), so a
 *          context part (a ground pad, a far tank) stays faint in BOTH themes, independently of
 *          how it is lit. −1 marks a particle the model does not use (see field-models.ts).
 * No colour lives here. `encodeW` / the shader's decode are the only two readers of this format.
 */

export type V3 = [number, number, number];
export type Rng = () => number;

/** mulberry32: small, fast, deterministic. Every model is seeded, so it is the same every load. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const v3 = (x: number, y: number, z: number): V3 => [x, y, z];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** Rotate about the y axis. */
export const rotY = (p: V3, a: number): V3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
};

/** Two unit vectors perpendicular to `axis` and to each other. */
export function basis(axis: V3): [V3, V3] {
  const a = norm(axis);
  const h: V3 = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(a, h));
  return [u, cross(a, u)];
}

export interface PartOptions {
  /** Density weight: points per unit of measure, relative to the other parts. */
  w?: number;
  /** Drawn in --primary instead of the ink colour. */
  accent?: boolean;
  /** Ink, 0–1: how strongly this part is drawn, in either theme (quantised to eighths). */
  tone?: number;
}

/** A sampler writes one point: position and, where it has one, the surface normal. */
export type Emit = (p: V3, n: V3 | null) => void;
type Sampler = (r: Rng, emit: Emit) => void;

interface Part {
  m: number;
  sample: Sampler;
  accent: boolean;
  tone: number;
}

export class Shape {
  private parts: Part[] = [];
  /** Model-space key light: from the upper left, in front. */
  light: V3 = norm([-0.55, 0.75, 0.45]);

  /** A custom part. `measure` is its size (length or area) before the weight is applied. */
  custom(measure: number, sample: Sampler, o: PartOptions = {}) {
    const m = measure * (o.w ?? 1);
    if (m > 0) this.parts.push({ m, sample, accent: !!o.accent, tone: o.tone ?? 1 });
    return this;
  }

  /** A strut: points within radius r of the segment a→b (r = 0 for a hairline). */
  line(a: V3, b: V3, o: PartOptions & { r?: number } = {}) {
    const d = sub(b, a), L = len(d), r = o.r ?? 0;
    const [u, v] = basis(d);
    return this.custom(L, (rng, emit) => {
      const t = rng(), th = rng() * Math.PI * 2, rr = r * Math.sqrt(rng());
      const n = add(mul(u, Math.cos(th)), mul(v, Math.sin(th)));
      emit(add(add(a, mul(d, t)), mul(n, rr)), n);
    }, o);
  }

  /** A polyline strut through `pts`. */
  path(pts: V3[], o: PartOptions & { r?: number } = {}) {
    for (let i = 1; i < pts.length; i++) this.line(pts[i - 1], pts[i], o);
    return this;
  }

  /** Surface of a cone frustum (a cylinder when r0 = r1) around the axis a→b. */
  cone(a: V3, b: V3, r0: number, r1: number, o: PartOptions & { from?: number; to?: number } = {}) {
    const d = sub(b, a), L = len(d);
    const [u, v] = basis(d);
    const th0 = o.from ?? 0, th1 = o.to ?? Math.PI * 2;
    const slant = Math.hypot(L, r1 - r0), area = (th1 - th0) * ((r0 + r1) / 2) * slant;
    const ax = norm(d);
    return this.custom(area, (rng, emit) => {
      // area-uniform along the axis: radius grows linearly, so invert the linear pdf
      const x = rng();
      const t = Math.abs(r1 - r0) < 1e-6 ? x : (Math.sqrt(r0 * r0 + (r1 * r1 - r0 * r0) * x) - r0) / (r1 - r0);
      const rr = r0 + (r1 - r0) * t, th = th0 + (th1 - th0) * rng();
      const n0 = add(mul(u, Math.cos(th)), mul(v, Math.sin(th)));
      const n = norm(add(mul(n0, L), mul(ax, r0 - r1)));
      emit(add(add(a, mul(d, t)), mul(n0, rr)), n);
    }, o);
  }

  tube(a: V3, b: V3, r: number, o: PartOptions = {}) {
    return this.cone(a, b, r, r, o);
  }

  /** An annulus (r0 inner, r1 outer) centred on c, facing n. */
  disc(c: V3, n: V3, r0: number, r1: number, o: PartOptions = {}) {
    const [u, v] = basis(n), nn = norm(n);
    return this.custom(Math.PI * (r1 * r1 - r0 * r0), (rng, emit) => {
      const rr = Math.sqrt(r0 * r0 + (r1 * r1 - r0 * r0) * rng()), th = rng() * Math.PI * 2;
      emit(add(c, add(mul(u, rr * Math.cos(th)), mul(v, rr * Math.sin(th)))), nn);
    }, o);
  }

  /** A circle of radius R (a torus of tube radius r) centred on c, in the plane facing n. */
  ring(c: V3, n: V3, R: number, o: PartOptions & { r?: number } = {}) {
    const [u, v] = basis(n), nn = norm(n), r = o.r ?? 0;
    return this.custom(Math.PI * 2 * R, (rng, emit) => {
      const th = rng() * Math.PI * 2, ph = rng() * Math.PI * 2, rr = r * Math.sqrt(rng());
      const radial = add(mul(u, Math.cos(th)), mul(v, Math.sin(th)));
      const off = add(mul(radial, Math.cos(ph)), mul(nn, Math.sin(ph)));
      emit(add(c, add(mul(radial, R), mul(off, rr))), off);
    }, o);
  }

  /** The parallelogram o + s·u + t·v, s,t ∈ [0, 1]. */
  quad(o0: V3, u: V3, v: V3, o: PartOptions = {}) {
    const n = cross(u, v), area = len(n), nn = norm(n);
    return this.custom(area, (rng, emit) => emit(add(o0, add(mul(u, rng()), mul(v, rng()))), nn), o);
  }

  /** All six faces of an axis-aligned box. */
  box(c: V3, size: V3, o: PartOptions = {}) {
    const [hx, hy, hz] = mul(size, 0.5);
    const X: V3 = [size[0], 0, 0], Y: V3 = [0, size[1], 0], Z: V3 = [0, 0, size[2]];
    const lo: V3 = [c[0] - hx, c[1] - hy, c[2] - hz];
    this.quad(lo, Y, Z, o).quad(add(lo, X), Z, Y, o); // −x, +x
    this.quad(lo, Z, X, o).quad(add(lo, Y), X, Z, o); // −y, +y
    this.quad(lo, X, Y, o).quad(add(lo, Z), Y, X, o); // −z, +z
    return this;
  }

  /** The twelve edges of an axis-aligned box, as struts. */
  edges(c: V3, size: V3, o: PartOptions & { r?: number } = {}) {
    const [hx, hy, hz] = mul(size, 0.5);
    const P = (sx: number, sy: number, sz: number): V3 => [c[0] + sx * hx, c[1] + sy * hy, c[2] + sz * hz];
    for (const s of [-1, 1])
      for (const t of [-1, 1]) {
        this.line(P(-1, s, t), P(1, s, t), o);
        this.line(P(s, -1, t), P(s, 1, t), o);
        this.line(P(s, t, -1), P(s, t, 1), o);
      }
    return this;
  }

  /** Total measure (for choosing weights). */
  get measure() {
    return this.parts.reduce((s, p) => s + p.m, 0);
  }

  /**
   * n points, (x, y, z, w) each. Stratified by part, then shuffled, so any prefix of the result
   * is itself a fair sample of the whole shape.
   */
  fill(n: number, rng: Rng): Float32Array {
    const out = new Float32Array(n * 4);
    const total = this.measure;
    if (!total || !n) return out;
    // Largest-remainder allocation.
    const exact = this.parts.map((p) => (p.m / total) * n);
    const count = exact.map(Math.floor);
    let left = n - count.reduce((a, b) => a + b, 0);
    exact
      .map((e, i) => [e - Math.floor(e), i] as const)
      .sort((a, b) => b[0] - a[0])
      .forEach(([, i]) => {
        if (left > 0) {
          count[i]++;
          left--;
        }
      });
    let k = 0;
    const L = this.light;
    this.parts.forEach((part, i) => {
      const emit: Emit = (p, nrm) => {
        const lam = nrm ? Math.abs(dot(nrm, L)) * 0.8 + Math.max(0, dot(nrm, L)) * 0.2 : 0.6;
        out[k * 4] = p[0];
        out[k * 4 + 1] = p[1];
        out[k * 4 + 2] = p[2];
        out[k * 4 + 3] = encodeW(0.28 + 0.72 * lam, part.accent, part.tone);
        k++;
      };
      for (let j = 0; j < count[i]; j++) part.sample(rng, emit);
    });
    shuffle4(out, k, rng);
    return out;
  }
}

/** Pack a point's shade, accent flag and ink into its w (see the header). */
export function encodeW(shade: number, accent: boolean, ink: number) {
  const level = Math.max(0, Math.min(7, Math.round((1 - ink) * 8)));
  return Math.min(0.999, Math.max(0, shade)) + 2 * ((accent ? 1 : 0) + 2 * level);
}

/** Fisher–Yates over 4-float records. */
export function shuffle4(a: Float32Array, n: number, rng: Rng) {
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    for (let c = 0; c < 4; c++) {
      const t = a[i * 4 + c];
      a[i * 4 + c] = a[j * 4 + c];
      a[j * 4 + c] = t;
    }
  }
}
