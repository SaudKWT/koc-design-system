import type { DirectionMeta } from "../directions";

export const meta: DirectionMeta = {
  id: "h2",
  name: "Asset View · v2",
  oneLiner:
    "Mineralsoft's operations dashboard as a daily launcher: search in the header, every KPI and all 28 dashboards on the first screen with Pinned and Recent in its asset rail, and the true-scale cutaway of a Burgan-type anticline moved to a large footer.",
  references: [
    "Ron Design Lab — Mineralsoft oil & gas operations dashboard — https://rondesignlab.com/cases/mineralsoft-oil-gas-operations-dashboard-ui",
    // Stratigraphy: names and order verified; depths are illustrative (see scene/strata.ts).
    "Burgan Field (reservoirs, domal structure) — https://en.wikipedia.org/wiki/Burgan_Field",
    "Sequence stratigraphy of the Burgan and Mauddud formations, Kuwait — https://www.researchgate.net/publication/261651269",
    "Assessment of the petroleum system of the Arabian–Iranian Basin in Kuwait (Wasia/Thamama/Jurassic reservoirs) — https://www.tandfonline.com/doi/full/10.1080/27669645.2021.1976930",
    "Geological, structural and geochemical aspects of the main aquifer systems in Kuwait (Kuwait Group, Hasa Group) — https://www.researchgate.net/publication/259800652",
  ],
  // Nothing from 21st.dev. Every Mineralsoft element is re-drawn in CSS/SVG,
  // and the 3D is raw WebGL2 in ./scene.
  components: [],
};
