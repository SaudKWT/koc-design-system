/**
 * The parts of the stylesheet that are NOT variables.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `@koc/theme` shipped `cssVars` and nothing else, so a KOC team installing it
 * got 76 correct colour variables and none of the CSS that makes components
 * actually use them. Every symptom of that is subtle and none of it errors:
 *
 *   - `duration-fast` / `-slow` / `-slower` produced NO CSS. Tailwind v4 has an
 *     `--ease-*` theme namespace but no `--duration-*` one, so the scale is only
 *     reachable through the `@utility` rules below. Without them every KOC
 *     component's carefully chosen duration silently became Tailwind's default
 *     150ms — the same failure `check:motion` guards against inside this repo,
 *     reproduced perfectly in every repo outside it.
 *   - Borders fell back to `currentColor`. Tailwind v4 dropped the v3 default of
 *     gray-200, so without `* { border-color: var(--border) }` every divider,
 *     card edge and input outline takes the text colour.
 *   - Body typography, tabular figures and the focus ring never arrived, so text
 *     sat at the browser's 16px/normal instead of the system's 14px/1.5, numeric
 *     columns shimmied by digit, and keyboard focus fell back to whatever the
 *     browser does.
 *
 * So the rules live here as data, rendered two ways from one source: as text
 * into `koc-tokens.css` for this monorepo, and as the registry item's `css`
 * object for everyone else. Hand-copying them into the registry would have
 * fixed today's bug and guaranteed tomorrow's divergence.
 */

import { foundation } from "./foundation.js";

/** A nested CSS object, matching shadcn's `cssValue` shape exactly. */
export type CssObject = { [key: string]: string | CssObject };

/**
 * `@utility duration-*`.
 *
 * Each sets BOTH transition-duration and animation-duration, because they are
 * separate properties and shadcn's entrance/exit classes (`animate-in`,
 * `fade-in-0`, `zoom-in-95`) are CSS animations, not transitions — a
 * transition-only duration would silently do nothing to them.
 */
export const motionUtilities: CssObject = Object.fromEntries(
  Object.entries(foundation.duration).map(([k, v]) => [
    `@utility duration-${k === "DEFAULT" ? "base" : k}`,
    { "transition-duration": v, "animation-duration": v },
  ]),
);

/** Everything in `@layer base`. */
export const baseLayer: CssObject = {
  "@layer base": {
    "*": { "border-color": "var(--border)" },

    "//font": "Inter's defaults leave gaps at UI sizes; contextual alternates close them.",

    body: {
      "background-color": "var(--background)",
      color: "var(--foreground)",
      "font-family": "var(--font-sans)",
      "font-size": foundation.fontSize.base,
      "line-height": String(foundation.lineHeight.normal),
      "font-feature-settings": '"cv02", "cv03", "cv04", "cv11"',
      "-webkit-font-smoothing": "antialiased",
    },

    "//tabular":
      "Numbers in dashboards must align on the decimal. Without tabular figures a\ncolumn of production volumes shimmies by digit and cannot be scanned.",

    '.tabular, table tbody td, [data-slot="kpi-value"]': {
      "font-variant-numeric": "tabular-nums",
      "font-feature-settings": '"tnum"',
    },

    "//focus":
      "A single visible focus style, everywhere. Keyboard users are the whole\nreason this exists — never remove it without a replacement.",

    ":focus-visible": {
      outline: "2px solid var(--ring)",
      "outline-offset": "2px",
    },

    "//motion":
      "Respect the OS-level reduced-motion setting. Vestibular disorders are real\nand this is a tool people use all day.",

    "@media (prefers-reduced-motion: reduce)": {
      "*, *::before, *::after": {
        "animation-duration": "0.01ms !important",
        "animation-iteration-count": "1 !important",
        "transition-duration": "0.01ms !important",
        "scroll-behavior": "auto !important",
      },
    },
  },
};

/**
 * A key beginning with `//` is a comment, not a declaration.
 *
 * The generated stylesheet is read by people — it is the file a KOC developer
 * opens when a colour looks wrong — so the reasoning has to survive into it.
 * shadcn's `css` object has nowhere to put a comment, so `renderCss` emits
 * these and `stripComments` drops them for the registry. One source, two views,
 * neither of them lying.
 */
const isComment = (key: string) => key.startsWith("//");

function stripComments(obj: CssObject): CssObject {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([k]) => !isComment(k))
      .map(([k, v]) => [k, typeof v === "string" ? v : stripComments(v)]),
  );
}

/** The whole non-variable stylesheet, as the registry's `css` object. */
export const registryCss: CssObject = stripComments({
  ...motionUtilities,
  ...baseLayer,
});

/** Render a CssObject as CSS text, for the generated stylesheet. */
export function renderCss(obj: CssObject, indent = ""): string {
  return Object.entries(obj)
    .map(([key, value]) => {
      if (isComment(key)) {
        return String(value)
          .split("\n")
          .map((line, i, all) =>
            all.length === 1
              ? `${indent}/* ${line} */`
              : i === 0
                ? `${indent}/* ${line}`
                : `${indent} * ${line}${i === all.length - 1 ? " */" : ""}`,
          )
          .join("\n");
      }
      if (typeof value === "string") return `${indent}${key}: ${value};`;
      const body = renderCss(value, `${indent}  `);
      return `${indent}${key} {\n${body}\n${indent}}`;
    })
    .join("\n");
}
