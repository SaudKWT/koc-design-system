import { test, expect } from "@playwright/test";

import { gotoSection } from "./helpers";

/**
 * The sliding tab indicator.
 *
 * Verified with real browser events, not synthetic ones. Four earlier attempts
 * at this were debugged through a hand-rolled JS harness that dispatched
 * synthetic events, and Radix ignores those in places — so the harness itself
 * was never trustworthy. Playwright drives the real input stack, and the
 * assertion becomes a regression test either way.
 */
test.describe("tabs indicator", () => {
  test("tracks the active tab, matching its box exactly", async ({ page }) => {
    await gotoSection(page, "Detail view");

    const list = page.locator('[data-slot="tabs-list"]').first();
    const indicator = list.locator('[data-slot="tabs-indicator"]');
    await expect(indicator).toBeVisible();

    // Reads the indicator's box against the active trigger's box.
    const drift = async () =>
      list.evaluate((el) => {
        const ind = el.querySelector<HTMLElement>('[data-slot="tabs-indicator"]')!;
        const act = el.querySelector<HTMLElement>('[data-state="active"]')!;
        const i = ind.getBoundingClientRect();
        const a = act.getBoundingClientRect();
        return { tab: act.textContent?.trim(), dLeft: i.left - a.left, dWidth: i.width - a.width };
      });

    const onLoad = await drift();
    expect(Math.abs(onLoad.dLeft), `on load, over ${onLoad.tab}`).toBeLessThan(1);
    expect(Math.abs(onLoad.dWidth), `on load, over ${onLoad.tab}`).toBeLessThan(1);

    // A real click. "History" is wider than "Report", so this also proves the
    // indicator resizes rather than only translating.
    await page.getByRole("tab", { name: /History/ }).click();
    await page.waitForTimeout(400); // let the spring settle

    const moved = await drift();
    expect(moved.tab).toBe("History");
    expect(Math.abs(moved.dLeft), "after switching to History").toBeLessThan(1);
    expect(Math.abs(moved.dWidth), "after switching to History").toBeLessThan(1);

    // And back.
    await page.getByRole("tab", { name: /Report/ }).click();
    await page.waitForTimeout(400);

    const back = await drift();
    expect(back.tab).toBe("Report");
    expect(Math.abs(back.dLeft), "after switching back").toBeLessThan(1);
    expect(Math.abs(back.dWidth), "after switching back").toBeLessThan(1);
  });

  test("animates on the KOC motion scale, not a hardcoded curve", async ({ page }) => {
    await gotoSection(page, "Detail view");

    const style = await page
      .locator('[data-slot="tabs-indicator"]')
      .first()
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return { easing: s.transitionTimingFunction, duration: s.transitionDuration };
      });

    // ease-spring / duration-slow from foundation.ts.
    expect(style.easing).toBe("cubic-bezier(0.34, 1.56, 0.64, 1)");
    expect(style.duration).toBe("0.24s");
  });
});
