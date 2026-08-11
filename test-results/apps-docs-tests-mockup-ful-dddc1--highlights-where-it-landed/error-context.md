# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: apps/docs/tests/mockup.spec.ts >> full application >> switching to a unit without that screen falls back, and highlights where it landed
- Location: apps/docs/tests/mockup.spec.ts:60:3

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/", waiting until "load"

```

# Test source

```ts
  1   | import type { Page } from "@playwright/test";
  2   | 
  3   | 
  4   | /**
  5   |  * Container roles that carry `tabindex="0"` to *delegate* focus rather than to
  6   |  * receive it — the roving-tabindex pattern.
  7   |  *
  8   |  * A `tablist` holds the tab stop while its triggers sit at `tabindex="-1"`;
  9   |  * tabbing into the group hands focus straight to the active trigger, so the
  10  |  * list itself is never the focused element. Counting it as a control makes a
  11  |  * correctly-implemented Radix Tabs look like it has an unreachable element.
  12  |  * That is a flaw in this heuristic, not in the component.
  13  |  */
  14  | const DELEGATING_ROLES = new Set([
  15  |   "tablist",
  16  |   "radiogroup",
  17  |   "toolbar",
  18  |   "menu",
  19  |   "menubar",
  20  |   "listbox",
  21  |   "tree",
  22  |   "grid",
  23  | ]);
  24  | 
  25  | /** The docs sections, by their sidebar label. */
  26  | export type SectionLabel =
  27  |   | "Overview"
  28  |   | "Full application"
  29  |   | "Colour"
  30  |   | "Typography"
  31  |   | "Components"
  32  |   | "Dashboard pattern"
  33  |   | "Team dashboard shell"
  34  |   | "Data table"
  35  |   | "Accessibility"
  36  |   | "List view"
  37  |   | "KPI dashboard"
  38  |   | "Detail view"
  39  |   | "shadcn-space audit"
  40  |   | "Staging ledger"
  41  |   | "Sidebar bake-off";
  42  | 
  43  | /** Open a docs section and wait for it to settle. */
  44  | export async function gotoSection(page: Page, label: SectionLabel) {
> 45  |   await page.goto("/");
      |              ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  46  |   await page.getByRole("button", { name: label, exact: true }).click();
  47  |   await page.waitForTimeout(150);
  48  | }
  49  | 
  50  | /**
  51  |  * Tab forward `n` times, returning what the browser focused each time.
  52  |  *
  53  |  * Reads the *accessible* name rather than textContent: an icon-only button in a
  54  |  * collapsed rail has text content of "" but should still have a name. Reporting
  55  |  * textContent would make those look fine when they are exactly the failure this
  56  |  * harness exists to catch.
  57  |  */
  58  | export async function tabThrough(page: Page, n: number): Promise<string[]> {
  59  |   const seen: string[] = [];
  60  |   for (let i = 0; i < n; i++) {
  61  |     await page.keyboard.press("Tab");
  62  |     seen.push(
  63  |       await page.evaluate(() => {
  64  |         const el = document.activeElement as HTMLElement | null;
  65  |         if (!el || el === document.body) return "<body>";
  66  |         const name =
  67  |           el.getAttribute("aria-label") ??
  68  |           el.getAttribute("title") ??
  69  |           (el.textContent ?? "").trim();
  70  |         return `${el.tagName.toLowerCase()}:${name.slice(0, 40) || "<unnamed>"}`;
  71  |       }),
  72  |     );
  73  |   }
  74  |   return seen;
  75  | }
  76  | 
  77  | /**
  78  |  * Does the currently focused element render a visible focus indicator?
  79  |  *
  80  |  * The base layer sets `:focus-visible { outline: 2px solid var(--ring) }`, but
  81  |  * nothing proves a component's own styles do not clobber it — `outline-none` is
  82  |  * one of the most-copied lines in the shadcn ecosystem. So this measures the
  83  |  * computed result rather than trusting the rule exists.
  84  |  */
  85  | export async function focusIsVisible(page: Page): Promise<boolean> {
  86  |   return page.evaluate(() => {
  87  |     const el = document.activeElement as HTMLElement | null;
  88  |     if (!el || el === document.body) return false;
  89  |     const s = getComputedStyle(el);
  90  |     const outline =
  91  |       s.outlineStyle !== "none" && parseFloat(s.outlineWidth || "0") > 0;
  92  |     // A ring implemented as box-shadow is equally valid — shadcn does both.
  93  |     const ring = s.boxShadow !== "none" && s.boxShadow.trim() !== "";
  94  |     return outline || ring;
  95  |   });
  96  | }
  97  | 
  98  | /**
  99  |  * How many elements the page can actually focus right now.
  100 |  *
  101 |  * Needed because "tab N times and look for <body>" cannot distinguish focus
  102 |  * being *dropped* from focus simply running off the end of the document —
  103 |  * tabbing past the last control legitimately hands focus to browser chrome,
  104 |  * which reports as <body>. Counting first makes any <body> a real drop.
  105 |  *
  106 |  * Disabled controls are excluded deliberately: a single page of results
  107 |  * correctly disables all four pagination buttons, and they are not focusable.
  108 |  */
  109 | export async function focusableNames(page: Page): Promise<string[]> {
  110 |   return page.evaluate((delegating) => {
  111 |     const sel = [
  112 |       "a[href]",
  113 |       "button:not([disabled])",
  114 |       "input:not([disabled])",
  115 |       "select:not([disabled])",
  116 |       "textarea:not([disabled])",
  117 |       '[tabindex]:not([tabindex="-1"])',
  118 |     ].join(",");
  119 |     return [...document.querySelectorAll<HTMLElement>(sel)]
  120 |       .filter((el) => {
  121 |         if (el.getAttribute("tabindex") === "-1") return false;
  122 |         const role = el.getAttribute("role");
  123 |         if (role && delegating.includes(role)) return false;
  124 |         const r = el.getBoundingClientRect();
  125 |         return r.width > 0 && r.height > 0;
  126 |       })
  127 |       .map((el) => {
  128 |         const name =
  129 |           el.getAttribute("aria-label") ??
  130 |           el.getAttribute("title") ??
  131 |           (el.textContent ?? "").trim();
  132 |         return `${el.tagName.toLowerCase()}:${name.slice(0, 40) || "<unnamed>"}`;
  133 |       });
  134 |   }, [...DELEGATING_ROLES]);
  135 | }
  136 | 
  137 | export async function focusableCount(page: Page): Promise<number> {
  138 |   return page.evaluate((delegating) => {
  139 |     const sel = [
  140 |       "a[href]",
  141 |       "button:not([disabled])",
  142 |       "input:not([disabled])",
  143 |       "select:not([disabled])",
  144 |       "textarea:not([disabled])",
  145 |       '[tabindex]:not([tabindex="-1"])',
```