/**
 * The few moving parts, as data. A worker can build a chapter but cannot send
 * a function back, so animated items carry a descriptor and the main thread
 * turns it into a per-frame transform here.
 */

import { m4, type M4 } from "./math";

export type Anim =
  /** Travelling block + top drive riding the drill line. a = [x, floorY, z, crownY]. */
  | { kind: "block" | "lines"; a: number[] }
  /** Windsock at the pole top. a = [x, y, z]. */
  | { kind: "sock"; a: number[] };

/** Block height above the floor: a slow trip, 6 m → 32 m and back. */
const travel = (t: number) => 6 + (Math.sin(t * 0.21) * 0.5 + 0.5) * 26;

export function animModel(anim: Anim): (t: number) => M4 {
  const a = anim.a;
  switch (anim.kind) {
    case "block":
      return (t) => m4.translation(a[0], a[1] + travel(t), a[2]);
    case "lines":
      // The drill-line band is unit height, stretched from the block to the crown.
      return (t) => {
        const y0 = a[1] + travel(t) + 1.2;
        return m4.compose(m4.translation(a[0], y0, a[2]), m4.scaling(1, a[3] - y0, 1));
      };
    case "sock":
      return (t) =>
        m4.compose(m4.translation(a[0], a[1], a[2]), m4.rotY(-0.9 + Math.sin(t * 0.7) * 0.18), m4.rotZ(-0.12 + Math.sin(t * 1.3) * 0.05));
  }
}
