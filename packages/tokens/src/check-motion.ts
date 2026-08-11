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
  kind: "duration" | "easing" | "unpinned";
}

/**
 * Transition-property utilities that start a transition and therefore need a
 * duration alongside them.
 *
 * `transition-none` is excluded because it *stops* one, and Tailwind v4's
 * `transition-discrete` / `-normal` set transition-behavior rather than
 * property, so neither implies a timing.
 */
const TRANSITION_PROPERTY =
  /\btransition(?:-(?:all|colors|opacity|shadow|transform|\[[^\]]+\]))?(?![-\w])/g;

/**
 * Bare-number durations (`duration-200`), arbitrary values (`duration-[250ms]`,
 * `ease-[cubic-bezier(...)]`) and Tailwind's built-in easing keywords are all
 * off-scale. Anything matching a key in `foundation.duration` / `.easing` is
 * fine — that IS the scale.
 */
export interface MotionScanResult {
  violations: MotionViolation[];
  /** Lines silenced with `motion-ok`. Reported, so the marker cannot hide. */
  exempted: number;
}

export function findMotionViolations(file: string, source: string): MotionScanResult {
  const { durations, easings } = allowedSuffixes();
  const out: MotionViolation[] = [];
  let exempted = 0;

  source.split("\n").forEach((text, i) => {
    // Skip comment lines — this file's own prose names the literals it forbids,
    // and so do the explanatory comments in the components.
    const trimmed = text.trim();
    if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) return;

    /**
     * `motion-ok` — for a line that NAMES a class rather than applying one.
     *
     * The staging ledger and the third-party audit pages exist to record which
     * candidate shipped which off-scale literal, so their prose necessarily
     * contains `duration-300` and friends as data. Without an opt-out, the only
     * way to document a violation would be to commit one.
     *
     * Deliberately narrow and greppable: it must be written on the line, and
     * every use is counted in the pass summary, so a marker can never quietly
     * become the way people silence this check.
     */
    if (/\bmotion-ok\b/.test(text)) {
      exempted++;
      return;
    }

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

    /**
     * A transition with NO duration at all.
     *
     * This is the hole the first version of this check left open, and it was
     * found from outside — a KOC app built on the registry reported that
     * `@koc/navigation-menu` shipped a bare `transition-all`. It did, and so did
     * ten other places.
     *
     * The literal checks above only catch a duration that is off-scale. A bare
     * `transition-colors` names no duration, so there is no literal to catch —
     * and Tailwind quietly applies its own 150ms default, which is not a step on
     * this scale. The result is the exact failure this file was written to
     * prevent, arriving through the one route the file did not watch: the scale
     * is bypassed by omission rather than by contradiction.
     *
     * Line-level rather than class-level, deliberately: these are single
     * className strings, and the same granularity the literal checks use.
     */
    if (!/\bduration-/.test(text)) {
      for (const m of text.matchAll(TRANSITION_PROPERTY)) {
        out.push({ file, line: i + 1, token: m[0], kind: "unpinned" });
      }
    }
  });

  return { violations: out, exempted };
}

/**
 * `bakeoff/` is skipped, and that is the point of it.
 *
 * It holds third-party candidates kept byte-for-byte as installed, so the
 * ledger's "what the rewrite had to fix" column means something. Holding it to
 * the motion scale would mean editing the one code in this repo whose entire
 * value is being unedited — and the 40-odd off-scale literals in there are
 * evidence, not debt.
 */
const SKIP_DIRS = new Set(["node_modules", "dist", "bakeoff"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
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
const scans = files.map((f) =>
  findMotionViolations(relative(process.cwd(), f), readFileSync(f, "utf8")),
);
const violations = scans.flatMap((s) => s.violations);
const exempted = scans.reduce((n, s) => n + s.exempted, 0);

const scale = allowedSuffixes();

if (violations.length === 0) {
  console.log(
    `✓ motion on-scale — ${files.length} file(s), ${scale.durations.size} durations / ${scale.easings.size} easings` +
      // Never let the marker count go unsaid: a check that silently permits
      // exemptions reads exactly like one that found nothing to permit.
      (exempted ? `, ${exempted} line(s) exempt via motion-ok` : ""),
  );
  process.exit(0);
}

const offScale = violations.filter((v) => v.kind !== "unpinned");
const unpinned = violations.filter((v) => v.kind === "unpinned");

console.error(`\n✗ OFF-SCALE MOTION — ${violations.length} problem(s)\n`);

if (offScale.length) {
  console.error(`  Off-scale literals (${offScale.length}):`);
  for (const v of offScale) console.error(`    ${v.file}:${v.line}  ${v.token}`);
  console.error("");
}

if (unpinned.length) {
  console.error(`  Transitions with no duration (${unpinned.length}):`);
  for (const v of unpinned) console.error(`    ${v.file}:${v.line}  ${v.token}`);
  console.error(
    `
  A transition with no duration is not "unstyled" — Tailwind applies its own
  150ms, which is not a step on this scale. Add one, e.g. 'duration-fast
  ease-out' for hover and focus. Use 'transition-none' if you mean no
  transition at all.
`,
  );
}

console.error(
  `Motion belongs to the token scale, not to the animation library's defaults.

  durations  ${[...scale.durations].join(", ")}
  easings    ${[...scale.easings].join(", ")}

Defined in packages/tokens/src/foundation.ts, each with a documented purpose —
'fast' for hover and focus, 'slow' for popovers and dropdowns, 'slower' for
modals and drawers. Pick the step that matches the intent. If none does, the
scale is wrong and belongs changed there, not bypassed here.
`,
);
process.exit(1);
