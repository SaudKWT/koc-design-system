import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { gotoSection, type SectionLabel } from "./helpers";

/**
 * Automated accessibility scan of every docs section.
 *
 * axe catches a genuine but limited slice — missing names, broken ARIA
 * relationships, orphaned controls, duplicate ids. It cannot tell you whether
 * tab order makes sense or whether a change was announced, which is why
 * behaviour.spec.ts exists alongside it. Passing this file is a floor, not a
 * result.
 *
 * Colour-contrast rules are disabled here on purpose: contrast is already
 * asserted at the token level against every documented pairing, by
 * packages/tokens/src/contrast.test.ts. Running it again over rendered pixels
 * would duplicate that and add flake from anti-aliasing and overlap heuristics
 * — and the token test is the stricter of the two, because it checks pairs that
 * no page happens to render today.
 */

const SECTIONS: SectionLabel[] = [
  "Overview",
  "Colour",
  "Typography",
  "Components",
  "Dashboard pattern",
  "Team dashboard shell",
  "Data table",
  "List view",
  "Accessibility",
];

for (const section of SECTIONS) {
  test(`a11y: ${section}`, async ({ page }) => {
    await gotoSection(page, section);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .disableRules(["color-contrast"])
      .analyze();

    // Report every violation with its nodes, so a failure is actionable without
    // opening a trace.
    const detail = results.violations
      .map(
        (v) =>
          `\n  [${v.impact}] ${v.id} — ${v.help}\n` +
          v.nodes.map((n) => `      ${n.target.join(" ")}`).join("\n"),
      )
      .join("");

    expect(results.violations, `axe violations on "${section}":${detail}`).toEqual([]);
  });
}
