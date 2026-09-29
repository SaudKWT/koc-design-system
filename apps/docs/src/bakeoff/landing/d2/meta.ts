import type { DirectionMeta } from "../directions";

export const meta: DirectionMeta = {
  id: "d2",
  name: "Datum",
  oneLiner:
    "A survey sheet you can work from every morning: find with Ctrl+K, the eight readouts as one strip of instrument cells, your pinned and recent dashboards, and every link hanging from its team's station on two ruled datum lines — all in the first screen and a half — while the stipple field, its rigs and wells, and the morphs into a rig, a reservoir, a bit and a wellhead, wait in a footer you scroll into on purpose.",
  references: [
    "Saud's reference — dotted topographic terrain with depth of field",
    "Anchor AI — motionsites.ai/?prompt=anchor-ai (high-density particle morphs; via Saud's screenshots)",
    "Terrain field spike (raw WebGL2), ported and grown into d2/field-renderer.ts — scratchpad/terrain-spike/",
    "Survey drawings and well-log headers — ruled baselines, station stakes, graduations, '+' grid marks",
    "Engineering drawing title blocks — figure number, 'NTS', the one-line specification under each model",
    "Stipple engraving and geological block diagrams — lithology patterns (dots, laminae, brick)",
    "Dot-matrix and halftone display type — the dotted headline and sign-off, as a CSS mask over real text",
  ],
  components: ["Blur Fade (Magic UI) — https://21st.dev/@dillionverma/components/blur-fade"],
};
