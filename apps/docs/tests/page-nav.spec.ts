import { test, expect } from "@playwright/test";

import { gotoSection } from "./helpers";

/**
 * Navigation menu behaviour, written with the Base UI port. This primitive
 * was the one Phase 0 never probed — its viewport variables had no confirmed
 * mapping — so this spec is the empirical record: the panel opens through
 * Base's Portal → Positioner → Popup → Viewport chain, the popup is sized by
 * `--popup-width/-height`, and open/close motion is a transition on the KOC
 * scale (keyframes cannot tween the popup's resize between panels).
 */

test.describe("page nav", () => {
  test("a nav group opens its panel, sized by the popup variables, on-scale", async ({
    page,
  }) => {
    await gotoSection(page, "Full application");
    // The PageNav lives on the DDR screen, not the landing dashboard.
    await page
      .locator('[data-shell-frame] a', { hasText: "Daily drilling reports" })
      .click();

    const trigger = page.locator('[data-slot="navigation-menu-trigger"]').first();
    await expect(trigger).toBeVisible();
    await trigger.click();

    const popup = page.locator('[data-slot="navigation-menu-viewport"]');
    await expect(popup).toBeVisible();
    await expect(
      popup.locator('[data-slot="navigation-menu-content"]').getByRole("link").first(),
    ).toBeVisible();

    const computed = await popup.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        open: el.hasAttribute("data-open"),
        popupWidthVar: s.getPropertyValue("--popup-width"),
        widthPx: el.getBoundingClientRect().width,
        transitionDuration: s.transitionDuration,
      };
    });
    expect(computed.open).toBe(true);
    expect(computed.popupWidthVar).not.toBe(""); // Base's live size variable
    expect(computed.widthPx).toBeGreaterThan(100); // and it actually sizes the popup
    expect(computed.transitionDuration).toContain("0.24s"); // duration-slow

    await page.keyboard.press("Escape");
    await expect(page.locator('[data-slot="navigation-menu-viewport"]')).toHaveCount(0);
  });
});
