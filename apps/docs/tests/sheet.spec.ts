import { test, expect } from "@playwright/test";

import { gotoSection } from "./helpers";

/**
 * Sheet behaviour, written with the Base UI port. Sheet is Dialog styled as
 * a side panel (Base's Drawer was considered and declined: it is the
 * swipe-to-dismiss gesture primitive, not a desktop side panel), so the
 * dialog's verified animation model applies — this spec proves the one
 * integration that actually renders a Sheet: the sidebar's mobile mode.
 */

test.describe("sheet", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the mobile sidebar opens as a sheet and Escape closes it", async ({ page }) => {
    await gotoSection(page, "Team dashboard shell");

    await page.locator('[data-slot="sidebar-trigger"]').first().click();
    // the sidebar re-slots its mobile sheet as data-slot="sidebar"
    const sheet = page.locator('[data-slot="sidebar"][data-mobile="true"]');
    await expect(sheet).toBeVisible();
    expect(await sheet.evaluate((el) => el.hasAttribute("data-open"))).toBe(true);

    // the shell's navigation is inside the sheet on mobile
    await expect(sheet.getByRole("link").first()).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator('[data-slot="sidebar"][data-mobile="true"]')).toHaveCount(0);
  });
});
