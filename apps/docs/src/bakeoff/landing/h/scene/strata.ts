/**
 * The geology the cutaway is cut from — one table, read by the WebGL shader,
 * the label overlay and the SVG fallback, so the three can never disagree.
 *
 * NAMES AND ORDER are Kuwait's published lithostratigraphy, youngest first:
 * Kuwait Group; the Hasa Group (Dammam, Rus, Umm Er Radhuma); the Aruma Group;
 * the Wasia Group (Mishrif, Rumaila, Ahmadi, Wara, Mauddud, Burgan); the
 * Thamama Group (Shuaiba, Zubair, Ratawi, Minagish, Makhul–Sulaiy); then the
 * Jurassic (Hith–Gotnia evaporites, Najmah–Sargelu, Marrat). Checked against
 * the Burgan Field literature and published Kuwait stratigraphic columns
 * (sources in ../meta.ts).
 *
 * DEPTHS ARE ILLUSTRATIVE. They are flank depths chosen to keep each unit's
 * thickness plausible relative to its neighbours; they are not any KOC well's
 * tops and must not be read as one. The page says so wherever depths show.
 *
 * Units: feet, true vertical depth, positive down. World Y is −depth.
 */

export type Lithology =
  | "sand" // unconsolidated sand & gravel
  | "sandstone"
  | "shale"
  | "limestone"
  | "dolomite"
  | "anhydrite";

export interface Formation {
  name: string;
  /** Short label for the cutaway, where the full name will not fit. */
  label: string;
  group: string;
  /** Flank top, ft TVD. The anticline lifts it toward the crest. */
  top: number;
  lith: Lithology;
  /** A producing interval — shaded where it sits above its oil–water contact. */
  reservoir?: boolean;
  /** Show a label on the cutaway. The rest are too thin to caption legibly. */
  labelled?: boolean;
}

export const FORMATIONS: Formation[] = [
  { name: "Kuwait Group", label: "Kuwait Gp.", group: "Kuwait", top: 0, lith: "sand", labelled: true },
  { name: "Dammam", label: "Dammam", group: "Hasa", top: 650, lith: "limestone", labelled: true },
  { name: "Rus", label: "Rus", group: "Hasa", top: 950, lith: "anhydrite", labelled: true },
  { name: "Umm Er Radhuma", label: "Umm Er Radhuma", group: "Hasa", top: 1200, lith: "dolomite", labelled: true },
  { name: "Aruma Group", label: "Aruma Gp.", group: "Aruma", top: 2250, lith: "shale" },
  { name: "Mishrif", label: "Mishrif", group: "Wasia", top: 2950, lith: "limestone", reservoir: true, labelled: true },
  { name: "Rumaila–Ahmadi", label: "Ahmadi", group: "Wasia", top: 3150, lith: "shale" },
  { name: "Wara", label: "Wara", group: "Wasia", top: 3430, lith: "sandstone", reservoir: true, labelled: true },
  { name: "Mauddud", label: "Mauddud", group: "Wasia", top: 3580, lith: "limestone", reservoir: true, labelled: true },
  { name: "Burgan", label: "Burgan", group: "Wasia", top: 3760, lith: "sandstone", reservoir: true, labelled: true },
  { name: "Shuaiba", label: "Shuaiba", group: "Thamama", top: 4750, lith: "limestone" },
  { name: "Zubair", label: "Zubair", group: "Thamama", top: 4950, lith: "sandstone", reservoir: true, labelled: true },
  { name: "Ratawi", label: "Ratawi", group: "Thamama", top: 6250, lith: "shale", labelled: true },
  { name: "Minagish", label: "Minagish", group: "Thamama", top: 6900, lith: "limestone", reservoir: true, labelled: true },
  { name: "Makhul–Sulaiy", label: "Makhul–Sulaiy", group: "Thamama", top: 7450, lith: "limestone" },
  // Below the block's base. Reached only by the deep well that runs out of it.
  { name: "Hith–Gotnia", label: "Hith–Gotnia", group: "Jurassic", top: 8600, lith: "anhydrite" },
  { name: "Najmah–Sargelu", label: "Najmah–Sargelu", group: "Jurassic", top: 10100, lith: "limestone" },
  { name: "Marrat", label: "Marrat", group: "Jurassic", top: 10900, lith: "dolomite", reservoir: true },
];

export const LITH_CODE: Record<Lithology, number> = {
  sand: 0,
  sandstone: 1,
  shale: 2,
  limestone: 3,
  dolomite: 4,
  anhydrite: 5,
};

/** The block: x east, z south, y up. Feet. */
export const BLOCK = {
  x0: -5000,
  x1: 5000,
  z0: -4000,
  z1: 4000,
  depth: 8000,
  /** The cut: the south-east quarter is removed from surface down to `cutDepth`. */
  notchX: -1500,
  notchZ: 0,
  cutDepth: 6000,
} as const;

/**
 * A Burgan-type domal anticline. Crest on the section face, so the face shows
 * the full fold. Amplitude grows with depth: the young, shallow units are
 * barely folded, which is what real growth structures look like.
 */
export const DOME = {
  cx: 2000,
  cz: 0,
  sx: 3600,
  sz: 3000,
  amplitude: 620,
  /** Depth over which the fold reaches full amplitude. */
  growth: 4200,
} as const;

/**
 * Oil–water contacts: flat, as a contact is. One per trap level, applied to
 * every `reservoir` formation whose flank top is at or below `fromTop`.
 */
export const CONTACTS = [
  { fromTop: 2900, owc: 3330 }, // Mishrif
  { fromTop: 3400, owc: 4080 }, // Wara, Mauddud, Burgan share a contact
  { fromTop: 4900, owc: 5260 }, // Zubair
  { fromTop: 6800, owc: 7020 }, // Minagish
  { fromTop: 10800, owc: 11400 }, // Marrat
] as const;

export function owcFor(f: Formation): number {
  if (!f.reservoir) return -1;
  let owc = -1;
  for (const c of CONTACTS) if (f.top >= c.fromTop) owc = c.owc;
  return owc;
}

/** Uplift (ft) of the strata at (x, z) and true depth d — the fold. */
export function uplift(x: number, z: number, depth: number): number {
  const dx = (x - DOME.cx) / DOME.sx;
  const dz = (z - DOME.cz) / DOME.sz;
  const g = Math.exp(-0.5 * (dx * dx + dz * dz));
  const grow = Math.min(1, Math.max(0, depth / DOME.growth));
  return DOME.amplitude * g * grow;
}

/** The stratigraphic depth a point sits at, i.e. its depth undone by the fold. */
export function stratDepth(x: number, z: number, depth: number): number {
  return depth + uplift(x, z, depth);
}

/**
 * True depth of a formation top at (x, z). Solved by fixed-point iteration on
 * `stratDepth(x, z, d) = top`, which converges in a few steps because the fold
 * is gentle.
 */
export function topDepthAt(top: number, x: number, z: number): number {
  let d = top;
  for (let i = 0; i < 8; i++) d = top - uplift(x, z, d);
  return Math.max(0, d);
}

export function formationAt(x: number, z: number, depth: number): Formation {
  const s = stratDepth(x, z, depth);
  let f = FORMATIONS[0];
  for (const g of FORMATIONS) if (s >= g.top) f = g;
  return f;
}

export const fmtFt = (n: number) => `${Math.round(n).toLocaleString("en-GB")} ft`;
