# Offshore Logistics weekly update

A generator for the weekly Offshore Logistics report. One JSON file per report
week in, two self-contained HTML files out.

```bash
python3 docs/reports/offshore-logistics/build.py 2026-09-03 2026-08-26
python3 docs/reports/offshore-logistics/build.py 2026-09-03 2026-08-26 --dashboard
python3 docs/reports/offshore-logistics/build.py 2026-09-03 2026-08-26 --email
python3 docs/reports/offshore-logistics/build.py 2026-09-03 2026-08-26 --no-notes
```

The two arguments are the current report date and the one it is compared
against, both matching a filename in `data/`. `--no-notes` drops the amber
"Data notes" block and writes a `_clean` file, for once the open queries in that
block have been answered.

Requires `matplotlib`, plus `openpyxl` for `extract.py`. `pillow` is optional
and cuts the output roughly in half.

## Two formats, because they cannot be one file

| | `email` | `dashboard` |
| --- | --- | --- |
| Weeks | one | both, behind a tab strip |
| Layout | nested tables, inline styles | CSS, sticky header |
| Charts | 3 PNG, base64 | 6 PNG, base64 |
| Script | none | tab behaviour only |
| Daily logs | in the attached workbook | in the page |
| Size | 92 KB | 203 KB |

The tab strip needs CSS and script, which is exactly what an Outlook-safe email
cannot have, so the two cannot be the same file. The email is what Bu Khaled
receives. The dashboard is for a browser, and because it has no attachment it
carries the full daily port and vessel logs itself.

Outlook renders mail through the Word engine, so the email format uses no
`<svg>`, no external CSS, no `<style>`, no media queries, no classes and no
HTML5 sectioning elements. Outlook also blocks images by default, so every
chart carries `alt` text with its figures and the comparison table repeats
every charted number as text.

## The tab strip

Proper ARIA tabs: `role="tablist"` / `tab` / `tabpanel`, `aria-selected`,
managed `tabindex`, arrow keys plus Home and End, and a visible focus ring.
`#<report-date>` in the URL deep-links to a week, and selecting a tab updates
it, so a link can point at one week.

Two deliberate details. The script bails out if any `aria-controls` fails to
resolve, rather than half-applying the pattern: this repo has already shipped a
`Tabs` whose `aria-controls` pointed at an id that did not exist. And the
panels carry no `hidden` in the markup, so with script disabled both weeks
render stacked instead of the page collapsing to nothing. Printing does the
same, and hides the tab strip.

## Data flow

```
workbook.xlsx  --extract.py-->  data/<date>.log.json   the daily narrative, machine-read
                                data/<date>.json       the counts, hand-audited
                                        |
                                    build.py  -->  dist/*.html
```

`extract.py` reads the narrative only. Every count stays hand-audited in
`data/<date>.json` with the workbook cell it came from, because each one is a
judgement the prose does not make for you. See the truck rule below.

## Why a generator and not a hand-edited file

The report states the same figure in a KPI tile, in a chart, and in the
comparison table. Hand-editing three copies is how they start to disagree. Each
number is read once from the JSON and rendered everywhere from that one value,
so a correction is a one-line edit in `data/`.

## Why the HTML is email-safe

Nested `<table>` elements, inline styles, base64 PNG charts, no script and no
external CSS. KOC is a Windows and Outlook organisation, and Outlook strips
`<svg>`, external stylesheets and script. An interactive SVG chart would arrive
as nothing.

Because Outlook also blocks images by default, every chart carries `alt` text
with its figures, every bar carries a printed value, and the week on week
comparison table repeats all charted figures as text. A recipient with images
off still gets the whole report.

## Adding next week

1. `python3 extract.py <the new workbook>.xlsx <new report date>`. Read its
   output: it reports every defect it found and every repair it made.
2. Copy `data/2026-09-03.json` to `data/<new report date>.json`.
3. Update the figures. Keep the `audit` arrays: they name the workbook cell each
   count came from, which is what makes a disputed number checkable a month later.
4. Set `showArrows` true on the new week and false on the one before it.
5. `periodDays` must equal the length of `trucks.byDay`. The build asserts it.
6. Run the build with the new date and the previous one.

## The truck counting rule, and the 46 that was 41

A truck loaded on one day and dispatched the next is **one** movement, counted
on dispatch.

The 26-08 report published **46** truck moves for 20 to 25 Aug. Five of those
are the same trucks counted twice across the Sunday to Monday boundary: four
vacuum trucks were loaded with slops on 23.08 (`E21`) and dispatched on 24.08
(`E25`), and one truck was loaded with mud skips on 23.08 (`E23`) and dispatched
on 24.08 (`E26`). That report's own prose repeats the error, calling them "8
vacuum-truck loads" and "6 full mud skips" where the workbook records 4 trucks
and 3 skips.

Counted once each the week made **41**, which is what both tabs show. It matters
because it moves a headline KPI: 41 against a published 46 reads as an 11% fall,
where the two weeks are in fact level. The previous-week tab states both numbers
and carries no arrow on that tile, because the corrected figure cannot be
compared against a baseline counted the old way.

Every other published figure reconciles exactly from the workbooks: the four
vessel trip counts, all six daily out/in splits, and all four fluid categories
to the cubic metre. Only the truck total was affected.

## What extract.py repairs, and reports

Three separate defects live in the workbook's Day, Date and Status columns.
Each is corrected against a source that cannot be wrong in the same way, and
each correction is printed and rendered in the daily log, never silent.

| Defect | Seen in | Corrected against |
| --- | --- | --- |
| Wrong year (`26.08.2025`) | 03.09 Port `C4` | the period the sheet declares in its own title |
| No Day, Date or Status at all | 03.09 Port rows 9 to 12 | the neighbouring block |
| Misspelled day (`Wedeneday`, `Thurseday`) | both workbooks | the date |

The blocks themselves come from the merged-cell geometry of the Day column, not
from reading values. Reading values will not do: the Thursday 27.08 block is
entirely empty, so a value-driven walk folds its four operations into Wednesday
and reports a 7-day week for an 8-day period.

## Palette: a deliberate exemption from invariant 1

The colours in `build.py` are the 26-08-2026 report's own palette, kept so the
weekly series stays visually continuous. **They are not the KOC token palette.**
This navy is `#1F3B57`; the KOC brand blue is `#0060A9`.

That is why this directory sits under `docs/reports/` and not in `packages/` or
`apps/`. It is an email deliverable, not design-system source, and invariant 1
(never hand-write a hex outside `packages/tokens/src/`) is scoped to the system
itself. No build gate reads this directory: `check:drift` reads only
`apps/docs/src/styles.css`, and `check:motion` reads only `.ts` and `.tsx` under
`packages/ui/src` and `apps/docs/src`.

Moving this report onto KOC tokens is a live option, and it would change the
look. It is not done here because it was not asked for.

## Contrast defects carried over, and fixed

Three colours in the 26-08-2026 file fell below WCAG AA at the size they were
used. They are corrected here. Ratios are measured against the `#F4F6F8` tile
fill.

| Role | Was | Ratio | Now | Ratio |
| --- | --- | --- | --- | --- |
| KPI tile label, 11px | `#6B7C88` | 3.99:1 | `#4A5C6A` | 6.43:1 |
| Neutral delta, 11px bold | `#7E8C97` | 3.19:1 | `#5B6B78` | 5.08:1 |
| "vs prior week", 9px | `#9AA9B4` | 2.23:1 | `#5B6B78` at 11px | 5.08:1 |
| Alarm delta, 11px bold | `#C0504D` | 4.31:1 | `#A8403D` | 5.59:1 |

The 9px step was also below the design system's own type floor, where `2xs` is
11px and nothing smaller ships.

`#C0504D` stays for the 24px tile value, where it measures 4.24:1 and the bar
for large text is 3:1, and for the 13px contractor counts on white at 4.68:1.
Only the 11px delta needed the darker step. axe failed the original at both
4.31:1 on the tile fill and 4.22:1 on the alert fill.

## Accessibility

axe-core, WCAG 2.1 A and AA **plus best-practice rules**, run in Chromium over
both tabs with the daily logs expanded: **0 violations, 42 passes each**.
Best-practice rules are included for the reason `CLAUDE.md` gives, that both
a11y defects a consuming KOC app reported were best-practice rules.

Three real defects were found this way and fixed, not waived:

- `landmark-one-main` and `region`: the page had no `main` and its content sat
  outside any landmark. Now `header` / `main` / `footer`.
- `color-contrast`: the 11px alarm red, as tabulated above.
- an `opacity` on the tab sub-label left axe unable to compute the contrast at
  all. Replaced with explicit colours, measured against the tab background.

The one remaining `incomplete` is "element content is too short to determine if
it is actual text content" on a single-digit KPI value. That is axe declining to
classify one character, not a defect.

Verified by driving the page rather than by reading it: click, arrow keys, Home
and End, focus follows selection, `aria-controls` all resolve, deep link
selects the right tab, no console errors, and no horizontal overflow at 400px.

`#2F7A55` is new. The old palette had no colour for an improving figure, so a
fall in overstay crew was rendered in the same alarm red as a rise. It measures
4.80:1 on `#F4F6F8` and 4.71:1 on the `#FDF1F0` alert fill.

## Intent is not arithmetic

The `StatCard` rule from `CLAUDE.md` applies to the KPI tiles and to the
comparison table. `delta` decides the arrow; `intent` decides the colour.

A fall in truck moves is neither good nor bad, it tracks the rig count, so it
renders neutral. A fall in overstay crew is unambiguously good, so it renders
green even though the tile stays in its alert treatment, because 10 crew are
still overstaying. Rendering that fall in red, as the old palette would have
forced, states the opposite of the truth.

## Chart notes

Both two-week charts share one grammar, so the reader learns it once: the
panel's own week is solid navy, the other week is pale and labelled "(other)".
Bars are ordered by period and never by whose panel it is, so time reads left to
right in both tabs. Ordering by panel put the later week on the left in the
previous-week tab, which read as time running backwards.

The fluids chart is grouped rather than stacked, and split three fluids by two
directions, because the interesting thing this week is a composition shift the
totals hide: fuel moved from bunkering into delivery, 216 m³ to nil bunkered
against nil to 200 m³ delivered, and drill water went the other way. A stack
would bury that inside two columns.

The palette was checked with the `dataviz` skill's validator. The pairs in use
(`#1F3B57`/`#AEBECB`, `#1F3B57`/`#E0A73C`, `#2E8B8B`/`#1F3B57`) all clear CVD
separation and the normal-vision floor with wide margins, worst case ΔE 24.3.
They fail the validator's lightness-band and chroma-floor checks, which are
properties of the inherited brand palette above. `#E0A73C` and `#AEBECB` sit
below 3:1 against the surface; the printed value on every bar and the
comparison table are the required relief.

Colour carries meaning in each chart rather than repeating the axis. In the
fluids chart it separates fluid bunkered into vessels from fluid delivered to
rigs; the words are also in the axis labels, so identity is never colour alone.
