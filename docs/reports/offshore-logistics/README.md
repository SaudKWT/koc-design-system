# Offshore Logistics weekly update

A generator for the weekly Offshore Logistics report. One JSON file per report
week in, two self-contained HTML files out.

```bash
python3 docs/reports/offshore-logistics/build.py 2026-09-10 2026-09-03 2026-08-26
python3 docs/reports/offshore-logistics/build.py 2026-09-10 2026-09-03 --dashboard
python3 docs/reports/offshore-logistics/build.py 2026-09-10 2026-09-03 --email
python3 docs/reports/offshore-logistics/build.py 2026-09-10 2026-09-03 --no-notes
```

Pass any number of report dates, each matching a filename in `data/`, in any
order. Each becomes a tab. **Tabs run oldest to newest, left to right**, the
same direction every chart orders its bars, and the newest week is the one that
opens. The email format always covers the newest. `--no-notes` drops the amber "Data notes" block and writes a
`_clean` file, for once the open queries in that block have been answered.

Every week is compared against **its own predecessor in the set**, so adding a
week does not re-point the older tabs at the wrong baseline. The oldest week has
no predecessor and falls back to its successor, which the charts still order
correctly because they sort by period rather than by argument.

Requires `matplotlib`, plus `openpyxl` for `extract.py`. `pillow` is optional
and cuts the output roughly in half.

## Three outputs, one per audience

```
dashboard/  Offshore_Logistics_Weekly_Dashboard.html   every week, for circulating
email/      Offshore_Logistics_Weekly_Update_<date>.html   the newest week, for the mail
notes/      data-queries.md                            the open questions
```

| | `email` | `dashboard` |
| --- | --- | --- |
| Weeks | one | all of them, behind a tab strip |
| Layout | nested tables, inline styles | CSS, sticky header |
| Charts | 3 PNG, base64 | one set per week, base64 |
| Script | none | tab behaviour only |
| Daily logs | in the attached workbook | in the page |
| Size | 91 KB | 310 KB at three weeks |

The tab strip needs CSS and script, which is exactly what an Outlook-safe email
cannot have, so those two cannot be the same file. The email is what Bu Khaled
receives. The dashboard is for a browser, and because it has no attachment it
carries the full daily port and vessel logs itself.

The dashboard filename carries no date. It covers every week, the tab strip says
which, and each rebuild replaces it rather than leaving a trail of near-copies.

### Why the queries are a separate file

They were an amber block inside both reports. They are questions for the report
author, not findings about operations, so they have no place in something being
circulated. They are also not something to lose, hence a file of their own,
generated from the same `dataNotes` arrays the reports were reading. One source,
so the two cannot drift apart.

`notes/data-queries.md` is a checklist: 21 open items across three weeks, each
naming the sheet and cell it came from, plus a Resolved section for the two
counting questions that are settled but still differ from the published
figures. Tick an item once it is answered and correct the matching
`data/<report-date>.json`; the dashboard follows on the next build.

The dashboard states one figure per metric and carries no caveats on its face.
Where a published number differs, the reason is in the notes file's Resolved
section rather than in a footnote on something being circulated.

Outlook renders mail through the Word engine, so the email format uses no
`<svg>`, no external CSS, no `<style>`, no media queries, no classes and no
HTML5 sectioning elements. Outlook also blocks images by default, so every
chart carries `alt` text with its figures and the comparison table repeats
every charted number as text.

## The tab strip

Proper ARIA tabs: `role="tablist"` / `tab` / `tabpanel`, `aria-selected`,
managed `tabindex`, arrow keys that wrap both ways, Home and End landing on the
oldest and newest week, and a visible focus ring.
`#<report-date>` in the URL deep-links to a week, and selecting a tab updates
it, so a link can point at one week.

Three deliberate details. The script bails out if any `aria-controls` fails to
resolve, rather than half-applying the pattern: this repo has already shipped a
`Tabs` whose `aria-controls` pointed at an id that did not exist. The panels
carry no `hidden` in the markup, so with script disabled every week renders
stacked instead of the page collapsing to nothing, and printing does the same
while hiding the tab strip. A `hashchange` listener handles a link pasted into
the address bar of an already-open page: a hash change alone does not re-run
the script, so without it such a link would silently do nothing. And the
default tab is read from whichever button the markup marks selected, not
hardcoded to index 0, because index 0 is now the oldest week rather than the
current one.

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
   count came from, which is what makes a disputed number checkable a month
   later. Anything that needs an answer from the report author goes in
   `dataNotes` and reaches `notes/data-queries.md` on its own.
4. Set `showArrows` true on the new week and false on the one before it.
5. `periodDays` must equal the length of `trucks.byDay`. The build asserts it.
6. Run the build with the new date and the previous one.

## Where the source disagrees with itself

Three times now the covering email and the workbook have not matched. Each is
resolved the same way: **one rule, applied to every week, with both numbers
stated.** A dashboard whose weeks are counted differently is worse than no
dashboard, because the arrows become fiction.

| Report | Email says | Workbook gives | Dashboard shows | Why |
| --- | --- | --- | --- | --- |
| 22 (26-08) | 46 truck moves | 41 | **41** | five trucks counted on both load and dispatch, proven from the cells |
| 24 (10-09) | 13 vessel trips | 8 | **13** | the covering email supersedes, decided 10 Sep |

The two are resolved differently on purpose. The truck figure is arithmetic: the
same trucks appear twice in the same sheet, and that report's own prose repeats
the error. The trip figure is a definition, not an error: the email appears to
count rig calls where the workbook narrative counts port voyages, and which one
the report means is the author's call, not the reader's. Saud settled it on
10 Sep in favour of the email.

Report 24's trip figures agree with the workbook on CA5 (0) and Charlie-3 (5)
and differ on CA1 (6 against 2) and CA3 (2 against 1). The same derivation
reproduced report 22's published chart and report 23's email exactly, all eight
vessel figures, so the derivation is not what changed; report 24 has a different
sender. Because the earlier weeks agree either way, the rise from 9 trips to 13
may carry some of the change of basis, which is worth confirming once with the
author so later weeks stay comparable. Both figures and that caveat are in
`notes/data-queries.md`.

Report 24 needs the offload rule too. Its Port sheet re-describes arrivals as
offloads (`E21` repeats `E19`, `E23` repeats `E24` to `E27`, `E34` and `E35`
repeat `E30` to `E33`, `E49` and `E50` repeat `E42`, `E43` and `E46`). Counting
both would add 14 movements to a 44-move week. `E35` is also what settles
whether the identical `E30` and `E33` rows are a duplicate: it records two
trucks of chemical containers offloaded, so they are two real trucks.

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

## Signatures are per week

The author changes. Report 24 came from a different sender and carried **no
signature block at all**, so `data/2026-09-10.json` gives the name and the
address from the `From` line and nothing else. Nothing beyond what the email
supports is invented, and the gap is in that week's data notes. Weeks with no
`signature` key fall back to the block from the 26.08 email.

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
every tab with the daily logs expanded: **0 violations, 42 passes each**.
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

Verified by driving the page rather than by reading it: click, arrow keys that
wrap in both directions, Home and End, focus follows selection, `aria-controls`
all resolve, deep links select the right tab on a cold load **and** on an
in-page hash change, an unknown hash falls back to the current week, no console
errors, and no horizontal overflow at 400px.

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

Both two-week charts share one grammar, so the reader learns it once: **this
week is solid navy, the previous week is pale**, and the legend says which in
words with the dates in brackets, rather than leaving two date ranges to be
decoded. Bars are ordered by period and never by whose panel it is, so time
reads left to right in every tab. Ordering by panel put the later week on the
left in an older tab, which read as time running backwards.

**The earliest week is the baseline and stands alone**: single-series charts in
one colour, no arrows on the tiles, no comparison table. It has no predecessor
in the set, and comparing it forward to a later week would draw a comparison
backwards in time. The week its own report measured against, 06 to 12 Aug 2026,
is not in the dashboard, so that stays a sentence under the tiles rather than
becoming arrows to a week nobody can open.

Both charts' y-axis ceilings are the 26-08 report's values used as a **floor**,
not a cap, so the weeks stay visually comparable but nothing clips. CA1 reached
6 trips in report 24 against a fixed ceiling of 7.

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
