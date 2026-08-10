/**
 * Motion-scale check.
 *
 * Fails if a component hardcodes a duration or easing that is not on the KOC
 * motion scale.
 *
 * WHY
 * ---
 * `foundation.ts` has carried a full motion scale — five durations, five easing
 * curves, each with a documented purpose — since the first commit. Nothing
 * referenced it. Every component installed from the shadcn ecosystem arrived
 * with the animation library's defaults (`duration-200`, `duration-500`,
 * `ease-linear`) and kept them, so the scale sat in the token package looking
 * finished while the actual UI ignored it.
 *
 * A token layer that exists but is not wired is worse than one that does not
 * exist, because it reads as done. And the failure is invisible: nothing looks
 * broken, the timings are just arbitrary and slightly inconsistent with each
 * other — which is exactly the class of thing nobody files a bug about.
 *
 * The proof this needs to be automatic rather than remembered: while fixing the
 * six literals that shipped with the installed components, a `duration-200` was
 * written by hand into app-shell.tsx in the same session. Intent does not
 * survive; a failing build does.
 *
 * Run:  npm run check:motion
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { foundation } from "./foundation.js";

/**
 * Utility suffixes that actually resolve to CSS.
 *
 * `DEFAULT` is emitted as `duration-base`, because `duration-DEFAULT` is not a
 * name anyone would write and Tailwind would not generate it. This set must
 * track the @utility rules emitted by build.ts — if they disagree, the check
 * either permits classes that do nothing or rejects ones that work.
 */
function allowedSuffixes(): { durations: Set<string>; easings: Set<string> } {
  return {
    durations: new Set(
      Object.keys(foundation.duration).map((k) => (k === "DEFAULT" ? "base" : k)),
    ),
    easings: new Set(
      Object.keys(foundation.easing).map((k) => (k === "DEFAULT" ? "base" : k)),
    ),
  };
}

export interface MotionViolation {
  file: string;
  line: number;
  token: string;
  kind: "duration" | "easing";
}

/**
 * Bare-number durations (`duration-200`), arbitrary values (`duration-[250ms]`,
 * `ease-[cubic-bezier(...)]`) and Tailwind's built-in easing keywords are all
 * off-scale. Anything matching a key in `foundation.duration` / `.easing` is
 * fine — that IS the scale.
 */
export function findMotionViolations(file: string, source: string): MotionViolation[] {
  const { durations, easings } = allowedSuffixes();
  const out: MotionViolation[] = [];

  source.split("\n").forEach((text, i) => {
    // Skip comment lines — this file's own prose names the literals it forbids,
    // and so do the explanatory comments in the components.
    const trimmed = text.trim();
    if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) return;

    for (const m of text.matchAll(/\bduration-(\[[^\]]+\]|[A-Za-z0-9]+)/g)) {
      const suffix = m[1];
      if (!durations.has(suffix)) {
        out.push({ file, line: i + 1, token: m[0], kind: "duration" });
      }
    }

    for (const m of text.matchAll(/\bease-(\[[^\]]+\]|[A-Za-z]+)/g)) {
      const suffix = m[1];
      if (!easings.has(suffix)) {
        out.push({ file, line: i + 1, token: m[0], kind: "easing" });
      }
    }
  });

  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const roots = process.argv.slice(2);

if (roots.length === 0) {
  console.error("usage: check-motion <dir> [...]");
  process.exit(2);
}

const files = roots.flatMap((r) => walk(r));
const violations = files.flatMap((f) =>
  findMotionViolations(relative(process.cwd(), f), readFileSync(f, "utf8")),
);

const scale = allowedSuffixes();

if (violations.length === 0) {
  console.log(
    `✓ motion on-scale — ${files.length} file(s), ${scale.durations.size} durations / ${scale.easings.size} easings`,
  );
  process.exit(0);
}

console.error(`\n✗ OFF-SCALE MOTION — ${violations.length} literal(s)\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  ${v.token}`);
}
console.error(
  `
Motion belongs to the token scale, not to the animation library's defaults.

  durations  ${[...scale.durations].join(", ")}
  easings    ${[...scale.easings].join(", ")}

Defined in packages/tokens/src/foundation.ts, each with a documented purpose —
'fast' for hover and focus, 'slow' for popovers and dropdowns, 'slower' for
modals and drawers. Pick the step that matches the intent. If none does, the
scale is wrong and belongs changed there, not bypassed here.
`,
);
process.exit(1);
