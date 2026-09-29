import type { DirectionMeta } from "../directions";

export const meta: DirectionMeta = {
  id: "f",
  name: "Burgan",
  oneLiner:
    "Kuwait's oil history as a fog-soft WebGL diorama — Bahra 1936, Burgan 1938, the first cargo 1946 — that opens on a rig pad today, where the eight teams are pinned as hotspots leading to their dashboards.",
  references: [
    "Aramco — The birth of oil (the brief) — https://www.aramco.com/en/about-us/our-history/the-birth-of-oil",
  ],
  // Nothing ported from 21st.dev: the hotspot ring, chapter index and Motion
  // toggle are Aramco's craft rebuilt in CSS + rAF; the 3D is raw WebGL2.
  components: [],
};
