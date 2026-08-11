import { test, expect } from "@playwright/test";

import { gotoSection } from "./helpers";

/**
 * The full-application mockup.
 *
 * Only the behaviour that composition introduced is pinned here. The individual
 * components are already covered by behaviour.spec.ts and tabs.spec.ts, and
 * re-asserting them through a second screen would be duplication that fails
 * twice for one cause.
 *
 * What IS new is the relationship between the unit switcher and the screen you
 * are on. It is the one piece of logic in the mockup that is not a component
 * doing its job, it has two branches that look identical when they work, and it
 * is exactly the kind of thing that quietly stops working when the DWOS config
 * gains a unit.
 */

const FRAME = "[data-shell-frame]";

/** Open the unit switcher and choose a unit by its KOC designation. */
async function switchUnit(page: import("@playwright/test").Page, label: string) {
  await page.locator(`${FRAME} [data-sidebar="menu-button"]`).first().click();
  await page.getByRole("menuitem", { name: new RegExp(`^${label}`) }).click();
}

test.describe("full application", () => {
  test("the sidebar navigates between screens", async ({ page }) => {
    await gotoSection(page, "Full application");

    const heading = page.locator(`${FRAME} h1`).first();
    await expect(heading).toHaveText(/Unit 1/);

    await page.locator(`${FRAME} a`, { hasText: "Daily drilling reports" }).click();
    await expect(heading).toHaveText("Daily Drilling Reports");

    await page.locator(`${FRAME} a`, { hasText: "Rig status" }).click();
    await expect(heading).toHaveText("Rig status");
  });

  test("switching unit keeps you on the same screen", async ({ page }) => {
    await gotoSection(page, "Full application");

    await page.locator(`${FRAME} a`, { hasText: "NPT tracking" }).click();
    await expect(page.locator(`${FRAME} h1`).first()).toHaveText("NPT tracking");

    await switchUnit(page, "Unit 3");

    // Still NPT, now scoped to Unit 3. Bouncing the user to a dashboard because
    // the id changed from unit-1-npt to unit-3-npt is the failure this guards.
    await expect(page.locator(`${FRAME} h1`).first()).toHaveText("NPT tracking");
    await expect(page.locator(`${FRAME} nav[aria-label="breadcrumb"]`)).toContainText(
      "Unit 3 — Deep",
    );
    // The nav really did re-scope, rather than the heading merely surviving.
    await expect(page.locator(`${FRAME} a[href^="/unit-3/"]`).first()).toBeVisible();
  });

  test("switching to a unit without that screen falls back, and highlights where it landed", async ({
    page,
  }) => {
    await gotoSection(page, "Full application");

    await page.locator(`${FRAME} a`, { hasText: "NPT tracking" }).click();
    await expect(page.locator(`${FRAME} h1`).first()).toHaveText("NPT tracking");

    // Unit 5 (Water Well) has no NPT screen. Leaving activeItemId pointing at
    // unit-1-npt would render a nav with nothing highlighted, showing a screen
    // belonging to a unit you have left.
    await switchUnit(page, "Unit 5");

    await expect(page.locator(`${FRAME} h1`).first()).toHaveText("Water well register");

    const active = page.locator(`${FRAME} [data-active="true"]`);
    await expect(active).toHaveCount(1);
    await expect(active).toHaveText("Water well register");
  });

  test("unbuilt screens say so rather than faking it", async ({ page }) => {
    await gotoSection(page, "Full application");

    await page.locator(`${FRAME} a`, { hasText: "Well programmes" }).click();

    await expect(page.locator(`${FRAME} h1`).first()).toHaveText("Well programmes");
    await expect(page.locator(FRAME)).toContainText("Not built");
    // No table, no tiles — a stub that looked like a screen would defeat the point.
    await expect(page.locator(`${FRAME} table`)).toHaveCount(0);
  });
});
