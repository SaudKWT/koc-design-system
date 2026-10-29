#!/usr/bin/env python3
"""
Build the Offshore Logistics weekly report.

    python3 build.py 2026-09-03 2026-08-26              # both formats
    python3 build.py 2026-09-03 2026-08-26 --dashboard  # tabbed, browser only
    python3 build.py 2026-09-03 2026-08-26 --email      # single week, Outlook safe
    python3 build.py 2026-09-03 2026-08-26 --no-notes   # drop the data-notes block

Two formats, because they cannot be one file:

  email      One week, nested tables, inline styles, base64 PNG charts, no
             script and no SVG. This is what Bu Khaled receives. Outlook strips
             <svg>, external CSS and script, so an interactive chart arrives as
             nothing, and Outlook blocks images by default, so every chart
             carries alt text and every charted figure is repeated as text.

  dashboard  Both weeks behind a tab strip. Tabs need CSS and script, which is
             exactly what the email format cannot have, so this one is for a
             browser. It carries the full daily port and vessel logs, which the
             email leaves to the attached workbook.

Numbers come from data/<report-date>.json (hand-audited counts, each with the
workbook cell it came from) and data/<report-date>.log.json (the daily
narrative, machine-extracted by extract.py). Nothing is typed twice.

PALETTE NOTE: these colours are the 26-08-2026 report's own, kept on
instruction so the weekly series stays visually continuous. They are NOT the
KOC token palette -- this navy is #1F3B57, the KOC brand blue is #0060A9. That
is why this directory sits under docs/reports/ and not in packages/ or apps/:
an email deliverable, not design-system source. See README.md.
"""

import base64
import io
import json
import math
import re
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import MaxNLocator

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

# Inter is fontFamily.sans. The browser gets it from Google Fonts; matplotlib
# gets the two vendored weights, because a KOC machine may not reach gstatic.
FONT_STACK = ("Inter, 'Inter var', -apple-system, BlinkMacSystemFont, "
              "'Segoe UI', 'Helvetica Neue', Arial, sans-serif")
EMAIL_FONT_STACK = "'Segoe UI', Arial, Helvetica, sans-serif"

def _register_inter():
    from matplotlib import font_manager as fm
    found = []
    for ttf in sorted((HERE / "fonts").glob("Inter-*.ttf")):
        fm.fontManager.addfont(str(ttf))
        found.append(ttf.name)
    if found and "Inter" in {f.name for f in fm.fontManager.ttflist}:
        return "Inter", found
    return "DejaVu Sans", found


FONT, _FONT_FILES = _register_inter()
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

def _frame(ax, ylabel):
    """Recessive axes: y grid only, no top or right spine."""
    ax.set_axisbelow(True)
    ax.yaxis.grid(True, color=RULE, linewidth=0.9)
    ax.xaxis.grid(False)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(INK_MUTED)
        ax.spines[side].set_linewidth(0.9)
    ax.set_ylabel(ylabel, fontsize=11, color=INK, fontname=FONT)
    ax.tick_params(axis="both", labelsize=10.5, colors=INK, length=0)
    for lbl in ax.get_xticklabels() + ax.get_yticklabels():
        lbl.set_fontname(FONT)


def _legend(ax, ncol=2, y=-0.20):
    """Always below the axis, never inside it.

    Inside the plot area a legend collides with whatever bar happens to be tall
    that week. It has happened twice: the fluids legend landed on the slops
    annotation, and the trips legend landed on CA1's value label the week CA1
    reached 6. Below the axis the collision cannot happen at any data value,
    which is worth more than the vertical space it costs."""
    leg = ax.legend(frameon=False, fontsize=10.5, ncol=ncol,
                    loc="upper center", bbox_to_anchor=(0.5, y))
    for t in leg.get_texts():
        t.set_color(INK)
        t.set_fontname(FONT)
    return leg


def _png(fig):
    """Render at 2x the 664px display width, then quantise.

    These charts are a handful of flat fills plus antialiasing, so an adaptive
    128-colour palette is visually identical to truecolour and about a third of
    the bytes. That matters: the PNGs are base64-inlined and base64 adds another
    33%, and the dashboard carries six of them."""
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=140, bbox_inches="tight",
                facecolor="white", edgecolor="none")
    plt.close(fig)
    buf.seek(0)
    try:
        from PIL import Image
    except ImportError:
        return base64.b64encode(buf.getvalue()).decode("ascii")
    im = Image.open(buf).convert("RGB").quantize(
        colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    out = io.BytesIO()
    im.save(out, format="PNG", optimize=True)
    return base64.b64encode(out.getvalue()).decode("ascii")


def _labels(ax, bars, colour, fmt="{:g}", size=10.5):
    """Direct value labels. Required, not decorative: they are the relief that
    discharges the sub-3:1 contrast of the amber and pale-blue fills."""
    for b in bars:
        h = b.get_height()
        ax.annotate(fmt.format(h), (b.get_x() + b.get_width() / 2, h),
                    textcoords="offset points", xytext=(0, 4), ha="center",
                    va="bottom", fontsize=size, fontweight="bold",
                    color=colour, fontname=FONT)


def _one_week_bars(ax, x, vals, w=0.58):
    """A single series for the baseline week, which has nothing to compare to.

    One series takes one colour: the category is already on the x axis, so a
    second hue per bar would be decoration. No legend either -- the title names
    the series."""
    _labels(ax, ax.bar(x, vals, w, color=PRIMARY, edgecolor="white",
                       linewidth=1.2), PRIMARY)


def _two_week_bars(ax, x, mine_w, mine_v, other_w, other_v, w=0.39):
    """The shared grammar, used by both two-week charts so the reader learns the
    encoding once: this week is solid navy, the previous week is pale, and the
    legend says which in words rather than leaving dates to be decoded.

    Bars are ordered by period, never by whose panel it is, so time always reads
    left to right. Ordering by panel put the later week on the left in the
    previous-week tab, which read as time running backwards. Centres at
    +/-0.2025 leave a ~4px gap between the pair at render width."""
    pairs = sorted([(mine_w, mine_v, True), (other_w, other_v, False)],
                   key=lambda pr: pr[0]["periodStart"])
    for k, (wk, vals, is_mine) in enumerate(pairs):
        off = -0.2025 if k == 0 else 0.2025
        role = "This week" if is_mine else "Previous week"
        bars = ax.bar([i + off for i in x], vals, w,
                      color=PRIMARY if is_mine else PRIOR,
                      edgecolor="white", linewidth=1.2,
                      label=f"{role}  ({short(wk)})")
        _labels(ax, bars, PRIMARY if is_mine else INK_MUTED)


def chart_trips(mine, theirs):
    names = ["CA1", "CA3", "CA5", "Charlie-3"]
    fig, ax = plt.subplots(figsize=(9.5, 3.9))
    x = range(len(names))
    vals = list(mine["vesselTrips"].values())
    if theirs is None:
        _one_week_bars(ax, list(x), [mine["vesselTrips"][n] for n in names])
        title = f"Vessel Trips by Vessel   ({trips(mine)} total)"
    else:
        vals += list(theirs["vesselTrips"].values())
        _two_week_bars(ax, x,
                       mine, [mine["vesselTrips"][n] for n in names],
                       theirs, [theirs["vesselTrips"][n] for n in names])
        title = (f"Vessel Trips by Vessel   ({trips(mine)} this week, "
                 f"{trips(theirs)} previous week)")
    ax.set_xticks(list(x))
    ax.set_xticklabels(names)
    # 7 was the 26-08 report's ceiling and is kept as a floor so the weeks stay
    # visually comparable, but it grows rather than clipping: CA1 reached 6 in
    # report 24 and a fixed ceiling would fail silently on the first 8.
    ax.set_ylim(0, max(7, max(vals) * 1.18))
    ax.yaxis.set_major_locator(MaxNLocator(integer=True))
    _frame(ax, "No. of trips")
    ax.set_title(title, fontsize=13.5, fontweight="bold", color=PRIMARY,
                 fontname=FONT, pad=12)
    if theirs is not None:
        _legend(ax)
    return _png(fig)


def chart_ground(w):
    """Per week by nature: the two periods are 8 days and 6 days long."""
    days = w["trucks"]["byDay"]
    out = [d["out"] for d in days]
    inn = [d["in"] for d in days]

    fig, ax = plt.subplots(figsize=(9.5, 3.9))
    x = range(len(days))
    b_out = ax.bar([i - 0.2025 for i in x], out, 0.39, color=PRIMARY,
                   edgecolor="white", linewidth=1.2, label="Dispatched (out)")
    b_in = ax.bar([i + 0.2025 for i in x], inn, 0.39, color=CHART[1],
                  edgecolor="white", linewidth=1.2, label="Arrived (in)")
    _labels(ax, b_out, PRIMARY)
    _labels(ax, b_in, INK_MUTED)

    ax.set_xticks(list(x))
    ax.set_xticklabels([d["label"] for d in days])
    # Same as the trips chart: the 26-08 ceiling of 12 is a floor, not a cap.
    ax.set_ylim(0, max(12, max(out + inn) * 1.18))
    ax.yaxis.set_major_locator(MaxNLocator(integer=True))
    _frame(ax, "Trucks / tankers")
    ax.set_title(f"Daily Ground Transport Movements   ({sum(out)} out / "
                 f"{sum(inn)} in, {sum(out) + sum(inn)} total)",
                 fontsize=13.5, fontweight="bold", color=PRIMARY,
                 fontname=FONT, pad=12)
    _legend(ax)
    return _png(fig)


def chart_fluids(mine, theirs):
    """Six categories, three fluids by two directions.

    Grouped rather than stacked, and in the same grammar as the trips chart,
    because the interesting thing this week is a composition shift the totals
    hide: fuel moved from bunkering into delivery and drill water went the other
    way. A stack would bury that inside two columns."""
    cats = [(d, f) for d in ("bunkered", "delivered") for f in FLUIDS]
    labels = [f"{f}\n{'bunkered' if d == 'bunkered' else 'to rigs'}"
              for d, f in cats]
    mv = [mine["fluids"][d][f] for d, f in cats]

    fig, ax = plt.subplots(figsize=(9.5, 4.0))
    # A gap between the bunkered trio and the delivered trio.
    x = [0, 1, 2, 3.45, 4.45, 5.45]
    if theirs is None:
        _one_week_bars(ax, x, mv, w=0.55)
        ceiling = max(mv)
        title = f"Fluids & Bulk Managed   ({fluid_total(mine):,} m³ total)"
    else:
        tv = [theirs["fluids"][d][f] for d, f in cats]
        _two_week_bars(ax, x, mine, mv, theirs, tv, w=0.37)
        ceiling = max(mv + tv)
        title = (f"Fluids & Bulk Managed   ({fluid_total(mine):,} m³ this "
                 f"week, {fluid_total(theirs):,} m³ previous week)")
    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontsize=9.5)
    ax.set_ylim(0, ceiling * 1.22)
    _frame(ax, "Cubic metres (m³)")
    ax.set_title(title, fontsize=13.5, fontweight="bold", color=PRIMARY,
                 fontname=FONT, pad=12)
    if theirs is not None:
        # Lower, because this chart's tick labels are two lines deep.
        _legend(ax, y=-0.30)
    return _png(fig)


# ── Detail charts: inline SVG ──────────────────────────────────────────────
#
# One builder for all three, because all three are the same chart: grouped
# bars, a categorical x axis, direct value labels and a legend. The matplotlib
# versions are kept for the email, which cannot have <svg> at all.


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


def chart_trend(weeks, upto):
    """One small panel per metric, every week to date, each on its own scale.

    This is the chart upper management actually needs: not this week against
    last, but the shape of four weeks. Small multiples rather than one chart
    with four lines, because trips run 9 to 16 while fluids run 742 to 1,782 --
    a shared axis would flatten four of the five, and a second y-axis is the
    one thing a chart must never do.

    Only weeks up to and including the panel's own are drawn, so an older tab
    does not show figures that had not happened yet when it was written."""
    series = TREND_SERIES
    order = _trend_weeks(weeks, upto)
    if len(order) < 2:
        return None

    fig, axes = plt.subplots(1, len(series), figsize=(9.5, 2.45))
    for ax, (label, get, fmt) in zip(axes, series):
        ys = [get(w) for w in order]
        xs = list(range(len(ys)))
        ax.plot(xs, ys, color=PRIMARY, linewidth=2, zorder=2,
                solid_capstyle="round")
        ax.plot(xs[:-1], ys[:-1], "o", color=PRIMARY, markersize=4.5,
                zorder=3, markeredgecolor=CARD, markeredgewidth=1.2)
        # The endpoint is the week the reader is on, so it carries the weight.
        ax.plot(xs[-1], ys[-1], "o", color=PRIMARY, markersize=8, zorder=4,
                markeredgecolor=CARD, markeredgewidth=1.6)

        span = (max(ys) - min(ys)) or 1
        ax.set_ylim(min(ys) - span * 0.62, max(ys) + span * 0.78)
        ax.set_xlim(-0.5, len(ys) - 0.5)

        # Put each end label on the side the line is NOT arriving from.
        # Fixed above, a label lands on its own line wherever the series drops
        # steeply into the endpoint, which is what fluids and overstay do.
        def place(i, other_i, text, size, weight, colour, align):
            below = ys[i] < ys[other_i]
            ax.annotate(text, (xs[i], ys[i]), textcoords="offset points",
                        xytext=(3 if align == "right" else -3,
                                -17 if below else 12),
                        ha=align, va="top" if below else "baseline",
                        fontsize=size, fontweight=weight, color=colour,
                        fontname=FONT, clip_on=False)

        place(-1, -2, fmt.format(ys[-1]), 12.5, "bold", PRIMARY, "right")
        place(0, 1, fmt.format(ys[0]), 10, "normal", INK_MUTED, "left")
        ax.set_title(label, fontsize=10, color=INK_MUTED, fontname=FONT,
                     pad=9, loc="left")
        for side in ("top", "right", "left"):
            ax.spines[side].set_visible(False)
        ax.spines["bottom"].set_color(RULE)
        ax.spines["bottom"].set_linewidth(1)
        ax.set_xticks([])
        ax.set_yticks([])
    fig.suptitle("")
    fig.tight_layout(pad=0.4, w_pad=2.2)
    return _png(fig)


# ── Deltas ─────────────────────────────────────────────────────────────────
# The StatCard rule from CLAUDE.md: the arithmetic and the meaning are two
# different things. A fall in truck moves is neither good nor bad, it tracks the
# rig count. A fall in overstay crew is unambiguously good. So `intent` decides
# the colour and `delta` only decides the arrow.

UP, DOWN = "&#9650;", "&#9660;"


def delta(now, was, mode="abs", intent="neutral", unit=""):
    """Return (html, colour). intent: 'neutral' | 'lower-is-better'."""
    diff = now - was
    if diff == 0:
        return f"No change &nbsp;({was:,g}{unit})", INK_MUTED
    arrow = UP if diff > 0 else DOWN
    if mode == "pct":
        size = "new" if was == 0 else f"{abs(diff) / was * 100:.0f}%"
    else:
        size = f"{abs(diff):,g}{unit}"
    colour = INK_MUTED
    if intent == "lower-is-better":
        # Delta text is always 11px, so the alarm uses the small-text red.
        colour = GOOD if diff < 0 else DANGER
    return f"{arrow} {size} &nbsp;({was:,g}{unit})", colour


def kpis(w, other):
    """Four tiles, in the same order every week. Consistency across weeks is
    most of what makes a weekly dashboard readable, so the set never changes.

    Vessel movements is not one of them. The count is still carried -- in the
    comparison table, per vessel and per day, under the rule it is counted on
    -- but it was the second of five headline figures and sat next to vessel
    trips, which a reader has to hold two definitions apart to tell apart.

    The oldest week in the set is the baseline and carries no arrows. Comparing
    it forward to a later week would read as time running backwards, and the
    week it was originally measured against is not in the dashboard at all."""
    arrows = other is not None and w.get("showArrows", True)

    def cmp(now, key, other_val, mode="abs", intent="neutral"):
        if arrows:
            return delta(now, other_val, mode, intent)
        return "", INK_MUTED

    tiles = [
        dict(value=trips(w), label="Vessel trips", colour=PRIMARY,
             **dict(zip(("delta_html", "delta_colour"),
                        cmp(trips(w), "trips",
                            trips(other) if other else 0, "pct")))),
        dict(value=truck_total(w), label="Truck moves", colour=PRIMARY,
             **dict(zip(("delta_html", "delta_colour"),
                        cmp(truck_total(w), "truckMoves",
                            truck_total(other) if other else 0, "pct")))),
        dict(value=f"{fluid_total(w):,}", label="Fluids handled, m³",
             colour=PRIMARY,
             **dict(zip(("delta_html", "delta_colour"),
                        cmp(fluid_total(w), "fluids",
                            fluid_total(other) if other else 0, "pct")))),
        dict(value=overstay(w), label="Overstay crew", colour=DANGER, alert=True,
             **dict(zip(("delta_html", "delta_colour"),
                        cmp(overstay(w), "overstay",
                            overstay(other) if other else 0,
                            "abs", "lower-is-better")))),
    ]
    # The corrected truck figure cannot be compared to a baseline counted under
    # the old rule, so that one tile states both numbers instead of an arrow.
    if not arrows and w["trucks"].get("publishedTotal"):
        # By label, not by index. It was written to tiles[1], which was Truck
        # moves until the vessel movements tile was inserted ahead of it, and
        # the correction then sat under a figure it did not describe. Removing
        # that tile would have shifted it a second time.
        truck = next(t for t in tiles if t["label"] == "Truck moves")
        truck["delta_html"] = (
            f'{truck_total(w)} counted once each &nbsp;'
            f'<span style="font-weight:400;">'
            f'({w["trucks"]["publishedTotal"]} as published)</span>')
        truck["delta_colour"] = DANGER
    return tiles


def kpi_row(w, other, sparks=None):
    """One table row of tiles. A table, not flex, because the email format has
    to render it too and Outlook's engine will not lay out a flex row.

    sparks adds the week-on-week line inside each tile, and with it the two
    hidden lines the scrub swaps in. Email passes nothing: Outlook strips
    <svg> and runs no script, so it keeps the raster small-multiples chart
    further down instead. Every style stays inline for the same reason -- the
    classes are there for the stylesheet and are inert in a mail client."""
    # "Last week", not "vs 03 to 09 Sep". The reader does not need the dates
    # of the week they are not reading; the panel head states the week they
    # are, and the comparison table below spells both out in full.
    default_caption = ("Last week"
                       if other is not None and w.get("showArrows", True)
                       else "Baseline week, no comparison")
    tiles = kpis(w, other)
    width = f"{100 // len(tiles)}%"
    cells = ""
    for t in tiles:
        alert = t.get("alert")
        bg = ALERT_BG if alert else SURFACE
        edge = f"border:1px solid {ALERT_RULE};" if alert else \
               f"border:1px solid {RULE};"
        spark = (sparks or {}).get(t["label"], "")
        # The scrubbed week goes in its own pair of lines rather than
        # overwriting the delta. A delta describes this week against last; put
        # an older week's figure above it and the two contradict each other.
        # Swapping which pair is displayed keeps the tile the same height.
        swap = ("" if not spark else
                f'\n        <div class="k-week"></div>'
                f'\n        <div class="k-wsub"></div>')
        cells += f"""      <td class="k" width="{width}" valign="top" style="background:{bg};border-radius:{RADIUS_MD};padding:14px 14px 12px;{edge}">
        <div class="k-label" style="font-size:{FS['2xs']};color:{INK_MUTED};letter-spacing:.06em;text-transform:uppercase;font-weight:{FW['semibold']};">{t['label']}</div>
        <div class="k-value" data-default="{t['value']}" style="font-size:{FS['3xl']};font-weight:{FW['bold']};color:{t['colour']};line-height:1.15;padding:6px 0 4px;font-variant-numeric:tabular-nums;">{t['value']}</div>
        <div class="k-delta" style="font-size:{FS['2xs']};font-weight:{FW['semibold']};color:{t['delta_colour']};">{t['delta_html']}</div>
        <div class="k-cap" style="font-size:{FS['2xs']};color:{INK_MUTED};">{t.get('caption') or default_caption}</div>{swap}
        {spark}</td>
"""
    return cells


# ── rig3 components (dashboard only) ───────────────────────────────────────
# The browser page is built from the rig3 pieces in @koc/ui: StatCard,
# SectionHeading, the translucent Card and the outline StatusBadge. The email
# keeps kpi_row and rig_strip above, because Outlook lays out neither grid nor
# flex and strips <svg>; its tiles stay tables with every style inline.

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

    Same four figures as the email's tiles, and the same rules: the oldest week
    is the baseline and carries no change row, and the corrected truck figure
    states both numbers instead of a change against a differently counted week.
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


def status_line(w):
    """The week in one sentence, before any number. Upper management reads this
    and stops; everything below is for whoever needs to act on it."""
    return (f'  <div style="border-left:3px solid {PRIMARY};padding:2px 0 2px 14px;'
            f'margin:4px 0 18px;">'
            f'<div style="font-size:{FS["md"]};line-height:1.5;color:{INK};">'
            f'{w.get("headline", "")}</div></div>\n')


def rig_strip(w):
    """Both rigs as two cards, replacing two five-row tables.

    The tables gave every field equal weight. A reader wants three things at a
    glance: which rig, what state, and whether anyone is overstaying."""
    cells = ""
    width = f"{100 // len(w['rigs'])}%"
    for rig_id in w["rigs"]:
        r = w["rigs"][rig_id]
        off = "off-hired" in r["currentOperation"].lower()
        chip_bg, chip_ink, chip = ((SURFACE, INK_MUTED, "OFF HIRED") if off
                                   else (tok("color.warning.50"), WARN, "ON HIRE"))
        ov = sum(r["overstay"].values())
        ov_txt = ("Nil" if not ov else " &nbsp;".join(
            f'{k} <span style="color:{DANGER};font-weight:{FW["bold"]};">{v}</span>'
            for k, v in r["overstay"].items() if v))
        pob = ("Nil" if not r["personnelOnboard"] else
               f'{r["personnelOnboard"]} <span style="font-size:{FS["2xs"]};'
               f'color:{INK_MUTED};font-weight:{FW["normal"]};">'
               f'incl. {r["visaHolders"]} visa</span>')
        cells += f"""      <td class="rig" width="{width}" valign="top" style="background:{CARD};border:1px solid {RULE};border-radius:{RADIUS_MD};padding:14px 16px;">
        <div><span style="font-size:{FS['lg']};font-weight:{FW['bold']};color:{INK};">Rig {rig_id}</span>
          <span style="font-size:{FS['2xs']};font-weight:{FW['bold']};color:{chip_ink};background:{chip_bg};border-radius:{RADIUS};padding:3px 8px;letter-spacing:.05em;margin-left:8px;white-space:nowrap;">{chip}</span></div>
        <div style="font-size:{FS['sm']};color:{INK};padding:8px 0 10px;line-height:1.45;">{r['currentOperation']}</div>
        <table width="100%" style="font-size:{FS['xs']};border-collapse:collapse;">
          <tr><td style="color:{INK_MUTED};padding:3px 20px 3px 0;width:1%;white-space:nowrap;">Personnel onboard</td><td style="color:{INK};font-weight:{FW['semibold']};font-variant-numeric:tabular-nums;">{pob}</td></tr>
          <tr><td style="color:{INK_MUTED};padding:3px 0;">Overstay crew</td><td style="color:{INK};font-variant-numeric:tabular-nums;">{ov_txt}</td></tr>
          <tr><td style="color:{INK_MUTED};padding:3px 0;vertical-align:top;">Last week</td><td style="color:{INK};">{r['lastWeek']}</td></tr>
          <tr><td style="color:{INK_MUTED};padding:3px 0;vertical-align:top;">Next steps</td><td style="color:{INK};">{r['nextSteps']}</td></tr>
        </table></td>
"""
    return (f'  <table class="rigs" width="100%" cellspacing="10" '
            f'cellpadding="0"><tr>\n{cells}  </tr></table>\n')


def collapsible(title, inner, sub="", open_it=False, email=False):
    """<details> on the web, a plain section in the email.

    The detail is what makes the report defensible, but it is not what the
    first reader needs, so on the web it folds away. Outlook does not implement
    <details>, and a collapsed one there renders as a heading with nothing
    under it, so the email gets everything inline."""
    if email:
        return "\n" + heading(title, PRIMARY) + inner
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

def row(cells, bold=False, shade=False):
    weight = "font-weight:700;" if bold else ""
    bg = f"background:{SURFACE};" if shade else ""
    tds = "".join(
        f'<td align="{a}" style="padding:7px 10px;border:1px solid {RULE};'
        f'{bg}{weight}{extra}">{v}</td>' for v, a, extra in cells)
    return f"    <tr>{tds}</tr>\n"


def section_row(title, span=4):
    return (f'    <tr><td colspan="{span}" style="padding:8px 10px;'
            f'background:{PRIMARY};color:{ON_PRIMARY};font-size:11px;font-weight:700;'
            f'letter-spacing:.06em;text-transform:uppercase;'
            f'border:1px solid {PRIMARY};">{title}</td></tr>\n')


def comparison_table(cur, prev, email=True):
    """The week-on-week comparison, and the text fallback for every chart.
    Each charted figure appears here, so a recipient whose client blocks images
    still receives all of it.

    One table, two dresses. The email gets the bordered table with every style
    inline, which is what Outlook renders. The dashboard gets @koc/chart's
    table: hairline rows, no vertical rules, and each block opened by a
    tracked-caps eyebrow instead of a solid blue bar."""
    c_out, c_in = truck_split(cur)
    p_out, p_in = truck_split(prev)
    c_over, p_over = overstay_by(cur), overstay_by(prev)

    def line(name, now, was, mode="abs", intent="neutral", unit="",
             bold=False, fmt="{:,g}"):
        if not email:
            kind, text, tone = stat_delta(now, was, mode, intent)
            b = ' class="tot"' if bold else ""
            return (f'    <tr{b}><th scope="row">{name}</th>'
                    f'<td>{fmt.format(now)}{unit}</td>'
                    f'<td class="soft">{fmt.format(was)}{unit}</td>'
                    f'<td class="chg {tone}">{glyph(kind)}{text}</td></tr>\n')
        html, colour = delta(now, was, mode, intent, unit)
        return row([
            (name, "left", ""),
            (fmt.format(now) + unit, "right", "font-variant-numeric:tabular-nums;"),
            (fmt.format(was) + unit, "right",
             f"font-variant-numeric:tabular-nums;color:{INK_MUTED};"),
            (html, "right", f"color:{colour};font-weight:700;font-size:12px;"),
        ], bold=bold)

    def sec(title):
        if email:
            return section_row(title)
        return (f'    <tr class="ct-sec"><th colspan="4" scope="colgroup">'
                f'{title}</th></tr>\n')

    if email:
        h = ('  <table width="100%" cellspacing="0" style="font-size:13px;'
             'border-collapse:collapse;margin-top:8px;">\n  <thead>\n')
        h += row([
            ("Metric", "left", ""),
            (f"{cur['tabLabel']}<br><span style='font-weight:400;font-size:11px;'>"
             f"{cur['periodDays']} days</span>", "right", ""),
            (f"{prev['tabLabel']}<br><span style='font-weight:400;font-size:11px;'>"
             f"{prev['periodDays']} days</span>", "right", ""),
            ("Change", "right", ""),
        ], bold=True, shade=True)
    else:
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
    return h + "  </tbody>\n  </table>\n" + ("" if email else "  </div>\n")


def rig_table(rig, accent, name):
    ov = " &nbsp;|&nbsp; ".join(
        (f'{k}: <span style="color:{DANGER};font-weight:700;">{v}</span>' if v
         else f"{k}: Nil")
        for k, v in rig["overstay"].items())
    pob = "Nil" if not rig["personnelOnboard"] else (
        f"{rig['personnelOnboard']} crew "
        f"(incl. {rig['visaHolders']} seaman / business visas)")
    rows = [("Current operation", rig["currentOperation"]),
            ("Last week", rig["lastWeek"]),
            ("Personnel onboard", pob),
            ("Overstay crew", ov),
            ("Next steps", rig["nextSteps"])]
    body = "".join(
        f'    <tr><td style="background:{SURFACE};padding:8px 10px;'
        f'font-weight:600;width:34%;border:1px solid {RULE};">{k}</td>'
        f'<td style="padding:8px 10px;border:1px solid {RULE};">{v}</td></tr>\n'
        for k, v in rows)
    return (f'  <div style="font-size:15px;font-weight:700;color:{PRIMARY};'
            f'border-left:4px solid {accent};padding-left:10px;">{name}</div>\n'
            f'  <table width="100%" cellspacing="0" style="margin-top:8px;'
            f'font-size:13px;border-collapse:collapse;">\n{body}  </table>\n')


def heading(text, accent):
    return (f'  <div style="font-size:15px;font-weight:700;color:{PRIMARY};'
            f'border-left:4px solid {accent};padding-left:10px;">{text}</div>\n')




# ── Daily logs (dashboard only) ────────────────────────────────────────────

def daily_log(log, key, title):
    """The workbook's own narrative, one block per day.

    The email leaves this to the attached workbook. A browser page has no
    attachment, so it carries the log itself and the report stands alone."""
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


DEFAULT_SIGNATURE = {
    "name": "Saud Abdulaziz AlKharji",
    "lines": ["Kuwait Oil Company (KOC)",
              "Engineer Drilling &amp; Workover | "
              "Drilling &amp; Workover Operational Support Team"],
    "muted": ["skharji@kockw.com | www.kockw.com"],
}


def signature(w):
    """Whoever is circulating the report signs it, which is the default below.

    A week may override it with a `signature` key. Nothing is invented: only
    what the person's own profile or email states goes in, which is why there is
    no phone or postal line here."""
    sig = w.get("signature") or DEFAULT_SIGNATURE
    body = "<br>\n      ".join(sig.get("lines", []))
    muted = "<br>\n      ".join(sig.get("muted", []))
    if muted:
        muted = (f'<br>\n      <span style="color:{INK_MUTED};">{muted}</span>')
    return f"""    <p style="font-size:13px;margin:0;">Thanks and Best Regards,</p>
    <p style="font-size:13px;margin:8px 0 0;line-height:1.6;">
      <b>{sig['name']}</b><br>
      {body}{muted}
    </p>
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

def figure(b64, alt, caption="", email=False):
    """<figure> on the web, plain <div> in the email.

    Outlook renders mail through the Word engine, which styles HTML5 sectioning
    elements unreliably. The semantics are worth having in a browser and not
    worth the risk in an inbox."""
    outer, inner = ("div", "div") if email else ("figure", "figcaption")
    cap = (f'\n    <{inner} style="font-size:11px;color:{INK_MUTED};'
           f'padding:6px 2px 0;">{caption}</{inner}>' if caption else "")
    return (f'  <{outer} style="margin:14px 0 22px;">\n'
            f'    <img src="data:image/png;base64,{b64}" alt="{alt}"\n'
            f'      style="width:100%;max-width:100%;display:block;'
            f'border:1px solid {RULE};border-radius:8px;">{cap}\n'
            f'  </{outer}>\n')


def week_body(w, other, log, with_comparison, email=False,
              all_weeks=None):
    """One week, ordered for the person with the least time.

    Headline, four numbers, the rigs, what happened, then everything that
    proves those figures -- the detail charts, the comparison table, the daily
    log -- folded away below. Nothing was dropped to get there; it was
    reordered and disclosed.

    On screen the order is set out as rig3's numbered sections, so the page
    reads as four parts rather than one long column. The email keeps its own
    layout, which Outlook can render."""
    if email:
        return _week_body_email(w, other, log, with_comparison, True,
                                all_weeks)
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
        detail += comparison_table(w, other, email=False)
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


def _week_body_email(w, other, log, with_comparison, email=True,
                     all_weeks=None):
    """The email's week: the same order as the page, as tables with every
    style inline, which is what Outlook renders. Flat tiles and the raster
    trend chart stand in for the page's sparklines."""
    h = status_line(w)
    h += (f'  <table class="kpis" width="100%" cellspacing="10" '
          f'cellpadding="0"><tr>\n{kpi_row(w, other)}'
          f'  </tr></table>\n')

    h += "\n" + rig_strip(w)

    if all_weeks and email:
        # The raster small multiples, for Outlook only. The browser gets the
        # same five series as live sparklines inside the KPI tiles above.
        trend = chart_trend(all_weeks, w)
        if trend:
            h += figure(trend, alt_trend(all_weeks, w),
                        "Each panel on its own scale. Figures to the right "
                        "are this week, to the left the first week tracked.",
                        email=True)

    # Where the covering email's own operations list has been transcribed,
    # that is what this section shows: its lines, reworded and nothing else.
    # The alternative was a written summary of the week, which is an
    # interpretation, and an interpretation is a place for a mistake to live.
    # The email's list covers the last day of the period, not all seven, so
    # the heading carries that date rather than implying a week.
    ops = w.get("dailyOperations")
    if ops:
        h += "\n" + heading(f"Daily ground operations &nbsp;&middot;&nbsp; "
                            f"{ops['label']}", PRIMARY)
        items = list(ops["lines"]) + list(ops.get("extraNotes") or [])
    else:
        h += "\n" + heading("What happened", PRIMARY)
        items = w["highlights"]
    lis = "".join(f"<li style='padding-bottom:5px;'>{x}</li>" for x in items)
    h += (f'  <ul style="font-size:{FS["base"]};color:{INK};margin:10px 0 0;'
          f'padding-left:20px;line-height:1.6;">{lis}</ul>\n')
    if ops:
        h += (f'  <div style="font-size:{FS["2xs"]};color:{INK_MUTED};'
              f'padding:7px 2px 0;">{ops["source"]}.</div>\n')

    # ── Everything below proves the above, and folds away ──────────────────
    # Charts first, then the table. The shape is what a reader takes from
    # this section; the table is what they check a single figure against, and
    # they scroll to it deliberately. The table was on top, so the charts sat
    # below sixty rows of numbers.
    #
    # The daily shape is the one thing no other view carries, so it stays in
    # both formats. The trips and fluids charts are per-vessel and per-category
    # views of totals the sparklines and the table already give, so the email
    # drops them: four base64 charts put it over Gmail's 102 KB clip, and a
    # clipped email loses the signature, not the chart.
    detail = figure(chart_ground(w), alt_ground(w), email=True)
    if with_comparison:
        detail += comparison_table(w, other)
    h += collapsible("Full figures", detail, "the daily shape, and every figure",
                     email=True)

    if log:
        inner = (daily_log(log, "port", "Port operations")
                 + daily_log(log, "vessel", "Vessel movements"))
        ops = sum(len(d["lines"]) for k in ("port", "vessel")
                  for d in log[k]["days"])
        h += collapsible("Daily log", inner, f"{ops} operations", email=email)

    return h


def alt_trend(weeks, upto):
    order = [x for x in sorted(weeks, key=lambda x: x["periodStart"])
             if x["periodStart"] <= upto["periodStart"]]
    parts = []
    for label, get in (("vessel trips", trips), ("vessel movements", movements),
                       ("truck moves", truck_total),
                       ("fluids in cubic metres", fluid_total),
                       ("overstay crew", overstay)):
        parts.append(label + " " + ", ".join(str(get(x)) for x in order))
    return ("Four week trend, one panel per metric, oldest to newest across "
            + ", ".join(x["tabLabel"] for x in order) + ". " + "; ".join(parts) + ".")


# ── Format: email ──────────────────────────────────────────────────────────

def build_email(cur, prev, all_weeks=None):
    body = week_body(cur, prev, None, with_comparison=True, email=True,
                     all_weeks=all_weeks)
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Offshore Logistics Weekly Update {cur['reportDate'].replace('-', '.')}</title></head>
<body style="margin:0;padding:0;background:{PAGE};font-family:{EMAIL_FONT_STACK};color:{INK};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{PAGE};padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="720" cellpadding="0" cellspacing="0" style="background:{CARD};border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.08);">
  <tr><td style="background:{PRIMARY};padding:22px 28px;">
    <table width="100%"><tr>
      <td style="color:{ON_PRIMARY};font-size:20px;font-weight:700;">Offshore Logistics Weekly Update</td>
      <td align="right" style="color:{tok('color.primary.200')};font-size:13px;">{cur['periodLabel']}</td>
    </tr></table></td></tr>
  <tr><td style="padding:22px 28px 6px;">
    <p style="margin:0 0 6px;font-size:15px;">Salam Bu Khaled,</p>
    <p style="margin:0;font-size:14px;color:{INK_MUTED};">Kindly find below the Offshore Logistics weekly summary. The week in one line and five figures comes first, then both rigs, then what happened, then the supporting charts and the full week on week comparison. Full daily port and vessel logs are in the attached workbook.</p>
  </td></tr>
  <tr><td style="padding:14px 28px 0;">
{body}  </td></tr>
  <tr><td style="padding:20px 28px 26px;">
    <p style="font-size:13px;margin:0 0 12px;">Full daily port and vessel logs are attached. Happy to walk through any item.</p>
{signature(cur)}  </td></tr>
</table></td></tr></table></body></html>
"""


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
.log{{width:100%;border-collapse:collapse;font-size:{FS['xs']}}}
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
   filling the right of the band. fi3's own 90rem width, wider than the report
   column, because the footer is a band and not a card. */
.foot-in{{position:relative;max-width:90rem;margin:0 auto;padding:40px 32px 80px;box-sizing:border-box;
  min-height:36rem;height:min(100svh,52rem)}}
.foot-mark{{position:relative;z-index:1;margin:0;font-size:clamp(2.5rem,5vw,5.75rem);
  font-weight:{FW['medium']};text-transform:uppercase;line-height:.86;letter-spacing:-.04em;color:{PRIMARY}}}
.foot-mark>span{{display:block;white-space:nowrap}}
.foot-mark .i1{{padding-left:1.55em}}
.foot-mark .i2{{padding-left:2.3em}}
.bitplate{{position:absolute;top:0;bottom:0;left:42%;right:0}}
.bitplate canvas{{position:absolute;inset:0;width:100%;height:100%;opacity:0;
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
  .foot-in{{height:auto;min-height:0;padding:28px 16px 0}}
  .foot-mark{{font-size:clamp(2.25rem,11vw,3.5rem)}}
  .bitplate{{position:relative;left:auto;right:auto;top:auto;bottom:auto;
    height:min(122vw,40rem);margin:12px -16px 0}}
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

JS = """(function(){
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
})();

(function(){
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
})();

(function(){
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
})();"""


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


def bit_plate():
    """fi3's drill bit, for the footer.

    The markup ships fi3's line elevation of the bit, which is what shows
    before the script runs, on paper, and wherever there is no hardware
    WebGL2 (a VDI desktop, a software renderer). vendor/drill-bit/drill-bit.js
    is fi3's own WebGL2 renderer, bundled; when it gets a frame on screen it
    fades the canvas in over the drawing. Decorative throughout, so hidden from
    assistive technology: the bit says nothing the report needs."""
    return (f'<div class="bitplate" aria-hidden="true"><span class="bit-probe"></span>'
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
        panels += f"""    <div role="tabpanel" id="panel-{wid}" aria-labelledby="tab-{wid}" tabindex="0">
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
    """Three outputs, one per audience:

        dashboard/  every week behind a tab strip, for circulating
        email/      the newest week, Outlook safe, for the weekly mail
        notes/      the open queries, for chasing answers

    The queries used to sit in an amber block inside both reports. They are
    questions for the report author, so they do not belong in something being
    circulated -- but they are also not something to lose, hence a file of
    their own, generated from the same data.
    """
    argv = sys.argv[1:]
    flags = {a for a in argv if a.startswith("--")}
    args = [a for a in argv if not a.startswith("--")]
    dates = args or ["2026-10-29", "2026-10-22", "2026-10-15", "2026-10-08",
                     "2026-10-01", "2026-09-24", "2026-09-17", "2026-09-10",
                     "2026-09-03", "2026-08-26"]

    picked = flags & {"--dashboard", "--email", "--notes", "--artifact"}
    want = {name: (f"--{name}" in flags or not picked)
            for name in ("dashboard", "email", "notes", "artifact")}

    weeks = []
    for d in dates:
        w = load(d)
        if w is None:
            sys.exit(f"missing data/{d}.json")
        weeks.append(w)
    weeks.sort(key=lambda w: w["periodStart"], reverse=True)
    cur, prev = weeks[0], weeks[1]

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
    if want["email"]:
        d, m, y = cur["reportDate"][8:10], cur["reportDate"][5:7], cur["reportDate"][:4]
        write("email", f"Offshore_Logistics_Weekly_Update_{d}-{m}-{y}.html",
              build_email(cur, prev, weeks))
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
