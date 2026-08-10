import type { Page } from "@playwright/test";


/**
 * Container roles that carry `tabindex="0"` to *delegate* focus rather than to
 * receive it — the roving-tabindex pattern.
 *
 * A `tablist` holds the tab stop while its triggers sit at `tabindex="-1"`;
 * tabbing into the group hands focus straight to the active trigger, so the
 * list itself is never the focused element. Counting it as a control makes a
 * correctly-implemented Radix Tabs look like it has an unreachable element.
 * That is a flaw in this heuristic, not in the component.
 */
const DELEGATING_ROLES = new Set([
  "tablist",
  "radiogroup",
  "toolbar",
  "menu",
  "menubar",
  "listbox",
  "tree",
  "grid",
]);

/** The docs sections, by their sidebar label. */
export type SectionLabel =
  | "Overview"
  | "Colour"
  | "Typography"
  | "Components"
  | "Dashboard pattern"
  | "Team dashboard shell"
  | "Data table"
  | "Accessibility"
  | "List view"
  | "KPI dashboard"
  | "shadcn-space audit"
  | "Staging ledger"
  | "Sidebar bake-off";

/** Open a docs section and wait for it to settle. */
export async function gotoSection(page: Page, label: SectionLabel) {
  await page.goto("/");
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(150);
}

/**
 * Tab forward `n` times, returning what the browser focused each time.
 *
 * Reads the *accessible* name rather than textContent: an icon-only button in a
 * collapsed rail has text content of "" but should still have a name. Reporting
 * textContent would make those look fine when they are exactly the failure this
 * harness exists to catch.
 */
export async function tabThrough(page: Page, n: number): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press("Tab");
    seen.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return "<body>";
        const name =
          el.getAttribute("aria-label") ??
          el.getAttribute("title") ??
          (el.textContent ?? "").trim();
        return `${el.tagName.toLowerCase()}:${name.slice(0, 40) || "<unnamed>"}`;
      }),
    );
  }
  return seen;
}

/**
 * Does the currently focused element render a visible focus indicator?
 *
 * The base layer sets `:focus-visible { outline: 2px solid var(--ring) }`, but
 * nothing proves a component's own styles do not clobber it — `outline-none` is
 * one of the most-copied lines in the shadcn ecosystem. So this measures the
 * computed result rather than trusting the rule exists.
 */
export async function focusIsVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return false;
    const s = getComputedStyle(el);
    const outline =
      s.outlineStyle !== "none" && parseFloat(s.outlineWidth || "0") > 0;
    // A ring implemented as box-shadow is equally valid — shadcn does both.
    const ring = s.boxShadow !== "none" && s.boxShadow.trim() !== "";
    return outline || ring;
  });
}

/**
 * How many elements the page can actually focus right now.
 *
 * Needed because "tab N times and look for <body>" cannot distinguish focus
 * being *dropped* from focus simply running off the end of the document —
 * tabbing past the last control legitimately hands focus to browser chrome,
 * which reports as <body>. Counting first makes any <body> a real drop.
 *
 * Disabled controls are excluded deliberately: a single page of results
 * correctly disables all four pagination buttons, and they are not focusable.
 */
export async function focusableNames(page: Page): Promise<string[]> {
  return page.evaluate((delegating) => {
    const sel = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");
    return [...document.querySelectorAll<HTMLElement>(sel)]
      .filter((el) => {
        if (el.getAttribute("tabindex") === "-1") return false;
        const role = el.getAttribute("role");
        if (role && delegating.includes(role)) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((el) => {
        const name =
          el.getAttribute("aria-label") ??
          el.getAttribute("title") ??
          (el.textContent ?? "").trim();
        return `${el.tagName.toLowerCase()}:${name.slice(0, 40) || "<unnamed>"}`;
      });
  }, [...DELEGATING_ROLES]);
}

export async function focusableCount(page: Page): Promise<number> {
  return page.evaluate((delegating) => {
    const sel = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");
    return [...document.querySelectorAll<HTMLElement>(sel)].filter((el) => {
      if (el.getAttribute("tabindex") === "-1") return false;
      const role = el.getAttribute("role");
      if (role && delegating.includes(role)) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }).length;
  }, [...DELEGATING_ROLES]);
}
