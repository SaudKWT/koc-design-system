import { test, expect } from "@playwright/test";

import { gotoSection } from "./helpers";

/**
 * Dialog behaviour, written with the Base UI port (BASE-UI-MIGRATION.md
 * Phase 1). These assertions are the pilot's contract:
 *
 * - The entrance animation is keyed off `data-open` and timed from the KOC
 *   scale. A stale state selector does not error, it silently stops animating —
 *   this is the one place that class of regression is caught in a real browser.
 * - The exit animation actually runs before Base unmounts the popup. Base
 *   waits on `element.getAnimations()`; if the `data-closed` keying breaks,
 *   the dialog pops out of existence and `__anims` records no "exit".
 * - ConfirmDialog opens with focus on Cancel (divergence #2). The failure this
 *   prevents is concrete: a stray Enter — a very common way to dismiss a
 *   dialog — must never destroy the record.
 */

test.describe("dialog", () => {
  test("opens from a real click, animates on-scale, and Escape closes and unmounts it", async ({
    page,
  }) => {
    await gotoSection(page, "List view");
    await page.getByRole("button", { name: "Open", exact: true }).first().click();

    const dialog = page.locator('[data-slot="dialog-content"]');
    await expect(dialog).toBeVisible();

    const entrance = await dialog.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        open: el.hasAttribute("data-open"),
        name: s.animationName,
        duration: s.animationDuration,
      };
    });
    expect(entrance.open).toBe(true);
    expect(entrance.name).toBe("enter"); // tw-animate-css entrance, keyed off data-open
    expect(entrance.duration).toBe("0.3s"); // duration-slower — the modal ceiling

    await page.evaluate(() => {
      const w = window as unknown as { __anims: string[] };
      w.__anims = [];
      document.addEventListener(
        "animationstart",
        (e) => w.__anims.push((e as AnimationEvent).animationName),
        true,
      );
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    // the exit animation ran, and the popup unmounted after it — not before
    expect(
      await page.evaluate(() => (window as unknown as { __anims: string[] }).__anims),
    ).toContain("exit");
    await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);
  });

  test("Escape returns focus to the control that opened the dialog", async ({ page }) => {
    await gotoSection(page, "List view");
    const opener = page.getByRole("button", { name: "Open", exact: true }).first();
    await opener.click();
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);
    // No Dialog.Trigger here — the dialog is controlled by a row button, so
    // Base's fallback ("previously focused element") is what carries the duty.
    await expect(opener).toBeFocused();
  });

  test("clicking the backdrop dismisses the dialog", async ({ page }) => {
    await gotoSection(page, "List view");
    await page.getByRole("button", { name: "Open", exact: true }).first().click();
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible();
    await page.mouse.click(8, 8); // far corner — always backdrop, never the popup
    await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);
  });
});

test.describe("confirm dialog", () => {
  test("initial focus lands on Cancel, and a stray Enter does not destroy the record", async ({
    page,
  }) => {
    await gotoSection(page, "List view");
    await page.getByRole("button", { name: "Open", exact: true }).first().click();
    await page.getByRole("button", { name: "Void report" }).click();

    const confirm = page
      .getByRole("dialog")
      .filter({ hasText: "cannot be undone" });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();

    // The scenario divergence #2 exists to prevent: Enter straight away.
    await page.keyboard.press("Enter");
    await expect(confirm).toBeHidden();
    // Nothing was voided — no toast appeared.
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
  });

  test("Escape closes only the top-most dialog of a nested pair", async ({ page }) => {
    await gotoSection(page, "List view");
    await page.getByRole("button", { name: "Open", exact: true }).first().click();
    await page.getByRole("button", { name: "Void report" }).click();
    await expect(page.getByRole("dialog").filter({ hasText: "cannot be undone" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog").filter({ hasText: "cannot be undone" })).toBeHidden();
    // the record view underneath survives
    await expect(page.locator('[data-slot="dialog-content"]').first()).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);
  });
});
