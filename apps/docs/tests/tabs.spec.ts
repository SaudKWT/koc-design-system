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
    expect(style.easing).toBe("cubic-bezier(0.34, 1.2, 0.64, 1)");
    expect(style.duration).toBe("0.24s");
  });

  test("never overshoots outside its own container, mid-flight", async ({ page }) => {
    // The bug this pins: ease-spring at the conventional 1.56 overshoots ~9.8%,
    // which on the asset tabs' ~150px travel is nearly 15px — and the list only
    // carries 3px of padding, so the pill visibly escaped on the outermost tab.
    // Sampling only the resting position would have missed it entirely.
    await gotoSection(page, "Data table");

    const list = page.locator('[data-slot="tabs-list"]').first();
    await expect(list.locator('[data-slot="tabs-indicator"]')).toBeVisible();

    // Jump to the far tab, which is the longest travel and the worst case.
    await page.getByRole("tab", { name: /Heavy Oil/ }).click();

    // Sample throughout the transition rather than after it settles.
    const worst = await list.evaluate(async (el) => {
      const ind = el.querySelector<HTMLElement>('[data-slot="tabs-indicator"]')!;
      let escape = 0;
      for (let i = 0; i < 40; i++) {
        const l = el.getBoundingClientRect();
        const b = ind.getBoundingClientRect();
        escape = Math.max(escape, b.right - l.right, l.left - b.left);
        await new Promise((r) => requestAnimationFrame(r));
      }
      return escape;
    });

    expect(worst, "indicator escaped the tabs list during the transition").toBeLessThan(1);
  });

  test("sits evenly inside the list, with concentric corners", async ({ page }) => {
    await gotoSection(page, "Detail view");

    const geometry = await page
      .locator('[data-slot="tabs-list"]')
      .first()
      .evaluate((el) => {
        const ind = el.querySelector<HTMLElement>('[data-slot="tabs-indicator"]')!;
        const l = el.getBoundingClientRect();
        const i = ind.getBoundingClientRect();
        const pad = parseFloat(getComputedStyle(el).paddingTop);
        return {
          pad,
          top: i.top - l.top,
          bottom: l.bottom - i.bottom,
          left: i.left - l.left,
          outerRadius: parseFloat(getComputedStyle(el).borderRadius),
          innerRadius: parseFloat(getComputedStyle(ind).borderRadius),
        };
      });

    // Every inset equals the list's padding. shadcn's h-[calc(100%-1px)] left the
    // trigger 1px short of the content box, and centring split the remainder as
    // 4px above / 3px below — visible, and wrong against 3px of padding.
    expect(geometry.top, "inset above").toBeCloseTo(geometry.pad, 1);
    expect(geometry.bottom, "inset below").toBeCloseTo(geometry.pad, 1);
    expect(geometry.left, "inset left").toBeCloseTo(geometry.pad, 1);

    // Concentric corners: the inner radius must be the outer minus the gap, or
    // the corners read as pinched even though the edges are parallel.
    expect(
      geometry.outerRadius - geometry.innerRadius,
      "inner radius should be outer minus the padding",
    ).toBeCloseTo(geometry.pad, 1);
  });
});
