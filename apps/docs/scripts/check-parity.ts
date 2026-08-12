/**
 * Consumer parity check.
 *
 * WHY
 * ---
 * There are two copies of this design system. One is this monorepo, where
 * `apps/docs` imports `packages/tokens/dist/koc-tokens.css` by relative path and
 * therefore receives everything in it. The other is what actually arrives when a
 * KOC team runs `npx shadcn add @koc/theme`, which is only what the registry
 * item explicitly declares.
 *
 * Every other gate in this repo tests the first copy. Nothing compared the two.
 * It is the difference between tasting the food in your own kitchen, where every
 * ingredient is already on the counter, and checking whether the shopping list
 * you handed someone names all of them.
 *
 * The bill for that, all of it found from outside the repo by the first real
 * consumer rather than by any of five green gates:
 *
 *   - `--radius-md` was never declared, so the CLI substituted its own
 *     `calc(var(--radius) * 0.8)` — 0.3rem against KOC's 0.5rem. Every
 *     `rounded-md` corner in a consuming app was 40% too tight.
 *   - The shadow scale was absent, so `shadow-sm` fell back to Tailwind's stock
 *     grey instead of KOC's hue-tinted elevation.
 *   - `@utility duration-*` and the whole `@layer base` were absent, so the
 *     motion scale resolved to nothing and every border drew in `currentColor`.
 *   - `tw-animate-css` was undeclared, so entrance classes were inert.
 *
 * None of it errored. None of it was visible from in here.
 *
 * WHAT THIS DOES
 * --------------
 * Reconstructs what a consumer receives from the generated registry JSON — which
 * is byte-for-byte what they download — and diffs it against the generated
 * stylesheet. Anything the docs app has and a consumer would not is a failure.
 *
 * It deliberately does NOT install over the network. The registry JSON is
 * already the payload, so simulating the merge is exact, needs no token, and
 * cannot flake. What it does not cover is the transport — the GitHub Contents
 * API and its auth — which was verified end to end on 2026-08-11 and is not
 * something a code change breaks. Re-verify that by hand before a release, not
 * on every build.
 *
 * Run: npm run check:parity   (after `npm run registry`)
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");
const CSS = join(ROOT, "packages", "tokens", "dist", "koc-tokens.css");
const THEME_JSON = join(__dirname, "..", "public", "r", "theme.json");
const DOCS_CSS = join(__dirname, "..", "src", "styles.css");

// ── what the docs app has ───────────────────────────────────────────────────

/**
 * Comments are stripped before anything is parsed.
 *
 * Without this, `@utility` matched the word "rules" out of the sentence
 * "These @utility rules close that gap", and the base-layer selector parser
 * swallowed whole comment blocks into selector names. A checker whose first
 * report is mostly its own parsing noise is a checker people learn to skip.
 */
const css = readFileSync(CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Contents of the first block matching `header {` … balanced `}`. */
function block(source: string, header: RegExp): string {
  const m = header.exec(source);
  if (!m) return "";
  let depth = 0;
  let i = source.indexOf("{", m.index);
  const start = i + 1;
  for (; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i);
  }
  return "";
}

const declaredIn = (body: string) =>
  new Set([...body.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1]));

const themeBlock = block(css, /@theme[^{]*\{/);
const docsTheme = declaredIn(themeBlock);
const docsUtilities = new Set(
  [...css.matchAll(/@utility\s+([a-z0-9-]+)/gi)].map((m) => m[1]),
);
/**
 * Top-level selectors of a rule body, by brace depth.
 *
 * A regex cannot do this: `.tabular, table tbody td, [data-slot="kpi-value"]` is
 * one selector containing commas and brackets, and a nested `@media` block has
 * its own children that are not top-level rules. Depth counting is the only
 * thing that gets both right.
 */
function topLevelSelectors(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "{") {
      if (depth === 0) out.push(body.slice(start, i).trim().replace(/\s+/g, " "));
      depth++;
    } else if (body[i] === "}") {
      if (--depth === 0) start = i + 1;
    }
  }
  return out.filter(Boolean);
}

const docsBaseSelectors = new Set(topLevelSelectors(block(css, /@layer\s+base\s*\{/)));

/**
 * The runtime variables, as distinct from the `@theme` bridge.
 *
 * Two `:root` blocks are emitted — the raw `--koc-*` ramp and the semantic
 * layer — plus `.dark`. A consumer receives `cssVars.light` and `cssVars.dark`
 * and nothing else, so this is where a semantic token added to semantic.ts but
 * never shipped would show up. Without it the `--koc-*` exemption below was
 * dead code guarding a scope nothing checked.
 */
const allRootBlocks = [...css.matchAll(/(^|\})\s*:root\s*\{/g)].map((m) =>
  block(css.slice(m.index), /:root\s*\{/),
);
const docsLight = new Set(allRootBlocks.flatMap((b) => [...declaredIn(b)]));
const docsDark = declaredIn(block(css, /\.dark\s*\{/));

// ── what a consumer receives ────────────────────────────────────────────────

interface ThemeItem {
  dependencies?: string[];
  cssVars?: { theme?: Record<string, string>; light?: Record<string, string>; dark?: Record<string, string> };
  css?: Record<string, unknown>;
  docs?: string;
}

const theme: ThemeItem = JSON.parse(readFileSync(THEME_JSON, "utf8"));

const consumerTheme = new Set(
  Object.keys(theme.cssVars?.theme ?? {}).map((k) => (k.startsWith("--") ? k : `--${k}`)),
);
const consumerUtilities = new Set(
  Object.keys(theme.css ?? {})
    .map((k) => /^@utility\s+([a-z0-9-]+)/i.exec(k)?.[1])
    .filter((v): v is string => !!v),
);
const consumerBase = new Set(
  Object.keys((theme.css?.["@layer base"] as Record<string, unknown>) ?? {}).map((k) =>
    k.trim().replace(/\s+/g, " "),
  ),
);

// ── exemptions, stated rather than silent ───────────────────────────────────

/**
 * Two families are absent from a consumer ON PURPOSE, and both would otherwise
 * dominate the report and train everyone to ignore it.
 *
 * `--color-*` is shadcn's own `@theme inline` bridge. The CLI writes one per
 * entry in cssVars.light, so declaring them here would duplicate what the tool
 * already does. This is the one assumption in the file: if the CLI ever stops,
 * this check goes quiet about a real gap. The parity of OUR file is still
 * asserted below — every semantic token must have its bridge — so the failure
 * mode is narrow and named.
 *
 * `--koc-*` is the raw ramp, and NOT shipping it is invariant 3 doing its job:
 * components consume semantic tokens, never raw steps. A consumer holding the
 * ramp could reach for `--koc-primary-600` directly, which is the thing that
 * makes dark mode a second codebase.
 */
const EXEMPT = [
  { prefix: "--color-", why: "shadcn's @theme bridge; the CLI generates one per semantic token" },
  { prefix: "--koc-", why: "the raw ramp — invariant 3 says consumers get semantic tokens only" },
];

const exemptCount = { "--color-": 0, "--koc-": 0 } as Record<string, number>;
const isExempt = (name: string) => {
  const hit = EXEMPT.find((e) => name.startsWith(e.prefix));
  if (hit) exemptCount[hit.prefix]++;
  return !!hit;
};

// ── diff ────────────────────────────────────────────────────────────────────

interface Gap {
  kind: string;
  name: string;
  hint: string;
}

const gaps: Gap[] = [];

for (const name of docsTheme) {
  if (isExempt(name)) continue;
  if (!consumerTheme.has(name)) {
    gaps.push({
      kind: "@theme variable",
      name,
      hint: "add to themeScales in build-registry.ts",
    });
  }
}

/**
 * `--radius` is declared in `:root` by the shadcn convention AND in `@theme`.
 * The consumer gets it from cssVars.theme, so its absence from cssVars.light is
 * correct, not a gap.
 */
const THEME_SUPPLIED = new Set(["--radius"]);

for (const [scope, docsVars, consumerVars] of [
  ["light", docsLight, new Set(Object.keys(theme.cssVars?.light ?? {}).map((k) => `--${k}`))],
  ["dark", docsDark, new Set(Object.keys(theme.cssVars?.dark ?? {}).map((k) => `--${k}`))],
] as const) {
  for (const name of docsVars) {
    if (isExempt(name) || THEME_SUPPLIED.has(name)) continue;
    if (!consumerVars.has(name)) {
      gaps.push({
        kind: `${scope} variable`,
        name,
        hint: "a token in the stylesheet that cssVars does not ship",
      });
    }
  }
}

for (const name of docsUtilities) {
  if (!consumerUtilities.has(name)) {
    gaps.push({ kind: "@utility", name, hint: "add to motionUtilities in base-css.ts" });
  }
}

for (const sel of docsBaseSelectors) {
  if (!consumerBase.has(sel)) {
    gaps.push({ kind: "@layer base rule", name: sel, hint: "add to baseLayer in base-css.ts" });
  }
}

/**
 * Every `@import` the docs entry needs, a consumer needs too — and the CLI
 * cannot place an @import, since it must precede every other rule and registry
 * CSS is appended. So the package must at least be declared and the manual step
 * documented. `tailwindcss` is excluded: it is the consumer's own framework, not
 * something this system supplies.
 */
const docsImports = [...readFileSync(DOCS_CSS, "utf8").matchAll(/@import\s+"([^"]+)"/g)]
  .map((m) => m[1])
  .filter((s) => s !== "tailwindcss" && !s.startsWith("."));

for (const pkg of docsImports) {
  const declared = theme.dependencies?.includes(pkg);
  const documented = theme.docs?.includes(pkg);
  if (!declared || !documented) {
    gaps.push({
      kind: "css @import",
      name: pkg,
      hint: !declared
        ? "add to the theme item's dependencies"
        : "name it in the theme item's docs — the CLI cannot place an @import",
    });
  }
}

/** Our own bridge must be complete, since the --color-* exemption assumes it. */
for (const token of Object.keys(theme.cssVars?.light ?? {})) {
  if (!docsTheme.has(`--color-${token}`)) {
    gaps.push({
      kind: "missing @theme bridge",
      name: `--color-${token}`,
      hint: "a semantic token with no @theme bridge — the --color-* exemption is unsafe until this is fixed",
    });
  }
}

// ── report ──────────────────────────────────────────────────────────────────

if (gaps.length === 0) {
  const exempt = EXEMPT.map((e) => `${exemptCount[e.prefix]} ${e.prefix}*`).join(", ");
  console.log(
    `✓ consumer parity — ${docsTheme.size} @theme vars, ${docsUtilities.size} utilities, ` +
      `${docsBaseSelectors.size} base rules, ${docsLight.size} light / ${docsDark.size} dark vars ` +
      `reach a consumer (exempt by design: ${exempt})`,
  );
  process.exit(0);
}

console.error(`\n✗ CONSUMER PARITY — ${gaps.length} thing(s) the docs app has and a consumer does not\n`);
for (const g of gaps) {
  console.error(`  [${g.kind}] ${g.name}`);
  console.error(`      → ${g.hint}`);
}
console.error(
  `
The docs site cannot fail the way a consumer fails: it imports the generated
stylesheet by relative path and always gets all of it. Every gap above is
invisible from inside this repo and looks like a design mistake from outside —
a wrong radius, a border in the text colour, a transition with no duration.

Fix at the source (base-css.ts / build-registry.ts), then re-run npm run registry.
`,
);
process.exit(1);
