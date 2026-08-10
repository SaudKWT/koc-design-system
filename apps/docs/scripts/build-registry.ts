/**
 * Registry build.
 *
 * Generates a shadcn-compatible registry from packages/ui, so any KOC team can run:
 *
 *   npx shadcn@latest add @koc/button
 *
 * and get the component source copied into their own repo, which they then own.
 *
 * WHY THIS FILE WAS REWRITTEN
 * ---------------------------
 * Its previous header claimed the registry "cannot drift" from the components.
 * That was only true of file *contents* — the list of which components exist was
 * hand-maintained, and it silently fell twelve behind: app-shell, data-table,
 * sidebar, tabs, select, checkbox, dropdown-menu, sheet, tooltip, collapsible,
 * separator and skeleton all existed in @koc/ui and none of them were
 * installable. The distribution half of the hybrid model was broken for exactly
 * the components that mattered most, and nothing said so.
 *
 * So now:
 *
 *  - The component list is READ FROM DISK, not written here.
 *  - `dependencies` and `registryDependencies` are DERIVED from each file's real
 *    imports. Hand-written dependency arrays are the other thing that goes stale,
 *    and a wrong one means a consumer installs a component that will not compile.
 *  - Only prose — title, description, categories, docs — is authored, because
 *    that is the part a machine cannot write and the part the KOC developer
 *    actually reads.
 *  - A component with no prose entry FAILS THE BUILD. That is the bit that makes
 *    the "cannot drift" claim true rather than aspirational.
 *
 * Output: apps/docs/public/r/{name}.json  +  public/r/registry.json
 * Serve statically. In production these sit behind https://design.kockw.com/r/.
 *
 * Run: npm run registry
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { light, dark } from "../../../packages/tokens/src/semantic.js";
import { toOklchCss } from "../../../packages/tokens/src/color.js";
import { foundation } from "../../../packages/tokens/src/foundation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");
const UI_SRC = join(ROOT, "packages", "ui", "src");
const OUT = join(__dirname, "..", "public", "r");
mkdirSync(OUT, { recursive: true });

const HOMEPAGE = "https://design.kockw.com";

interface RegistryFile {
  path: string;
  content: string;
  type: string;
  target?: string;
}

interface RegistryItem {
  $schema?: string;
  name: string;
  type: string;
  title: string;
  description: string;
  dependencies?: string[];
  registryDependencies?: string[];
  files?: RegistryFile[];
  cssVars?: Record<string, Record<string, string>>;
  docs?: string;
  categories?: string[];
}

/** Prose for one registry item. Everything else is derived. */
interface Meta {
  title: string;
  description: string;
  categories?: string[];
  docs?: string;
}

// ── prose ───────────────────────────────────────────────────────────────────
//
// Keyed by component filename without extension. A component on disk with no
// entry here fails the build — see the assertion at the bottom. That is
// deliberate: shipping a component to KOC teams with no description is how a
// registry becomes a list of names nobody can choose between.

const LIB_META: Record<string, Meta> = {
  utils: {
    title: "cn utility",
    description: "Class merger — clsx + tailwind-merge.",
  },
  "use-mobile": {
    title: "useIsMobile",
    description: "Viewport hook backing the sidebar's mobile sheet behaviour.",
  },
  org: {
    title: "Org model",
    description:
      "The KOC organisational model a team dashboard is configured from — Directorate › Group › Team › Unit. Adding a team dashboard is a TeamConfig, not a new component.",
  },
};

const META: Record<string, Meta> = {
  "confirm-dialog": {
    title: "Confirm Dialog",
    description:
      "A decision that cannot be undone. Takes the subject as a required prop, so the question reads 'Void report BG-1042?' rather than 'Delete Item?' — a confirmation that does not name what it destroys is how people delete the wrong thing.",
    categories: ["koc"],
    docs: "Cancel is ordered first and takes initial focus. Radix focuses the first focusable child on open, and on a destructive dialog that must not be the destructive button — a stray Enter is a very common way to dismiss a dialog.",
  },
  "page-nav": {
    title: "Page Nav",
    description:
      "Horizontal navigation inside an application. The sidebar answers 'which app am I in'; this answers 'which part of this app'. One level of dropdown only — deeper than that and the screen wants a sidebar.",
    categories: ["layout", "koc"],
    docs: "Adapted from shadcn-space's topbar-05 with its sidebar coupling removed — the original calls useSidebar() and throws outside a provider. Pass `renderLink` to integrate your router.",
  },
  "navigation-menu": {
    title: "Navigation Menu",
    description: "Horizontal menu primitive with dropdown panels. Backs @koc/page-nav.",
    categories: ["layout"],
  },
  "page-header": {
    title: "Page Header",
    description:
      "The top of every KOC application screen — title, optional breadcrumb, actions and meta. The title is an h1 because the app shell contributes no heading, so without it a screen has no top-level landmark at all.",
    categories: ["layout", "koc"],
    docs: "Keep breadcrumbs shallow. Directorate and Group are identity, not navigation, and the unit is already in the sidebar switcher — a breadcrumb here should carry only the path within the app.",
  },
  "date-range-filter": {
    title: "Date Range Filter",
    description:
      "Presets first, calendar second. Today / 7 days / 30 days / This month are one click; the range picker is there for the exception.",
    categories: ["form", "koc"],
    docs: "Pass `today` in rather than letting the component read the clock — that keeps it testable and stops a 'Today' filter meaning a different day than the data does.",
  },
  combobox: {
    title: "Combobox",
    description:
      "Searchable single-select. shadcn documents this as a Command + Popover pattern rather than shipping it, which means every project assembles a slightly different one; this is the KOC version.",
    categories: ["form"],
    docs: "Use only when a list is long enough that scanning is work — roughly ten items. Below that Select is faster and a search box is noise. `label` is required: a trigger reading only 'Select…' tells a screen-reader user nothing.",
  },
  dialog: {
    title: "Dialog",
    description: "Modal surface. Use for a record you read and return from, or a short focused form.",
  },
  popover: {
    title: "Popover",
    description: "Non-modal floating panel. Backs the date picker and combobox.",
  },
  command: {
    title: "Command",
    description: "Filterable command list built on cmdk. Backs @koc/combobox.",
  },
  calendar: {
    title: "Calendar",
    description: "Date and range picker built on react-day-picker.",
    categories: ["form"],
  },
  breadcrumb: {
    title: "Breadcrumb",
    description: "Path within an app. Used by @koc/page-header.",
    categories: ["layout"],
  },
  button: {
    title: "Button",
    description: "Six variants, four sizes. Every label/background pair is contrast-tested.",
    categories: ["form"],
  },
  card: {
    title: "Card",
    description: "The primary surface for grouping dashboard content.",
    categories: ["layout"],
  },
  input: {
    title: "Input",
    description:
      "Text field. Its border carries KOC's WCAG 1.4.11 compliance at 3.63:1 — do not soften it to border-border.",
    categories: ["form"],
  },
  label: {
    title: "Label",
    description: "Form label. Always pair with a control via htmlFor.",
    categories: ["form"],
  },
  badge: {
    title: "Badge",
    description:
      "Counts, tags and categories. `shape=\"count\"` gives a circular count that becomes a pill past two digits. For plant state use @koc/status-badge instead.",
  },
  alert: {
    title: "Alert",
    description:
      "Inline message. Callers must supply an icon — colour alone cannot carry severity.",
  },
  table: {
    title: "Table",
    description:
      "Table primitives. Body cells get tabular figures automatically; right-align numeric columns. For sorting, filtering and pagination use @koc/data-table.",
    categories: ["data"],
  },
  "status-badge": {
    title: "Status Badge",
    description:
      "Operational state for wells, assets and jobs. Takes a status, not a colour — it derives colour, icon and label together so WCAG 1.4.1 cannot be violated by omission.",
    categories: ["data", "koc"],
    docs: "Statuses: producing, normal, warning, critical, shutin, maintenance, offline, unknown. `critical` is the only filled variant — keep it rare so it stays pre-attentive.",
  },
  "stat-card": {
    title: "Stat Card",
    description:
      "A KPI with a change indicator. Direction and sentiment are separate inputs, because at an oil company 'up' is not always good.",
    categories: ["data", "koc"],
    docs: "Set `intent` explicitly: 'higher-is-better' (production, uptime), 'lower-is-better' (flaring, emissions, downtime, water cut). Defaults to 'neutral' — an honest grey delta beats a confident wrong colour.",
  },
  "data-table": {
    title: "Data Table",
    description:
      "Sorting, filtering, column visibility and pagination on TanStack Table v9 — with loading, empty and filtered-empty as three distinct states, and numeric alignment declared on the column rather than remembered in a cell renderer.",
    categories: ["data", "koc"],
    docs: "Set `meta: { numeric: true }` on numeric columns; it right-aligns header and cells together. `empty` is for genuinely no data — a filter excluding everything gets its own message and a Clear filter action automatically. `caption` is required: screen readers announce the table by it.",
  },
  "app-shell": {
    title: "App Shell",
    description:
      "The standard KOC team dashboard frame. Configured entirely from a TeamConfig — unit switcher, unit nav and an always-visible team-wide zone. Building a dashboard for another team is a config file, not a fork.",
    categories: ["layout", "koc"],
    docs: "The unit is a context you switch, not a nav section: seven units × five apps is 35 permanent items, 34 irrelevant to any given user. `ALL_UNITS` gives team leads the cross-unit view. Pass `renderLink` to integrate your router — the default is a plain anchor.",
  },
  sidebar: {
    title: "Sidebar",
    description:
      "Collapsible sidebar primitives with an icon rail, mobile sheet and keyboard shortcut. Diverges from upstream: collapsed padding is scoped per size, because upstream's base `p-2!` beats `lg`'s `p-0!` on CSS source order.",
    categories: ["layout"],
  },
  tabs: {
    title: "Tabs",
    description: "Switch between sibling views. Use for scope (assets, periods), not for filters.",
    categories: ["layout"],
  },
  select: {
    title: "Select",
    description: "Single-choice dropdown built on Radix.",
    categories: ["form"],
  },
  checkbox: {
    title: "Checkbox",
    description: "Binary control built on Radix.",
    categories: ["form"],
  },
  "dropdown-menu": {
    title: "Dropdown Menu",
    description: "Action and option menus built on Radix.",
  },
  sheet: {
    title: "Sheet",
    description: "Edge-anchored panel. Backs the sidebar's mobile behaviour.",
    categories: ["layout"],
  },
  tooltip: {
    title: "Tooltip",
    description:
      "Short label on hover and focus. Load-bearing in a collapsed icon rail — it is the only accessible name those buttons have.",
  },
  collapsible: {
    title: "Collapsible",
    description: "Show/hide a region. Backs nested sidebar navigation.",
  },
  separator: {
    title: "Separator",
    description: "Visual divider.",
  },
  skeleton: {
    title: "Skeleton",
    description:
      "Loading placeholder. Prefer it over a spinner so layout does not jump when data lands.",
  },
};

// ── derivation ──────────────────────────────────────────────────────────────

/** npm packages that are the consumer's own concern, never registry deps. */
const PEER = new Set(["react", "react-dom"]);

/**
 * Pull the real imports out of a source file.
 *
 * Deriving this rather than hand-writing it matters more than it looks: a stale
 * `dependencies` array means a KOC team installs a component that does not
 * compile, and the failure surfaces in their repo rather than in ours.
 */
function analyse(src: string): { deps: string[]; registryDeps: string[] } {
  const deps = new Set<string>();
  const registryDeps = new Set<string>();

  for (const m of src.matchAll(/from\s+"([^"]+)"/g)) {
    const spec = m[1];

    if (spec.startsWith("./")) {
      // Sibling component → another registry item.
      registryDeps.add(`@koc/${spec.slice(2)}`);
    } else if (spec.startsWith("../lib/")) {
      registryDeps.add(`@koc/${spec.slice("../lib/".length)}`);
    } else if (!spec.startsWith(".")) {
      // Bare specifier → npm package. Scoped names keep two segments.
      const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
      if (!PEER.has(pkg)) deps.add(pkg);
    }
  }

  return { deps: [...deps].sort(), registryDeps: [...registryDeps].sort() };
}

/** Rewrite intra-package imports to the aliases the shadcn CLI resolves. */
function rewrite(src: string): string {
  return src
    .replace(/from "\.\.\/lib\/utils"/g, 'from "@/lib/utils"')
    .replace(/from "\.\.\/lib\/([a-z-]+)"/g, 'from "@/lib/$1"')
    .replace(/from "\.\/([a-z-]+)"/g, 'from "@/components/ui/$1"');
}

// ── discover ────────────────────────────────────────────────────────────────

const componentFiles = readdirSync(join(UI_SRC, "components"))
  .filter((f) => f.endsWith(".tsx"))
  .sort();

const libFiles = readdirSync(join(UI_SRC, "lib"))
  .filter((f) => f.endsWith(".ts"))
  .sort();

const missing = [
  ...componentFiles.map((f) => f.replace(/\.tsx$/, "")).filter((n) => !META[n]),
  ...libFiles.map((f) => f.replace(/\.ts$/, "")).filter((n) => !LIB_META[n]),
];

if (missing.length) {
  console.error(
    `\n✗ REGISTRY GAP — ${missing.length} file(s) in @koc/ui have no registry entry:\n`,
  );
  for (const n of missing) console.error(`    ${n}`);
  console.error(
    `
Add prose for each in apps/docs/scripts/build-registry.ts (META / LIB_META).
Everything else — files, dependencies, registryDependencies — is derived.

A component that is not in the registry cannot be installed by a KOC team, which
means it does not exist as far as the standard is concerned. This check is here
because twelve of them went missing exactly that way.
`,
  );
  process.exit(1);
}

// ── build ───────────────────────────────────────────────────────────────────

const mapVars = (t: Record<string, string>) =>
  Object.fromEntries(Object.entries(t).map(([k, v]) => [k, toOklchCss(v)]));

const themeItem: RegistryItem = {
  $schema: "https://ui.shadcn.com/schema/registry-item.json",
  name: "theme",
  type: "registry:theme",
  title: "KOC Theme",
  description:
    "Kuwait Oil Company brand tokens for light and dark. Anchored to #0060A9, recovered from KOC's own stylesheets. Install this first — it re-skins a stock shadcn app into a KOC app.",
  cssVars: {
    theme: {
      "font-sans": foundation.fontFamily.sans.join(", "),
      "font-mono": foundation.fontFamily.mono.join(", "),
      radius: foundation.radius.DEFAULT,
    },
    light: mapVars(light),
    dark: mapVars(dark),
  },
  docs: "Requires Inter. Add https://rsms.me/inter/inter.css, or install the `inter` font package. Every colour pair here is asserted against WCAG 2.1 AA in CI.",
};

const libItems: RegistryItem[] = libFiles.map((file) => {
  const name = file.replace(/\.ts$/, "");
  const raw = readFileSync(join(UI_SRC, "lib", file), "utf8");
  const { deps, registryDeps } = analyse(raw);
  return {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name,
    type: "registry:lib",
    ...LIB_META[name],
    dependencies: deps.length ? deps : undefined,
    registryDependencies: registryDeps.length ? registryDeps : undefined,
    files: [
      {
        path: `lib/${file}`,
        content: rewrite(raw),
        type: "registry:lib",
        target: `lib/${file}`,
      },
    ],
  };
});

const uiItems: RegistryItem[] = componentFiles.map((file) => {
  const name = file.replace(/\.tsx$/, "");
  const raw = readFileSync(join(UI_SRC, "components", file), "utf8");
  const { deps, registryDeps } = analyse(raw);
  return {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name,
    type: "registry:ui",
    ...META[name],
    dependencies: deps.length ? deps : undefined,
    registryDependencies: registryDeps.length ? registryDeps : undefined,
    files: [
      {
        path: `components/ui/${file}`,
        content: rewrite(raw),
        type: "registry:ui",
        target: `components/ui/${file}`,
      },
    ],
  };
});

const items: RegistryItem[] = [themeItem, ...libItems, ...uiItems];

// ── emit ────────────────────────────────────────────────────────────────────

for (const item of items) {
  writeFileSync(join(OUT, `${item.name}.json`), JSON.stringify(item, null, 2));
}

const index = {
  $schema: "https://ui.shadcn.com/schema/registry.json",
  name: "koc",
  homepage: HOMEPAGE,
  items: items.map(({ name, type, title, description, categories }) => ({
    name,
    type,
    title,
    description,
    categories,
  })),
};
writeFileSync(join(OUT, "registry.json"), JSON.stringify(index, null, 2));

console.log(`✓ @koc registry built — ${items.length} items`);
for (const i of items) {
  const d = i.dependencies?.length ? `  deps: ${i.dependencies.join(", ")}` : "";
  console.log(`    @koc/${i.name.padEnd(16)} ${i.type.padEnd(16)}${d}`);
}
console.log(`\n  → apps/docs/public/r/`);
console.log(`\n  Consumers add to components.json:`);
console.log(`    "registries": { "@koc": "${HOMEPAGE}/r/{name}.json" }`);
