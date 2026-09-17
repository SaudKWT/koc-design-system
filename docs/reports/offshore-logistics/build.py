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
FW = {k: tok(f"typography.fontWeight.{k}")
      for k in ("normal", "medium", "semibold", "bold")}
RADIUS = px("dimension.radius.DEFAULT")
RADIUS_MD = px("dimension.radius.md")

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


def overstay(w):
    return sum(w["rigs"][r]["overstay"][k]
               for r in ("OD1", "OPH") for k in ("KOC", "HLB", "COSL"))


def overstay_by(w):
    return {k: sum(w["rigs"][r]["overstay"][k] for r in ("OD1", "OPH"))
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
            f'          <line class="base" x1="0" y1="{H - 0.5:g}" '
            f'x2="{W:g}" y2="{H - 0.5:g}"/>\n'
            f'          {hits}<polyline class="ln" points="{poly}"/>{dots}\n'
            f'        </svg>\n'
            f'        <div class="k-spark-foot">{len(ys)} wks, '
            f'from {fmt.format(ys[0])}</div>')
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
        dict(value=movements(w), label="Vessel movements", colour=PRIMARY,
             **dict(zip(("delta_html", "delta_colour"),
                        cmp(movements(w), "movements",
                            movements(other) if other else 0)))),
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
        tiles[1]["delta_html"] = (
            f'{truck_total(w)} counted once each &nbsp;'
            f'<span style="font-weight:400;">'
            f'({w["trucks"]["publishedTotal"]} as published)</span>')
        tiles[1]["delta_colour"] = DANGER
    return tiles


def kpi_row(w, other, sparks=None):
    """One table row of tiles. A table, not flex, because the email format has
    to render it too and Outlook's engine will not lay out a flex row.

    sparks adds the week-on-week line inside each tile, and with it the two
    hidden lines the scrub swaps in. Email passes nothing: Outlook strips
    <svg> and runs no script, so it keeps the raster small-multiples chart
    further down instead. Every style stays inline for the same reason -- the
    classes are there for the stylesheet and are inert in a mail client."""
    default_caption = (f"vs {other['tabLabel']}"
                       if other is not None and w.get("showArrows", True)
                       else "baseline week")
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
    for rig_id in ("OD1", "OPH"):
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
        cells += f"""      <td width="50%" valign="top" style="background:{CARD};border:1px solid {RULE};border-radius:{RADIUS_MD};padding:14px 16px;">
        <div><span style="font-size:{FS['lg']};font-weight:{FW['bold']};color:{INK};">Rig {rig_id}</span>
          <span style="font-size:{FS['2xs']};font-weight:{FW['bold']};color:{chip_ink};background:{chip_bg};border-radius:{RADIUS};padding:3px 8px;letter-spacing:.05em;margin-left:8px;">{chip}</span></div>
        <div style="font-size:{FS['sm']};color:{INK};padding:8px 0 10px;line-height:1.45;">{r['currentOperation']}</div>
        <table width="100%" style="font-size:{FS['xs']};border-collapse:collapse;">
          <tr><td style="color:{INK_MUTED};padding:3px 0;width:42%;">Personnel onboard</td><td style="color:{INK};font-weight:{FW['semibold']};font-variant-numeric:tabular-nums;">{pob}</td></tr>
          <tr><td style="color:{INK_MUTED};padding:3px 0;">Overstay crew</td><td style="color:{INK};font-variant-numeric:tabular-nums;">{ov_txt}</td></tr>
          <tr><td style="color:{INK_MUTED};padding:3px 0;vertical-align:top;">Last week</td><td style="color:{INK};">{r['lastWeek']}</td></tr>
          <tr><td style="color:{INK_MUTED};padding:3px 0;vertical-align:top;">Next steps</td><td style="color:{INK};">{r['nextSteps']}</td></tr>
        </table></td>
"""
    return (f'  <table width="100%" cellspacing="10" cellpadding="0">'
            f'<tr>\n{cells}  </tr></table>\n')


def collapsible(title, inner, sub="", open_it=False, email=False):
    """<details> on the web, a plain section in the email.

    The detail is what makes the report defensible, but it is not what the
    first reader needs, so on the web it folds away. Outlook does not implement
    <details>, and a collapsed one there renders as a heading with nothing
    under it, so the email gets everything inline."""
    if email:
        return "\n" + heading(title, PRIMARY) + inner
    note = (f' <span style="font-weight:{FW["normal"]};color:{INK_MUTED};">'
            f'{sub}</span>' if sub else "")
    return f"""  <details{' open' if open_it else ''} style="margin-top:14px;">
    <summary style="cursor:pointer;font-size:{FS['base']};font-weight:{FW['semibold']};color:{PRIMARY};padding:10px 14px;background:{SURFACE};border:1px solid {RULE};border-radius:{RADIUS_MD};">{title}{note}</summary>
{inner}  </details>
"""


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
            f'background:{PRIMARY};color:#ffffff;font-size:11px;font-weight:700;'
            f'letter-spacing:.06em;text-transform:uppercase;'
            f'border:1px solid {PRIMARY};">{title}</td></tr>\n')


def comparison_table(cur, prev):
    """The week-on-week comparison, and the text fallback for every chart.
    Each charted figure appears here, so a recipient whose client blocks images
    still receives all of it."""
    c_out, c_in = truck_split(cur)
    p_out, p_in = truck_split(prev)
    c_over, p_over = overstay_by(cur), overstay_by(prev)

    def line(name, now, was, mode="abs", intent="neutral", unit="",
             bold=False, fmt="{:,g}"):
        html, colour = delta(now, was, mode, intent, unit)
        return row([
            (name, "left", ""),
            (fmt.format(now) + unit, "right", "font-variant-numeric:tabular-nums;"),
            (fmt.format(was) + unit, "right",
             f"font-variant-numeric:tabular-nums;color:{INK_MUTED};"),
            (html, "right", f"color:{colour};font-weight:700;font-size:12px;"),
        ], bold=bold)

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
    h += "  </thead>\n  <tbody>\n"

    h += section_row("Vessel trips")
    for v in ("CA1", "CA3", "CA5", "Charlie-3"):
        h += line(v, cur["vesselTrips"][v], prev["vesselTrips"][v])
    h += line("Total vessel trips", trips(cur), trips(prev), bold=True)

    if cur.get("vesselMovements") and prev.get("vesselMovements"):
        h += section_row("Vessel movements &nbsp;<span style='font-weight:400;"
                         "text-transform:none;letter-spacing:0;'>port to rig, "
                         "rig to port, rig to rig</span>")
        for v in ("CA1", "CA3", "CA5", "Charlie-3"):
            h += line(v, cur["vesselMovements"][v], prev["vesselMovements"][v])
        h += line("Total vessel movements", movements(cur), movements(prev),
                  bold=True)
        h += line("Movements per day",
                  round(movements(cur) / cur["periodDays"], 1),
                  round(movements(prev) / prev["periodDays"], 1), fmt="{:.1f}")

    h += section_row("Ground transport")
    h += line("Dispatched (out)", c_out, p_out)
    h += line("Arrived (in)", c_in, p_in)
    h += line("Total truck / tanker moves", c_out + c_in, p_out + p_in, bold=True)
    h += line("Moves per day", round((c_out + c_in) / cur["periodDays"], 1),
              round((p_out + p_in) / prev["periodDays"], 1), fmt="{:.1f}")

    h += section_row("Fluids and bulk")
    for d, tag in (("bunkered", "bunkered at port"), ("delivered", "to rigs")):
        for f in FLUIDS:
            h += line(f"{f} {tag}", cur["fluids"][d][f], prev["fluids"][d][f],
                      unit=" m³")
    h += line("Total fluids managed", fluid_total(cur), fluid_total(prev),
              unit=" m³", bold=True)
    h += line("Slops discharged", cur["slops"]["dischargedBbl"],
              prev["slops"]["dischargedBbl"], unit=" bbl")

    h += section_row("Rigs and crew")
    h += line("Active rigs", cur["activeRigs"], prev["activeRigs"])
    h += line("OD1 personnel onboard", cur["rigs"]["OD1"]["personnelOnboard"],
              prev["rigs"]["OD1"]["personnelOnboard"])
    for k in ("KOC", "HLB", "COSL"):
        h += line(f"Overstay crew, {k}", c_over[k], p_over[k],
                  intent="lower-is-better")
    h += line("Total overstay crew", overstay(cur), overstay(prev),
              intent="lower-is-better", bold=True)
    return h + "  </tbody>\n  </table>\n"


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


def note_box(title, items):
    lis = "".join(f"<li>{i}</li>" for i in items)
    return (f'  <div style="background:{NOTE_BG};border:1px solid {NOTE_RULE};'
            f'border-radius:6px;padding:12px 14px;font-size:12px;'
            f'color:{NOTE_INK};margin-top:14px;"><b>{title}</b>'
            f'<ul style="margin:8px 0 0;padding-left:18px;line-height:1.55;">'
            f'{lis}</ul></div>\n')


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
        mark_html = ""
        if marks:
            mark_html = (f'<div style="font-size:11px;color:{NOTE_INK};'
                         f'padding-top:6px;">{"; ".join(marks)}</div>')
        status = d["status"] or "not stated"
        tone = INK_MUTED if status.lower() == "normal" else NOTE_INK
        rows += f"""    <tr>
      <td valign="top" style="background:{SURFACE};padding:8px 10px;border:1px solid {RULE};width:23%;">
        <div style="font-weight:700;">{d['day']}</div>
        <div style="font-size:12px;color:{INK_MUTED};font-variant-numeric:tabular-nums;">{d['date']}</div>
        <div style="font-size:11px;color:{tone};padding-top:4px;">{status}</div></td>
      <td valign="top" style="padding:8px 10px;border:1px solid {RULE};">
        <ul style="margin:0;padding-left:18px;line-height:1.5;">{ops}</ul>{mark_html}</td>
    </tr>
"""
    n = sum(len(d["lines"]) for d in days)
    return f"""  <details style="margin-top:10px;">
    <summary style="cursor:pointer;font-size:13px;font-weight:600;color:{PRIMARY};padding:8px 10px;background:{SURFACE};border:1px solid {RULE};border-radius:6px;">{title} &nbsp;<span style="font-weight:400;color:{INK_MUTED};">{len(days)} days, {n} operations</span></summary>
  <table width="100%" cellspacing="0" style="font-size:13px;border-collapse:collapse;margin-top:8px;">
{rows}  </table>
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

METHOD = ("One trip is one outbound voyage from Shuaiba Port plus its return; "
          "a rig to rig transit is not a new trip. A truck move counts one "
          "truck unit per dispatch or arrival, and a truck loaded on one day "
          "and dispatched the next is one movement, counted on dispatch. Both "
          "weeks are counted on that one rule, which is why the previous week "
          "reads 41 here against the 46 its own report published.")


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
              with_notes=False, all_weeks=None):
    """One week, ordered for the person with the least time.

    Headline, five numbers, both rigs, the four-week shape, then what happened.
    Everything that proves those figures -- the per-vessel and per-day tables,
    the detail charts, the daily log, the open queries -- folds away below.
    Nothing was dropped to get there; it was reordered and disclosed."""
    h = status_line(w)
    # On screen each tile carries its own sparkline, so the five figures are
    # stated once. Email keeps flat tiles and the raster chart further down.
    sparks = spark_svgs(all_weeks, w) if (all_weeks and not email) else {}
    h += (f'  <table class="kpis" width="100%" cellspacing="10" '
          f'cellpadding="0"><tr>\n{kpi_row(w, other, sparks)}'
          f'  </tr></table>\n')

    if w.get("showArrows", True) and other is not None:
        basis = (f"Arrows compare against {other['periodLabel']}, counted on "
                 f"the same rule. Prior value in brackets.")
    else:
        base = w.get("publishedBaseline") or {}
        basis = "Earliest week in this dashboard, so no comparison is drawn."
        if base:
            basis += (f" The {w['reportLabel']} report compared these against "
                      f"06 to 12 Aug 2026: {base.get('trips')} vessel trips, "
                      f"{base.get('truckMoves')} truck moves, "
                      f"{base.get('activeRigs')} active rigs, nil overstay.")
        if w["trucks"].get("publishedTotal"):
            basis += (f" Truck moves read {truck_total(w)} here against the "
                      f"{w['trucks']['publishedTotal']} that report published.")
    if sparks:
        basis += (' <span class="k-hint">Hover or tab a point on a line to '
                  'read that week.</span>')
    h += (f'  <div style="font-size:{FS["2xs"]};color:{INK_MUTED};'
          f'padding:8px 2px 0;text-align:right;">{basis}</div>\n')

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

    h += "\n" + heading("What happened", PRIMARY)
    lis = "".join(f"<li style='padding-bottom:5px;'>{x}</li>"
                  for x in w["highlights"])
    h += (f'  <ul style="font-size:{FS["base"]};color:{INK};margin:10px 0 0;'
          f'padding-left:20px;line-height:1.6;">{lis}</ul>\n')

    # ── Everything below proves the above, and folds away ──────────────────
    detail = ""
    if with_comparison:
        detail += comparison_table(w, other)
    # The daily shape is the one thing no other view carries, so it stays in
    # both formats. The trips and fluids charts are per-vessel and per-category
    # views of totals the trend strip and the table already give, so the email
    # drops them: four base64 charts put it over Gmail's 102 KB clip, and a
    # clipped email loses the signature, not the chart.
    detail += figure(chart_ground(w), alt_ground(w), email=email)
    if not email:
        detail += figure(chart_trips(w, other), alt_trips(w, other))
        detail += figure(chart_fluids(w, other), alt_fluids(w, other),
                         slops_caption(w, other))
    n = ("every figure, and the daily shape" if email
         else "every figure and the three detail charts")
    h += collapsible("Full figures", detail, n, email=email)

    if log:
        inner = (daily_log(log, "port", "Port operations")
                 + daily_log(log, "vessel", "Vessel movements"))
        ops = sum(len(d["lines"]) for k in ("port", "vessel")
                  for d in log[k]["days"])
        h += collapsible("Daily log", inner, f"{ops} operations", email=email)

    if with_notes and w.get("dataNotes"):
        lis = "".join(f"<li style='padding-bottom:4px;'>{i}</li>"
                      for i in w["dataNotes"])
        inner = (f'  <div style="background:{NOTE_BG};border:1px solid '
                 f'{NOTE_RULE};border-radius:{RADIUS_MD};padding:12px 14px;'
                 f'font-size:{FS["xs"]};color:{NOTE_INK};margin-top:10px;">'
                 f'<ul style="margin:0;padding-left:18px;line-height:1.55;">'
                 f'{lis}</ul></div>\n')
        h += collapsible("Open data queries", inner,
                         f"{len(w['dataNotes'])} to confirm", email=email)

    h += (f'  <div style="background:{SURFACE};border:1px solid {RULE};'
          f'border-radius:{RADIUS_MD};padding:10px 12px;font-size:{FS["xs"]};'
          f'color:{INK_MUTED};margin-top:14px;line-height:1.5;">'
          f'{METHOD}</div>\n')
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
<table role="presentation" width="720" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.08);">
  <tr><td style="background:{PRIMARY};padding:22px 28px;">
    <table width="100%"><tr>
      <td style="color:#fff;font-size:20px;font-weight:700;">Offshore Logistics Weekly Update</td>
      <td align="right" style="color:#9FC0D4;font-size:13px;">{cur['periodLabel']}</td>
    </tr></table></td></tr>
  <tr><td style="padding:22px 28px 6px;">
    <p style="margin:0 0 6px;font-size:15px;">Salam Bu Khaled,</p>
    <p style="margin:0;font-size:14px;color:{INK_MUTED};">Kindly find below the Offshore Logistics weekly summary. A one glance dashboard comes first, then the week on week comparison, then the supporting detail. Full daily port and vessel logs are in the attached workbook.</p>
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

CSS = f""":root{{color-scheme:light}}
.wrap{{max-width:1000px;margin:0 auto;padding:0 16px 40px}}
.card{{background:{CARD};border-radius:{RADIUS_MD};border:1px solid {RULE};overflow:hidden}}
.top{{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:{PRIMARY}}}
.top-in{{max-width:1000px;margin:0 auto;padding:16px 16px 0;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 16px}}
.top h1{{margin:0;color:{ON_PRIMARY};font-size:{FS['xl']};font-weight:{FW['bold']};letter-spacing:-.015em}}
.top .sub{{color:{tok('color.primary.100')};font-size:{FS['xs']};margin:0}}
[role=tablist]{{max-width:1000px;margin:0 auto;padding:12px 16px 0;display:flex;flex-wrap:wrap;gap:4px}}
[role=tab]{{appearance:none;background:transparent;border:0;border-bottom:3px solid transparent;
  color:{tok('color.primary.100')};font:inherit;font-size:{FS['sm']};font-weight:{FW['semibold']};text-align:left;
  padding:8px 14px 9px;cursor:pointer;border-radius:{RADIUS} {RADIUS} 0 0;
  transition:color {DUR_FAST} {EASE_OUT},border-color {DUR_FAST} {EASE_OUT},background-color {DUR_FAST} {EASE_OUT}}}
[role=tab] .rep{{display:block;font-weight:{FW['normal']};font-size:{FS['2xs']};color:{tok('color.primary.200')}}}
[role=tab][aria-selected=true] .rep{{color:{tok('color.primary.100')}}}
[role=tab]:hover .rep{{color:{tok('color.primary.100')}}}
[role=tab]:hover{{color:{ON_PRIMARY};background:{tok('color.primary.700')}}}
[role=tab][aria-selected=true]{{color:{ON_PRIMARY};border-bottom-color:{ON_PRIMARY};background:{tok('color.primary.700')}}}
[role=tab]:focus-visible{{outline:2px solid {ON_PRIMARY};outline-offset:-2px}}
[role=tabpanel]{{padding:20px 24px 26px}}
[role=tabpanel]:focus-visible{{outline:2px solid {PRIMARY};outline-offset:-2px}}
.panel-head{{border-bottom:1px solid {RULE};padding-bottom:12px;margin-bottom:4px}}
.panel-head h2{{margin:0;font-size:{FS['2xl']};color:{INK};letter-spacing:-.015em}}
.panel-head p{{margin:5px 0 0;font-size:{FS['xs']};color:{INK_MUTED}}}
.sig{{border-top:1px solid {RULE};padding:18px 24px 24px}}
details[open] summary{{border-radius:6px 6px 0 0}}
summary::marker{{color:{INK_MUTED}}}
table{{width:100%}}
/* Sparkline inside each KPI tile. Inline SVG, so it costs a tenth of a PNG,
   prints as vectors, and can be hovered or tabbed a point at a time. */
/* overflow:visible so the hover halo around a point at the top or
   bottom of the band is a full circle, not a clipped one. It only
   ever reaches into this element's own 9px top margin. */
.k-spark{{display:block;width:100%;height:auto;margin:9px 0 0;
  overflow:visible}}
/* width:100% with height:auto keeps the viewBox aspect, so the marks stay
   round at any tile width. preserveAspectRatio="none" would oval them. */
.k-spark .base{{stroke:{RULE};stroke-width:1;vector-effect:non-scaling-stroke}}
.k-spark .ln{{fill:none;stroke:{PRIMARY};stroke-width:1.6;
  stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}}
.k-spark .d{{fill:{PRIMARY};stroke:{CARD};stroke-width:1}}
.k-spark .dl{{stroke-width:1.4}}
/* The visual marks are painted over the hit targets, so they must not swallow
   the pointer events the hit targets exist to receive. */
.k-spark .base,.k-spark .ln,.k-spark .d{{pointer-events:none}}
.k-spark .h{{fill:transparent;stroke:none;cursor:pointer;
  transition:fill {DUR_FAST} {EASE_OUT}}}
.k-spark .h:hover{{fill:{tok('color.primary.100')}}}
/* A ring on the hit target itself is the focus indicator: it marks exactly
   the area that responds, which an outline on an SVG shape cannot. */
.k-spark .h:focus-visible{{outline:none;fill:{tok('color.primary.100')};
  stroke:{PRIMARY};stroke-width:2;vector-effect:non-scaling-stroke}}
.k-spark-foot{{font-size:{FS['2xs']};color:{INK_MUTED};padding-top:2px;
  font-variant-numeric:tabular-nums}}
/* Two lines' worth of room whether the label needs one or two, so every
   sparkline in the row starts at the same height. Four of the five labels
   wrap at print width, and a ragged row of lines is harder to compare. */
.k-label{{line-height:1.15;min-height:2.3em}}
/* The scrubbed week swaps in for the delta pair, so the tile keeps its
   height and a figure from an older week is never sitting above a delta that
   describes this one. */
.k-week,.k-wsub{{display:none;font-size:{FS['2xs']};
  font-variant-numeric:tabular-nums}}
.k-week{{font-weight:{FW['semibold']};color:{INK}}}
.k-wsub{{color:{INK_MUTED}}}
.k[data-scrub] .k-delta,.k[data-scrub] .k-cap{{display:none}}
.k[data-scrub] .k-week,.k[data-scrub] .k-wsub{{display:block}}
@media (max-width:760px){{
  [role=tabpanel]{{padding:16px 12px 20px}}
  .top h1{{font-size:17px}}
  [role=tab]{{flex:1 1 auto;font-size:12.5px;padding:8px 10px 9px}}
  /* A five-column table cannot wrap, so below this width it was 503px wide
     inside a 400px page: the fifth tile -- overstay crew -- was clipped off
     and unreachable. The table markup has to stay for Outlook, which will
     not lay out a flex or grid row, so the layout is re-declared here where
     only a browser reads it. The width="20%" attribute is a presentational
     hint and loses to this stylesheet without needing !important. */
  .kpis,.kpis tbody{{display:block}}
  .kpis tr{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
    gap:10px}}
  .kpis td.k{{display:block;width:auto}}
}}
@media print{{
  .top{{position:static}}
  [role=tablist]{{display:none}}
  [role=tabpanel][hidden]{{display:block!important}}
  .card{{box-shadow:none}}
  /* A long table splits across pages, so its header has to come with it. */
  thead{{display:table-header-group}}
  tr,figure{{break-inside:avoid}}
  /* The daily log is collapsed on screen and opened by to_pdf.py before
     printing, so its summary stays visible: open, it is the section heading.
     A long log has to be allowed to break across pages. */
  details,details table{{break-inside:auto}}
  summary{{list-style:none}}
  .k{{break-inside:avoid}}
  /* "Hover" means nothing on paper. */
  .k-hint{{display:none}}
}}
@media (prefers-reduced-motion:reduce){{
  [role=tab],.k-spark .h{{transition:none}}
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
    setHash(tabs[i].dataset.week);
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
  function tile(h){return h.parentNode&&h.parentNode.parentNode;}  /* circle > svg > td.k */
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
    h.addEventListener('pointerleave',function(){set(h,false);});
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
})();"""


def build_dashboard(weeks, logs, with_notes=False, artifact=False):
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
                 f'tabindex="{0 if is_current else -1}">{w["tabLabel"]} '
                 f'<span class="rep">report {w["reportLabel"]}'
                 f'{" &middot; current" if is_current else ""}</span></button>\n')
        body = week_body(w, other, logs.get(wid),
                         with_comparison=has_predecessor,
                         with_notes=with_notes, all_weeks=weeks)
        panels += f"""    <div role="tabpanel" id="panel-{wid}" aria-labelledby="tab-{wid}" tabindex="0">
      <div class="panel-head">
        <h2>{w['periodLabel']}</h2>
        <p>Report of {w['reportLabel']} &nbsp;&middot;&nbsp; {w['periodDays']} days &nbsp;&middot;&nbsp; MARSEC {w['marsec']}</p>
        <p>{w['provenance']}</p>
      </div>
{body}    </div>
"""
    shell = f"""  <header class="top">
    <div class="top-in">
      <h1>Offshore Logistics Weekly Dashboard</h1>
      <p class="sub">Drilling &amp; Workover Operations Support &nbsp;&middot;&nbsp; Kuwait Oil Company</p>
    </div>
    <div role="tablist" aria-label="Report week">
{tabs}    </div>
  </header>
  <main class="wrap">
    <div class="card">
{panels}      <footer class="sig">
{signature(cur)}      </footer>
    </div>
  </main>
<script>
{JS}
</script>
"""
    style = f"""<style>
{FONT_FACE}
body{{margin:0;background:{PAGE};font-family:{FONT_STACK};color:{INK};-webkit-text-size-adjust:100%;font-size:{FS['base']}}}
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
    dates = args or ["2026-09-17", "2026-09-10", "2026-09-03",
                     "2026-08-26"]

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
              build_dashboard(weeks, logs, with_notes=True, artifact=True))


if __name__ == "__main__":
    main()
