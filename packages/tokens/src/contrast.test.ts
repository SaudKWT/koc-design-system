/**
 * Contrast conformance tests.
 *
 * These run in CI and fail the build. That is the entire point: accessibility
 * documented in a guideline is accessibility that drifts the first time someone
 * is in a hurry. Encoded as a test, a regression cannot merge.
 *
 * Target is WCAG 2.1 AA:
 *   - 4.5:1  normal text
 *   - 3.0:1  large text (>=18.66px bold or >=24px) and UI component boundaries
 *
 * Run: npm run test --workspace=@koc/tokens
 */

import { differenceCiede2000 } from "culori";
import { contrast } from "./color.js";
import { light, dark, type SemanticTheme } from "./semantic.js";
import { palette, chartSeries } from "./palette.js";

const AA_TEXT = 4.5;
const AA_UI = 3.0;

/**
 * Floor for decorative borders. NOT a WCAG number — 1.4.11 does not apply to
 * them (see auditTheme). This only asserts they didn't drift to invisible.
 */
const DECORATIVE_MIN = 1.25;

/**
 * Perceptual distance, ΔE2000. Roughly: <1 imperceptible, 2–10 perceptible at a
 * glance, 11–49 "more similar than opposite", 100 opposite.
 *
 * This is the right instrument for "are these two hues tellable apart", and WCAG
 * contrast is the wrong one — contrast measures a *luminance ratio*, so any two
 * colours sharing a perceptual lightness score ~1:1 no matter how different
 * their hues. In a perceptual ramp every `-600` shares a lightness by
 * construction, so a WCAG-based hue test reports total failure on a palette that
 * is in fact perfectly legible. An earlier revision of this file made exactly
 * that mistake.
 */
const deltaE = differenceCiede2000();

let failures = 0;
let checks = 0;

function check(
  label: string,
  fg: string,
  bg: string,
  min: number,
  note = "",
): void {
  checks++;
  const ratio = contrast(fg, bg);
  const pass = ratio >= min;
  if (!pass) failures++;
  const status = pass ? "  ok  " : " FAIL ";
  const detail = `${ratio.toFixed(2).padStart(5)}:1 (need ${min})`;
  console.log(
    `${status} ${label.padEnd(46)} ${detail}${note ? `  — ${note}` : ""}`,
  );
}

/** Assert two colours are perceptually distinguishable, by ΔE2000. */
function checkDistinct(
  label: string,
  a: string,
  b: string,
  min: number,
  note = "",
): void {
  checks++;
  const d = deltaE(a, b);
  const pass = d >= min;
  if (!pass) failures++;
  const status = pass ? "  ok  " : " FAIL ";
  const detail = `ΔE ${d.toFixed(1).padStart(5)} (need ${min})`;
  console.log(
    `${status} ${label.padEnd(46)} ${detail}${note ? `  — ${note}` : ""}`,
  );
}

/** Every foreground/background pair the semantic layer promises is legible. */
function auditTheme(name: string, t: SemanticTheme): void {
  console.log(`\n── ${name} ────────────────────────────────────────────────`);

  const pairs: Array<[string, string, string, number]> = [
    ["body text on background", t.foreground, t.background, AA_TEXT],
    ["card text on card", t["card-foreground"], t.card, AA_TEXT],
    ["popover text on popover", t["popover-foreground"], t.popover, AA_TEXT],
    ["primary label on primary", t["primary-foreground"], t.primary, AA_TEXT],
    ["secondary label on secondary", t["secondary-foreground"], t.secondary, AA_TEXT],
    ["muted text on muted", t["muted-foreground"], t.muted, AA_TEXT],
    ["muted text on background", t["muted-foreground"], t.background, AA_TEXT],
    ["accent label on accent", t["accent-foreground"], t.accent, AA_TEXT],
    ["destructive label on destructive", t["destructive-foreground"], t.destructive, AA_TEXT],
    ["success label on success", t["success-foreground"], t.success, AA_TEXT],
    ["warning label on warning", t["warning-foreground"], t.warning, AA_TEXT],
    ["info label on info", t["info-foreground"], t.info, AA_TEXT],
    ["sidebar text on sidebar", t["sidebar-foreground"], t.sidebar, AA_TEXT],
    ["sidebar accent label", t["sidebar-accent-foreground"], t["sidebar-accent"], AA_TEXT],
    ["sidebar primary label", t["sidebar-primary-foreground"], t["sidebar-primary"], AA_TEXT],
  ];
  for (const [label, fg, bg, min] of pairs) check(label, fg, bg, min);

  // Non-text contrast. The scope of WCAG 1.4.11 is narrower than it first looks:
  // it covers visual information "required to identify user interface components
  // and states" — not every line on the page.
  //
  //   - `border` draws card edges, dividers and table rules. Remove them and no
  //     control becomes unidentifiable. Decorative → out of scope. Held to a
  //     visibility floor only, so it can't silently drift to nothing.
  //   - `input` draws the boundary of a text field. It is the *only* cue that a
  //     control exists there. In scope → a hard 3:1.
  //
  // Conflating the two is why so many systems either ship invisible inputs or
  // heavy-handed card outlines. They are different tokens for a reason.
  check("border vs background (decorative)", t.border, t.background, DECORATIVE_MIN);
  check("input border vs background", t.input, t.background, AA_UI, "WCAG 1.4.11");
  check("input border vs card", t.input, t.card, AA_UI, "WCAG 1.4.11");
  check("focus ring vs background", t.ring, t.background, AA_UI, "WCAG 2.4.11");

  // Charts are read, not decorated. Each series must be resolvable against the
  // surface it is drawn on.
  for (let i = 1; i <= 5; i++) {
    check(`chart-${i} vs background`, t[`chart-${i}`], t.background, AA_UI);
  }
}

/**
 * Status colours must be distinguishable from *each other*, not merely legible
 * against the page. A dashboard where "success" and "warning" both clear AA
 * against the background but not against one another still misreports plant
 * state — and in an operations context that is the failure that matters.
 *
 * Threshold 15 ΔE: comfortably past "perceptible at a glance". Note this is a
 * floor, not a licence to encode meaning in colour alone — WCAG 1.4.1 still
 * requires every status to carry an icon or label, which is what makes the
 * tighter info/primary pair acceptable.
 */
function auditStatusSeparation(): void {
  console.log(`\n── status separation (ΔE2000) ─────────────────────────────`);
  const { success, warning, danger, info, primary } = palette;
  const combos: Array<[string, string, string]> = [
    ["success vs warning", success[600], warning[600]],
    ["success vs danger", success[600], danger[600]],
    ["warning vs danger", warning[600], danger[600]],
    ["success vs info", success[600], info[600]],
    ["info vs primary", info[600], primary[600]],
  ];
  for (const [label, a, b] of combos) checkDistinct(label, a, b, 15);
}

/**
 * Adjacent chart series are checked two ways, because they can fail two ways:
 *
 *   - ΔE catches "these look the same to a colour-sighted reader".
 *   - Luminance ratio catches "these collapse to the same grey" — which is what
 *     happens on a greyscale printout, on a failing projector, or to a reader
 *     with achromatopsia. Hue separation does nothing for any of them.
 *
 * A palette can pass either test alone and still be unreadable in the field.
 */
function auditChartSeparation(): void {
  console.log(`\n── chart series separation ────────────────────────────────`);
  for (let i = 0; i < chartSeries.length - 1; i++) {
    const [a, b] = [chartSeries[i], chartSeries[i + 1]];
    checkDistinct(`series ${i + 1} vs ${i + 2} (colour)`, a, b, 15);
    check(`series ${i + 1} vs ${i + 2} (greyscale)`, a, b, 1.2, "tonal");
  }
}

console.log("KOC Design System — contrast audit (WCAG 2.1 AA)");
auditTheme("LIGHT", light);
auditTheme("DARK", dark);
auditStatusSeparation();
auditChartSeparation();

console.log(
  `\n${"─".repeat(60)}\n${checks - failures}/${checks} passed` +
    (failures ? `, ${failures} FAILED` : "") + "\n",
);

if (failures > 0) {
  console.error(
    `✗ ${failures} contrast check(s) failed. Fix the token, not the test.\n`,
  );
  process.exit(1);
}
console.log("✓ All contrast checks passed.\n");
