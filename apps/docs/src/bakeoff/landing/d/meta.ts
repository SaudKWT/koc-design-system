import type { DirectionMeta } from "../directions";

export const meta: DirectionMeta = {
  id: "d",
  name: "Datum",
  oneLiner:
    "One field of stipple specks that the page walks through as you scroll: a landscape flown over, with rigs and their directional wells, where the eight teams stand as survey stations on the line every depth is measured from; then a land rig and a cut-away of the reservoir forming beside the group's readouts; a calm, particle-free directory of every dashboard; and a wellhead to sign off.",
  references: [
    "Saud's reference — dotted topographic terrain with depth of field",
    "Anchor AI — motionsites.ai/?prompt=anchor-ai (high-density particle morphs; via Saud's screenshots)",
    "Terrain field spike (raw WebGL2), ported and grown into d/field-renderer.ts — scratchpad/terrain-spike/",
    "Survey drawings and well-log headers — ruled baselines, station stakes, graduations, '+' grid marks",
    "Engineering drawing title blocks — figure number, 'NTS', the one-line specification under each model",
    "Stipple engraving and geological block diagrams — lithology patterns (dots, laminae, brick)",
    "Dot-matrix and halftone display type — the dotted headline and sign-off, as a CSS mask over real text",
  ],
  components: ["Blur Fade (Magic UI) — https://21st.dev/@dillionverma/components/blur-fade"],
};
