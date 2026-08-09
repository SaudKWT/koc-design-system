/**
 * Figma bridge — emits `dist/koc-tokens.figma.json`.
 *
 * WHY THIS EXISTS RATHER THAN A REST-API PUSH
 * -------------------------------------------
 * Figma's Variables REST API (`POST /v1/files/:key/variables`) is restricted to
 * full seats in **Enterprise** orgs. On any other plan there is no programmatic
 * write path into a file's variables, so the token bridge has to go through a
 * plugin. Tokens Studio reads this file and creates the variables for us.
 *
 * If KOC ever lands on Figma Enterprise, replace this with a direct REST push
 * and delete the manual import step — nothing else in the pipeline changes.
 *
 * WHY TOKENS STUDIO'S FORMAT AND NOT THE DTCG FILE WE ALREADY EMIT
 * ----------------------------------------------------------------
 * `dist/tokens.json` is W3C DTCG (`$value` / `$type`) and Tokens Studio's import
 * is happier with its own native shape (`value` / `type`) plus the `$themes` /
 * `$metadata` blocks that tell it which sets become which Figma **modes**.
 * Same source of truth, second serialisation — this file is generated, never
 * hand-edited, and the DTCG file stays the neutral interchange format.
 *
 * THE IMPORTANT PART: SEMANTIC TOKENS EMIT AS ALIASES
 * ---------------------------------------------------
 * `semantic.ts` is built on indirection — a component references `--primary`,
 * never `primary[600]`, and that is what lets dark mode be a re-mapping instead
 * of a second codebase. A naive export flattens that: every semantic token
 * lands in Figma as a loose hex, the relationship to the ramp is lost, and a
 * designer editing `primary/600` sees nothing change.
 *
 * So each semantic value is matched back against the palette and emitted as a
 * Tokens Studio reference — `{color.primary.600}` — falling back to a literal
 * only for values that genuinely aren't in a ramp (pure white, mostly). Figma
 * then builds real variable aliases and the indirection survives the crossing.
 */

import { palette, type PaletteName } from "./palette.js";
import { light, dark, type SemanticTheme } from "./semantic.js";
import { foundation } from "./foundation.js";
import { STEPS } from "./color.js";
import { KOC_PRIMARY } from "./brand.js";

/** Tokens Studio's native token node. `value` may be a literal or a `{ref}`. */
interface TsToken {
  value: string;
  type: string;
  description?: string;
}

type TsSet = Record<string, unknown>;

const paletteNames = Object.keys(palette) as PaletteName[];

/**
 * Reverse index: `#0060A9` → `color.primary.600`.
 *
 * First writer wins. The ramps are generated in a stable order and collisions
 * across ramps are near-impossible in OKLCH, but if two ever did collide the
 * earlier ramp is the more semantically meaningful owner (primary before
 * neutral before status hues), which is the order `palette` already declares.
 */
const byHex = new Map<string, string>();
for (const name of paletteNames) {
  for (const step of STEPS) {
    const hex = palette[name][step].toUpperCase();
    if (!byHex.has(hex)) byHex.set(hex, `color.${name}.${step}`);
  }
}

/** A semantic value as either a `{ramp.step}` reference or a bare hex. */
function aliasOrLiteral(value: string): string {
  const ref = byHex.get(value.toUpperCase());
  return ref ? `{${ref}}` : value;
}

/** One semantic theme as a Tokens Studio set. Becomes one Figma mode. */
function semanticSet(theme: SemanticTheme): TsSet {
  return Object.fromEntries(
    Object.entries(theme).map(([name, value]) => [
      name,
      { value: aliasOrLiteral(value), type: "color" } satisfies TsToken,
    ]),
  );
}

/**
 * `core` — the raw ramps and the non-colour foundations.
 *
 * Published so semantic aliases have something to point at, but designers are
 * meant to reach for the semantic set. Mark it `source` (not `enabled`) in the
 * themes below and Tokens Studio resolves the references without offering the
 * raw ramp steps as pickable variables — the same discipline `semantic.ts`
 * enforces in code, carried into the Figma variable picker.
 */
const core: TsSet = {
  color: Object.fromEntries(
    paletteNames.map((name) => [
      name,
      Object.fromEntries(
        STEPS.map((step) => [
          String(step),
          {
            value: palette[name][step],
            type: "color",
            description:
              name === "primary" && step === 600
                ? `Kuwait Oil Company brand blue — ${KOC_PRIMARY.source}`
                : undefined,
          } satisfies TsToken,
        ]),
      ),
    ]),
  ),
  spacing: Object.fromEntries(
    Object.entries(foundation.spacing).map(([k, v]) => [
      k,
      { value: v, type: "spacing" } satisfies TsToken,
    ]),
  ),
  radius: Object.fromEntries(
    Object.entries(foundation.radius).map(([k, v]) => [
      k === "DEFAULT" ? "default" : k,
      { value: v, type: "borderRadius" } satisfies TsToken,
    ]),
  ),
  fontSize: Object.fromEntries(
    Object.entries(foundation.fontSize).map(([k, v]) => [
      k,
      { value: v, type: "fontSizes" } satisfies TsToken,
    ]),
  ),
  fontWeight: Object.fromEntries(
    Object.entries(foundation.fontWeight).map(([k, v]) => [
      k,
      { value: String(v), type: "fontWeights" } satisfies TsToken,
    ]),
  ),
};

/**
 * Two themes over one collection = two modes on the Figma variable collection,
 * which is what makes a designer able to flip a frame light↔dark the same way
 * `.dark` flips it in CSS.
 */
const themes = [
  {
    id: "koc-light",
    name: "Light",
    group: "Theme",
    selectedTokenSets: { core: "source", "semantic/light": "enabled" },
  },
  {
    id: "koc-dark",
    name: "Dark",
    group: "Theme",
    selectedTokenSets: { core: "source", "semantic/dark": "enabled" },
  },
];

export const figmaTokens = {
  $metadata: {
    tokenSetOrder: ["core", "semantic/light", "semantic/dark"],
  },
  $themes: themes,
  core,
  "semantic/light": semanticSet(light),
  "semantic/dark": semanticSet(dark),
};

/** How many semantic tokens resolved to a ramp reference rather than a hex. */
export function aliasStats(): { aliased: number; literal: number } {
  const values = [...Object.values(light), ...Object.values(dark)];
  const aliased = values.filter((v) => byHex.has(v.toUpperCase())).length;
  return { aliased, literal: values.length - aliased };
}
