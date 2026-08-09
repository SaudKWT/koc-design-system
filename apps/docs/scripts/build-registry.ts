/**
 * Registry build.
 *
 * Generates a shadcn-compatible registry from packages/ui, so any KOC team can run:
 *
 *   npx shadcn@latest add @koc/button
 *
 * and get the component source copied into their own repo, which they then own.
 *
 * The registry is *generated from* the component package rather than maintained
 * beside it. A hand-written registry drifts from the components it describes
 * within about two sprints; this one cannot, because there is only one copy of
 * each file.
 *
 * Output: apps/docs/public/r/{name}.json  +  public/r/registry.json
 * Serve statically. In production these sit behind https://design.kockw.com/r/.
 *
 * Run: npm run registry
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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
  css?: Record<string, unknown>;
  docs?: string;
  categories?: string[];
}

/** Read a component's source and rewrite its intra-package imports to the
 *  aliases the shadcn CLI resolves in the consumer's project. */
function readComponent(file: string): string {
  const src = readFileSync(join(UI_SRC, "components", file), "utf8");
  return src
    .replace(/from "\.\.\/lib\/utils"/g, 'from "@/lib/utils"')
    .replace(/from "\.\/([a-z-]+)"/g, 'from "@/components/ui/$1"');
}

function uiItem(cfg: {
  name: string;
  file: string;
  title: string;
  description: string;
  dependencies?: string[];
  registryDependencies?: string[];
  categories?: string[];
  docs?: string;
}): RegistryItem {
  return {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name: cfg.name,
    type: "registry:ui",
    title: cfg.title,
    description: cfg.description,
    dependencies: cfg.dependencies,
    registryDependencies: cfg.registryDependencies,
    categories: cfg.categories,
    docs: cfg.docs,
    files: [
      {
        path: `components/ui/${cfg.file}`,
        content: readComponent(cfg.file),
        type: "registry:ui",
        target: `components/ui/${cfg.file}`,
      },
    ],
  };
}

// ── theme ───────────────────────────────────────────────────────────────────
//
// The one item every KOC project installs first. Carries the whole semantic
// layer as cssVars, so `npx shadcn add @koc/theme` re-skins a stock shadcn app
// into a KOC app without touching a single component.

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

// ── components ──────────────────────────────────────────────────────────────

const items: RegistryItem[] = [
  themeItem,

  {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name: "utils",
    type: "registry:lib",
    title: "cn utility",
    description: "Class merger — clsx + tailwind-merge.",
    dependencies: ["clsx", "tailwind-merge"],
    files: [
      {
        path: "lib/utils.ts",
        content: readFileSync(join(UI_SRC, "lib", "utils.ts"), "utf8"),
        type: "registry:lib",
        target: "lib/utils.ts",
      },
    ],
  },

  uiItem({
    name: "button",
    file: "button.tsx",
    title: "Button",
    description: "Six variants, four sizes. Every label/background pair is contrast-tested.",
    dependencies: ["@radix-ui/react-slot", "class-variance-authority"],
    registryDependencies: ["@koc/utils"],
    categories: ["form"],
  }),

  uiItem({
    name: "card",
    file: "card.tsx",
    title: "Card",
    description: "The primary surface for grouping dashboard content.",
    registryDependencies: ["@koc/utils"],
    categories: ["layout"],
  }),

  uiItem({
    name: "input",
    file: "input.tsx",
    title: "Input",
    description:
      "Text field. Its border carries KOC's WCAG 1.4.11 compliance at 3.63:1 — do not soften it to border-border.",
    registryDependencies: ["@koc/utils"],
    categories: ["form"],
  }),

  uiItem({
    name: "label",
    file: "label.tsx",
    title: "Label",
    description: "Form label. Always pair with a control via htmlFor.",
    dependencies: ["@radix-ui/react-label"],
    registryDependencies: ["@koc/utils"],
    categories: ["form"],
  }),

  uiItem({
    name: "badge",
    file: "badge.tsx",
    title: "Badge",
    description: "Counts, tags and categories. For plant state use @koc/status-badge instead.",
    dependencies: ["class-variance-authority"],
    registryDependencies: ["@koc/utils"],
  }),

  uiItem({
    name: "alert",
    file: "alert.tsx",
    title: "Alert",
    description: "Inline message. Callers must supply an icon — colour alone cannot carry severity.",
    dependencies: ["class-variance-authority"],
    registryDependencies: ["@koc/utils"],
  }),

  uiItem({
    name: "table",
    file: "table.tsx",
    title: "Table",
    description:
      "Table primitives. Body cells get tabular figures automatically; right-align numeric columns.",
    registryDependencies: ["@koc/utils"],
    categories: ["data"],
  }),

  uiItem({
    name: "status-badge",
    file: "status-badge.tsx",
    title: "Status Badge",
    description:
      "Operational state for wells, assets and jobs. Takes a status, not a colour — it derives colour, icon and label together so WCAG 1.4.1 cannot be violated by omission.",
    dependencies: ["lucide-react"],
    registryDependencies: ["@koc/utils"],
    categories: ["data", "koc"],
    docs: "Statuses: producing, normal, warning, critical, shutin, maintenance, offline, unknown. `critical` is the only filled variant — keep it rare so it stays pre-attentive.",
  }),

  uiItem({
    name: "stat-card",
    file: "stat-card.tsx",
    title: "Stat Card",
    description:
      "A KPI with a change indicator. Direction and sentiment are separate inputs, because at an oil company 'up' is not always good.",
    dependencies: ["lucide-react"],
    registryDependencies: ["@koc/utils", "@koc/card"],
    categories: ["data", "koc"],
    docs: "Set `intent` explicitly: 'higher-is-better' (production, uptime), 'lower-is-better' (flaring, emissions, downtime, water cut). Defaults to 'neutral' — an honest grey delta beats a confident wrong colour.",
  }),
];

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
for (const i of items) console.log(`    @koc/${i.name.padEnd(14)} ${i.type}`);
console.log(`\n  → apps/docs/public/r/`);
console.log(`\n  Consumers add to components.json:`);
console.log(`    "registries": { "@koc": "${HOMEPAGE}/r/{name}.json" }`);
