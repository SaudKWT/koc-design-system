# Offshore Logistics weekly update

A generator for the weekly Offshore Logistics email that goes to Bu Khaled. One
JSON file per report week in, one self-contained HTML file out.

```bash
python3 docs/reports/offshore-logistics/build.py 2026-09-03 2026-08-26
python3 docs/reports/offshore-logistics/build.py 2026-09-03 2026-08-26 --no-notes
```

The two arguments are the current report date and the one it is compared
against, both matching a filename in `data/`. `--no-notes` drops the amber
"Data notes" block and writes a `_clean` file, for once the open queries in that
block have been answered.

Requires `matplotlib` only.

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

1. Copy `data/2026-09-03.json` to `data/<new report date>.json`.
2. Update the figures. Keep the `audit` arrays: they name the workbook cell each
   count came from, which is what makes a disputed number checkable a month later.
3. `periodDays` must equal the length of `trucks.byDay`. The build asserts it.
4. Run the build with the new date and the previous one.

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

The 9px step was also below the design system's own type floor, where `2xs` is
11px and nothing smaller ships.

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
