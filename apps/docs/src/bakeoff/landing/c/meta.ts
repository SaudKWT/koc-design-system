import type { DirectionMeta } from "../directions";

export const meta: DirectionMeta = {
  id: "c",
  name: "Drill Floor",
  oneLiner:
    "The driller's console for the 06:30 check: one dial and seven readouts on a dark faceplate, and every dashboard of all eight teams on one screen beneath it.",
  references: [
    "CoMinVi — https://www.awwwards.com/sites/cominvi (a static gauge bezel of 180 radial ticks → the budget dial)",
    "Exebenus — https://www.awwwards.com/sites/exebenus (a bordered KPI strip docked across the hero; the plain 'On pace' vocabulary)",
    "Space Hub — https://www.awwwards.com/sites/space-hub (L-bracket viewfinder corners → the faceplate frame and the snapping viewfinder)",
    "Cerebrium — https://www.awwwards.com/sites/cerebrium (mono LABEL / value readouts)",
    "Wise Design — https://www.awwwards.com/sites/wise-design (a 4×2 grid of uniform tiles, all eight in one viewport — as real links)",
    "Terminal Industries — https://www.awwwards.com/sites/terminal-industries (the numbered entry card → the panel header)",
    "Vista Energy — https://www.awwwards.com/sites/vista-energy (the mini production bar chart → 12-bar micro histograms)",
  ],
  components: [
    "Grid Pattern (Magic UI) — https://21st.dev/@dillionverma/components/grid-pattern",
    "Status (Kibo UI) — https://21st.dev/@haydenbleasel/components/status",
    "Command (shadcn, reused as @koc/command) — https://21st.dev/@shadcn/components/command",
  ],
};
