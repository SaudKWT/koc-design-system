# DWEG landing: v2 brief (daily use)

**Written 2026-09-29.** It applies to every direction, A to I. v1 stays as the backup.

## What Saud asked for, verbatim

> These options are great […] We want to create a landing page that is continuously used every
> day. The visuals are amazing but imagine if you open the landing page every day and you have to
> scroll and find the dashboard per team every day. It becomes tedious, also the KPIs should be
> immediately visible and compacted.
>
> So we want to optimize for accessibility, not everything needs to be in the first immediate
> section as soon as you land on the page but in a way that minimizes searching and scrolling.
> And we can keep animations in empty spaces and a large footer.
>
> Make the new pages as v2 and keep the old ones for backup.

"Accessibility" here means **ease of access**: the fewest steps from opening the page to being on
your dashboard. WCAG accessibility still applies in full, on top of that.

v1 optimised for the first visit. v2 optimises for the hundredth.

## Ground rules

1. **Keep v1 untouched.** Build v2 in a new folder, `apps/docs/src/bakeoff/landing/<id>2/`:
   - Start from a copy with `cp -R <id> <id>2`.
   - Set `id: "<id>2"` in its `meta.ts`.
   - Register it in `directions.ts` (import and entry), and add `"<id>2"` to the `id` union.
   - Add `"<id>2"` to `IDS_V2` in `tests/landing.spec.ts`.
2. **Before any other edit, rename every global CSS name in `<id>2/`.** That means classes,
   `@keyframes`, custom properties and `data-` hooks used as selectors, e.g. `.ms-` → `.ms2-`.
   CSS files are global. An edited copy that shares names with v1 silently restyles v1 the moment
   both have been viewed in one session.
3. **Keep the direction's identity.** Same concept, same visual language, same type voice.
   Restructure it for daily use; do not turn it into a generic dashboard. A v2 should still be
   recognisably "Multilateral", "Burgan" and so on.
4. **Shared behaviour comes from `shared.tsx`.** It gained five v2 helpers. Use them; do not
   re-implement them.
   - `useDashboardMemory()` returns `{ pinned, recent, isPinned, togglePin, clearRecent }`.
     `pinned` and `recent` are arrays of `{ link, team }`, persisted per browser in localStorage
     and synced across tabs. `recent` never repeats a pinned link.
   - `recordDashboardOpen(id)` is called by DashboardAnchor on every open, middle-click included.
     You never need to call it.
   - `<PinToggle link pinned onTogglePin />` is the only pin control. Its names are "Pin X" and
     "Unpin X", with `aria-pressed`. Put it **beside** the anchor, never inside it.
   - `useFindShortcut(ref)`: Ctrl+K / ⌘K focuses the field. It works with the Arabic layout
     active.
   - `matchDashboards(query)` is the one search. It is multi-word AND across the link label, the
     platform, and the team code, name and abbreviation. It returns `{ team, links, teamMatched }[]`.

## The page, top to bottom

The order is a priority, not a template. Each direction expresses it in its own language.

1. **A compact header.** It holds the group identity and a **visible search field**: `<input
   type="search">`, or `role="searchbox"`/`"combobox"`. It must be in the first viewport. Typing
   filters in place with `matchDashboards`, and a match must be visible without further scrolling.
   Ctrl+K focuses it through `useFindShortcut`. A button that opens a dialog is not enough; the
   field itself must be on the page.
2. **Compact KPIs, visible without scrolling at 1440×900 AND at 1280×630.** 1280×630 is a
   1920×1080 KOC laptop at 150% scaling, after Edge's chrome.
   - Put `data-kpi={k.id}` on each KPI's container.
   - A–D show the eight group `KPIS`. E–I may keep their `COMPANY_KPIS` row, but compact it too.
   - Compact means one small cell per KPI: label, value with unit, and delta text in the intent
     colour. A tiny sparkline is optional.
   - No marquee, no count-up longer than 300ms, and no figure that moves while being read.
3. **Your dashboards.** Two regions from `useDashboardMemory()`, in the first viewport whenever
   they have content:
   - `<section aria-label="Pinned dashboards">`
   - `<section aria-label="Recent dashboards">`

   The region names must contain "pinned" and "recent". When a region is empty it gets one quiet
   line ("Pin a dashboard with the pin icon to keep it here"), never a big empty box.
4. **The directory.** All 8 teams, with every link directly visible. There is no disclosure at
   1024px and wider.
   - All 28 links must start within **1.5 screens at 1440×900** and **2 screens at 1280×720**.
   - Every link has a PinToggle beside it.
   - The 8 teams stay the page's 8 categories. A jump bar or index to a team is welcome. Use buttons
     with `scrollIntoView` and never `href="#…"`, because the viewer is hash-routed and a hash link
     navigates away.
   - Add a "Skip to dashboards" link as the first tab stop.
5. **The showpiece.** v1's visual (WebGL, SVG, drawing, diorama) moves into:
   - **empty space**: gutters, margins, or a side column the layout leaves free;
   - **a large footer** of at least 450px at 1440×900, and taller is fine. The footer is where
     the direction's hero visual now lives in full. Lazy-mount heavy renderers when the footer
     approaches (IntersectionObserver), and pause them offscreen and when the tab is hidden.
6. **Visuals never sit behind or over functional content.** No canvas and no running animation
   may overlap a dashboard link, a KPI or the search field. That includes fixed-position layers,
   which count as covering everything they could scroll over.

Everything in the v1 `BRIEF.md` still applies:
- tokens-only colour, and the motion scale for interactions;
- ambient motion only in declared CSS or JS, stopped under both reduced-motion conditions;
- axe with best-practice rules, the keyboard, visible focus;
- no horizontal scroll at 390, 1024 or 1440;
- zero new dependencies;
- StrictMode-safe cleanup;
- every link through `DashboardAnchor`.

## Verify
Run both suites; each must pass:

`KOC_DOCS_PORT=<port> npx playwright test landing -g "landing <id>2" --output=<tmp>`

The "landing `<id>2`" base suite and the "landing `<id>2` v2" suite both run from that one command.
The v2 suite checks:
- KPIs at 1440×900 and 1280×630;
- the search field plus Ctrl+K and "payment";
- no hunting at 1440×900 and 1280×720;
- Pinned and Recent surviving a reload;
- no visual overlapping a link, KPI or the search field;
- a footer of at least 450px.

Then look at screenshots in light, dark, reduced motion and 390, and fix what you see.

## Report back
- What changed from v1, and why.
- Test results.
- 2–3 screenshot paths.
- A commit on your own branch: "Landing direction `<X>` v2: daily use".
