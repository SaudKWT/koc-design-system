#!/usr/bin/env python3
"""
Build the Offshore Logistics weekly dashboard.

    python3 build.py                        # every week in main()'s list
    python3 build.py 2026-11-05 2026-10-29  # only these weeks
    python3 build.py --dashboard            # one output only
                                            # (--dashboard, --notes, --artifact)

One page for a browser: every week behind a tab strip, with live SVG charts,
the full daily port and vessel logs, and the drill bit footer. It is uploaded
to SharePoint or OneDrive and previewed there.

There is no email format any more. It was dropped on 05.11.2026, when Saud
said it was not wanted; git history holds it.

Numbers come from data/<report-date>.json (hand-audited counts, each with the
workbook cell it came from) and data/<report-date>.log.json (the daily
narrative, machine-extracted by extract.py). Nothing is typed twice.

Colours come from packages/tokens through tok() and sem() below; no hex is
written here. This directory sits under docs/reports/ and not in packages/ or
apps/ because it is a report, not design-system source. See README.md.
"""

import base64
import json
import math
import re
import sys
from pathlib import Path



HERE = Path(__file__).parent
REPO = HERE.parents[2]

# ── The palette is the KOC design system, read from its generated output ───
# Nothing here is a hand-written hex. packages/tokens/dist/tokens.json is what
# `npm run build:tokens` emits, so a colour changed at source reaches this
# report on the next build, and invariant 1 holds: the only hexes in this repo
# live in packages/tokens/src/.
#
# This replaced the 26-08 report's own palette, which was carried for four
# weeks to keep the weekly series visually continuous and is now retired. That
# navy was #1F3B57; KOC blue is #0060A9.

TOKENS_JSON = REPO / "packages" / "tokens" / "dist" / "tokens.json"


def _load_tokens():
    if not TOKENS_JSON.exists():
        sys.exit(f"missing {TOKENS_JSON}. Run: npm run build:tokens")
    raw = json.loads(TOKENS_JSON.read_text(encoding="utf-8"))

    def flat(node, prefix=""):
        out = {}
        for k, v in node.items():
            key = f"{prefix}.{k}" if prefix else k
            if isinstance(v, dict) and "$value" in v:
                out[key] = v["$value"]
            elif isinstance(v, dict):
                out.update(flat(v, key))
        return out

    return flat(raw)


T = _load_tokens()


def tok(path):
    try:
        return T[path]
    except KeyError:
        sys.exit(f"token not found: {path}. Run: npm run build:tokens")


def sem(name):
    """A semantic token from the light theme. Components take these, never a
    raw ramp step -- that indirection is what makes the theme re-mappable."""
    return tok(f"semantic.light.{name}")


PAGE = sem("background")          # #F4F5F7
CARD = sem("card")                # #FFFFFF
INK = sem("foreground")           # #14181B
INK_MUTED = sem("muted-foreground")   # #55606B, 5.9:1 on the card
SURFACE = sem("muted")            # #E8EAED, tile fill
RULE = sem("border")              # #D4D9DE, decorative edges only
PRIMARY = sem("primary")          # #0060A9, the KOC blue
ON_PRIMARY = sem("primary-foreground")
DANGER = sem("destructive")       # #AA2422
GOOD = sem("success")             # #00704E
WARN = sem("warning")             # #835200
INFO = sem("info")                # #006B78

CHART = [sem(f"chart-{i}") for i in range(1, 6)]

# The one deliberate raw-ramp use. A chart that compares this period against
# the previous one needs the SAME series at lower emphasis, and the semantic
# layer has no token for that role: chart-1..5 all say "a different thing", and
# border/muted are surfaces, not marks. A neutral step reads as recessed
# without claiming to be a second series. Worth a `--chart-prior` token if this
# pattern spreads beyond this report.
PRIOR = tok("color.neutral.300")  # #BCC3CA

# Alert surfaces. Tinted, not saturated: the tile still has to read as a tile.
ALERT_BG = tok("color.danger.50")
ALERT_RULE = tok("color.danger.200")
NOTE_BG = tok("color.warning.50")
NOTE_RULE = tok("color.warning.200")
NOTE_INK = tok("color.warning.700")

# Type and geometry, also from the tokens.
def px(rem_token):
    v = tok(rem_token)
    return f"{float(v.replace('rem', '')) * 16:g}px" if v.endswith("rem") else v


FS = {k: px(f"typography.fontSize.{k}") for k in
      ("2xs", "xs", "sm", "base", "md", "lg", "xl", "2xl", "3xl", "4xl")}
# light (300) is rig3's figure-and-title weight, for 24px and up only.
FW = {k: tok(f"typography.fontWeight.{k}")
      for k in ("light", "normal", "medium", "semibold", "bold")}
RADIUS = px("dimension.radius.DEFAULT")
RADIUS_MD = px("dimension.radius.md")
RADIUS_LG = px("dimension.radius.lg")
RADIUS_XL = px("dimension.radius.xl")


def _css_var(name):
    """A foundation value the DTCG JSON does not carry, read from the generated
    stylesheet instead of being retyped here. letterSpacing.caps is emitted
    only as --tracking-caps."""
    css = (TOKENS_JSON.parent / "koc-tokens.css").read_text(encoding="utf-8")
    m = re.search(rf"--{name}:\s*([^;]+);", css)
    if not m:
        sys.exit(f"--{name} not in koc-tokens.css. Run: npm run build:tokens")
    return m.group(1).strip()


TRACK_CAPS = _css_var("tracking-caps")   # rig3 eyebrows and tags


def rgba(hexcol, a):
    """A token colour at an opacity: Tailwind's `bg-card/70`, spelled for a
    stylesheet that has no Tailwind. The hex still comes from the token."""
    h = hexcol.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return f"rgba({r},{g},{b},{a:g})"


# rig3 surfaces. A card is the card colour at 70% over the page's fog, with a
# hairline border and no shadow. The fog is fei3's: a breath of primary from
# the top left and of success from the right, over the page background.
CARD_GLASS = rgba(CARD, 0.7)
FOG_A = rgba(PRIMARY, 0.08)
FOG_B = rgba(GOOD, 0.06)
DUR_SLOWER = _css_var("duration-slower")   # the bit's canvas fading in
ACCENT = sem("accent")
INPUT = sem("input")
RING = sem("ring")

# Motion comes from the scale, never a literal. duration-fast + ease-out.
EASE_OUT = "cubic-bezier(0,0,.2,1)"
DUR_FAST = "120ms"

# Inter is fontFamily.sans, inlined from fonts/ (see _inter_face), because a
# KOC machine may not reach gstatic.
FONT_STACK = ("Inter, 'Inter var', -apple-system, BlinkMacSystemFont, "
              "'Segoe UI', 'Helvetica Neue', Arial, sans-serif")


FLUIDS = ("Fresh water", "Fuel", "Drill water")


def short(w):
    """The period without the year, for chart labels. The panel heading and the
    chart title already carry the year."""
    return w["periodLabel"].replace(" 2026", "")


# ── Small helpers over the data files ──────────────────────────────────────

def trips(w):
    return sum(w["vesselTrips"].values())


def truck_split(w):
    d = w["trucks"]["byDay"]
    return sum(x["out"] for x in d), sum(x["in"] for x in d)


def truck_total(w):
    o, i = truck_split(w)
    return o + i


def fluid_total(w):
    f = w["fluids"]
    return sum(f["bunkered"].values()) + sum(f["delivered"].values())


def movements(w):
    return sum(w.get("vesselMovements", {}).values())


# The rigs are whatever the week's data lists, not a fixed pair. OPH was
# off-hired, and from report 30 the email stops reporting it, so those weeks
# carry OD1 only.
def overstay(w):
    return sum(r["overstay"][k]
               for r in w["rigs"].values() for k in ("KOC", "HLB", "COSL"))


def overstay_by(w):
    return {k: sum(r["overstay"][k] for r in w["rigs"].values())
            for k in ("KOC", "HLB", "COSL")}


# ── Chart plumbing ─────────────────────────────────────────────────────────



















# ── Detail charts: inline SVG ──────────────────────────────────────────────
#
# One builder for all three, because all three are the same chart: grouped
# bars, a categorical x axis, direct value labels and a legend.


def _nice_step(top, target=5, integer=False):
    """A tick step a reader can do arithmetic in: 1, 2, 2.5, 5 or 10 times a
    power of ten. matplotlib's MaxNLocator did this; hand-rolled axes have to."""
    if top <= 0:
        return 1
    raw = top / float(target)
    mag = 10.0 ** math.floor(math.log10(raw))
    step = next((m * mag for m in (1, 2, 2.5, 5, 10) if raw <= m * mag),
                10 * mag)
    return max(1, round(step)) if integer else step


def svg_bars(uid, cats, series, title, sub, readout_default,
             aria, xpos=None, floor=0, headroom=1.18, fmt="{:g}",
             integer=False, caption="", diff=False):
    """A grouped bar chart as inline SVG, in the rig3 chart grammar.

    That is @koc/chart's grammar on the rig3 branch: a framed card with a quiet
    14px title and a muted subtitle, the legend as swatches above the plot, a
    hairline grid with the zero line a step darker, no axis spines, 2px-radius
    bars with a 2px surface gap between a pair, and muted 10px axis text. The
    unit moves from a rotated y-axis title into the subtitle, where it reads
    without turning the head.

    One deliberate departure from @koc/chart: every bar keeps its value label,
    not only a single series' bars. The previous week is drawn in a pale
    neutral, under 3:1 against the card, and the label beside it is the relief
    that discharges that. It is drawn whatever else changes.

    Hovering or tabbing a column reads the whole category out under the chart
    -- every series and the change between them -- rather than popping a
    tooltip. A tooltip repeats the value already printed on the bar, gets
    clipped by the edge of a SharePoint preview frame, and cannot be reached
    by keyboard or touch. The readout states what the bars do not: the
    difference."""
    n = len(series)
    two_line = any("\n" in c for c in cats)
    W, PAD_L, PAD_R, PAD_T = 950.0, 46.0, 6.0, 24.0
    PLOT_H = 236.0
    XLAB_H = 42.0 if two_line else 26.0
    H = PAD_T + PLOT_H + XLAB_H
    plot_w = W - PAD_L - PAD_R
    y0 = PAD_T + PLOT_H
    GAP = 2.0   # the surface gap between the bars of a pair

    us = list(xpos) if xpos else list(range(len(cats)))
    span = (max(us) - min(us)) + 1.0
    unit = plot_w / span

    def px(u):
        return PAD_L + (u - min(us) + 0.5) * unit

    allv = [v for s in series for v in s["values"]]
    peak = max(allv) if allv else 1
    step = _nice_step(max(floor, peak * headroom), integer=integer)
    # The ceiling is the first tick at or above the peak, raised one more step
    # if that leaves no room to print the tallest bar's label. The label sits
    # above the bar and is the required contrast relief, so it cannot be the
    # thing that gets clipped -- and rounding every chart up a whole step
    # unconditionally would leave the fluids chart a fifth empty.
    # A multiple of the step, so the top edge of the plot is a labelled tick.
    ymax = math.ceil(max(floor, peak, step) / step) * step
    while (ymax - peak) / ymax * PLOT_H < 20:
        ymax += step
    ticks, t = [], 0.0
    while t <= ymax + step * 0.001:
        ticks.append(t)
        t += step

    def py(v):
        return y0 - (v / ymax) * PLOT_H if ymax else y0

    # Hairline grid, the zero line a step darker, tick labels in muted ink.
    # No spines: the grid already says where the values are.
    grid = ""
    for t in ticks:
        yy = py(t)
        grid += (f'<line class="{"cx-zero" if t == 0 else "cx-grid"}" '
                 f'x1="{PAD_L:.1f}" y1="{yy:.1f}" '
                 f'x2="{W - PAD_R:.1f}" y2="{yy:.1f}"/>'
                 f'<text class="cx-yt" x="{PAD_L - 8:.1f}" y="{yy + 4:.1f}" '
                 f'text-anchor="end">{fmt.format(t)}</text>')

    # A group per category: one hit target spanning the whole column, then
    # its bars and labels. The target is drawn first, under the bars, so its
    # hover band sits behind them; the bars take no pointer events, so the
    # pointer still reaches it through a bar.
    # Capped in absolute units as well as in slot fractions: four vessels
    # across 950 units gives a 226-unit slot, where a slot fraction alone drew
    # bars wide enough to read as blocks rather than bars.
    bw = min((0.5 if n == 1 else 0.58 / n) * unit - (0 if n == 1 else GAP),
             54.0)
    groups = ""
    for i, cat in enumerate(cats):
        cx = px(us[i])
        bars = ""
        parts = []
        for k, s in enumerate(series):
            v = s["values"][i]
            off = 0.0 if n == 1 else (k - (n - 1) / 2.0) * (bw + GAP)
            x = cx + off - bw / 2
            h = y0 - py(v)
            bars += (f'<rect class="cx-bar" x="{x:.1f}" y="{py(v):.1f}" '
                     f'width="{bw:.1f}" height="{max(h, 0.0):.1f}" rx="2" '
                     f'fill="{s["fill"]}"/>'
                     f'<text class="cx-vl" x="{x + bw / 2:.1f}" '
                     f'y="{py(v) - 6:.1f}" text-anchor="middle" '
                     f'fill="{s["ink"]}">{fmt.format(v)}</text>')
            parts.append(f'{s["name"]} {fmt.format(v)}')
        flat = cat.replace("\n", " ")
        change = ""
        if diff and n == 2:
            d = series[-1]["values"][i] - series[0]["values"][i]
            change = ("no change" if d == 0 else
                      f"{'up' if d > 0 else 'down'} {fmt.format(abs(d))}")
        read = (f"<b>{flat}</b> &middot; " + ", ".join(parts)
                + (f" &middot; {change}" if change else ""))
        label = f"{flat}: " + ", ".join(parts) + (f", {change}" if change else "")
        lines = cat.split("\n")
        xlab = "".join(
            f'<text class="cx-xt{" cx-xt2" if j else ""}" x="{cx:.1f}" '
            f'y="{y0 + 18 + j * 14:.1f}" text-anchor="middle">{ln}</text>'
            for j, ln in enumerate(lines))
        groups += (f'<g class="cx-g" tabindex="{0 if i == 0 else -1}" '
                   f'role="img" aria-label="{label}" '
                   f'data-r="{read}">'
                   f'<rect class="cx-hit" x="{cx - unit / 2 + 3:.1f}" '
                   f'y="{PAD_T - 14:.1f}" width="{unit - 6:.1f}" '
                   f'height="{PLOT_H + 14:.1f}" rx="6"/>'
                   f'{bars}{xlab}</g>')

    # Above the plot, as swatches, as @koc/chart draws it. Below the axis it
    # was a second thing to look for after the bars; above, it is read first.
    legend = ""
    if n > 1:
        legend = ('\n    <ul class="cx-leg" aria-hidden="true">'
                  + "".join(f'<li><span class="cx-sw" style="background:'
                            f'{s["fill"]}"></span>{s["name"]}</li>'
                            for s in series)
                  + "</ul>")
    note = (f'\n    <div class="cx-note">{caption}</div>' if caption else "")
    return f"""  <figure class="cx" id="cx-{uid}">
    <figcaption class="cx-head"><span class="cx-title">{title}</span><span class="cx-sub">{sub}</span></figcaption>{legend}
    <div class="cx-plot"><svg class="cx-svg" viewBox="0 0 {W:g} {H:g}" role="group"
         aria-label="{aria}">
      {grid}{groups}
    </svg></div>
    <div class="cx-read" data-default="{readout_default}">{readout_default}</div>{note}
  </figure>
"""


def svg_trips(mine, theirs):
    names = ["CA1", "CA3", "CA5", "Charlie-3"]
    mv = [mine["vesselTrips"][n] for n in names]
    if theirs is None:
        series = [dict(name="Trips", values=mv, fill=PRIMARY, ink=PRIMARY)]
        sub = f"Trips per vessel &middot; {trips(mine)} in total"
    else:
        tv = [theirs["vesselTrips"][n] for n in names]
        series = _two_week_series(mine, mv, theirs, tv)
        sub = (f"Trips per vessel &middot; {trips(mine)} this week, "
               f"{trips(theirs)} the week before")
    return svg_bars(
        f"trips-{mine['reportDate']}", names, series, "Vessel trips", sub,
        # 7 was the 26-08 report's ceiling, kept as a floor so the weeks stay
        # visually comparable. It grows rather than clipping: CA1 reached 6 in
        # report 24 and a fixed ceiling would fail silently on the first 8.
        _readout_hint(len(series)), alt_trips(mine, theirs), floor=7,
        integer=True, diff=len(series) == 2)


def svg_ground(w):
    days = w["trucks"]["byDay"]
    out = [d["out"] for d in days]
    inn = [d["in"] for d in days]
    series = [dict(name="Dispatched (out)", values=out, fill=CHART[0],
                   ink=PRIMARY),
              dict(name="Arrived (in)", values=inn, fill=CHART[1],
                   ink=INK_MUTED)]
    sub = (f"Trucks and tankers per day &middot; {sum(out)} out, "
           f"{sum(inn)} in, {sum(out) + sum(inn)} in total")
    return svg_bars(
        f"ground-{w['reportDate']}", [d["label"] for d in days], series,
        "Ground transport", sub,
        "Tap or hover over a day to read its dispatches and arrivals.",
        alt_ground(w), floor=12, integer=True)


def svg_fluids(mine, theirs):
    cats = [(d, f) for d in ("bunkered", "delivered") for f in FLUIDS]
    labels = [f"{f}\n{'bunkered' if d == 'bunkered' else 'to rigs'}"
              for d, f in cats]
    mv = [mine["fluids"][d][f] for d, f in cats]
    if theirs is None:
        series = [dict(name="Cubic metres", values=mv, fill=PRIMARY,
                       ink=PRIMARY)]
        sub = f"Cubic metres (m³) &middot; {fluid_total(mine):,} in total"
    else:
        tv = [theirs["fluids"][d][f] for d, f in cats]
        series = _two_week_series(mine, mv, theirs, tv)
        sub = (f"Cubic metres (m³) &middot; {fluid_total(mine):,} this week, "
               f"{fluid_total(theirs):,} the week before")
    return svg_bars(
        # A gap between the bunkered trio and the delivered trio.
        f"fluids-{mine['reportDate']}", labels, series, "Fluids and bulk",
        sub, _readout_hint(len(series)), alt_fluids(mine, theirs),
        xpos=[0, 1, 2, 3.45, 4.45, 5.45], headroom=1.22, fmt="{:,g}",
        caption=slops_caption(mine, theirs), diff=len(series) == 2)


def _two_week_series(mine_w, mine_v, other_w, other_v):
    """The shared grammar: this week solid navy, the previous week pale, and
    the legend saying which in words rather than leaving dates to be decoded.

    Ordered by period and never by whose panel it is, so time reads left to
    right in every tab. Ordering by panel put the later week on the left in an
    older tab, which read as time running backwards."""
    pairs = sorted([(mine_w, mine_v, True), (other_w, other_v, False)],
                   key=lambda pr: pr[0]["periodStart"])
    return [dict(name=f"{'This week' if mn else 'Previous week'} "
                      f"({short(wk)})", values=vals,
                 fill=PRIMARY if mn else PRIOR,
                 ink=PRIMARY if mn else INK_MUTED)
            for wk, vals, mn in pairs]


def _readout_hint(n):
    # "Tap or hover", not "hover or tab": on a phone there is no hover, and
    # a keyboard user finds the columns by tabbing whether told to or not.
    return ("Tap or hover over a column to read it." if n == 1 else
            "Tap or hover over a column to read both weeks and the change.")


TREND_SERIES = [
    ("Vessel trips", lambda w: trips(w), "{:g}"),
    ("Vessel movements", lambda w: movements(w), "{:g}"),
    ("Truck moves", lambda w: truck_total(w), "{:g}"),
    ("Fluids handled, m³", lambda w: fluid_total(w), "{:,g}"),
    ("Overstay crew", lambda w: overstay(w), "{:g}"),
]


def _trend_weeks(weeks, upto):
    """Only weeks up to and including this panel's own, so an older tab never
    shows figures that had not happened when it was written."""
    return [w for w in sorted(weeks, key=lambda w: w["periodStart"])
            if w["periodStart"] <= upto["periodStart"]]


def spark_svgs(weeks, upto):
    """One sparkline per KPI, keyed by the tile's label, to be drawn inside the
    tile rather than beside it.

    It started life as a strip of its own under the KPI row, which meant the
    page carried the same five figures twice, 400px apart. Putting the line in
    the tile that already holds the number is one block instead of two, with
    nothing dropped.

    Inline SVG rather than a PNG for three reasons: a tenth of the bytes, it
    prints as vectors instead of a 140 dpi raster, and a reader can hover or
    tab a point to read that week. Verified inside a sandboxed srcdoc frame
    with a null origin, which is how SharePoint previews an uploaded file:
    markup paints, :hover applies and script runs there. Four APIs do throw in
    that origin -- localStorage, sessionStorage, document.cookie and
    history.replaceState -- so none of them appear here or in the script.

    There is no floating tooltip on purpose. Hovering a point scrubs the
    tile's own number and the two lines under it, which reads the same on
    mouse, touch and keyboard, and cannot be clipped by the edge of a narrow
    preview frame."""
    order = _trend_weeks(weeks, upto)
    if len(order) < 2:
        return {}

    # viewBox units. Fixed geometry, scaled by CSS, so the stroke and the marks
    # keep their weight and stay round at any tile width.
    W, H, PX, PT, PB = 160.0, 34.0, 9.5, 6.0, 8.0
    out = {}
    for label, get, fmt in TREND_SERIES:
        ys = [get(w) for w in order]
        lo, hi = min(ys), max(ys)
        step = (W - 2 * PX) / (len(ys) - 1)

        def at(i, lo=lo, hi=hi):
            # A metric that did not move draws across the middle, not along
            # the floor. On the floor an unchanged figure reads as a low one.
            frac = 0.5 if hi == lo else (ys[i] - lo) / (hi - lo)
            return PX + step * i, PT + (H - PT - PB) * (1 - frac)

        pts = [at(i) for i in range(len(ys))]
        poly = " ".join(f"{x:.2f},{y:.2f}" for x, y in pts)
        dots, hits = "", ""
        for i, (x, y) in enumerate(pts):
            last = i == len(pts) - 1
            dots += (f'<circle class="d{" dl" if last else ""}" '
                     f'cx="{x:.2f}" cy="{y:.2f}" r="{3.4 if last else 2.2}"/>')
            # A generous hit target, and a roving tabindex: one tab stop per
            # sparkline, not one per point. Twenty extra stops across five
            # tiles would make the keyboard route through this page worse, not
            # better. The entry point is the last -- the week being read --
            # so focusing it shows the number already on screen.
            hits += (f'<circle class="h" cx="{x:.2f}" cy="{y:.2f}" r="9" '
                     f'tabindex="{0 if last else -1}" role="img" '
                     f'aria-label="{order[i]["periodLabel"]}: '
                     f'{fmt.format(ys[i])} {label.lower()}" '
                     f'data-v="{fmt.format(ys[i])}" '
                     f'data-a="{order[i]["periodLabel"]}" '
                     f'data-b="week {i + 1} of {len(ys)} tracked"/>')

        name = (f"{label} over {len(ys)} weeks, {fmt.format(ys[0])} in "
                f"{order[0]['tabLabel']} to {fmt.format(ys[-1])} in "
                f"{order[-1]['tabLabel']}")
        out[label] = (
            f'<svg class="k-spark" viewBox="0 0 {W:g} {H:g}" role="group"\n'
            f'             aria-label="{name}">\n'
            f'          {hits}<polyline class="ln" points="{poly}"/>{dots}\n'
            f'        </svg>')
    return out




# ── Deltas ─────────────────────────────────────────────────────────────────
# The StatCard rule from CLAUDE.md: the arithmetic and the meaning are two
# different things. A fall in truck moves is neither good nor bad, it tracks the
# rig count. A fall in overstay crew is unambiguously good. So `intent` decides
# the colour and `delta` only decides the arrow.









# ── rig3 components ────────────────────────────────────────────────────────
# The page is built from the rig3 pieces in @koc/ui: StatCard,
# SectionHeading, the translucent Card and the outline StatusBadge.

MINUS = "−"   # a real minus, as StatCard prints it, never a hyphen

# lucide's trending-up, trending-down and minus, the glyphs StatCard draws.
GLYPH = {
    "up": '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>'
          '<polyline points="16 7 22 7 22 13"/>',
    "down": '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/>'
            '<polyline points="16 17 22 17 22 11"/>',
    "flat": '<path d="M5 12h14"/>',
}


def glyph(kind):
    return (f'<svg class="k-glyph" viewBox="0 0 24 24" aria-hidden="true" '
            f'focusable="false">{GLYPH[kind]}</svg>')


def section_head(index, eyebrow, aside=""):
    """fei3's section label: one tracked-caps eyebrow carrying the section
    number in the brand blue, an aside on the right, over a hairline. fei3
    gives a section no display title; the masthead and the week are the only
    large type on the page."""
    side = f'<p class="sec-aside">{aside}</p>' if aside else ""
    return (f'  <div class="sec-head"><h3 class="eyebrow">'
            f'<span class="idx">{index}</span> &mdash; {eyebrow}</h3>{side}</div>\n')


def stat_delta(now, was, mode, intent):
    """StatCard's change row: (glyph, text, colour class).

    intent decides the colour and the arithmetic only decides the glyph. A
    fall in truck moves is neither good nor bad, it tracks the rig count; a
    fall in overstay crew is unambiguously good."""
    diff = now - was
    if diff == 0:
        return "flat", "No change", "neutral"
    kind = "up" if diff > 0 else "down"
    sign = "+" if diff > 0 else MINUS
    if mode == "pct":
        text = "new" if was == 0 else f"{sign}{abs(diff) / was * 100:.1f}%"
    else:
        text = f"{sign}{abs(diff):,g}"
    tone = "neutral"
    if intent == "lower-is-better":
        tone = "good" if diff < 0 else "bad"
    return kind, text, tone


def stat_cards(w, other, sparks=None):
    """Four rig3 StatCards, in the same order every week.

    The oldest week is the baseline and carries no change row, and the
    corrected truck figure states both numbers instead of a change against a
    differently counted week.
    """
    arrows = other is not None and w.get("showArrows", True)
    specs = [
        ("Vessel trips", "Vessel trips", "Marine", trips, "", "pct",
         "neutral"),
        ("Truck moves", "Truck moves", "Ground", truck_total, "", "pct",
         "neutral"),
        ("Fluids handled, m³", "Fluids handled", "Supply", fluid_total, "m³",
         "pct", "neutral"),
        ("Overstay crew", "Overstay crew", "Crew", overstay, "", "abs",
         "lower-is-better"),
    ]
    cards = ""
    for key, label, tag, get, unit, mode, intent in specs:
        now = get(w)
        value = f"{now:,}"
        alert = key == "Overstay crew" and now > 0
        if arrows:
            was = get(other)
            kind, text, tone = stat_delta(now, was, mode, intent)
            change = (f'{glyph(kind)}<span class="k-dtext">{text}</span> '
                      f'<span class="k-dlabel">vs {was:,} last week</span>')
        else:
            tone = "neutral"
            change = '<span class="k-dlabel">Baseline week, no comparison</span>'
        if key == "Truck moves" and not arrows and w["trucks"].get("publishedTotal"):
            tone = "bad"
            change = (f'<span class="k-dtext">{now} counted once each</span> '
                      f'<span class="k-dlabel">'
                      f'({w["trucks"]["publishedTotal"]} as published)</span>')
        spark = (sparks or {}).get(key, "")
        # The scrubbed week goes in its own pair of lines rather than
        # overwriting the change row. A change describes this week against
        # last; put an older week's figure above it and the two contradict
        # each other. Swapping which is displayed keeps the tile one height.
        # The scrubbed week takes the change row's slot, so the tile never
        # changes height. It did, by one line, and the point under the pointer
        # moved away from it, which reset the tile, which moved the point
        # back: a flicker for as long as the mouse stayed.
        swap = "" if not spark else '\n      <div class="k-week"></div>'

        unit_html = f'<span class="k-unit">{unit}</span>' if unit else ""
        cards += f"""    <div class="k{' k-alert' if alert else ''}">
      <div class="k-top"><span class="k-label">{label}</span><span class="tag">{tag}</span></div>
      <div class="k-fig"><span class="k-value" data-default="{value}">{value}</span>{unit_html}</div>
      <div class="k-delta {tone}">{change}</div>{swap}
      {spark}</div>
"""
    return f'  <div class="kpis">\n{cards}  </div>\n'


def rig_cards(w):
    """One card per rig: which rig, what state, and whether anyone is
    overstaying -- the three things a reader wants at a glance.

    The state is StatusBadge's outline badge: a hairline pill with a coloured
    dot. A rig on hire is the normal state, so it gets no tint; a tint, or the
    solid red fill, is held back for what needs acting on."""
    cards = ""
    for rig_id in w["rigs"]:
        r = w["rigs"][rig_id]
        off = "off-hired" in r["currentOperation"].lower()
        badge = (f'<span class="badge"><span class="dot {"off" if off else "on"}"'
                 f' aria-hidden="true"></span>{"Off hired" if off else "On hire"}'
                 f'</span>')
        ov = sum(r["overstay"].values())
        ov_txt = ("Nil" if not ov else " &nbsp;".join(
            f'{k} <b class="hot">{v}</b>'
            for k, v in r["overstay"].items() if v))
        pob = ("Nil" if not r["personnelOnboard"] else
               f'<b>{r["personnelOnboard"]}</b> '
               f'<span class="soft">incl. {r["visaHolders"]} visa</span>')
        cards += f"""    <div class="rig">
      <div class="rig-head"><span class="rig-id">{rig_id}</span><span class="rig-meta"><span class="tag">Rig</span>{badge}</span></div>
      <p class="rig-op">{r['currentOperation']}</p>
      <dl class="kv">
        <dt>Personnel onboard</dt><dd>{pob}</dd>
        <dt>Overstay crew</dt><dd>{ov_txt}</dd>
        <dt>Last week</dt><dd>{r['lastWeek']}</dd>
        <dt>Next steps</dt><dd>{r['nextSteps']}</dd>
      </dl>
    </div>
"""
    return f'  <div class="rigs">\n{cards}  </div>\n'






def collapsible(title, inner, sub="", open_it=False):
    """The detail is what makes the report defensible, but it is not what the
    first reader needs, so it folds away."""
    sub_html = f'<span class="fold-sub">{sub}</span>' if sub else ""
    return f"""  <details class="fold"{' open' if open_it else ''}>
    <summary><span class="fold-title">{title}</span>{sub_html}{CHEVRON}</summary>
    <div class="fold-body">
{inner}    </div>
  </details>
"""


# lucide's chevron-down. It turns a half turn when the fold opens, on the
# motion scale, so the state change is visible and not only announced.
CHEVRON = ('<svg class="chev" viewBox="0 0 24 24" aria-hidden="true" '
           'focusable="false"><path d="m6 9 6 6 6-6"/></svg>')


# ── Tables ─────────────────────────────────────────────────────────────────

def comparison_table(cur, prev):
    """The week-on-week comparison, and the text behind every chart: each
    charted figure appears here as a number.

    @koc/chart's table: hairline rows, no vertical rules, and each block opened
    by a tracked-caps eyebrow."""
    c_out, c_in = truck_split(cur)
    p_out, p_in = truck_split(prev)
    c_over, p_over = overstay_by(cur), overstay_by(prev)

    def line(name, now, was, mode="abs", intent="neutral", unit="",
             bold=False, fmt="{:,g}"):
        kind, text, tone = stat_delta(now, was, mode, intent)
        b = ' class="tot"' if bold else ""
        return (f'    <tr{b}><th scope="row">{name}</th>'
                f'<td>{fmt.format(now)}{unit}</td>'
                f'<td class="soft">{fmt.format(was)}{unit}</td>'
                f'<td class="chg {tone}">{glyph(kind)}{text}</td></tr>\n')

    def sec(title):
        return (f'    <tr class="ct-sec"><th colspan="4" scope="colgroup">'
                f'{title}</th></tr>\n')

    h = ('  <div class="ct-wrap"><table class="ct">\n'
         f'  <caption>Week on week, {cur["tabLabel"]} against '
         f'{prev["tabLabel"]}</caption>\n  <thead>\n'
         f'    <tr><th scope="col">Metric</th>'
         f'<th scope="col">{cur["tabLabel"]}<span>{cur["periodDays"]} days</span></th>'
         f'<th scope="col">{prev["tabLabel"]}<span>{prev["periodDays"]} days</span></th>'
         f'<th scope="col">Change</th></tr>\n')
    h += "  </thead>\n  <tbody>\n"

    h += sec("Vessel trips")
    for v in ("CA1", "CA3", "CA5", "Charlie-3"):
        h += line(v, cur["vesselTrips"][v], prev["vesselTrips"][v])
    h += line("Total vessel trips", trips(cur), trips(prev), bold=True)

    if cur.get("vesselMovements") and prev.get("vesselMovements"):
        h += sec("Vessel movements &nbsp;<span style='font-weight:400;"
                 "text-transform:none;letter-spacing:0;'>port to rig, "
                 "rig to port, rig to rig</span>")
        for v in ("CA1", "CA3", "CA5", "Charlie-3"):
            h += line(v, cur["vesselMovements"][v], prev["vesselMovements"][v])
        h += line("Total vessel movements", movements(cur), movements(prev),
                  bold=True)
        h += line("Movements per day",
                  round(movements(cur) / cur["periodDays"], 1),
                  round(movements(prev) / prev["periodDays"], 1), fmt="{:.1f}")

    h += sec("Ground transport")
    h += line("Dispatched (out)", c_out, p_out)
    h += line("Arrived (in)", c_in, p_in)
    h += line("Total truck / tanker moves", c_out + c_in, p_out + p_in, bold=True)
    h += line("Moves per day", round((c_out + c_in) / cur["periodDays"], 1),
              round((p_out + p_in) / prev["periodDays"], 1), fmt="{:.1f}")

    h += sec("Fluids and bulk")
    for d, tag in (("bunkered", "bunkered at port"), ("delivered", "to rigs")):
        for f in FLUIDS:
            h += line(f"{f} {tag}", cur["fluids"][d][f], prev["fluids"][d][f],
                      unit=" m³")
    h += line("Total fluids managed", fluid_total(cur), fluid_total(prev),
              unit=" m³", bold=True)
    h += line("Slops discharged", cur["slops"]["dischargedBbl"],
              prev["slops"]["dischargedBbl"], unit=" bbl")

    h += sec("Rigs and crew")
    h += line("Active rigs", cur["activeRigs"], prev["activeRigs"])
    h += line("OD1 personnel onboard", cur["rigs"]["OD1"]["personnelOnboard"],
              prev["rigs"]["OD1"]["personnelOnboard"])
    for k in ("KOC", "HLB", "COSL"):
        h += line(f"Overstay crew, {k}", c_over[k], p_over[k],
                  intent="lower-is-better")
    h += line("Total overstay crew", overstay(cur), overstay(prev),
              intent="lower-is-better", bold=True)
    return h + "  </tbody>\n  </table>\n  </div>\n"








# ── Daily logs ─────────────────────────────────────────────────────────────

def daily_log(log, key, title):
    """The workbook's own narrative, one block per day.

    A page has no attachment, so it carries the log itself and the report
    stands alone."""
    days = log[key]["days"]
    rows = ""
    for d in days:
        ops = "".join(f"<li>{ln}</li>" for ln in d["lines"]) or "<li>Nil</li>"
        marks = []
        if d.get("nightShift") is False:
            marks.append("no night shift")
        if d.get("dateInferred"):
            marks.append("date inferred")
        for msg in d.get("defects", []):
            marks.append(msg)
        mark_html = (f'<div class="log-mark">{"; ".join(marks)}</div>'
                     if marks else "")
        status = d["status"] or "not stated"
        tone = "" if status.lower() == "normal" else " note"
        rows += f"""      <tr>
        <th scope="row"><span class="log-day">{d['day']}</span><span class="log-date">{d['date']}</span><span class="log-status{tone}">{status}</span></th>
        <td><ul>{ops}</ul>{mark_html}</td>
      </tr>
"""
    n = sum(len(d["lines"]) for d in days)
    return f"""      <details class="fold fold-in">
        <summary><span class="fold-title">{title}</span><span class="fold-sub">{len(days)} days, {n} operations</span>{CHEVRON}</summary>
        <div class="fold-body">
        <table class="log">
{rows}        </table>
        </div>
      </details>
"""





def slops_caption(mine, theirs):
    s = mine["slops"]
    txt = ("Slops: none recorded" if not s["dischargedBbl"]
           else f"Slops: {s['dischargedBbl']} bbl discharged to vacuum tankers")
    if theirs is not None and theirs["slops"]["dischargedBbl"]:
        txt += f". Previous week: {theirs['slops']['dischargedBbl']} bbl"
    return txt + "."


def alt_trips(mine, theirs):
    txt = ("Vessel trips by vessel. " + f"{mine['periodLabel']}: "
           + ", ".join(f"{k} {v}" for k, v in mine["vesselTrips"].items())
           + f", total {trips(mine)}.")
    if theirs is None:
        return txt
    return (txt + f" {theirs['periodLabel']}: "
            + ", ".join(f"{k} {v}" for k, v in theirs["vesselTrips"].items())
            + f", total {trips(theirs)}.")


def alt_ground(w):
    o, i = truck_split(w)
    return ("Daily ground transport movements, " + w["periodLabel"] + ". "
            + "; ".join(f"{d['label']} {d['out']} out {d['in']} in"
                        for d in w["trucks"]["byDay"])
            + f". Totals {o} out, {i} in, {o + i} moves.")


def alt_fluids(mine, theirs):
    parts = []
    for d, tag in (("bunkered", "bunkered"), ("delivered", "to rigs")):
        for f in FLUIDS:
            v = f"{f} {tag} {mine['fluids'][d][f]}"
            if theirs is not None:
                v += f" against {theirs['fluids'][d][f]}"
            parts.append(v)
    head = ("Fluids and bulk managed, cubic metres, " + mine["periodLabel"]
            + ("." if theirs is None
               else f" against {theirs['periodLabel']}."))
    tail = (f". Total {fluid_total(mine)}." if theirs is None else
            f". Totals {fluid_total(mine)} against {fluid_total(theirs)}.")
    return head + " " + "; ".join(parts) + tail


# ── Shared panel body ──────────────────────────────────────────────────────



def week_body(w, other, log, with_comparison, all_weeks=None):
    """One week, ordered for the person with the least time.

    Headline, four numbers, the rigs, what happened, then everything that
    proves those figures -- the detail charts, the comparison table, the daily
    log -- folded away below. Nothing was dropped to get there; it was
    reordered and disclosed.

    The order is set out as rig3's numbered sections, so the page reads as
    four parts rather than one long column."""
    h = (f'  <p class="lead">{w.get("headline", "")}</p>\n'
         if w.get("headline") else "")

    # Each tile carries its own sparkline, so the four figures are stated once.
    sparks = spark_svgs(all_weeks, w) if all_weeks else {}
    cmp_note = ("Change against the week before"
                if other is not None and w.get("showArrows", True)
                else "First week tracked, nothing to compare")
    h += '  <section class="sec">\n'
    h += section_head("01", "Figures", cmp_note)
    h += stat_cards(w, other, sparks)
    h += "  </section>\n"

    n_rigs = len(w["rigs"])
    h += '  <section class="sec">\n'
    h += section_head("02", "Rigs",
                      f"{n_rigs} rig{'s' if n_rigs != 1 else ''} in this report")
    h += rig_cards(w)
    h += "  </section>\n"

    # Where the covering email's own operations list has been transcribed,
    # that is what this section shows: its lines, reworded and nothing else.
    # The alternative was a written summary of the week, which is an
    # interpretation, and an interpretation is a place for a mistake to live.
    # The email's list covers the last day of the period, not all seven, so
    # the heading carries that date rather than implying a week.
    ops = w.get("dailyOperations")
    if ops:
        title, aside = "Daily ground operations", ops["label"]
        items = list(ops["lines"]) + list(ops.get("extraNotes") or [])
    else:
        title, aside, items = "What happened", "", w["highlights"]
    lis = "".join(f"<li>{x}</li>" for x in items)
    h += '  <section class="sec">\n'
    h += section_head("03", title, aside)
    h += f'  <div class="panel ops"><ul>{lis}</ul>'
    if ops:
        h += f'<p class="src">{ops["source"]}.</p>'
    h += "</div>\n  </section>\n"

    # Charts first, then the table. The shape is what a reader takes from
    # this section; the table is what they check a single figure against, and
    # they scroll to it deliberately.
    detail = ('    <div class="charts">\n' + svg_ground(w) + svg_trips(w, other)
              + svg_fluids(w, other) + "    </div>\n")
    if with_comparison:
        detail += comparison_table(w, other)
    h += '  <section class="sec">\n'
    h += section_head("04", "Detail", "Every figure, and the log behind it")
    h += collapsible("Full figures", detail, "three charts, and every figure")
    if log:
        inner = (daily_log(log, "port", "Port operations")
                 + daily_log(log, "vessel", "Vessel movements"))
        n_ops = sum(len(d["lines"]) for k in ("port", "vessel")
                    for d in log[k]["days"])
        h += collapsible("Daily log", inner, f"{n_ops} operations")
    h += "  </section>\n"
    return h






# ── Format: tabbed dashboard ───────────────────────────────────────────────

def _inter_face():
    """Inter inlined as one @font-face, not linked from Google Fonts.

    The variable latin subset is 47 KB and covers 400 to 700 in a single file,
    which is cheap against a page this size and buys three things a <link>
    cannot: it renders on a KOC machine that cannot reach fonts.gstatic.com, it
    survives being opened from a file:// path or a SharePoint preview frame,
    and it adds no request that a proxy can fail. Without it the page falls
    back to Segoe UI, which is the look the design system replaced."""
    f = HERE / "fonts" / "Inter-latin-var.woff2"
    if not f.exists():
        return ""
    b64 = base64.b64encode(f.read_bytes()).decode("ascii")
    return (f"@font-face{{font-family:'Inter';font-style:normal;"
            f"font-weight:100 900;font-display:swap;"
            f"src:url(data:font/woff2;base64,{b64}) format('woff2')}}")


FONT_FACE = _inter_face()

CSS = f""":root{{color-scheme:light;
  /* The six roles the fi3 bit's renderer reads at runtime (gl/tokens.ts). */
  --background:{PAGE};--card:{CARD};--foreground:{INK};--primary:{PRIMARY};
  --muted-foreground:{INK_MUTED};--border:{RULE}}}
/* The fog, as fei3 lays it: a breath of primary from the top left and of
   success from the right. A fixed layer behind the page, not a background on
   body, because background-attachment:fixed repaints on every scroll on a
   phone. */
body::before{{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;
  background:radial-gradient(70% 45% at 0% 0%,{FOG_A},transparent 70%),
    radial-gradient(60% 50% at 100% 30%,{FOG_B},transparent 70%),{PAGE}}}
.wrap{{max-width:1120px;margin:0 auto;padding:0 24px 40px}}
/* The rig3 card: the card colour at 70% over the fog, a hairline edge, no
   shadow. Every surface on the page is one of these. */
.k,.rig,.panel,.cx,.fold,.ct-wrap{{background:{CARD_GLASS};border:1px solid {RULE};
  border-radius:{RADIUS_XL};-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}}
.eyebrow{{margin:0;font-size:{FS['2xs']};font-weight:{FW['medium']};text-transform:uppercase;
  letter-spacing:{TRACK_CAPS};color:{INK_MUTED}}}
.eyebrow .idx{{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:{PRIMARY}}}
.tag{{flex:0 0 auto;font-size:{FS['2xs']};font-weight:{FW['medium']};text-transform:uppercase;
  letter-spacing:{TRACK_CAPS};color:{INK_MUTED}}}

/* ── Masthead: fei3's. The KOC emblem in KOC blue, as tall as the title
   block; the title in staggered uppercase blue; the group under it; then
   fei3's horizon line. No top bar, as on rig3. ── */
.top-in{{max-width:1120px;margin:0 auto;padding:22px 24px 0}}
.mast{{display:flex;align-items:center;gap:14px;min-width:0}}
.emblem{{flex:0 0 auto;width:3.65rem;height:4.5rem;background:{PRIMARY};
  -webkit-mask:var(--emblem) center/contain no-repeat;mask:var(--emblem) center/contain no-repeat}}
.top h1{{margin:0;font-size:clamp(1.25rem,1.9vw,1.75rem);font-weight:{FW['medium']};
  text-transform:uppercase;line-height:.9;letter-spacing:-.035em;color:{PRIMARY}}}
.top h1>span{{display:block;white-space:nowrap}}
.top h1 .l2{{padding-left:1.2em}}
.top .sub{{margin:7px 0 0;font-size:{FS['xs']};color:{INK_MUTED}}}
.top .sub b{{font-weight:{FW['semibold']};color:{PRIMARY}}}
.horizon{{max-width:1120px;margin:14px auto 0;padding:0 24px;box-sizing:border-box}}
.horizon i{{display:block;height:1px;background:linear-gradient(90deg,transparent,
  {rgba(PRIMARY, 0.45)} 25%,{rgba(PRIMARY, 0.45)} 75%,transparent)}}
/* The weeks, as fei3's pinned/recent bar: a translucent card with a caps
   label, the weeks as chips in one row that scrolls sideways when it
   overflows. The row grows by one week a week, so wrapping would only get
   worse. */
.tabs-wrap{{max-width:1120px;margin:0 auto;padding:14px 24px 0}}
.weeks{{display:flex;align-items:center;gap:12px;min-height:44px;padding:5px 6px 5px 14px;
  box-sizing:border-box;background:{CARD_GLASS};border:1px solid {RULE};border-radius:{RADIUS_XL};
  -webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}}
.weeks .eyebrow{{flex:0 0 auto}}
[role=tablist]{{display:flex;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin;gap:6px;
  padding:2px;position:relative;min-width:0;flex:1 1 auto}}
[role=tab]{{flex:0 0 auto;white-space:nowrap;appearance:none;font:inherit;cursor:pointer;
  display:inline-flex;align-items:baseline;gap:6px;
  background:{rgba(CARD, 0.8)};border:1px solid {RULE};border-radius:9999px;
  color:{INK};font-size:{FS['xs']};font-weight:{FW['medium']};padding:5px 12px;
  transition:color {DUR_FAST} {EASE_OUT},background-color {DUR_FAST} {EASE_OUT},border-color {DUR_FAST} {EASE_OUT}}}
[role=tab] .rep{{font-weight:{FW['normal']};color:{INK_MUTED}}}
[role=tab]:hover{{color:{PRIMARY}}}
[role=tab][aria-selected=true]{{color:{ON_PRIMARY};background:{PRIMARY};border-color:{PRIMARY}}}
[role=tab][aria-selected=true] .rep{{color:{tok('color.primary.100')}}}
[role=tab]:focus-visible{{outline:2px solid {RING};outline-offset:2px}}

/* ── A week ── */
[role=tabpanel]{{padding:30px 0 0}}
[role=tabpanel]:focus-visible{{outline:2px solid {RING};outline-offset:6px;border-radius:{RADIUS_MD}}}
.panel-head h2{{margin:6px 0 0;font-size:{FS['3xl']};font-weight:{FW['light']};
  letter-spacing:-.02em;line-height:1.15;color:{INK}}}
.lead{{margin:12px 0 0;max-width:72ch;font-size:{FS['md']};line-height:1.6;color:{INK}}}
.sec{{margin-top:30px}}
/* fei3's section label: an eyebrow and an aside over a hairline in ink at
   15%, the directory's rule. */
.sec-head{{display:flex;align-items:baseline;justify-content:space-between;gap:4px 24px;
  flex-wrap:wrap;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid {rgba(INK, 0.15)}}}
.sec-aside{{margin:0;font-size:{FS['2xs']};color:{INK_MUTED}}}

/* StatCard */
.kpis{{display:grid;gap:8px;grid-template-columns:repeat(4,minmax(0,1fr))}}
/* fei3's figure cell: rounded-lg, a small muted label, a light figure. */
.k{{display:flex;flex-direction:column;gap:2px;padding:10px 14px 12px;border-radius:{RADIUS_LG}}}
.k-top{{display:flex;align-items:baseline;justify-content:space-between;gap:8px}}
.k-label{{font-size:{FS['2xs']};color:{INK_MUTED}}}
.k-alert .tag{{color:{sem('destructive-muted-foreground')};background:{sem('destructive-muted')};
  border-radius:9999px;padding:2px 8px}}
.k-fig{{display:flex;align-items:baseline;gap:6px;margin-top:2px}}
.k-value{{font-size:{FS['3xl']};font-weight:{FW['light']};letter-spacing:-.025em;line-height:2.25rem;
  color:{INK};font-variant-numeric:tabular-nums}}
.k-unit{{font-size:{FS['2xs']};color:{INK_MUTED}}}
.k-delta{{display:flex;align-items:center;gap:4px;flex-wrap:wrap;font-size:{FS['2xs']};
  font-variant-numeric:tabular-nums;min-height:1.5em}}
.k-glyph{{width:12px;height:12px;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:2;
  stroke-linecap:round;stroke-linejoin:round}}
.neutral{{color:{INK_MUTED}}}
.good{{color:{GOOD}}}
.bad{{color:{DANGER}}}
.k-dtext{{font-weight:{FW['medium']}}}
.k-dlabel{{color:{INK_MUTED}}}
/* The scrubbed week swaps in for the change row, so the tile keeps its height
   and a figure from an older week never sits above a change describing this
   one. */
.k-week{{display:none;align-items:center;min-height:1.5em;font-size:{FS['2xs']};
  font-weight:{FW['medium']};color:{INK};font-variant-numeric:tabular-nums}}
.k[data-scrub] .k-delta{{display:none}}
.k[data-scrub] .k-week{{display:flex}}
/* Sparkline inside each tile. Inline SVG, so it costs a tenth of a PNG,
   prints as vectors, and can be hovered or tabbed a point at a time.
   width:100% with height:auto keeps the viewBox aspect, so the marks stay
   round at any tile width; overflow:visible so a hover halo at the top or
   bottom of the band is a full circle. */
.k-spark{{display:block;width:100%;height:auto;margin:8px 0 0;overflow:visible}}
.k-spark .ln{{fill:none;stroke:{PRIMARY};stroke-opacity:.7;stroke-width:1.5;
  stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}}
.k-spark .d{{fill:{PRIMARY};stroke:{CARD};stroke-width:1}}
.k-spark .dl{{stroke-width:1.4}}
.k-spark .ln,.k-spark .d{{pointer-events:none}}
.k-spark .h{{fill:transparent;stroke:none;cursor:pointer;transition:fill {DUR_FAST} {EASE_OUT}}}
.k-spark .h:hover{{fill:{tok('color.primary.100')}}}
.k-spark .h:focus-visible{{outline:none;fill:{tok('color.primary.100')};
  stroke:{RING};stroke-width:2;vector-effect:non-scaling-stroke}}

/* Rig cards and the outline StatusBadge */
.rigs{{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}}
.rig{{padding:18px 20px}}
/* fei3's team index: the rig's name as a large light figure in KOC blue,
   its kind in caps and its state beside it. */
.rig-head{{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap}}
.rig-id{{font-size:{FS['3xl']};font-weight:{FW['light']};line-height:1;letter-spacing:-.02em;
  color:{PRIMARY};font-variant-numeric:tabular-nums}}
.rig-meta{{display:flex;flex-direction:column;gap:4px;align-items:flex-start}}
.badge{{display:inline-flex;align-items:center;gap:6px;border:1px solid {RULE};border-radius:{RADIUS};
  padding:2px 8px;font-size:{FS['2xs']};font-weight:{FW['medium']};color:{INK};white-space:nowrap;
  background:{CARD}}}
.dot{{width:7px;height:7px;border-radius:9999px;background:{INK_MUTED}}}
.dot.on{{background:{sem('success-muted-foreground')}}}
.rig-op{{margin:10px 0 12px;font-size:{FS['base']};line-height:1.5;color:{INK}}}
.kv{{display:grid;grid-template-columns:max-content 1fr;gap:6px 20px;margin:0;
  font-size:{FS['xs']};line-height:1.5;border-top:1px solid {RULE};padding-top:12px}}
.kv dt{{color:{INK_MUTED}}}
.kv dd{{margin:0;color:{INK};font-variant-numeric:tabular-nums}}
.kv b{{font-weight:{FW['semibold']}}}
.hot{{color:{DANGER}}}
.soft{{color:{INK_MUTED};font-weight:{FW['normal']}}}

/* Operations */
.panel{{padding:18px 22px}}
.ops ul{{margin:0;padding-left:20px;font-size:{FS['base']};line-height:1.6;color:{INK}}}
.ops li{{padding-bottom:6px}}
.ops li::marker{{color:{PRIMARY}}}
.src{{margin:6px 0 0;font-size:{FS['2xs']};color:{INK_MUTED}}}

/* Folds */
.fold+.fold{{margin-top:12px}}
.fold summary{{display:flex;align-items:baseline;gap:10px;cursor:pointer;list-style:none;
  padding:14px 18px;border-radius:{RADIUS_XL};transition:background-color {DUR_FAST} {EASE_OUT}}}
.fold summary::-webkit-details-marker{{display:none}}
.fold summary:hover{{background:{rgba(ACCENT, 0.6)}}}
.fold summary:focus-visible{{outline:2px solid {RING};outline-offset:2px}}
.fold-title{{font-size:{FS['sm']};font-weight:{FW['medium']};color:{INK}}}
.fold-sub{{font-size:{FS['xs']};color:{INK_MUTED}}}
.chev{{width:16px;height:16px;margin-left:auto;align-self:center;flex:0 0 auto;fill:none;
  stroke:{INK_MUTED};stroke-width:2;stroke-linecap:round;stroke-linejoin:round;
  transition:transform {DUR_FAST} {EASE_OUT}}}
.fold[open]>summary .chev{{transform:rotate(180deg)}}
.fold-body{{padding:4px 18px 18px}}
/* A nested fold is a child of the one above it, so it reads as one. */
.fold-in{{margin-left:18px;background:{CARD}}}
.fold-in+.fold-in{{margin-top:10px}}
.charts{{display:grid;gap:12px}}

/* @koc/chart, in SVG. Fonts are declared here rather than per element so one
   rule changes the whole set, and so print inherits them. */
.cx{{margin:0;padding:16px;display:flex;flex-direction:column;gap:10px;min-width:0}}
.cx-head{{display:flex;flex-direction:column}}
.cx-title{{font-size:{FS['sm']};font-weight:{FW['medium']};color:{INK}}}
.cx-sub{{font-size:{FS['xs']};color:{INK_MUTED}}}
.cx-leg{{display:flex;flex-wrap:wrap;gap:4px 16px;margin:0;padding:0;list-style:none;
  font-size:{FS['2xs']};color:{INK_MUTED}}}
.cx-leg li{{display:flex;align-items:center;gap:6px}}
.cx-sw{{display:inline-block;width:16px;height:8px;border-radius:2px}}
.cx-svg{{display:block;width:100%;height:auto;font-family:inherit;overflow:visible}}
.cx-yt,.cx-xt{{font-size:11px;fill:{INK_MUTED}}}
.cx-grid{{stroke:{RULE};stroke-width:1;vector-effect:non-scaling-stroke}}
.cx-zero{{stroke:{INK_MUTED};stroke-opacity:.6;stroke-width:1;vector-effect:non-scaling-stroke}}
/* Direct value labels. Required, not decorative: they are the relief that
   discharges the sub-3:1 contrast of the pale previous-week fill. */
.cx-vl{{font-size:11.5px;font-weight:{FW['semibold']};font-variant-numeric:tabular-nums}}
.cx-hit{{fill:transparent;cursor:pointer;transition:fill {DUR_FAST} {EASE_OUT}}}
.cx-bar,.cx-vl,.cx-grid,.cx-zero,.cx-xt,.cx-yt{{pointer-events:none}}
.cx-g{{outline:none}}
/* Hover lays a band behind the column rather than restyling the bars, so the
   colour encoding is never touched by an interaction state. */
.cx-g:hover .cx-hit{{fill:{rgba(ACCENT, 0.7)}}}
.cx-g:focus-visible .cx-hit{{fill:{rgba(tok('color.primary.100'), 0.6)};stroke:{RING};stroke-width:2;
  vector-effect:non-scaling-stroke}}
.cx-read{{font-size:{FS['xs']};color:{INK};font-variant-numeric:tabular-nums;min-height:1.5em;
  border-top:1px solid {RULE};padding-top:8px}}
.cx-read b{{font-weight:{FW['semibold']}}}
.cx-note{{font-size:{FS['xs']};color:{INK_MUTED}}}

/* The comparison table, as @koc/chart's table view draws it */
.ct-wrap{{margin-top:12px;padding:6px 16px 10px;overflow-x:auto}}
.ct{{width:100%;border-collapse:collapse;font-size:{FS['xs']};font-variant-numeric:tabular-nums}}
.ct caption{{text-align:left;padding:10px 0 6px;font-size:{FS['sm']};font-weight:{FW['medium']};color:{INK}}}
.ct th,.ct td{{padding:7px 8px;text-align:right;border-bottom:1px solid {rgba(RULE, 0.6)}}}
.ct th:first-child{{text-align:left;padding-left:0}}
.ct tbody th{{font-weight:{FW['normal']};color:{INK}}}
.ct thead th{{font-weight:{FW['medium']};color:{INK_MUTED};border-bottom:1px solid {RULE};vertical-align:bottom}}
.ct thead th span{{display:block;font-weight:{FW['normal']};font-size:{FS['2xs']}}}
.ct .tot th,.ct .tot td{{font-weight:{FW['semibold']};color:{INK}}}
.ct .tot td.soft{{color:{INK_MUTED}}}
.ct-sec th{{text-align:left;padding:16px 0 6px;font-size:{FS['2xs']};font-weight:{FW['medium']};
  text-transform:uppercase;letter-spacing:{TRACK_CAPS};color:{PRIMARY};border-bottom:1px solid {RULE}}}
.ct .chg{{white-space:nowrap;font-weight:{FW['medium']}}}
.ct .chg .k-glyph{{width:12px;height:12px;vertical-align:-2px;margin-right:4px}}

/* Daily log */
/* The workbook writes some days as one comma-joined run with no spaces
   ("Vessel CA1- Vessel at OD1,Anchor heaved up@11:09,..."). Unbroken, that is
   wider than a phone: 479px in a 390px screen, which Chromium clips and iOS
   lets the page slide sideways to show. So it may break anywhere, here and in
   every other block of workbook or email text. */
.log{{width:100%;border-collapse:collapse;font-size:{FS['xs']};table-layout:fixed}}
.log td,.ops li,.kv dd,.rig-op,.lead{{overflow-wrap:anywhere}}
.log th,.log td{{vertical-align:top;text-align:left;padding:10px 0;border-top:1px solid {rgba(RULE, 0.8)}}}
.log tr:first-child th,.log tr:first-child td{{border-top:0}}
.log th{{width:22%;padding-right:16px;font-weight:{FW['normal']}}}
.log-day{{display:block;font-weight:{FW['medium']};color:{INK};font-size:{FS['sm']}}}
.log-date{{display:block;color:{INK_MUTED};font-variant-numeric:tabular-nums}}
.log-status{{display:block;padding-top:4px;color:{INK_MUTED};font-size:{FS['2xs']}}}
.log-status.note{{color:{sem('warning-muted-foreground')}}}
.log ul{{margin:0;padding-left:18px;line-height:1.55;color:{INK}}}
.log-mark{{font-size:{FS['2xs']};color:{sem('warning-muted-foreground')};padding-top:6px}}

/* ── Footer: fi3's plate. The bit stands on the page, not in a box: the
   canvas is transparent and its ground grid runs out into a breath of KOC
   blue. Under it, before any script runs and wherever there is no hardware
   WebGL2, is fi3's own line elevation of the same bit. ── */
.foot{{margin-top:56px;border-top:1px solid {rgba(INK, 0.1)};overflow:hidden;
  background:radial-gradient(110% 90% at 72% 45%,{rgba(PRIMARY, 0.1)} 0%,transparent 70%)}}
/* fi3's Plate I: the group's name at display scale, staggered, with the bit
   filling the right of the band. The band runs full width; its contents keep
   the report column's 1120px and 24px gutter, so the wordmark lines up with
   the page above it.
   A fixed height, never fi3's min(100svh,52rem): OneDrive and SharePoint
   preview the file in a frame sized to the page's own height, so 100svh grew
   with the page and the page grew with 100svh, and the footer ran on far
   past the bit. The wordmark is centred on
   the bit's height, not pinned to the top, so no empty quarter sits under it. */
.foot-in{{position:relative;max-width:1120px;margin:0 auto;padding:0 24px;
  height:34rem;display:flex;align-items:center;justify-content:center;gap:clamp(3rem,12vw,11rem)}}
.foot-mark{{position:relative;z-index:1;margin:0;font-size:clamp(2.5rem,5vw,5.75rem);
  font-weight:{FW['medium']};text-transform:uppercase;line-height:.86;letter-spacing:-.04em;color:{PRIMARY}}}
.foot-mark>span{{display:block;white-space:nowrap}}
.foot-mark .i1{{padding-left:1.55em}}
.foot-mark .i2{{padding-left:2.3em}}
/* The wordmark and the bit are one group, centred in the column, so the
   space left of the name equals the space right of the bit. */
/* Part of the plate on the right is room for the shadow, not the bit; a negative
   margin takes it out of the centring, so the gaps are the bit's own. */
.bitplate{{position:relative;flex:0 0 auto;width:min(28rem,46%);height:100%;
  margin-right:calc(min(28rem,46%) * -0.115)}}
/* The shadow falls to the right of the bit, so the plate is wider than the
   bit by the shadow's reach, and its right edge fades out, as fi3 masks its
   own canvas, instead of ending in a hard line. */
.bitplate canvas{{position:absolute;inset:0;width:100%;height:100%;opacity:0;
  -webkit-mask-image:linear-gradient(90deg,var(--foreground) 78%,transparent);
  mask-image:linear-gradient(90deg,var(--foreground) 78%,transparent);
  transition:opacity {DUR_SLOWER} {EASE_OUT}}}
.bitplate[data-live] canvas{{opacity:1}}
.bitplate[data-live] .bit-line{{opacity:0}}
.bit-probe{{position:absolute;width:0;height:0;overflow:hidden;pointer-events:none}}
.bit-line{{position:absolute;inset:24px;width:calc(100% - 48px);height:calc(100% - 48px);
  color:{PRIMARY};transition:opacity {DUR_SLOWER} {EASE_OUT}}}
.bit-line .bo{{fill:{CARD};stroke:currentColor;stroke-width:.03;stroke-linejoin:round}}
.bit-line .bl{{stroke:currentColor;stroke-width:.02}}
.bit-line .bc{{fill:{rgba(PRIMARY, 0.15)};stroke:currentColor;stroke-width:.025}}
@media (max-width:900px){{
  .kpis{{grid-template-columns:repeat(2,minmax(0,1fr))}}
}}
@media (max-width:760px){{
  .wrap{{padding:0 16px 32px}}
  /* The header scrolls away with the page on a phone and is short: on a
     740px screen, every pixel above the figures is a pixel of them lost. */
  .top-in{{padding:14px 16px 0}}
  .mast{{gap:10px}}
  .emblem{{width:2.1rem;height:2.6rem}}
  .top h1{{font-size:{FS['lg']}}}
  .top .sub{{margin-top:5px;font-size:{FS['2xs']}}}
  .top .sub .abbr{{display:none}}
  .top .sub .wide{{display:none}}
  .top h1{{line-height:.95}}
  .horizon{{margin-top:10px;padding:0 16px}}
  .tabs-wrap{{padding:10px 16px 0}}
  .weeks{{padding:4px;min-height:0}}
  .weeks .eyebrow{{display:none}}
  [role=tablist]{{scrollbar-width:none;overscroll-behavior-x:contain}}
  [role=tablist]::-webkit-scrollbar{{display:none}}
  [role=tab]{{padding:6px 12px}}
  /* The report number under each tab label is dropped here. The label names
     the week and the fill marks the selected tab. */
  [role=tab] .rep{{display:none}}
  [role=tabpanel]{{padding-top:22px}}
  .panel-head h2{{font-size:{FS['2xl']}}}
  .sec{{margin-top:30px}}
  .kpis{{gap:10px}}
  /* Two tiles a row leave no room for the tag beside the label. */
  .k .tag{{display:none}}
  .k-alert .k-label{{color:{DANGER}}}
  .k{{padding:14px}}
  .k-value{{font-size:{FS['2xl']};line-height:2rem}}
  .rigs{{grid-template-columns:1fr}}
  .rig{{padding:16px}}
  .kv{{grid-template-columns:1fr;gap:0}}
  .kv dd{{padding-bottom:8px}}
  .panel{{padding:16px}}
  .fold summary{{padding:13px 14px;flex-wrap:wrap}}
  .fold-body{{padding:2px 12px 14px}}
  .fold-in{{margin-left:8px}}
  .log th{{width:30%}}
  /* A 950-unit chart drawn 300px wide shrinks 11-unit labels to about 3.5px.
     Below this width the chart keeps a 680px floor and scrolls sideways, so
     its labels stay at about 8px or larger. The readout stays at full width,
     outside the scroller. */
  .cx{{padding:14px}}
  .cx-plot{{overflow-x:auto;overscroll-behavior-x:contain}}
  .cx-svg{{min-width:680px}}
  .foot-in{{display:block;height:auto;padding:28px 16px 0}}
  .foot-mark{{font-size:clamp(2.25rem,11vw,3.5rem)}}
  .bitplate{{position:relative;left:auto;right:auto;top:auto;bottom:auto;width:auto;
    height:min(122vw,40rem);margin:12px -16px 0}}
  .bitplate canvas{{-webkit-mask-image:none;mask-image:none}}
}}
@media (max-width:420px){{
  .kpis{{grid-template-columns:1fr 1fr}}
  .k-value{{font-size:{FS['xl']};line-height:1.75rem}}
}}
@media print{{
  body::before{{display:none}}
  .k,.rig,.panel,.cx,.fold,.ct-wrap,.weeks{{-webkit-backdrop-filter:none;backdrop-filter:none;background:{CARD}}}
  /* Paper gets the line drawing, never a canvas frame. */
  .bitplate canvas{{display:none!important}}
  .bitplate[data-live] .bit-line{{opacity:1}}
  .tabs-wrap{{display:none}}
  [role=tabpanel][hidden]{{display:block!important}}
  thead{{display:table-header-group}}
  tr,figure{{break-inside:avoid}}
  details,details table{{break-inside:auto}}
  .k,.cx,.rig{{break-inside:avoid}}
  /* "Hover" means nothing on paper. */
  .cx-read{{display:none}}
}}
@media (prefers-reduced-motion:reduce){{
  [role=tab],.k-spark .h,.cx-hit,.chev,.fold summary,.bitplate canvas,.bit-line{{transition:none}}
}}"""

JS = """/* Each block is wrapped so that nothing it does can throw to the page:
   SharePoint's viewer puts any uncaught error in the frame in a banner
   over the report. A failing block loses only its own behaviour. */
(function(){try{
  var list=document.querySelector('[role="tablist"]');
  if(!list)return;
  var tabs=Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
  var panels=tabs.map(function(t){return document.getElementById(t.getAttribute('aria-controls'));});
  if(panels.some(function(p){return !p;}))return;   /* never leave aria-controls dangling */
  function select(i,focus){
    tabs.forEach(function(t,j){
      var on=j===i;
      t.setAttribute('aria-selected',on?'true':'false');
      t.tabIndex=on?0:-1;
      panels[j].hidden=!on;
    });
    if(focus)tabs[i].focus();
    reveal(tabs[i]);
    setHash(tabs[i].dataset.week);
  }
  function reveal(t){
    /* On a phone the tabs are one row that scrolls sideways, and the week
       that opens is the newest, at the far end. Scroll the row, not the page:
       scrollIntoView would also move the page vertically on load. On a wide
       screen the row does not overflow and this does nothing. */
    if(list.scrollWidth<=list.clientWidth)return;
    list.scrollLeft=Math.max(0,t.offsetLeft-(list.clientWidth-t.offsetWidth)/2);
  }
  function setHash(week){
    /* SharePoint previews an uploaded .html inside a sandboxed srcdoc iframe,
       where the document origin is null. replaceState is illegal there and
       throws a SecurityError, which used to abort select() on every tab
       switch and put a "some content didn't load" banner over the report.
       Deep links cannot work in that frame anyway, so losing them quietly is
       the right trade: the tab strip has to keep working. */
    try{
      if(history.replaceState)history.replaceState(null,'','#'+week);
    }catch(e){}
  }
  tabs.forEach(function(t,i){
    t.addEventListener('click',function(){select(i,false);});
    t.addEventListener('keydown',function(e){
      var n=null,k=e.key;
      if(k==='ArrowRight'||k==='ArrowDown')n=(i+1)%tabs.length;
      else if(k==='ArrowLeft'||k==='ArrowUp')n=(i-1+tabs.length)%tabs.length;
      else if(k==='Home')n=0;
      else if(k==='End')n=tabs.length-1;
      if(n!==null){e.preventDefault();select(n,true);}
    });
  });
  function fromHash(){
    var h='';
    try{h=location.hash.replace('#','');}catch(e){}
    var want=-1;
    tabs.forEach(function(t,i){if(t.dataset.week===h)want=i;});
    return want;
  }
  /* A hash change alone does not re-run this script, so a link pasted into the
     address bar of an already-open page would otherwise do nothing. */
  window.addEventListener('hashchange',function(){
    var i=fromHash();
    if(i>-1)select(i,false);
  });
  /* The default is whichever tab the markup marks selected, not index 0:
     tabs run oldest first but the newest week is the one that should open. */
  var initial=0;
  tabs.forEach(function(t,i){if(t.getAttribute('aria-selected')==='true')initial=i;});
  var start=fromHash();
  select(start>-1?start:initial,false);
}catch(e){}})();

(function(){try{
  /* KPI sparklines. Hovering, tapping or focusing a point scrubs that
     tile's own number and caption; there is no floating tooltip. A tooltip
     would be clipped by the edge of a SharePoint preview frame, is
     unreachable by keyboard, and has no hover state to fire on a touch
     screen. Scrubbing the tile reads identically on all three.

     Nothing below touches localStorage, sessionStorage, document.cookie or
     history.replaceState. All four throw a SecurityError in the null origin
     SharePoint previews an uploaded file in, and one of them already put a
     "some content didn't load" banner over this report once. */
  var hits=Array.prototype.slice.call(document.querySelectorAll('.k-spark .h'));
  if(!hits.length)return;
  function tile(h){return h.closest?h.closest('.k'):null;}
  function set(h,live){
    var k=tile(h);
    if(!k||!k.querySelector)return;
    var v=k.querySelector('.k-value'),
        a=k.querySelector('.k-week'),
        b=k.querySelector('.k-wsub');
    if(!v)return;
    if(live){
      v.textContent=h.getAttribute('data-v');
      if(a)a.textContent=h.getAttribute('data-a');
      if(b)b.textContent=h.getAttribute('data-b');
      k.setAttribute('data-scrub','');
    }else{
      v.textContent=v.getAttribute('data-default');
      k.removeAttribute('data-scrub');
    }
  }
  hits.forEach(function(h){
    h.addEventListener('pointerenter',function(){set(h,true);});
    /* Only a mouse leaves. On a touch screen pointerleave fires the moment
       the finger lifts, so a tapped week showed for an instant and snapped
       back. A tap now holds until the next tap, here or anywhere else. */
    h.addEventListener('pointerleave',function(e){
      if(e.pointerType==='mouse')set(h,false);});
    h.addEventListener('focus',function(){set(h,true);});
    h.addEventListener('blur',function(){set(h,false);});
    h.addEventListener('keydown',function(e){
      /* One tab stop per sparkline, arrows within it: the roving tabindex
         pattern, same as the tab strip above. */
      var sib=Array.prototype.slice.call(h.parentNode.querySelectorAll('.h'));
      var i=sib.indexOf(h),n=null,k=e.key;
      if(k==='ArrowRight'||k==='ArrowUp')n=Math.min(i+1,sib.length-1);
      else if(k==='ArrowLeft'||k==='ArrowDown')n=Math.max(i-1,0);
      else if(k==='Home')n=0;
      else if(k==='End')n=sib.length-1;
      if(n===null||n===i)return;
      e.preventDefault();
      sib.forEach(function(c){c.setAttribute('tabindex','-1');});
      sib[n].setAttribute('tabindex','0');
      sib[n].focus();
    });
  });
  document.addEventListener('pointerdown',function(e){
    if(e.pointerType==='mouse')return;
    var inside=e.target&&e.target.closest&&e.target.closest('.k-spark .h');
    hits.forEach(function(h){if(h!==inside)set(h,false);});
  });
}catch(e){}})();

(function(){try{
  /* Detail charts. Hovering or focusing a column reads that whole category
     out under the chart: every series, and for the two-week charts the change
     between them. No floating tooltip -- it would repeat the value already
     printed on the bar, be clipped by the edge of a SharePoint preview frame,
     and be unreachable by keyboard or touch. The readout states the one thing
     the bars do not, which is the difference.

     Same constraint as above: nothing here touches localStorage,
     sessionStorage, document.cookie or history.replaceState. */
  var figs=Array.prototype.slice.call(document.querySelectorAll('figure.cx'));
  if(!figs.length)return;
  figs.forEach(function(fig){
    var read=fig.querySelector('.cx-read');
    var cols=Array.prototype.slice.call(fig.querySelectorAll('.cx-g'));
    if(!read||!cols.length)return;
    function show(g){ read.innerHTML=g.getAttribute('data-r'); }
    function reset(){ read.innerHTML=read.getAttribute('data-default'); }
    cols.forEach(function(g,i){
      g.addEventListener('pointerenter',function(){show(g);});
      g.addEventListener('pointerleave',function(e){
        if(e.pointerType==='mouse')reset();});
      g.addEventListener('focus',function(){show(g);});
      g.addEventListener('blur',reset);
      g.addEventListener('keydown',function(e){
        /* One tab stop per chart, arrows across the columns. Eight days plus
           four vessels plus six fluid categories would otherwise put eighteen
           extra stops in the middle of the page. */
        var n=null,k=e.key;
        if(k==='ArrowRight'||k==='ArrowDown')n=Math.min(i+1,cols.length-1);
        else if(k==='ArrowLeft'||k==='ArrowUp')n=Math.max(i-1,0);
        else if(k==='Home')n=0;
        else if(k==='End')n=cols.length-1;
        if(n===null||n===i)return;
        e.preventDefault();
        cols.forEach(function(c){c.setAttribute('tabindex','-1');});
        cols[n].setAttribute('tabindex','0');
        cols[n].focus();
      });
    });
  });
  /* A tapped column holds until the next tap, as with the sparklines. */
  document.addEventListener('pointerdown',function(e){
    if(e.pointerType==='mouse')return;
    var g=e.target&&e.target.closest&&e.target.closest('.cx-g');
    figs.forEach(function(fig){
      if(g&&fig.contains(g))return;
      var read=fig.querySelector('.cx-read');
      if(read)read.innerHTML=read.getAttribute('data-default');
    });
  });
}catch(e){}})();"""


VENDOR = HERE / "vendor"


def _vendor(name):
    f = VENDOR / name
    if not f.exists():
        sys.exit(f"missing {f}. See vendor/drill-bit/build.sh")
    return f.read_text(encoding="utf-8")


def _emblem_css():
    """fei3's KOC emblem, white artwork drawn in KOC blue through a mask, as a
    data URI so the page stays one file. Vendored from dweg-landing."""
    b64 = base64.b64encode(_vendor("koc-emblem.svg").encode("utf-8")).decode("ascii")
    return ':root{--emblem:url("data:image/svg+xml;base64,' + b64 + '")}'


# The bit's place in its plate, in the renderer's terms: shiftX/shiftY move
# its centre in clip space, availW/availH cap how much of the plate it fills.
# Left of centre in its plate by the room the shadow takes on the right, so
# the bit and its ring, not the plate, are what the footer centres.
BIT_LAYOUT = '{"shiftX":-0.18,"shiftY":0,"availW":0.78,"availH":0.9}'


def bit_plate():
    """fi3's drill bit, for the footer.

    The markup ships fi3's line elevation of the bit, which is what shows
    before the script runs, on paper, and wherever there is no hardware
    WebGL2 (a VDI desktop, a software renderer). vendor/drill-bit/drill-bit.js
    is fi3's own WebGL2 renderer, bundled; when it gets a frame on screen it
    fades the canvas in over the drawing. Decorative throughout, so hidden from
    assistive technology: the bit says nothing the report needs."""
    return (f'<div class="bitplate" aria-hidden="true" '
            f"data-layout='{BIT_LAYOUT}'>" '<span class="bit-probe"></span>'
            f'{_vendor("drill-bit/drill-bit.svg").strip()}<canvas></canvas></div>')


def build_dashboard(weeks, logs, artifact=False):
    """weeks: newest first. The first is the current report.

    Each week is compared against its own predecessor, so adding a week does
    not re-point the older tabs at the wrong baseline. The earliest week has no
    predecessor and is shown on its own: single-series charts, no arrows and no
    comparison table."""
    cur = weeks[0]
    # Tabs run oldest to newest, left to right, matching the way every chart
    # orders its bars. The newest is still the tab that opens.
    order = list(reversed(weeks))
    tabs, panels = "", ""
    for j, w in enumerate(order):
        is_current = w is cur
        has_predecessor = j > 0
        # None, not the successor: the earliest week is the baseline and is
        # shown on its own. Handing it the week after would draw a comparison
        # backwards in time.
        other = order[j - 1] if has_predecessor else None
        wid = w["reportDate"]
        tabs += (f'      <button role="tab" id="tab-{wid}" '
                 f'aria-controls="panel-{wid}" data-week="{wid}" '
                 f'aria-selected="{"true" if is_current else "false"}" '
                 f'tabindex="{0 if is_current else -1}" '
                 f'title="Report of {w["reportLabel"]}">{w["tabLabel"]}'
                 f'</button>\n')
        body = week_body(w, other, logs.get(wid),
                         with_comparison=has_predecessor,
                         all_weeks=weeks)
        # Hidden in the markup, not only by the script. OneDrive and
        # SharePoint measure the page before the script runs and size their
        # preview frame to it: with all ten weeks showing it measured 14,914px,
        # the script then hid nine, and the frame scrolled on past the footer.
        hide = "" if is_current else " hidden"
        panels += f"""    <div role="tabpanel" id="panel-{wid}" aria-labelledby="tab-{wid}" tabindex="0"{hide}>
      <div class="panel-head">
        <h2>{w['periodLabel']}</h2>
      </div>
{body}    </div>
"""
    # The KOC emblem goes in the file that is uploaded to SharePoint, inside
    # KOC. The Artifact copy is a private preview hosted outside KOC, so it
    # carries the words but not the logo.
    emblem = ('' if artifact else
              '<span class="emblem" aria-hidden="true"></span>\n        ')
    shell = f"""  <header class="top">
    <div class="top-in">
      <div class="mast">
        {emblem}<div>
          <h1><span>Offshore Logistics</span> <span class="l2">Weekly Dashboard</span></h1>
          <p class="sub"><b class="abbr">DWOS &middot; </b>Drilling &amp; Workover Operations Support Team<span class="wide"> &middot; Drilling &amp; Workover Engineering Group &middot; Kuwait Oil Company</span></p>
        </div>
      </div>
    </div>
    <div class="horizon" aria-hidden="true"><i></i></div>
    <div class="tabs-wrap">
      <div class="weeks"><p class="eyebrow" id="weeks-label">Weeks</p>
      <div role="tablist" aria-labelledby="weeks-label">
{tabs}      </div></div>
    </div>
  </header>
  <main class="wrap">
{panels}  </main>
  <footer class="foot">
    <div class="foot-in">
      <p class="foot-mark"><span>Drilling &amp;</span><span class="i1">Workover</span><span>Engineering</span><span class="i2"><span aria-hidden="true">&mdash; </span>Group</span></p>
      {bit_plate()}
    </div>
  </footer>
<script>
{JS}
</script>
<script>
{_vendor("drill-bit/drill-bit.js").strip()}
</script>
"""
    style = f"""<style>
{FONT_FACE}
{"" if artifact else _emblem_css()}
html,body{{max-width:100%;overflow-x:hidden}}
body{{margin:0;background:{PAGE};font-family:{FONT_STACK};color:{INK};-webkit-text-size-adjust:100%;font-size:{FS['base']};position:relative;z-index:0}}
table{{font-variant-numeric:tabular-nums}}
{CSS}
</style>"""

    if artifact:
        # The Artifact host supplies <!doctype>, <html>, <head> and <body>, so
        # the page ships as a body fragment. Anything above <body> here is
        # either discarded or re-parsed into the body.
        return f"""<title>Offshore Logistics Weekly Dashboard</title>
{style}
{shell}"""

    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Offshore Logistics Dashboard {cur['periodLabel']}</title>
{style}</head>
<body>
{shell}</body></html>
"""


# ── Format: the notes file ─────────────────────────────────────────────────

def _md(text):
    """The data notes carry <b> for the dashboard. Markdown wants **."""
    return text.replace("<b>", "**").replace("</b>", "**")


def build_notes(weeks):
    """Every open query, pulled out of the weeks and into one file.

    These used to sit in an amber block inside the report. They are questions
    for the report author, not findings about operations, so they do not belong
    in something being circulated. They still come from the same data files as
    the dashboard, so they cannot drift out of step with it."""
    total = sum(len(w.get("dataNotes", [])) for w in weeks)
    newest = weeks[0]
    out = [
        "# Offshore Logistics: open data queries",
        "",
        "Raised while reconciling the weekly workbooks and covering emails "
        "against each other. Each item is a question for the report author, "
        "not a finding about operations.",
        "",
        f"**{total} open queries across {len(weeks)} weeks**, as of the report "
        f"of {newest['reportLabel']}.",
        "",
        "Tick an item once its answer is confirmed, and correct the matching "
        "`data/<report-date>.json` so the dashboard follows.",
        "",
        "> Generated by `build.py` from the `dataNotes` arrays in "
        "`data/*.json`. Edit those, not this file.",
        "",
    ]
    for w in weeks:
        notes = w.get("dataNotes", [])
        out += [f"## {w['periodLabel']}", "",
                f"Report of {w['reportLabel']} | {w['periodDays']} days | "
                f"{len(notes)} "
                f"{'query' if len(notes) == 1 else 'queries'}", "",
                f"*Source: {w['provenance']}*", ""]
        out += [f"- [ ] {_md(n)}" for n in notes] or ["*None.*"]
        out.append("")

    out += ["## Resolved", "",
            "Settled counting questions. They are recorded here because a "
            "figure somewhere differs from the dashboard, and anyone "
            "reconciling the two will need the reason.",
            "",
            "- **Report 24's trips are the email's 13, not the workbook's 8.** "
            "Settled 10 Sep: the covering email supersedes. The workbook "
            "narrative yields 2 outbound voyages from Shuaiba for CA1 and 1 "
            "for CA3, against the email's 6 and 2, so the email appears to "
            "count rig calls rather than port voyages. CA5 and Charlie-3 agree "
            "either way. For reports 22 and 23 the email and the workbook "
            "agree exactly, so the rise from 9 to 13 may carry some of the "
            "change of basis.",
            "- **Report 22 published 46 truck moves for 20 to 25 Aug. The week "
            "made 41.** Four vacuum trucks were loaded with slops on 23.08 "
            "(`E21`) and dispatched on 24.08 (`E25`), and one truck was loaded "
            "with mud skips on 23.08 (`E23`) and dispatched on 24.08 (`E26`). "
            "Both events were counted. That report's prose repeats it as 8 "
            "vacuum-truck loads and 6 full mud skips, where the workbook "
            "records 4 trucks and 3 skips.",
            "- **Offload lines re-describe arrivals already counted.** Most "
            "visible in report 24, where counting them again would add 14 "
            "movements to a 44-move week. Each truck is counted once, on "
            "arrival.",
            ""]
    return "\n".join(out)


# ── Entry point ────────────────────────────────────────────────────────────

def load(date_str, suffix=""):
    p = HERE / "data" / f"{date_str}{suffix}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def main():
    """Three outputs:

        dashboard/  every week behind a tab strip, for SharePoint or OneDrive
        notes/      the open queries, for chasing answers
        artifact/   the same dashboard as a body fragment, for review

    The queries used to sit in an amber block inside the report. They are
    questions for the report author, so they do not belong in something being
    circulated -- but they are also not something to lose, hence a file of
    their own, generated from the same data.
    """
    argv = sys.argv[1:]
    flags = {a for a in argv if a.startswith("--")}
    args = [a for a in argv if not a.startswith("--")]
    dates = args or ["2026-11-05", "2026-10-29", "2026-10-22", "2026-10-15", "2026-10-08",
                     "2026-10-01", "2026-09-24", "2026-09-17", "2026-09-10",
                     "2026-09-03", "2026-08-26"]

    picked = flags & {"--dashboard", "--notes", "--artifact"}
    want = {name: (f"--{name}" in flags or not picked)
            for name in ("dashboard", "notes", "artifact")}

    weeks = []
    for d in dates:
        w = load(d)
        if w is None:
            sys.exit(f"missing data/{d}.json")
        weeks.append(w)
    weeks.sort(key=lambda w: w["periodStart"], reverse=True)

    for w in weeks:
        got, expect = len(w["trucks"]["byDay"]), w["periodDays"]
        assert got == expect, (
            f"{w['reportDate']}: {got} truck days, {expect} declared")

    def write(folder, name, text):
        d = HERE / folder
        d.mkdir(parents=True, exist_ok=True)
        (d / name).write_text(text, encoding="utf-8")
        kb = (d / name).stat().st_size / 1024
        print(f"  {folder + '/' + name:58s} {kb:5.0f} KB")

    logs = {w["reportDate"]: load(w["reportDate"], ".log") for w in weeks}

    if want["dashboard"]:
        # A stable filename: the dashboard covers every week, so the tab strip
        # says which, and each rebuild replaces the file rather than adding one.
        write("dashboard", "Offshore_Logistics_Weekly_Dashboard.html",
              build_dashboard(weeks, logs))
    if want["notes"]:
        write("notes", "data-queries.md", build_notes(weeks))

    if want["artifact"]:
        # The review copy: the same dashboard with the open queries put back in,
        # as a body fragment for the Artifact host. The circulated copy in
        # dashboard/ stays clean, which is why the queries came out at all.
        write("artifact", "dashboard.artifact.html",
              build_dashboard(weeks, logs, artifact=True))


if __name__ == "__main__":
    main()
