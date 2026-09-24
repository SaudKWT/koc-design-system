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
| Charts | 1 PNG, base64 | 3 inline SVG per week |
| KPI cards | 4 | 4 |
| Trend | raster small multiples | live sparkline inside each KPI tile |
| Script | none | tabs, sparkline scrub, chart readout |
| Daily logs | in the attached workbook | in the page |
| Size | 67 KB | 326 KB at four weeks |

The tab strip needs CSS and script, which is exactly what an Outlook-safe email
cannot have, so those two cannot be the same file. The email is what Bu Khaled
receives. The dashboard is for a browser, and because it has no attachment it
carries the full daily port and vessel logs itself.

The dashboard filename carries no date. It covers every week, the tab strip says
which, and each rebuild replaces it rather than leaving a trail of near-copies.

### The queries are a file, not a section

They are not rendered on the page at all now, in either format.
`notes/data-queries.md` is generated from the same `dataNotes` fields and is
the only place they appear. The METHOD footnote went the same way, so the
counting rules live here in this README rather than at the foot of every week.

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

## Hosting it on SharePoint

SharePoint previews an uploaded `.html` inside a **sandboxed `srcdoc` iframe
whose document origin is `null`**. Two consequences, both handled:

- `history.replaceState` is illegal in an opaque origin and throws a
  `SecurityError`. It used to abort `select()` on every tab switch and put a
  red *"Some content didn't load. A script didn't run correctly on this page"*
  banner over the report. The call is now wrapped in `try`/`catch`.
- Deep links cannot work in that frame, because there is no address bar URL to
  carry a hash. Losing them quietly there is the right trade: the tab strip has
  to keep working.

Everything else survives. Scripts run, the base64 charts render, tabs switch on
click and keyboard. `scratchpad` reproduction: load the file into an
`<iframe sandbox="allow-scripts">` via `srcdoc`, which produces the same opaque
origin, and assert zero console errors.

If a tenant blocks script outright, or renders nothing at all, use the PDF:

```bash
python3 to_pdf.py dashboard/Offshore_Logistics_Weekly_Dashboard.html
python3 to_pdf.py <file>.html --week latest        # just the current week
python3 to_pdf.py <file>.html --week 2026-09-03    # one named week
```

A PDF previews inline on every tenant with no script and no settings change,
and it is also the answer for a tenant that serves `.html` from a document
library as a **download** rather than a preview, which is a tenant setting no
file can work around.

The tab strip cannot survive that trip and does not need to: the print
stylesheet unhides every panel and hides the strip, so the whole-file PDF
carries all weeks stacked, oldest first. `--week` trims it to one by removing
the other panels from the DOM. It reads the built HTML rather than
re-rendering from data, so the PDF cannot disagree with the page it came from.

Three things the PDF path has to get right, each of which was wrong first:

- **The daily log is a collapsed `<details>`.** A PDF has nothing to click, so
  a collapsed one printed as a heading with nothing under it, silently dropping
  86 operations. `to_pdf.py` opens every one before printing and reports how
  many, which is what makes the PDF a complete document rather than a summary.
- **The comparison table spans pages** and lost its column headings on the
  second, leaving three unlabelled number columns. It now has a real `<thead>`,
  which Chromium repeats per page under `display:table-header-group`.
- **Charts are atomic**, so one that does not fit bumps whole and leaves a
  third of a page blank. `scale=0.95` is imperceptible and buys about 55px a
  page, which is the difference between both charts fitting on page one and
  the second being bumped.

`to_pdf.py` asserts that every panel it kept is visible under print media, so a
broken print rule fails loudly instead of shipping a truncated PDF.

## On a phone

Below 760px the layout changes in five ways. Each change fixes something that
was measured, not guessed.

- **The header is not pinned.** Pinned, with five tabs wrapping to three rows,
  it held 222px of an 844px screen and 237px of a 740px one, and nearly half
  of the shorter SharePoint preview frame. It now scrolls away with the page,
  and it is 96px tall. Desktop keeps the pinned header: there it is one row,
  102px.
- **The tabs are one row that scrolls sideways**, and each tab shows only its
  week label. The report date under each label made every tab twice as tall.
  The newest week opens at the far end of the row. The script scrolls the row
  so that tab is in view. It scrolls the row only, not the page, because
  `scrollIntoView` would also move the page vertically on load.
- **The rig cards stack.** Side by side they were 114 to 158px wide, and the
  ON HIRE chip wrapped under the rig name. The selectors use child
  combinators (`.rigs>tbody>tr`). A descendant selector also matched the
  key/value table inside each card and put every label on top of its value.
  The screenshot caught this; the width measurement did not.
- **Charts keep a 680px minimum width and scroll sideways.** A 950-unit chart
  drawn 330px wide shrinks its 11.5-unit labels to about 4px. At 680px they
  stay at about 8px. The readout under the chart stays full size, because it
  sits in the scroll box, not in the SVG.
- **A tap holds.** On a touch screen `pointerleave` fires the moment the
  finger lifts. So a tapped week or column showed for an instant and snapped
  back. Only a mouse leaving now resets the readout. A tap holds until the
  next tap, on the chart or anywhere else.

None of this reaches the PDF. The charts print at full width, and the page
count is unchanged.

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
6. Add the new date to the `dates` default at the top of `main()`, newest
   first, or pass every date on the command line. A date left out of that list
   is a week missing from the tab strip and from every sparkline, and nothing
   fails to warn you.
7. Transcribe the covering email's `Daily Ground Operations` list into
   `dailyOperations` — its `lines` reworded and nothing else, its `extraNotes`
   for the MARSEC line, and a `label` naming the day the email's list actually
   covers. Check the email's figures against the ones you entered first.
   Without this key the week falls back to written `highlights`.
8. Run the build, then `python3 check_contrast.py` if you touched a chart
   colour.

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

## Signatures

**Whoever circulates the report signs it.** That is `DEFAULT_SIGNATURE` in
`build.py`: Saud Abdulaziz AlKharji, Engineer Drilling & Workover, Drilling &
Workover Operational Support Team, skharji@kockw.com.

The sender of the source email is a different thing and belongs in
`provenance`, which the dashboard prints under each week's heading. Report 24
came from Rejeesh Kumar Kunjupillai, so his name appears there and nowhere else.

A week can override the block with a `signature` key (`name`, `lines`,
`muted`). Nothing goes in that the person's own profile or email does not state,
which is why there is no phone or postal line. Only the newest week's signature
is ever rendered, in the footer below the tabs and at the foot of the email.

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

## The KPI sparklines

Each of the five tiles carries the whole series to date as an inline SVG line
under its number. **Hover, tap or tab a point and the tile shows that week
instead**: the big number becomes that week's figure, and the two lines under
it swap from the delta to the week's dates and its position in the series.
Move away and it snaps back.

Four decisions in that, each of which was the second attempt:

- **Inline SVG, not a PNG.** A tenth of the bytes, it prints as vectors rather
  than a 140 dpi raster, and it is the only version a reader can interrogate.
  Email still gets the raster small multiples, because Outlook strips `<svg>`
  and runs no script.
- **In the tile, not beside it.** The lines began as a strip of their own under
  the KPI row, which meant the page stated the same five figures twice, 400px
  apart. Upper management reading a weekly report does not need to be told
  twice. One block, nothing dropped.
- **No floating tooltip.** A tooltip would be clipped by the edge of a
  SharePoint preview frame, cannot be reached by keyboard, and has no hover to
  fire on a touch screen. Scrubbing the tile reads identically on all three.
- **The scrubbed week replaces the delta, not the caption.** A delta describes
  this week against last. Put an older week's figure above it and the two
  contradict each other. Swapping which pair of lines is displayed also keeps
  the tile the same height, so nothing below it moves.

Verified inside a sandboxed `srcdoc` frame with a `null` origin, the same
harness as the SharePoint section above: markup paints, `:hover` applies,
script runs, zero console errors. All four of the APIs that throw in that
origin -- `localStorage`, `sessionStorage`, `document.cookie`,
`history.replaceState` -- are still throwing there, which is why none of them
appears in the scrub script.

**Keyboard**: one tab stop per sparkline, arrows within it, which is the same
roving-tabindex pattern as the tab strip. Twenty extra tab stops across five
tiles would make the route through the page worse, not better. The entry point
is the last mark, the week being read, so focusing it changes nothing on
screen. Focus draws a 2px ring on the hit target itself, which marks exactly
the area that responds. Each mark also carries an `aria-label` naming its week
and figure, and each line a `role="group"` label stating the series in words,
so a screen reader gets the numbers without the geometry.

**Print**: the lines print as vectors, the hover instruction is hidden, and
`break-inside:avoid` keeps a tile whole. Every chart in the PDF is vectors
now; it reports zero embedded images. Page one of `--week latest` carries
the headline, all five tiles with their lines, both rigs and the highlights.

Two smaller things the sparklines forced:

- **A metric that did not move draws across the middle of the band**, not
  along its floor. On the floor an unchanged figure reads as a low one, which
  is what the flat two-week trips line did.
- **The KPI row now wraps below 760px.** A five-column table cannot, and at a
  400px viewport it was 503px wide inside a 400px page, so the fifth tile --
  overstay crew -- was clipped off and unreachable. That predates the
  sparklines; taller tiles made it obvious. The table markup has to stay for
  Outlook, which will not lay out a flex or grid row, so the browser layout is
  re-declared in a media query that only a browser reads. The `width="20%"`
  attribute is a presentational hint and loses to the stylesheet without
  needing `!important`.

## What "What happened" became

For the week that has its covering email transcribed, that section is **the
email's own `Daily Ground Operations` list, reworded and nothing else**. It was
a written summary of the week, which is an interpretation, and an
interpretation is a place for a mistake to live: the old bullets asserted
things like "the busiest of the four weeks tracked" and "turned outbound
again", which are conclusions, not records.

Two things that matter about the substitution:

- **The email's list is one day, not the week.** Its eight bullets match the
  workbook's `16.09.2026` port lines exactly, one for one. So the heading
  carries `Wed 16 Sep 2026` rather than implying seven days, and a source line
  under the list says where it came from. Calling one day's operations the
  week's story would be the same mistake in a new place.
- **Eight in, eight out, same order.** No line merged, split, added or
  inferred. The MARSEC note is carried separately, from the email's own
  `Extra Notes`, because the strap line that used to state it is gone.

Every figure in the 17.09 email was checked against `data/2026-09-17.json`
before the transcription: four per-vessel trip counts and the total, both rig
summary tables, personnel and visa counts, all three overstay figures, next
steps, and the MARSEC level. All matched.

The other three weeks keep their written bullets under **What happened**,
because their covering emails are not in this repo. `dailyOperations` in the
data file is what switches a week over; `week_body` falls back to `highlights`
when it is absent, so adding one week changes only that week.

**The headline above the cards is still a written summary.** It is the one
interpretation left on the page.

## Vessel movements is not a card

Four cards, not five. The count is still carried — in the comparison table,
per vessel and per day, under the rule it is counted on — but as a headline
figure it sat next to vessel trips, and a reader has to hold two definitions
apart to tell those two numbers apart.

The truck-count correction is now looked up **by label**, not by index. It had
been written to `tiles[1]`, which was Truck moves until the vessel movements
tile was inserted ahead of it; the correction then sat under Vessel movements,
a figure of 22, reading "41 counted once each". Removing the tile would have
shifted it a second time. That is twice the same bug from the same cause, so
the lookup no longer depends on position.

## What the panel head does not say

The head is the week and nothing else: `10 to 16 Sep 2026`, a rule, then the
one sentence that matters. Four things were taken out of it and none was
thrown away.

- **The strap line** (`Report of 17 Sep 2026 · 7 days · MARSEC Level 2`)
  repeated three facts the page already carried, above the headline. The
  report date is on the tab directly above it. The day count is readable off
  the date range, and stated again with its own sub-line in the comparison
  table's header, where it is doing real work: 6, 8, 7 and 7 days is why some
  rows are compared per day as well as per week. **MARSEC is a highlight in
  every one of the four weeks** — checked, not assumed, before the line came
  out.

- **The source line** (`Email of 17.09.2026 from … .xlsx (report 25, sheets
  Port and Vessel)`) sat third line down, above the headline, so the first
  thing a reader met was a filename. It is an audit trail, not news. It is now
  the last sentence of the METHOD footnote, with the rules the figures were
  counted on, generated from the same `provenance` field.
- **The arrows basis line** (`Arrows compare against 03 to 09 Sep 2026,
  counted on the same rule. Prior value in brackets.`) explained a convention
  the tiles already show. Each tile's own caption now reads **Last week**,
  which is the whole of it.
- **The baseline week's two extra facts** were in that same line. The
  published-baseline comparison moved into the METHOD footnote, which only
  states it on the week it applies to. The truck-count correction stayed on a
  tile, but **moved to the right one**: it read `41 counted once each (46 as
  published)` under *Vessel movements*, whose value is 22. `kpis()` wrote it to
  `tiles[1]`, which was Truck moves until the vessel movements tile was
  inserted at index 1 and pushed it to 2. The correction had been on the wrong
  tile since movements were added.

`vs 03 to 09 Sep` became `Last week` for the same reason: a reader does not
need the dates of the week they are *not* reading. The panel head states the
week they are on, and the comparison table below spells both out in full with
day counts.

## Chart notes

**All four chart types are inline SVG.** The sparklines in the KPI tiles and
the three detail charts. matplotlib is still in `build.py`, but only the email
path reaches it: Outlook strips `<svg>` and runs no script, so the mail keeps
one rasterised chart.

Three reasons, in the order they matter here:

1. **It prints as vectors.** The single-week PDF now reports zero images and
   306 vector drawings on its chart page, where it used to embed 140 dpi
   rasters.
2. **Bytes.** The dashboard went 536 KB → 326 KB carrying one more week than
   it did at 536 KB. Nine base64 PNGs left.
3. **A reader can interrogate it.** Hover or tab a column and the whole
   category reads out under the chart: every series, and on the two-week
   charts the change between them. That last part is the point — the value is
   already printed on every bar, so a readout that only repeated it would earn
   nothing. The difference is what the bars do not state.

`svg_bars()` builds all three detail charts, because all three *are* the same
chart: grouped bars, a categorical x axis, a direct label on every bar, a
legend below the axis. One builder means the grammar cannot drift between
them, which is what happened to the PNG versions twice.

**No floating tooltip, in any chart.** It would repeat the printed value, get
clipped by the edge of a SharePoint preview frame, be unreachable by keyboard,
and have no hover to fire on a touch screen. The readout line is none of those
things.

**Keyboard**: one tab stop per chart, arrows across the columns. Seven days
plus four vessels plus six fluid categories would otherwise drop eighteen
extra tab stops into the middle of the page. They are inside a collapsed
`<details>`, so they cost nothing until it is opened.

Two things the hand-rolled axes had to get right that matplotlib did for free:

- **A tick step a reader can do arithmetic in** — 1, 2, 2.5, 5 or 10 times a
  power of ten, and forced to a whole number where the metric is counted in
  units. That is `MaxNLocator`'s job; `_nice_step()` does it here.
- **A ceiling that is a labelled tick and leaves room for the tallest label.**
  First attempt left the trips chart topping out at 7 with its last gridline
  at 6. Second attempt rounded every chart up a whole step, which left the
  fluids chart a fifth empty. It now takes the first tick at or above the peak
  and adds one more step only when that leaves under 20 units of room for the
  label above the bar — which is the one thing that must not be clipped,
  because it is the contrast relief.

### The grammar, unchanged from the PNGs

**This week is solid navy, the previous week is pale**, and the legend says
which in words with the dates in brackets, rather than leaving two date ranges
to be decoded. Bars are ordered by period and never by whose panel it is, so
time reads left to right in every tab. Ordering by panel put the later week on
the left in an older tab, which read as time running backwards.

**The earliest week is the baseline and stands alone**: single-series charts in
one colour, no legend, no arrows on the tiles, no comparison table, no
sparklines. It has no predecessor in the set, and comparing it forward to a
later week would draw a comparison backwards in time.

Both two-week charts' y ceilings use the 26-08 report's values as a **floor**,
not a cap, so the weeks stay visually comparable but nothing clips. CA1 reached
6 trips in report 24 against a floor of 7, and the ceiling grew to 8.

The fluids chart is grouped rather than stacked, and split three fluids by two
directions, because the interesting thing is a composition shift the totals
hide: fuel moved from bunkering into delivery and drill water went the other
way. A stack would bury that inside two columns.

Colour carries meaning in each chart rather than repeating the axis. In the
fluids chart it separates fluid bunkered into vessels from fluid delivered to
rigs; the words are also in the axis labels, so identity is never colour alone.

### Contrast: axe cannot see inside an SVG

Switching the charts to SVG moved 86 nodes per tab from *pass* to
**incomplete** in axe, for two reasons of axe's own: it treats an `<svg>` as an
image node and cannot resolve what is behind the text, and it skips a
one-character tick label like `0` as "too short to determine if it is actual
text content".

Incomplete is not a pass. `check_contrast.py` asserts the nine pairs instead,
reading the same tokens `build.py` does:

```bash
python3 check_contrast.py     # 9 pairs, floor 4.5:1
```

Everything in these charts needs 4.5:1 — nothing is WCAG large text, since the
biggest is a 15px bold title and large starts at 18.66px bold. Worst case is
6.42:1. The pale `#BCC3CA` previous-week fill is 1.78:1 and the amber
`#B06F00` is 4.10:1, both non-text and exempt from 1.4.3, and both the reason
a direct value label on every bar is mandatory rather than decorative.

The palette was also checked with the `dataviz` skill's validator: the pairs
in use clear CVD separation and the normal-vision floor with wide margins,
worst case ΔE 24.3. They fail its lightness-band and chroma-floor checks,
which are properties of the inherited brand palette.

## Reading order inside a week

Charts above the table in **Full figures**. The shape is what a reader takes
from that section; the table is what they check a single figure against, and
they scroll to it deliberately. The table was on top, so the charts sat below
sixty rows of numbers. The email is ordered the same way.

A nested fold is indented 18px (`details details`), so **Port operations** and
**Vessel movements** read as children of **Daily log** rather than as three
peers.
