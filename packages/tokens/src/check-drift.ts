/**
 * Token-drift check.
 *
 * Fails if a consuming app redefines a token that `@koc/tokens` owns.
 *
 * WHY THIS IS A SCRIPT AND NOT A CODE COMMENT
 * -------------------------------------------
 * `npx shadcn add sidebar` appends its own `:root` / `.dark` blocks with stock
 * Zinc defaults to whatever CSS entry it finds. They land after the KOC import,
 * carry identical specificity, and win — KOC's `primary-800` sidebar becomes
 * near-white grey with no visible error. We put a warning comment at the exact
 * insertion point; the very next `shadcn add` appended the block directly
 * beneath it. Discipline does not survive contact with a CLI, so this is a
 * check that fails a build instead.
 *
 * Any ecosystem component that ships theme variables can do this. The failure is
 * silent, survives review because it looks like ordinary generated CSS, and
 * de-brands the app. For an org standard that is the difference between "KOC
 * blue everywhere" and "KOC blue until someone installs a component".
 *
 * Run:  npm run check:drift
 * Or, in a consuming repo:  tsx check-drift.ts src/styles.css
 */

import { readFileSync, existsSync } from "node:fs";

import { light } from "./semantic.js";
import { palette } from "./palette.js";
import { STEPS } from "./color.js";

/** Every custom property `@koc/tokens` is the source of truth for. */
export function ownedTokens(): Set<string> {
  const owned = new Set<string>();
  for (const name of Object.keys(light)) owned.add(name);
  for (const ramp of Object.keys(palette))
    for (const step of STEPS) owned.add(`koc-${ramp}-${step}`);
  owned.add("radius");
  return owned;
}

export interface Drift {
  file: string;
  line: number;
  token: string;
  value: string;
}

/**
 * Find redefinitions of owned tokens in a stylesheet.
 *
 * Comments are stripped first — the guard comment in `styles.css` names the very
 * tokens it warns about, and matching those would make the check fail on its own
 * documentation.
 */
export function findDrift(file: string, source: string): Drift[] {
  const owned = ownedTokens();
  const drift: Drift[] = [];

  // Blank out comments while preserving newlines, so reported line numbers still
  // point at the real location in the file.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, " "),
  );

  code.split("\n").forEach((text, i) => {
    // `--token: value;` — a definition. `var(--token)` is a *use* and is fine,
    // which is why the match is anchored to the start of the declaration.
    const m = /^\s*--([a-z0-9-]+)\s*:\s*([^;]+);/i.exec(text);
    if (!m) return;

    const [, token, value] = m;
    if (!owned.has(token)) return;

    // `@theme inline` maps a token onto Tailwind's namespace as
    // `--color-x: var(--x)` — a re-export, not a redefinition. Only a literal
    // value overrides the token, so an alias to another var is allowed through.
    if (/^var\(/.test(value.trim())) return;

    drift.push({ file, line: i + 1, token, value: value.trim() });
  });

  return drift;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const targets = process.argv.slice(2);

if (targets.length === 0) {
  console.error("usage: check-drift <file.css> [...]");
  process.exit(2);
}

const all: Drift[] = [];
for (const file of targets) {
  if (!existsSync(file)) {
    console.error(`✗ not found: ${file}`);
    process.exit(2);
  }
  all.push(...findDrift(file, readFileSync(file, "utf8")));
}

if (all.length === 0) {
  console.log(
    `✓ no token drift — ${targets.length} file(s) checked against ${ownedTokens().size} owned tokens`,
  );
  process.exit(0);
}

console.error(`\n✗ TOKEN DRIFT — ${all.length} redefinition(s) of KOC-owned tokens\n`);
for (const d of all) {
  console.error(`  ${d.file}:${d.line}`);
  console.error(`    --${d.token}: ${d.value};`);
}
console.error(
  `
These override @koc/tokens and have passed no contrast assertion. This is
usually a component installer appending its own theme block — delete it.
If the value is genuinely wanted, it belongs in packages/tokens/src, where
the contrast tests can see it.
`,
);
process.exit(1);
