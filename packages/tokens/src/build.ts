/**
 * Token build.
 *
 * Emits, from the one TypeScript source of truth:
 *
 *   dist/koc-tokens.css  — CSS custom properties + Tailwind v4 `@theme inline`
 *   dist/tokens.json     — W3C Design Tokens (DTCG) format, for Figma et al.
 *   dist/report.json     — measured OKLCH + contrast for every colour
 *
 * Nothing downstream hand-writes a hex. If a colour is wrong, it is wrong here.
 *
 * Run: npm run build --workspace=@koc/tokens
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { palette, chartSeries, type PaletteName } from "./palette.js";
import { light, dark, type SemanticTheme } from "./semantic.js";
import { foundation } from "./foundation.js";
import { toOklchCss, describe, STEPS } from "./color.js";
import { KOC_PRIMARY, KOC_LOGO, KOC_LEGACY_STACK } from "./brand.js";
import { figmaTokens, aliasStats } from "./figma.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "..", "dist");
mkdirSync(DIST, { recursive: true });

const BANNER = `/**
 * KOC Design System — design tokens
 * GENERATED FILE. Do not edit.
 *
 * Source: packages/tokens/src/*.ts    Regenerate: npm run build:tokens
 *
 * Brand anchor: ${KOC_PRIMARY.value} (${KOC_PRIMARY.source})
 */`;

/** Render a semantic theme as CSS custom properties. */
function themeVars(theme: SemanticTheme, indent = "  "): string {
  return Object.entries(theme)
    .map(([k, v]) => `${indent}--${k}: ${toOklchCss(v)};`)
    .join("\n");
}

/** Render one palette ramp as CSS custom properties. */
function rampVars(name: PaletteName, indent = "  "): string {
  return STEPS.map(
    (s) => `${indent}--koc-${name}-${s}: ${toOklchCss(palette[name][s])};`,
  ).join("\n");
}

const paletteNames = Object.keys(palette) as PaletteName[];

// ── koc-tokens.css ──────────────────────────────────────────────────────────
//
// Colours are emitted as OKLCH rather than hex. Tailwind v4 and shadcn both
// expect it, and it means a consumer can nudge lightness with a colour-mix()
// without the hue drifting the way it does in sRGB.

const css = `${BANNER}

/* ── Raw palette ────────────────────────────────────────────────────────────
 * The full ramps. Available to any consumer, but prefer the semantic tokens
 * below — those are what re-theme correctly in dark mode.
 */
:root {
${paletteNames.map((n) => rampVars(n)).join("\n\n")}

  /* Categorical chart series (theme-independent reference copies) */
${chartSeries.map((c, i) => `  --koc-chart-series-${i + 1}: ${toOklchCss(c)};`).join("\n")}
}

/* ── Semantic tokens: light ─────────────────────────────────────────────────
 * Names follow the shadcn/ui contract exactly, so any shadcn, Origin UI or
 * Kibo UI component is automatically on-brand with no restyling.
 */
:root {
${themeVars(light)}

  --radius: ${foundation.radius.DEFAULT};
}

/* ── Semantic tokens: dark ──────────────────────────────────────────────────
 * A distinct mapping, not an inversion. 'primary' lifts 600 -> 400 because
 * ${KOC_PRIMARY.value} reaches only ~3.2:1 on a dark surface and would fail AA.
 */
.dark {
${themeVars(dark)}
}

/* ── Tailwind v4 theme bridge ───────────────────────────────────────────────
 * '@theme inline' maps our tokens onto Tailwind's colour namespace, so
 * 'bg-primary', 'text-muted-foreground', 'border-border' etc. all resolve.
 */
@theme inline {
${Object.keys(light)
  .map((k) => `  --color-${k}: var(--${k});`)
  .join("\n")}

${paletteNames
  .map((n) =>
    STEPS.map(
      (s) => `  --color-koc-${n}-${s}: var(--koc-${n}-${s});`,
    ).join("\n"),
  )
  .join("\n")}

  --font-sans: ${foundation.fontFamily.sans.join(", ")};
  --font-mono: ${foundation.fontFamily.mono.join(", ")};

${Object.entries(foundation.fontSize)
  .map(([k, v]) => `  --text-${k}: ${v};`)
  .join("\n")}

${Object.entries(foundation.radius)
  .map(([k, v]) => `  --radius-${k === "DEFAULT" ? "DEFAULT" : k}: ${v};`)
  .join("\n")}

${Object.entries(foundation.shadow)
  .map(([k, v]) => `  --shadow-${k === "DEFAULT" ? "DEFAULT" : k}: ${v};`)
  .join("\n")}

${Object.entries(foundation.screens)
  .map(([k, v]) => `  --breakpoint-${k}: ${v};`)
  .join("\n")}

${Object.entries(foundation.duration)
  .map(([k, v]) => `  --duration-${k === "DEFAULT" ? "DEFAULT" : k}: ${v};`)
  .join("\n")}

${Object.entries(foundation.easing)
  .map(([k, v]) => `  --ease-${k === "DEFAULT" ? "DEFAULT" : k}: ${v};`)
  .join("\n")}
}

/* ── Base layer ─────────────────────────────────────────────────────────────*/
@layer base {
  * {
    border-color: var(--border);
  }

  body {
    background-color: var(--background);
    color: var(--foreground);
    font-family: var(--font-sans);
    font-size: ${foundation.fontSize.base};
    line-height: ${foundation.lineHeight.normal};
    /* Inter's defaults leave gaps at UI sizes; contextual alternates close them. */
    font-feature-settings: "cv02", "cv03", "cv04", "cv11";
    -webkit-font-smoothing: antialiased;
  }

  /* Numbers in dashboards must align on the decimal. Without tabular figures a
   * column of production volumes shimmies by digit and can't be scanned. */
  .tabular,
  table tbody td,
  [data-slot="kpi-value"] {
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum";
  }

  /* A single visible focus style, everywhere. Keyboard users are the whole
   * reason this exists — never remove it without a replacement. */
  :focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }

  /* Respect the OS-level reduced-motion setting. Vestibular disorders are real
   * and this is a tool people use all day. */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
}
`;

writeFileSync(join(DIST, "koc-tokens.css"), css);

// ── tokens.json (DTCG) ──────────────────────────────────────────────────────
//
// W3C Design Tokens Community Group format — the interchange format Figma
// Variables, Style Dictionary and Tokens Studio all read. This is the file that
// lets the design side stay in sync without hand-copying hexes.

interface DtcgToken {
  $value: string;
  $type: string;
  $description?: string;
}

const dtcg: Record<string, unknown> = {
  $description: `KOC Design System tokens. Brand anchor ${KOC_PRIMARY.value} — ${KOC_PRIMARY.source}`,
  color: {
    ...Object.fromEntries(
      paletteNames.map((n) => [
        n,
        Object.fromEntries(
          STEPS.map((s) => [
            String(s),
            {
              $value: palette[n][s],
              $type: "color",
              $description:
                n === "primary" && s === 600
                  ? "Kuwait Oil Company brand blue — the anchor for the entire system"
                  : undefined,
            } satisfies DtcgToken,
          ]),
        ),
      ]),
    ),
  },
  semantic: {
    light: Object.fromEntries(
      Object.entries(light).map(([k, v]) => [
        k,
        { $value: v, $type: "color" } satisfies DtcgToken,
      ]),
    ),
    dark: Object.fromEntries(
      Object.entries(dark).map(([k, v]) => [
        k,
        { $value: v, $type: "color" } satisfies DtcgToken,
      ]),
    ),
  },
  dimension: {
    spacing: Object.fromEntries(
      Object.entries(foundation.spacing).map(([k, v]) => [
        k,
        { $value: v, $type: "dimension" } satisfies DtcgToken,
      ]),
    ),
    radius: Object.fromEntries(
      Object.entries(foundation.radius).map(([k, v]) => [
        k,
        { $value: v, $type: "dimension" } satisfies DtcgToken,
      ]),
    ),
  },
  typography: {
    fontSize: Object.fromEntries(
      Object.entries(foundation.fontSize).map(([k, v]) => [
        k,
        { $value: v, $type: "dimension" } satisfies DtcgToken,
      ]),
    ),
    fontWeight: Object.fromEntries(
      Object.entries(foundation.fontWeight).map(([k, v]) => [
        k,
        { $value: v, $type: "fontWeight" } satisfies DtcgToken,
      ]),
    ),
  },
};

writeFileSync(join(DIST, "tokens.json"), JSON.stringify(dtcg, null, 2));

// ── koc-tokens.figma.json (Tokens Studio) ───────────────────────────────────
//
// The design-side half of the bridge. Figma's Variables REST API is Enterprise
// only, so the crossing goes through the Tokens Studio plugin instead — see
// figma.ts for why this is a second serialisation rather than a reuse of the
// DTCG file above. Code → Figma is one-way by design: nothing ever reads back.

writeFileSync(
  join(DIST, "koc-tokens.figma.json"),
  JSON.stringify(figmaTokens, null, 2),
);

// ── report.json ─────────────────────────────────────────────────────────────
//
// The measured truth about every colour: OKLCH coordinates and contrast against
// white and black. The docs site renders this, so the published contrast figures
// are computed rather than transcribed — and therefore cannot go stale.

const report = {
  generatedFrom: "packages/tokens/src",
  brand: {
    primary: KOC_PRIMARY,
    logo: KOC_LOGO,
    legacy: KOC_LEGACY_STACK,
  },
  palette: Object.fromEntries(
    paletteNames.map((n) => [
      n,
      Object.fromEntries(STEPS.map((s) => [s, describe(palette[n][s])])),
    ]),
  ),
  chartSeries: chartSeries.map(describe),
  themes: {
    light: Object.fromEntries(
      Object.entries(light).map(([k, v]) => [k, describe(v)]),
    ),
    dark: Object.fromEntries(
      Object.entries(dark).map(([k, v]) => [k, describe(v)]),
    ),
  },
};

writeFileSync(join(DIST, "report.json"), JSON.stringify(report, null, 2));

// ── summary ─────────────────────────────────────────────────────────────────

const rampCount = paletteNames.length;
const tokenCount =
  rampCount * STEPS.length +
  Object.keys(light).length +
  Object.keys(dark).length +
  Object.keys(foundation.spacing).length +
  Object.keys(foundation.fontSize).length;

console.log(`✓ @koc/tokens built`);
console.log(`  ${rampCount} ramps × ${STEPS.length} steps  ·  ~${tokenCount} tokens`);
console.log(`  anchor  ${KOC_PRIMARY.value}  →  koc-primary-600  (verified exact)`);
const alias = aliasStats();

console.log(`  dist/koc-tokens.css`);
console.log(`  dist/tokens.json           (DTCG)`);
console.log(`  dist/koc-tokens.figma.json (Tokens Studio — 2 modes)`);
console.log(
  `    ${alias.aliased} semantic tokens alias the ramp, ${alias.literal} literal`,
);
console.log(`  dist/report.json`);

// The anchor surviving the pipeline byte-exact is the one invariant that must
// never break: if this fires, the ramp generator has started approximating the
// brand colour rather than preserving it.
if (palette.primary[600] !== KOC_PRIMARY.value.toUpperCase()) {
  console.error(
    `\n✗ ANCHOR DRIFT: primary-600 is ${palette.primary[600]}, expected ${KOC_PRIMARY.value}`,
  );
  process.exit(1);
}
