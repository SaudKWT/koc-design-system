/**
 * @koc/tokens — the single source of truth for Kuwait Oil Company's visual language.
 *
 * Consumed three ways:
 *   - `@koc/tokens`      → typed JS/TS values (charts, canvas, anything not CSS)
 *   - `@koc/tokens/css`  → CSS custom properties + Tailwind v4 @theme
 *   - `@koc/tokens/json` → DTCG-format tokens, for Figma and other design tools
 */

export * from "./brand.js";
export * from "./color.js";
export * from "./palette.js";
export * from "./semantic.js";
export * from "./foundation.js";

import { palette, chartSeries } from "./palette.js";
import { themes } from "./semantic.js";
import { foundation } from "./foundation.js";

export const tokens = {
  palette,
  chartSeries,
  themes,
  ...foundation,
} as const;

export default tokens;
