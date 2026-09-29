import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * D&W landing directions — the floor every direction must clear before it is
 * shown for comparison. Evaluation-only (src/bakeoff/landing/), so this file
 * checks correctness, never taste.
 *
 * Run just these:  KOC_DOCS_PORT=4187 npx playwright test landing
 */

/**
 * Open a direction and wait until it has actually rendered, then settle.
 *
 * A fixed sleep alone flaked under load: with several sessions' dev servers and
 * browsers on one machine, a lazily loaded direction sometimes had no <main>
 * yet when axe ran. Waiting for the landmark removes that; the short settle
 * that follows is for entrance motion, not for loading.
 */
async function openDirection(page: import("@playwright/test").Page, id: string, settleMs: number) {
  await page.goto(`/#/landing/${id}`);
  await page.locator("main h1, h1").first().waitFor({ state: "attached", timeout: 30_000 });
  await page.locator("main").first().waitFor({ state: "attached", timeout: 30_000 });
  await page.waitForTimeout(settleMs);
}

const IDS_V1 = ["a", "b", "c", "d", "e", "f", "g", "h", "i"] as const;
/** v2 rounds present in this checkout. Each branch adds its own; the merge unions them. */
const IDS_V2 = ["a2", "b2", "c2", "d2", "e2", "f2", "g2", "h2", "i2"] as const;
const IDS = [...IDS_V1, ...IDS_V2] as const;

for (const id of IDS) {
  test.describe(`landing ${id}`, () => {
    test("axe: no violations (light)", async ({ page }) => {
      await openDirection(page, id, 600);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
        // Asserted at the token level; see a11y.spec.ts.
        .disableRules(["color-contrast"])
        .analyze();
      const detail = results.violations
        .map((v) => `\n  [${v.impact}] ${v.id} — ${v.help}\n` + v.nodes.map((n) => `      ${n.target.join(" ")}`).join("\n"))
        .join("");
      expect(results.violations, detail).toEqual([]);
    });

    test("exactly one h1 and one main", async ({ page }) => {
      await openDirection(page, id, 400);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("main")).toHaveCount(1);
    });

    test("all 28 dashboard links open in a new tab and announce it", async ({ page }) => {
      await openDirection(page, id, 400);
      const links = page.locator('a[href*=".dweg.invalid"]');
      await expect(links).toHaveCount(28);
      for (const l of await links.all()) {
        await expect(l).toHaveAttribute("target", "_blank");
        await expect(l).toHaveAttribute("rel", /noopener/);
        await expect(l).toContainText("opens in a new tab");
      }
    });

    test("all eight teams are named", async ({ page }) => {
      await openDirection(page, id, 400);
      for (const code of ["EN01", "EN11", "EN31", "EN41", "EN51", "EN61", "EN71", "EN81"]) {
        await expect(page.getByText(code, { exact: false }).first()).toBeAttached();
      }
    });

    for (const width of [1440, 1024, 390]) {
      test(`no horizontal scroll at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await openDirection(page, id, 500);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }

    test("reduced motion: no running CSS animations after settle", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openDirection(page, id, 1200);
      const running = await page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => a.playState === "running")
          .filter((a) => {
            const t = (a.effect as KeyframeEffect | null)?.target as Element | null;
            // Sonner's toaster and the viewer bar are not part of any direction.
            return t && !t.closest("[data-sonner-toaster],[aria-label='Direction viewer']");
          })
          .map((a) => {
            const t = (a.effect as KeyframeEffect).target as Element;
            return `${t.tagName.toLowerCase()}.${String(t.className).slice(0, 60)}`;
          }),
      );
      expect(running).toEqual([]);
    });

    test("keyboard: first dashboard link is reachable with a visible focus ring", async ({ page }) => {
      await openDirection(page, id, 400);
      let found = false;
      for (let i = 0; i < 60 && !found; i++) {
        await page.keyboard.press("Tab");
        found = await page.evaluate(() => {
          const el = document.activeElement as HTMLAnchorElement | null;
          return !!el && el.tagName === "A" && el.href.includes(".dweg.invalid");
        });
      }
      expect(found, "no dashboard link reached within 60 tabs").toBe(true);
      const visible = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const cs = getComputedStyle(el);
        return (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
      });
      expect(visible, "focused dashboard link shows no outline or ring").toBe(true);
    });
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
 * v2: DAILY USE. The rules from V2-BRIEF.md, as assertions. Every v2 page must
 * also pass every test above.
 * ──────────────────────────────────────────────────────────────────────────── */

const LINKS = 'a[href*=".dweg.invalid"]';

for (const id of IDS_V2) {
  test.describe(`landing ${id} v2`, () => {
    for (const [w, h] of [
      [1440, 900],
      [1280, 630], // a 1920×1080 KOC laptop at 150% scaling, minus Edge's chrome
    ] as const) {
      test(`KPIs: every [data-kpi] figure is fully in the first viewport at ${w}×${h}`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h });
        await openDirection(page, id, 800);
        const boxes = await page.locator("[data-kpi]").evaluateAll((els) =>
          els.map((el) => {
            const r = el.getBoundingClientRect();
            return { id: el.getAttribute("data-kpi"), top: r.top, bottom: r.bottom, left: r.left, right: r.right };
          }),
        );
        expect(boxes.length, "tag each KPI's container with data-kpi={k.id}").toBeGreaterThanOrEqual(8);
        const outside = boxes.filter((b) => b.top < 0 || b.bottom > h || b.left < 0 || b.right > w);
        expect(outside, "KPIs must be visible without scrolling").toEqual([]);
      });
    }

    test("find: a visible search field in the first viewport, Ctrl+K focuses it, typing finds a dashboard", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await openDirection(page, id, 600);
      const field = page.getByRole("searchbox").or(page.getByRole("combobox")).first();
      await expect(field).toBeVisible();
      const box = await field.boundingBox();
      expect(box && box.y + box.height <= 900, "search field must be in the first viewport").toBe(true);
      await page.locator("body").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press("Control+k");
      await expect(field).toBeFocused();
      await page.keyboard.type("payment");
      await page.waitForTimeout(400);
      const hit = page.getByRole("link", { name: /Payment certificates/ }).first();
      await expect(hit).toBeVisible();
      await expect(hit).toBeInViewport();
    });

    for (const [w, h, screens] of [
      [1440, 900, 1.5],
      [1280, 720, 2],
    ] as const) {
      test(`no hunting: all 28 dashboard links start within ${screens} screens at ${w}×${h}`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h });
        await openDirection(page, id, 600);
        const tops = await page
          .locator(LINKS)
          .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top + window.scrollY));
        expect(tops.length).toBe(28);
        expect(Math.max(...tops), `deepest link must start above ${screens} × ${h}px`).toBeLessThanOrEqual(screens * h);
      });
    }

    test("your dashboards: an opened link appears under Recent and a pin survives a reload", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await openDirection(page, id, 600);
      await page.getByRole("link", { name: /Contract register/ }).first().click();
      await page.getByRole("button", { name: "Pin Tender pipeline", exact: true }).first().click();
      // Prove the pin landed before reloading, so a failure below means persistence, not a lost click.
      await expect(page.getByRole("button", { name: "Unpin Tender pipeline", exact: true }).first()).toHaveAttribute("aria-pressed", "true");
      await page.reload();
      await page.locator("main").first().waitFor({ state: "attached", timeout: 30_000 });
      const pinned = page.getByRole("region", { name: /pinned/i });
      const recent = page.getByRole("region", { name: /recent/i });
      // Generous timeouts: under load a lazily loaded direction can take seconds to re-render.
      await expect(pinned.getByRole("link", { name: /Tender pipeline/ })).toBeVisible({ timeout: 15_000 });
      await expect(recent.getByRole("link", { name: /Contract register/ })).toBeVisible({ timeout: 15_000 });
      await expect(pinned, "pinned dashboards belong in the first viewport").toBeInViewport();
      await expect(page.getByRole("button", { name: "Unpin Tender pipeline", exact: true }).first()).toHaveAttribute("aria-pressed", "true");
    });

    test("visuals stay in empty space: no canvas or running animation overlaps a link, KPI or the search field", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await openDirection(page, id, 1500);
      const overlaps = await page.evaluate((linkSel) => {
        const pageRect = (el: Element) => {
          const r = el.getBoundingClientRect();
          const fixed = getComputedStyle(el).position === "fixed";
          // A fixed layer covers whatever is under it at every scroll position.
          return fixed
            ? { l: r.left, r: r.right, t: 0, b: document.documentElement.scrollHeight, fixed }
            : { l: r.left, r: r.right, t: r.top + scrollY, b: r.bottom + scrollY, fixed };
        };
        const isViewer = (el: Element) => !!el.closest("[aria-label='Direction viewer'],[data-sonner-toaster]");
        const functional = [
          ...document.querySelectorAll(`${linkSel}, [data-kpi], input[type='search'], [role='searchbox'], [role='combobox']`),
        ].filter((el) => !isViewer(el));
        const moving = new Set<Element>();
        document.querySelectorAll("canvas").forEach((c) => moving.add(c));
        document.getAnimations().forEach((a) => {
          if (a.playState !== "running") return;
          const t = (a.effect as KeyframeEffect | null)?.target as Element | null;
          if (t && !isViewer(t)) moving.add(t);
        });
        const hits: string[] = [];
        for (const m of moving) {
          const mr = pageRect(m);
          if (mr.r - mr.l < 2 || mr.b - mr.t < 2) continue;
          for (const f of functional) {
            if (m.contains(f) || f.contains(m)) continue;
            const fr = pageRect(f);
            if (fr.l < mr.r && fr.r > mr.l && fr.t < mr.b && fr.b > mr.t) {
              hits.push(`${m.tagName.toLowerCase()}.${String((m as HTMLElement).className).slice(0, 40)} × ${(f.textContent ?? "").trim().slice(0, 30)}`);
              break;
            }
          }
        }
        return hits;
      }, LINKS);
      expect(overlaps).toEqual([]);
    });

    test("a large footer: at least half a screen tall at 1440×900", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await openDirection(page, id, 600);
      const h = await page.locator("footer").last().evaluate((el) => el.getBoundingClientRect().height);
      expect(h).toBeGreaterThanOrEqual(450);
    });
  });
}
