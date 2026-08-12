import { test, expect } from "@playwright/test";

import { focusableNames, gotoSection, tabThrough, focusIsVisible } from "./helpers";

/**
 * The assertions axe cannot make.
 *
 * These encode the KOC-specific behavioural rules the same way contrast is
 * encoded rather than documented — because "we should check keyboard access"
 * in a guideline has the same shelf life as "don't hardcode colours" did.
 */

test.describe("focus", () => {
  test("every tabbable control in the shell shows a visible focus indicator", async ({
    page,
  }) => {
    await gotoSection(page, "Team dashboard shell");

    const unfocusable: string[] = [];
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      const el = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (!a || a === document.body) return null;
        return `${a.tagName.toLowerCase()}:${(a.getAttribute("aria-label") ?? a.textContent ?? "").trim().slice(0, 30)}`;
      });
      if (!el) continue;
      if (!(await focusIsVisible(page))) unfocusable.push(el);
    }

    expect(
      unfocusable,
      `Controls reachable by keyboard with no visible focus indicator:\n  ${unfocusable.join("\n  ")}`,
    ).toEqual([]);
  });

  test("every focusable control is reachable by keyboard", async ({ page }) => {
    await gotoSection(page, "Data table");

    // Reachability rather than "does <body> appear": tabbing legitimately runs
    // off the end of the document into browser chrome, which reports as <body>,
    // and Chromium keeps its own sequential-focus starting point that blur()
    // does not reset. Two earlier versions of this test failed on both of those
    // rather than on a real defect.
    //
    // Coverage is the property that actually matters and it does not care where
    // traversal begins: tab a full cycle plus one, and every control the page
    // exposes should have been visited.
    const expected = await focusableNames(page);

    // Tab until everything has been seen, with a hard cap. A fixed count is
    // fragile: traversal starts wherever the last click left focus, and the
    // trip past the end of the document into browser chrome consumes a step of
    // its own, so "one full cycle" is not a fixed number of presses.
    // Track coverage against the expected set specifically. Counting every
    // visited name would include <body> from the wrap past the document end,
    // inflating the count and stopping the loop before coverage is complete.
    const want = new Set(expected);
    const covered = new Set<string>();
    const cap = expected.length * 2 + 6;
    for (let i = 0; i < cap && covered.size < want.size; i++) {
      for (const name of await tabThrough(page, 1)) {
        if (want.has(name)) covered.add(name);
      }
    }
    const visited = covered;

    const unreachable = expected.filter((n) => !visited.has(n));

    expect(
      unreachable,
      `Focusable controls never reached by tabbing:\n  ${unreachable.join("\n  ")}`,
    ).toEqual([]);
  });
});

test.describe("app shell", () => {
  test("collapsed rail items keep an accessible name", async ({ page }) => {
    await gotoSection(page, "Team dashboard shell");

    const frame = page.locator("[data-shell-frame]");
    await frame.locator('[data-slot="sidebar-trigger"]').click();
    await expect(frame.locator('[data-slot="sidebar"]')).toHaveAttribute(
      "data-state",
      "collapsed",
    );

    // This is THE failure mode of an icon rail: the label is clipped away by
    // overflow, and if the tooltip is hover-only the button becomes an
    // unidentifiable icon for anyone not using a mouse.
    const unnamed = await frame.locator('[data-slot="sidebar-menu-button"]').evaluateAll(
      (els) =>
        els
          .filter((el) => {
            const name =
              el.getAttribute("aria-label") ??
              el.getAttribute("title") ??
              (el.textContent ?? "").trim();
            return !name;
          })
          .map((el) => el.outerHTML.slice(0, 90)),
    );

    expect(
      unnamed,
      `Collapsed rail buttons with no accessible name:\n  ${unnamed.join("\n  ")}`,
    ).toEqual([]);
  });

  test("the unit switcher opens and lists every unit", async ({ page }) => {
    await gotoSection(page, "Team dashboard shell");
    const frame = page.locator("[data-shell-frame]");
    await frame.locator('[data-slot="sidebar-header"] button').click();

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    // Seven DWOS units plus the All units escape hatch.
    await expect(menu.getByRole("menuitem")).toHaveCount(8);
  });

  test("Escape closes the unit switcher and returns focus to the trigger", async ({
    page,
  }) => {
    await gotoSection(page, "Team dashboard shell");
    const trigger = page.locator('[data-shell-frame] [data-slot="sidebar-header"] button');
    await trigger.click();
    await expect(page.getByRole("menu")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    // Losing focus to <body> after closing a menu strands a keyboard user at
    // the top of the document.
    await expect(trigger).toBeFocused();
  });
});

test.describe("data table", () => {
  test("sortable headers expose and update aria-sort", async ({ page }) => {
    await gotoSection(page, "Data table");

    const wellHeader = page.getByRole("columnheader", { name: /Well/ }).first();
    await expect(wellHeader).toHaveAttribute("aria-sort", "none");

    await wellHeader.getByRole("button").click();
    await expect(wellHeader).toHaveAttribute("aria-sort", "ascending");

    await wellHeader.getByRole("button").click();
    await expect(wellHeader).toHaveAttribute("aria-sort", "descending");
  });

  test("the row count is in a live region so filtering is announced", async ({ page }) => {
    await gotoSection(page, "Data table");

    const live = page.locator("[aria-live]").filter({ hasText: /row/ });
    await expect(live).toBeVisible();
    const before = await live.textContent();

    await page.getByRole("textbox", { name: /Search wells/i }).fill("BG-1042");
    await expect(live).not.toHaveText(before ?? "");
  });

  test("filtered-empty is a different state from empty, with a way out", async ({ page }) => {
    await gotoSection(page, "Data table");

    await page.getByRole("textbox", { name: /Search wells/i }).fill("zzzzz");
    await expect(page.getByText("No matching rows")).toBeVisible();

    // The recovery action is the point: an empty table with no way to undo the
    // filter looks identical to an empty table with no data.
    await page.getByRole("button", { name: "Clear filter" }).click();
    await expect(page.getByText("No matching rows")).toBeHidden();
  });

  test("the table has an accessible caption", async ({ page }) => {
    await gotoSection(page, "Data table");
    const caption = page.locator("table caption");
    await expect(caption).toHaveCount(1);
    expect((await caption.textContent())?.trim().length).toBeGreaterThan(10);
  });
});

/**
 * The guard behind a11y.spec.ts's landmark exemptions.
 *
 * Three landmark rules are disabled there because embedding AppShell inside a
 * docs page nests the shell's `main` in the page's own — an artifact that cannot
 * happen in a consuming app, where the shell IS the page. Disabling them without
 * this would mean a genuine landmark regression in the shell goes unreported,
 * which is exactly how an allowlist rots.
 *
 * So the shell's own landmark shape is asserted directly instead.
 */
test.describe("app shell landmarks", () => {
  test("the sidebar is a labelled navigation landmark", async ({ page }) => {
    await gotoSection(page, "Team dashboard shell");

    const frame = page.locator("[data-shell-frame]");
    const nav = frame.getByRole("navigation", { name: /navigation$/i });
    await expect(nav).toHaveCount(1);

    // The point of the fix: the sidebar's links must be reachable through the
    // nav landmark. Before it, getByRole('navigation') found the BREADCRUMB and
    // a consumer writing this exact query got three links and a wrong diagnosis.
    const links = nav.getByRole("link");
    expect(await links.count()).toBeGreaterThan(5);

    // Two navs on a page — this and the breadcrumb — so the name is load-bearing.
    const allNavs = frame.getByRole("navigation");
    for (let i = 0; i < (await allNavs.count()); i++) {
      const name = await allNavs.nth(i).getAttribute("aria-label");
      expect(name, "every navigation landmark must be named").toBeTruthy();
    }
  });

  test("the shell renders exactly one main landmark", async ({ page }) => {
    await gotoSection(page, "Team dashboard shell");
    await expect(page.locator('[data-shell-frame] main')).toHaveCount(1);
  });
});
