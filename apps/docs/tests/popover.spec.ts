import { test, expect } from "@playwright/test";

import { gotoSection } from "./helpers";

/**
 * Popover-family behaviour, written with the Base UI port (Phase 2 of
 * BASE-UI-MIGRATION.md). The load-bearing assertions:
 *
 * - The entrance animation is keyed off `data-open` and timed from the KOC
 *   scale — a stale state variant silently stops animating, nothing errors.
 * - `--anchor-width` (Base's replacement for the Radix trigger-width
 *   variable) actually reaches the popup: the combobox popover must match its
 *   trigger's width, which is the one place a wrong variable name is visible
 *   as layout rather than as a subtlety.
 * - Checkbox state styling is keyed off `data-checked` / `data-unchecked`.
 */

test.describe("popover", () => {
  test("combobox popover opens on-scale and matches its trigger's width", async ({ page }) => {
    await gotoSection(page, "List view");
    const trigger = page.getByRole("combobox", { name: "Filter by well" });
    await trigger.click();

    const popup = page.locator('[data-slot="popover-content"]');
    await expect(popup).toBeVisible();

    const entrance = await popup.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        open: el.hasAttribute("data-open"),
        name: s.animationName,
        duration: s.animationDuration,
      };
    });
    expect(entrance.open).toBe(true);
    expect(entrance.name).toBe("enter");
    expect(entrance.duration).toBe("0.24s"); // duration-slow — popovers' step

    // w-(--anchor-width): the popup tracks the trigger it anchors to
    const triggerBox = await trigger.boundingBox();
    const popupBox = await popup.boundingBox();
    expect(Math.abs((popupBox?.width ?? 0) - (triggerBox?.width ?? 0))).toBeLessThan(1.5);

    await page.keyboard.press("Escape");
    await expect(page.locator('[data-slot="popover-content"]')).toHaveCount(0);
  });

  test("the date range filter's popover opens with the calendar and closes", async ({ page }) => {
    await gotoSection(page, "List view");
    await page.getByRole("button", { name: /Date range/ }).click();
    const popup = page.locator('[data-slot="popover-content"]');
    await expect(popup).toBeVisible();
    await expect(popup.getByRole("grid").first()).toBeVisible(); // the calendar
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-slot="popover-content"]')).toHaveCount(0);
  });
});

test.describe("checkbox", () => {
  test("checking styles through data-checked and announces through aria-checked", async ({
    page,
  }) => {
    await gotoSection(page, "Full application");
    const box = page.locator('[data-slot="checkbox"]').first();
    await expect(box).toBeVisible();

    const before = await box.evaluate((el) => ({
      checked: el.hasAttribute("data-checked"),
      unchecked: el.hasAttribute("data-unchecked"),
      aria: el.getAttribute("aria-checked"),
    }));
    await box.click();
    const after = await box.evaluate((el) => ({
      checked: el.hasAttribute("data-checked"),
      aria: el.getAttribute("aria-checked"),
      // the styling the attribute keys: checked = filled with the brand colour
      background: getComputedStyle(el).backgroundColor,
    }));

    expect(before.checked).not.toBe(after.checked);
    expect(after.aria).not.toBe(before.aria);
    if (after.checked) {
      expect(after.background).not.toBe("rgba(0, 0, 0, 0)");
    }
  });
});
