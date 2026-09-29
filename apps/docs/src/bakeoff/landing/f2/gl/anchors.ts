/**
 * Where things are, without the things themselves: chapter centres, the
 * streak's glint points and the team hotspots. Dependency-free on purpose —
 * the page imports this for its first render, and the WebGL code (models,
 * renderer, engine) loads afterwards.
 */

import type { V3 } from "./math";

const ft = (x: number) => x * 0.3048;

export const CENTERS: V3[] = [
  [-900, 0, 0],
  [-300, 0, 0],
  [300, 0, 0],
  [900, 0, 0],
];

export const rel = (c: V3, p: V3): V3 => [c[0] + p[0], p[1], c[2] + p[2]];

/** Where the light-streak's glint sits in each chapter. */
export const FOCUS: V3[] = [
  rel(CENTERS[0], [0, 5.4, 0]),
  rel(CENTERS[1], [0, 5.6, 0]),
  rel(CENTERS[2], [2, 17.8, -43]),
  rel(CENTERS[3], [0, 4.0, 0]),
];

/** Rig pad (chapter IV) grade, and the drill floor above it (30 ft). */
export const PAD_Y = 3;
export const FLOOR = ft(30);
const A4 = (dx: number, yy: number, dz: number): V3 => [CENTERS[3][0] + dx, PAD_Y + yy, CENTERS[3][2] + dz];

/**
 * Team hotspots on the rig pad: which part of the pad each team is pinned to.
 * A constant, so the page can place them before the pad has finished building.
 */
export const TEAM_ANCHORS: Record<string, V3> = {
  EN01: A4(46, 4.5, -34), // the office caravan
  EN11: A4(-38, 5.5, -3), // the contracted power and mud-pump spread
  EN31: A4(-46, 7.5, 34), // water tank: logistics and water wells
  EN41: A4(-16, 8.2, 44), // windsock and muster point
  EN51: A4(0, FLOOR + ft(142) * 0.62, 0), // the mast
  EN61: A4(0, 4.5, 0), // the BOP stack and wellhead
  EN71: A4(22, 3.5, -6), // pipe racks: materials
  EN81: A4(20, 8.5, 36), // coiled tubing unit
};
