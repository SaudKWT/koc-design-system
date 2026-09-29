/**
 * The wireline log strip's data: a seeded, deterministic, clean-room log.
 *
 * Idea (not code) from "Mechanical Waves" (@designali-in, 21st.dev), which has no licence:
 * traces generated once from seeded noise. Everything here is written from scratch, and
 * unlike the original there is no animation loop at all. The log is computed once, turned
 * into static SVG path strings and never touched again, so every reload and every
 * screenshot is identical.
 *
 * It is modelled as a log, not as noise. A bed sequence (shale, water sand, pay sand,
 * tight streak) is generated first, and each curve is that geology seen by a different
 * tool:
 *   GR   — gamma ray: shales hot, clean sands cold. Drawn with a variable-area fill from
 *          a shale baseline, so sands hang off the line as filled lobes.
 *   RES  — deep and shallow resistivity on a log scale. They separate in permeable beds
 *          (mud-filtrate invasion), which is what an engineer's eye looks for.
 *   ROP  — rate of penetration, a step line: fast in sand, slow in tight rock.
 *   CAL  — caliper against bit size: shales wash out (the hole opens past the bit), sands
 *          build mudcake (a touch under it). The washout is filled.
 *   N–D  — neutron porosity and bulk density on compatible scales. In shale the neutron
 *          reads high and the two separate; in the pay sands they cross over (the density
 *          reads more porosity than the neutron: the gas effect), and the crossover is filled.
 * The two marker tops sit on the tops of the two pay sands. Their labels ("Top A",
 * "Top B") are deliberately generic: never a real formation name.
 *
 * v2: the full log (all five tracks) is the footer's showpiece. CAL and N–D draw their bed
 * properties from a second PRNG, so GR, RES and ROP are exactly v1's traces.
 */

/** viewBox width. The SVG is stretched with preserveAspectRatio="none". */
export const LOG_W = 1200;
/** One lane's viewBox height. The footer draws each lane 40–56px tall (stretched, with
    non-scaling strokes), so the vertical scale is close to 1:1. */
export const LANE_H = 48;

const N = 960;
const PAD = 3;

export interface LogTop {
  label: string;
  /** Position along the log, 0–1. */
  at: number;
}

export interface WirelineLog {
  grFill: string;
  grLine: string;
  /** y of the shale baseline inside the GR lane. */
  grBase: number;
  resDeep: string;
  resShallow: string;
  rop: string;
  cal: string;
  /** The washout: filled between the bit-size line and the caliper where the hole is over-gauge. */
  calFill: string;
  /** y of the bit-size line inside the CAL lane. */
  bitSize: number;
  nphi: string;
  rhob: string;
  /** The crossover: filled between the two curves where the density reads the more porosity. */
  xover: string;
  tops: LogTop[];
}

/** Small, fast, seedable PRNG (mulberry32). */
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Kind = "shale" | "silt" | "sand" | "pay" | "tight";

interface BedProps {
  gr: number;
  /** GR change across the bed (coarsening / fining upward). */
  grRamp: number;
  /** Deep resistivity, ohm·m. */
  rd: number;
  /** Shallow / deep ratio. Above 1 in water sands, well below 1 in pay. */
  invasion: number;
  rop: number;
}

/** CAL and N–D, drawn from their own PRNG (see the header). */
interface BedExtra {
  /** Caliper, inches. */
  cal: number;
  /** Neutron porosity, v/v. */
  nphi: number;
  /** Bulk density, g/cc. */
  rhob: number;
}

function smooth(src: Float64Array, radius: number): Float64Array {
  const out = new Float64Array(src.length);
  for (let i = 0; i < src.length; i++) {
    let sum = 0;
    let n = 0;
    for (let j = i - radius; j <= i + radius; j++) {
      if (j < 0 || j >= src.length) continue;
      sum += src[j];
      n++;
    }
    out[i] = sum / n;
  }
  return out;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const yOf = (t: number) => PAD + (1 - clamp01(t)) * (LANE_H - 2 * PAD);
const xOf = (i: number) => (i / (N - 1)) * LOG_W;
const f1 = (v: number) => (Math.round(v * 10) / 10).toString();

/** Display ranges. GR is scaled so shales sit high in the lane and clean sands hang low. */
const GR_MIN = 10;
const GR_MAX = 140;
const GR_SHALE_BASE = 90;
const RES_LO = 0.3;
const RES_HI = 300;
const RES_MIN = Math.log10(RES_LO);
const RES_SPAN = Math.log10(RES_HI) - RES_MIN;
const ROP_MAX = 44;
const BIT = 8.5;
const CAL_LO = 6;
const CAL_HI = 13;
/* Limestone-compatible scales, as a composite log prints them: NPHI 0.45 → −0.15 and RHOB
   1.95 → 2.95 span the same lane, so the two overlay in clean, water-bearing rock. */
const NPHI_LO = -0.15;
const NPHI_HI = 0.45;
const RHOB_LO = 1.95;
const RHOB_HI = 2.95;

/** Each track's scale, as a log header prints it. Exported so the strip never restates a number. */
export const SCALES = {
  gr: { lo: GR_MIN, hi: GR_MAX, unit: "gAPI" },
  res: { lo: RES_LO, hi: RES_HI, unit: "Ω·m" },
  rop: { lo: 0, hi: ROP_MAX, unit: "m/h" },
  cal: { lo: CAL_LO, hi: CAL_HI, unit: "in" },
  /** The density scale; the neutron shares the lane on its compatible scale (0.45 → −0.15). */
  nd: { lo: RHOB_LO, hi: RHOB_HI, unit: "g/cc" },
} as const;

export const TOP_A = 0.38;
export const TOP_B = 0.645;

export function buildLog(seed = 0x5eed_0b1e): WirelineLog {
  const rnd = mulberry32(seed);
  const rnd2 = mulberry32(seed ^ 0x0ca1_1be5);
  const r2 = (a: number, b: number) => a + (b - a) * rnd2();
  const extra = (kind: Kind): BedExtra => {
    switch (kind) {
      case "shale":
        return { cal: BIT + r2(0.6, 3.2), nphi: r2(0.3, 0.4), rhob: r2(2.45, 2.58) };
      case "silt":
        return { cal: BIT + r2(0.1, 0.9), nphi: r2(0.2, 0.27), rhob: r2(2.4, 2.5) };
      case "sand":
        return { cal: BIT - r2(0.1, 0.35), nphi: r2(0.2, 0.27), rhob: r2(2.22, 2.34) };
      case "pay":
        return { cal: BIT - r2(0.15, 0.4), nphi: r2(0.07, 0.13), rhob: r2(2.12, 2.24) };
      case "tight":
        return { cal: BIT + r2(-0.05, 0.1), nphi: r2(0.02, 0.06), rhob: r2(2.6, 2.7) };
    }
  };
  const r = (a: number, b: number) => a + (b - a) * rnd();
  /** Roughly normal, mean 0, sd ≈ 1. */
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.73;

  const props = (kind: Kind): BedProps => {
    switch (kind) {
      case "shale":
        return { gr: r(96, 130), grRamp: r(-12, 12), rd: r(1.2, 3), invasion: r(0.85, 1), rop: r(9, 16) };
      case "silt":
        return { gr: r(72, 92), grRamp: r(-10, 10), rd: r(2, 5), invasion: r(1, 1.3), rop: r(15, 21) };
      case "sand":
        return { gr: r(34, 62), grRamp: r(-34, 34), rd: r(0.7, 2), invasion: r(1.6, 2.4), rop: r(24, 33) };
      case "pay":
        return { gr: r(22, 34), grRamp: r(4, 16), rd: r(35, 110), invasion: r(0.18, 0.32), rop: r(31, 40) };
      case "tight":
        return { gr: r(16, 28), grRamp: r(-4, 4), rd: r(60, 180), invasion: r(0.7, 0.85), rop: r(4, 8) };
    }
  };

  const gr = new Float64Array(N);
  const rd = new Float64Array(N);
  const rs = new Float64Array(N);
  const ropBase = new Float64Array(N);
  const cal = new Float64Array(N);
  const nphi = new Float64Array(N);
  const rhob = new Float64Array(N);

  const paint = (from: number, to: number, p: BedProps, x: BedExtra) => {
    const end = Math.min(N, to);
    for (let i = from; i < end; i++) {
      const u = end - from > 1 ? (i - from) / (end - from - 1) - 0.5 : 0;
      gr[i] = p.gr + p.grRamp * u;
      rd[i] = p.rd;
      rs[i] = p.rd * p.invasion;
      ropBase[i] = p.rop;
      cal[i] = x.cal;
      nphi[i] = x.nphi;
      rhob[i] = x.rhob;
    }
  };
  const bed = (kind: Kind) => [props(kind), extra(kind)] as const;

  // 1. A random bed sequence. Thin beds are commoner than thick ones.
  for (let i = 0; i < N; ) {
    const len = Math.round(3 * Math.pow(9, rnd()));
    const roll = rnd();
    const kind: Kind =
      roll < 0.44 ? "shale" : roll < 0.6 ? "silt" : roll < 0.9 ? "sand" : "tight";
    paint(i, i + len, ...bed(kind));
    i += len;
  }

  // 2. Two reservoir sands, each sealed by a clean shale. Their tops are the markers.
  const at = (u: number) => Math.round(u * (N - 1));
  paint(at(TOP_A - 0.03), at(TOP_A), ...bed("shale"));
  paint(at(TOP_A), at(TOP_A + 0.05), ...bed("pay"));
  paint(at(TOP_A + 0.05), at(TOP_A + 0.056), ...bed("tight"));
  paint(at(TOP_A + 0.056), at(TOP_A + 0.092), ...bed("pay"));
  paint(at(TOP_A + 0.092), at(TOP_A + 0.11), ...bed("shale"));
  paint(at(TOP_B - 0.028), at(TOP_B), ...bed("shale"));
  paint(at(TOP_B), at(TOP_B + 0.058), ...bed("pay"));
  paint(at(TOP_B + 0.058), at(TOP_B + 0.072), ...bed("shale"));

  // 3. Tool response: a slow drift (compaction, bed-scale heterogeneity) under short-range
  //    correlated noise, then the tool's vertical resolution — a blur that rounds the bed
  //    boundaries, so the trace reads as rock and not as a square wave.
  let nGr = 0;
  let drift = 0;
  let nRes = 0;
  let nSh = 0;
  for (let i = 0; i < N; i++) {
    nGr = 0.6 * nGr + gauss() * 5;
    drift = 0.985 * drift + gauss() * 1.3;
    nRes = 0.7 * nRes + gauss() * 0.07;
    nSh = 0.5 * nSh + gauss() * 0.05;
    gr[i] += nGr + drift + gauss() * 2.2;
    rd[i] = Math.log10(rd[i]) + nRes;
    rs[i] = Math.log10(rs[i]) + nRes * 0.8 + nSh;
  }
  const grS = smooth(smooth(gr, 2), 1);
  const rdS = smooth(smooth(rd, 2), 1);
  const rsS = smooth(rs, 1);
  // CAL and N–D take their noise from the second PRNG, for the same reason.
  const gauss2 = () => (rnd2() + rnd2() + rnd2() + rnd2() - 2) * 1.73;
  let nCal = 0;
  let nNd = 0;
  for (let i = 0; i < N; i++) {
    nCal = 0.75 * nCal + gauss2() * 0.12;
    nNd = 0.6 * nNd + gauss2() * 0.008;
    cal[i] += nCal + gauss2() * 0.05;
    nphi[i] += nNd + gauss2() * 0.006;
    rhob[i] += nNd * 1.4 + gauss2() * 0.012;
  }
  const calS = smooth(smooth(cal, 2), 1);
  const nphiS = smooth(smooth(nphi, 2), 1);
  const rhobS = smooth(smooth(rhob, 2), 1);

  // 4. Paths.
  const grT = (v: number) => (v - GR_MIN) / (GR_MAX - GR_MIN);
  const grY = Array.from(grS, (v) => yOf(grT(v)));
  const grBase = yOf(grT(GR_SHALE_BASE));
  let grLine = "";
  let grFill = `M0,${f1(grBase)}`;
  for (let i = 0; i < N; i++) {
    const x = f1(xOf(i));
    grLine += `${i === 0 ? "M" : "L"}${x},${f1(grY[i])}`;
    // Variable area: only the deflection toward sand (downward here) is filled.
    grFill += `L${x},${f1(Math.max(grY[i], grBase))}`;
  }
  grFill += `L${LOG_W},${f1(grBase)}Z`;

  const resPath = (src: Float64Array) => {
    let d = "";
    for (let i = 0; i < N; i++) {
      d += `${i === 0 ? "M" : "L"}${f1(xOf(i))},${f1(yOf((src[i] - RES_MIN) / RES_SPAN))}`;
    }
    return d;
  };

  // ROP is reported per drilled interval, so it steps.
  let rop = "";
  for (let i = 0; i < N; ) {
    const len = Math.round(r(3, 9));
    const v = ropBase[i] + gauss() * 2.4;
    const y = f1(yOf(v / ROP_MAX));
    rop += i === 0 ? `M0,${y}` : `V${y}`;
    i = Math.min(N - 1, i + len);
    rop += `H${f1(xOf(i))}`;
    if (i === N - 1) break;
  }

  // Two curves and the fill between them where `over` sits above `under` (smaller y).
  const pair = (over: number[], under: number[]) => {
    let a = "";
    let b = "";
    let fill = "";
    for (let i = 0; i < N; i++) {
      const x = f1(xOf(i));
      a += `${i === 0 ? "M" : "L"}${x},${f1(over[i])}`;
      b += `${i === 0 ? "M" : "L"}${x},${f1(under[i])}`;
      fill += `${i === 0 ? "M" : "L"}${x},${f1(Math.min(over[i], under[i]))}`;
    }
    for (let i = N - 1; i >= 0; i--) fill += `L${f1(xOf(i))},${f1(under[i])}`;
    return { a, b, fill: `${fill}Z` };
  };

  const calT = (v: number) => (v - CAL_LO) / (CAL_HI - CAL_LO);
  const bitSize = yOf(calT(BIT));
  const calLane = pair(
    Array.from(calS, (v) => yOf(calT(v))),
    Array.from({ length: N }, () => bitSize),
  );
  // Density-porosity plotting above the neutron is the crossover.
  const nd = pair(
    Array.from(rhobS, (v) => yOf((RHOB_HI - v) / (RHOB_HI - RHOB_LO))),
    Array.from(nphiS, (v) => yOf((v - NPHI_LO) / (NPHI_HI - NPHI_LO))),
  );

  return {
    cal: calLane.a,
    calFill: calLane.fill,
    bitSize,
    rhob: nd.a,
    nphi: nd.b,
    xover: nd.fill,
    grFill,
    grLine,
    grBase,
    resDeep: resPath(rdS),
    resShallow: resPath(rsS),
    rop,
    tops: [
      { label: "Top A", at: TOP_A },
      { label: "Top B", at: TOP_B },
    ],
  };
}
