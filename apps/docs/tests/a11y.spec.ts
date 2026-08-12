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
  "Full application",
  "Colour",
  "Typography",
  "Components",
  "Dashboard pattern",
  "Team dashboard shell",
  "Data table",
  "List view",
  "KPI dashboard",
  "Detail view",
  "Accessibility",
  "Staging ledger",
];

for (const section of SECTIONS) {
  test(`a11y: ${section}`, async ({ page }) => {
    await gotoSection(page, section);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
      /**
       * `best-practice` is included on purpose. Both defects the DWOS app
       * reported — the shell's missing nav landmark and AlertTitle's hardcoded
       * h5 — are best-practice rules, so filtering to WCAG tags meant this
       * suite could not have caught either. It found four more the moment the
       * tag was added.
       */
      .disableRules([
        // Asserted more strictly at the token level, over pairs no page renders.
        "color-contrast",
        /**
         * DOCS-FRAME ARTIFACTS, not component defects.
         *
         * Sections that embed AppShell put the shell's `main` (SidebarInset)
         * inside the docs page's own `main`, which is what these three rules
         * are describing. A real consumer app IS the shell — there is no outer
         * page to nest inside — so the condition cannot arise there.
         *
         * Guarded rather than trusted: behaviour.spec.ts asserts the shell
         * renders exactly one `main` and one labelled `navigation` landmark, so
         * these exemptions cannot start hiding a real landmark regression. An
         * exemption without a guard is a slow leak.
         */
        "landmark-no-duplicate-main",
        "landmark-main-is-top-level",
        "landmark-unique",
      ])
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
