/**
 * Release status, and the consumer-visible diff.
 *
 * WHY
 * ---
 * A change to this system reaches a KOC app only after it is committed, pushed
 * AND tagged. Vendored consumers read `git show <tag>:apps/docs/public/r/*`, so
 * an untagged commit is invisible to them — and invisible in the worst way,
 * because nothing fails. The app just keeps building against an older payload
 * and looks fine.
 *
 * That is not hypothetical. At the time this was written, `main` sat four
 * commits past `v0.1.2` carrying five animation fixes and a typecheck gate, and
 * the DWOS app had no way to know. The only thing that would ever have told
 * anyone was someone remembering to look.
 *
 * WHAT A CONSUMER ACTUALLY NEEDS
 * ------------------------------
 * Not a commit log. "Act on the first consumer report" tells a KOC developer
 * nothing about whether their app changes. The honest changelog for this system
 * is a diff of the REGISTRY PAYLOAD — the JSON they install — because that is
 * the entire surface they receive.
 *
 * It is also strictly more truthful than a hand-written note. The v0.1.2 release
 * was described as fixing badges and lg buttons; a payload diff would have shown
 * `--text-sm` and `--text-base` changing value, which re-flowed every table cell
 * and form label in a consuming app. Nobody was hiding that. It just was not
 * visible from where the note was written.
 *
 *   npm run release:status            gap + consumer-visible diff since last tag
 *   npm run release:status v0.1.1     … since a specific tag
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");
const R_DIR = "apps/docs/public/r";

const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

const gitQuiet = (...args: string[]) => {
  try {
    return git(...args);
  } catch {
    return "";
  }
};

// ── where we are ────────────────────────────────────────────────────────────

const tag = process.argv[2] || gitQuiet("describe", "--tags", "--abbrev=0");
if (!tag) {
  console.error("No tags in this repo. A vendored consumer pins to tags, so nothing is reachable.");
  process.exit(1);
}

const ahead = gitQuiet("rev-list", `${tag}..HEAD`, "--count");
const dirty = gitQuiet("status", "--porcelain");
const localMain = gitQuiet("rev-parse", "HEAD");
const remoteMain = gitQuiet("ls-remote", "origin", "main").split(/\s/)[0] ?? "";
const unpushed = remoteMain && remoteMain !== localMain ? gitQuiet("rev-list", `${remoteMain}..HEAD`, "--count") : "0";

// ── is the committed registry actually current? ─────────────────────────────

/**
 * A tag whose registry JSON was never regenerated ships a stale payload, and
 * every gate still passes — check:parity compares the stylesheet against the
 * registry, so if BOTH are stale together they agree perfectly.
 *
 * `npm run registry` is deterministic, so the check is simply: does regenerating
 * change anything that is already committed?
 */
const registryDirty = gitQuiet("status", "--porcelain", "--", R_DIR);

// ── the consumer-visible diff ───────────────────────────────────────────────

interface Item {
  name?: string;
  dependencies?: string[];
  registryDependencies?: string[];
  cssVars?: Record<string, Record<string, string>>;
  css?: Record<string, unknown>;
  files?: { path: string; content: string }[];
}

const readAt = (ref: string, file: string): Item | null => {
  const raw = gitQuiet("show", `${ref}:${R_DIR}/${file}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Item;
  } catch {
    return null;
  }
};

const readNow = (file: string): Item | null => {
  try {
    return JSON.parse(readFileSync(join(ROOT, R_DIR, file), "utf8")) as Item;
  } catch {
    return null;
  }
};

const files = readdirSync(join(ROOT, R_DIR))
  .filter((f) => f.endsWith(".json") && f !== "registry.json")
  .sort();

const oldFiles = new Set(
  gitQuiet("ls-tree", "--name-only", `${tag}:${R_DIR}`).split("\n").filter(Boolean),
);

/**
 * Tailwind's own step names, per namespace.
 *
 * A NEW theme variable is not automatically harmless, and getting this wrong is
 * how v0.1.2 shipped with an understated release note. `--text-sm` was new to
 * OUR payload and not new to Tailwind, which already defines `text-sm` as
 * 0.875rem. Declaring it at KOC's 0.8125rem does not add a class — it silently
 * re-points one already used on every table cell and form label in the app.
 *
 * `--text-2xs` and `--breakpoint-3xl` are genuinely additive: Tailwind has no
 * such step, so nothing existing moves. Same diff line, opposite consequence,
 * and a consumer cannot tell them apart without this list.
 */
const TAILWIND_DEFAULTS: Record<string, Record<string, string>> = {
  text: {
    xs: "0.75rem", sm: "0.875rem", base: "1rem", lg: "1.125rem", xl: "1.25rem",
    "2xl": "1.5rem", "3xl": "1.875rem", "4xl": "2.25rem", "5xl": "3rem",
    "6xl": "3.75rem", "7xl": "4.5rem", "8xl": "6rem", "9xl": "8rem",
  },
  radius: { sm: "0.25rem", md: "0.375rem", lg: "0.5rem", xl: "0.75rem", "2xl": "1rem" },
  breakpoint: { sm: "40rem", md: "48rem", lg: "64rem", xl: "80rem", "2xl": "96rem" },
};

/**
 * Namespaces where Tailwind has a default for every step but the values are
 * long strings (shadows, easing curves, font stacks). Any KOC value in these
 * differs by construction, so name matching is enough and comparing is noise.
 */
const NAME_ONLY: Record<string, string[]> = {
  shadow: ["none", "sm", "md", "lg", "xl", "2xl", "inner"],
  ease: ["in", "out", "in-out", "linear"],
  font: ["sans", "serif", "mono"],
};

/** rem and px are interchangeable in these scales; the strings are not. */
function toPx(v: string): number | null {
  const m = /^(-?[\d.]+)(rem|px)$/.exec(v.trim());
  if (!m) return null;
  return parseFloat(m[1]) * (m[2] === "rem" ? 16 : 1);
}

/**
 * Does declaring this re-point a class the consumer's app already uses?
 *
 * Only when Tailwind has the same step AND our value differs. Tailwind v4 states
 * breakpoints in rem and this system states them in px, so `640px` against
 * `40rem` is the same breakpoint written two ways — flagging it would be crying
 * wolf, and a report that over-warns gets skimmed exactly like one that
 * under-warns.
 */
function overridesTailwind(key: string, value: string): boolean {
  const i = key.indexOf("-");
  if (i < 0) return false;
  const ns = key.slice(0, i);
  const step = key.slice(i + 1);

  if (NAME_ONLY[ns]?.includes(step)) return true;

  const theirs = TAILWIND_DEFAULTS[ns]?.[step];
  if (theirs === undefined) return false;

  const a = toPx(value);
  const b = toPx(theirs);
  if (a !== null && b !== null) return a !== b;
  return value.trim() !== theirs;
}

interface Change {
  item: string;
  lines: string[];
}

const changes: Change[] = [];
const added: string[] = [];
const removed: string[] = [];

for (const f of files) {
  const name = f.replace(/\.json$/, "");
  if (!oldFiles.has(f)) {
    added.push(name);
    continue;
  }

  const before = readAt(tag, f);
  const after = readNow(f);
  if (!before || !after) continue;

  const lines: string[] = [];

  // npm dependencies — a consumer must install these, so a change is an action.
  const depDiff = (key: "dependencies" | "registryDependencies") => {
    const b = new Set(before[key] ?? []);
    const a = new Set(after[key] ?? []);
    for (const d of a) if (!b.has(d)) lines.push(`+ ${key}: ${d}`);
    for (const d of b) if (!a.has(d)) lines.push(`- ${key}: ${d}`);
  };
  depDiff("dependencies");
  depDiff("registryDependencies");

  // CSS variables — the single highest-consequence diff in this system, since a
  // changed value re-styles an app that never re-added a component.
  for (const scope of ["theme", "light", "dark"]) {
    const b = before.cssVars?.[scope] ?? {};
    const a = after.cssVars?.[scope] ?? {};
    for (const k of Object.keys(a)) {
      if (!(k in b)) {
        lines.push(`+ ${scope}: --${k} = ${a[k]}${overridesTailwind(k, a[k]) ? "   ⚠ OVERRIDES TAILWIND DEFAULT" : ""}`);
      } else if (a[k] !== b[k]) {
        lines.push(`~ ${scope}: --${k}  ${b[k]} → ${a[k]}`);
      }
    }
    for (const k of Object.keys(b)) if (!(k in a)) lines.push(`- ${scope}: --${k}`);
  }

  // Raw CSS rules (the @utility and @layer blocks).
  const bCss = Object.keys(before.css ?? {});
  const aCss = Object.keys(after.css ?? {});
  for (const k of aCss) if (!bCss.includes(k)) lines.push(`+ css: ${k}`);
  for (const k of bCss) if (!aCss.includes(k)) lines.push(`- css: ${k}`);

  // Component source. Only whether it changed — the diff itself belongs in git.
  for (const file of after.files ?? []) {
    const old = before.files?.find((x) => x.path === file.path);
    if (!old) lines.push(`+ file: ${file.path}`);
    else if (old.content !== file.content) {
      const delta = file.content.split("\n").length - old.content.split("\n").length;
      lines.push(`~ file: ${file.path}${delta ? ` (${delta > 0 ? "+" : ""}${delta} lines)` : ""}`);
    }
  }

  if (lines.length) changes.push({ item: name, lines });
}

for (const f of oldFiles) {
  if (f.endsWith(".json") && f !== "registry.json" && !files.includes(f)) {
    removed.push(f.replace(/\.json$/, ""));
  }
}

// ── report ──────────────────────────────────────────────────────────────────

const bar = "─".repeat(72);
console.log(`\n${bar}\n  Release status — HEAD against ${tag}\n${bar}\n`);

console.log(`  latest tag        ${tag}`);
console.log(`  commits since     ${ahead}${ahead === "0" ? "" : "   ← invisible to a vendored consumer until tagged"}`);
console.log(`  unpushed          ${unpushed}${unpushed === "0" ? "" : "   ← invisible to everyone until pushed"}`);
console.log(`  working tree      ${dirty ? `${dirty.split("\n").length} file(s) uncommitted` : "clean"}`);
console.log(
  `  registry payload  ${registryDirty ? "STALE — regenerate before tagging" : "matches the committed source"}`,
);

if (!changes.length && !added.length && !removed.length) {
  console.log(`\n  No consumer-visible change since ${tag}.`);
  console.log(`  Anything in those ${ahead} commit(s) is internal — gates, docs, the docs app.\n`);
  process.exit(0);
}

console.log(`\n${bar}\n  What a KOC app would actually receive\n${bar}\n`);

if (added.length) console.log(`  NEW ITEMS       ${added.join(", ")}\n`);
if (removed.length) console.log(`  REMOVED ITEMS   ${removed.join(", ")}\n`);

for (const c of changes) {
  console.log(`  @koc/${c.item}`);
  for (const l of c.lines) console.log(`      ${l}`);
  console.log("");
}

/**
 * A changed cssVar restyles an app that re-adds only the theme. A changed file
 * does nothing until that component is re-added. Consumers need to be told
 * which of the two they are looking at, because the actions are different.
 */
const varChanges = changes.flatMap((c) => c.lines.filter((l) => /: --/.test(l)));
const fileChanges = changes.flatMap((c) => c.lines.filter((l) => l.includes("file:")));

console.log(`${bar}\n  What that means for a consumer\n${bar}\n`);
const overrides = varChanges.filter((l) => l.includes("OVERRIDES TAILWIND"));

if (varChanges.length) {
  console.log(`  ${varChanges.length} CSS variable change(s) — re-adding @koc/theme alone applies these,`);
  console.log(`  and they restyle components the app never re-added.\n`);
  console.log(`  A ~ line moves existing UI. A + line usually does not — UNLESS it is flagged`);
  console.log(`  as overriding a Tailwind default, which re-points a class the app already uses.\n`);
  if (overrides.length) {
    console.log(`  ⚠ ${overrides.length} of them override a Tailwind default. THIS IS THE BREAKING KIND —`);
    console.log(`    every existing use of that class moves. Say so in the release note.\n`);
  }
}
if (fileChanges.length) {
  console.log(`  ${fileChanges.length} component file(s) changed — these need that component re-added`);
  console.log(`  individually, with --overwrite. They do nothing until then.\n`);
}
console.log(`  To release:  npm test && git push origin main && git tag <v> && git push origin <v>\n`);
