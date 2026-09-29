import type { DirectionMeta } from "../directions";

export const meta: DirectionMeta = {
  id: "f2",
  name: "Burgan v2",
  oneLiner:
    "Burgan for daily use: find field, compact KOC and group figures, your pinned and recent dashboards, and all 28 links on the first screen — with the fog diorama and its four history chapters moved whole into a large footer.",
  references: [
    "Aramco — The birth of oil (v1's brief) — https://www.aramco.com/en/about-us/our-history/the-birth-of-oil",
  ],
  // Nothing ported from 21st.dev: the diorama is raw WebGL2, the rest is
  // @koc/ui, Tailwind and the shared v2 helpers.
  components: [],
};
