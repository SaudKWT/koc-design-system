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

# ── Palette ────────────────────────────────────────────────────────────────
NAVY = "#1F3B57"    # headings, the panel's own week, header bar
TEAL = "#2E8B8B"    # truck KPI value, highlights accent
AMBER = "#E0A73C"   # arrivals series, OD1 accent
GREY = "#8A9AA5"    # OPH accent, axis spines
RED = "#C0504D"     # overstay value, 24px and 13px only
RED_TEXT = "#A8403D"  # the same alarm at 11px: 5.59:1 on the tile,
                      # 5.49:1 on the alert fill. #C0504D managed
                      # only 4.31 and 4.22 and axe failed it.
GREEN = "#2F7A55"   # improving delta  (added: the old file had no "good" colour)
OTHER = "#AEBECB"   # the week that is not this panel's

INK = "#243746"        # body
INK_SOFT = "#3B4C5A"   # list copy
INK_MUTED = "#4A5C6A"  # tile labels      (was #6B7C88, 3.99:1 -> 6.43:1)
INK_DELTA = "#5B6B78"  # neutral deltas   (was #7E8C97, 3.19:1 -> 5.08:1)

SURFACE = "#F4F6F8"
RULE = "#E5EAEE"
PAGE = "#EDF1F4"
ALERT_BG = "#FDF1F0"
ALERT_RULE = "#EBC9C7"
NOTE_BG = "#FFF8EC"
NOTE_RULE = "#F0DCB0"
NOTE_INK = "#7A5A16"

FONT = "DejaVu Sans"
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
        ax.spines[side].set_color(GREY)
        ax.spines[side].set_linewidth(0.9)
    ax.set_ylabel(ylabel, fontsize=11, color=INK, fontname=FONT)
    ax.tick_params(axis="both", labelsize=10.5, colors=INK, length=0)
    for lbl in ax.get_xticklabels() + ax.get_yticklabels():
        lbl.set_fontname(FONT)


def _legend(ax, **kw):
    leg = ax.legend(frameon=False, fontsize=10.5, **kw)
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
    _labels(ax, ax.bar(x, vals, w, color=NAVY, edgecolor="white",
                       linewidth=1.2), NAVY)


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
                      color=NAVY if is_mine else OTHER,
                      edgecolor="white", linewidth=1.2,
                      label=f"{role}  ({short(wk)})")
        _labels(ax, bars, NAVY if is_mine else INK_DELTA)


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
    ax.set_title(title, fontsize=13.5, fontweight="bold", color=NAVY,
                 fontname=FONT, pad=12)
    if theirs is not None:
        _legend(ax, loc="upper left")
    return _png(fig)


def chart_ground(w):
    """Per week by nature: the two periods are 8 days and 6 days long."""
    days = w["trucks"]["byDay"]
    out = [d["out"] for d in days]
    inn = [d["in"] for d in days]

    fig, ax = plt.subplots(figsize=(9.5, 3.9))
    x = range(len(days))
    b_out = ax.bar([i - 0.2025 for i in x], out, 0.39, color=NAVY,
                   edgecolor="white", linewidth=1.2, label="Dispatched (out)")
    b_in = ax.bar([i + 0.2025 for i in x], inn, 0.39, color=AMBER,
                  edgecolor="white", linewidth=1.2, label="Arrived (in)")
    _labels(ax, b_out, NAVY)
    _labels(ax, b_in, INK_DELTA)

    ax.set_xticks(list(x))
    ax.set_xticklabels([d["label"] for d in days])
    # Same as the trips chart: the 26-08 ceiling of 12 is a floor, not a cap.
    ax.set_ylim(0, max(12, max(out + inn) * 1.18))
    ax.yaxis.set_major_locator(MaxNLocator(integer=True))
    _frame(ax, "Trucks / tankers")
    ax.set_title(f"Daily Ground Transport Movements   ({sum(out)} out / "
                 f"{sum(inn)} in, {sum(out) + sum(inn)} total)",
                 fontsize=13.5, fontweight="bold", color=NAVY,
                 fontname=FONT, pad=12)
    _legend(ax, loc="upper left", ncol=2)
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
    ax.set_title(title, fontsize=13.5, fontweight="bold", color=NAVY,
                 fontname=FONT, pad=12)
    if theirs is not None:
        _legend(ax, loc="upper right")
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
        return f"No change &nbsp;({was:,g}{unit})", INK_DELTA
    arrow = UP if diff > 0 else DOWN
    if mode == "pct":
        size = "new" if was == 0 else f"{abs(diff) / was * 100:.0f}%"
    else:
        size = f"{abs(diff):,g}{unit}"
    colour = INK_DELTA
    if intent == "lower-is-better":
        # Delta text is always 11px, so the alarm uses the small-text red.
        colour = GREEN if diff < 0 else RED_TEXT
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
        return "", INK_DELTA

    tiles = [
        dict(value=trips(w), label="Total vessel trips", colour=NAVY,
             **dict(zip(("delta_html", "delta_colour"),
                        cmp(trips(w), "trips",
                            trips(other) if other else 0, "pct")))),
        dict(value=truck_total(w), label="Truck / tanker moves", colour=TEAL,
             **dict(zip(("delta_html", "delta_colour"),
                        cmp(truck_total(w), "truckMoves",
                            truck_total(other) if other else 0, "pct")))),
        dict(value=w["activeRigs"], label="Active rig (OD1)", colour=AMBER,
             **dict(zip(("delta_html", "delta_colour"),
                        cmp(w["activeRigs"], "activeRigs",
                            other["activeRigs"] if other else 0)))),
        dict(value=overstay(w), label="Overstay crew", colour=RED, alert=True,
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
        tiles[1]["delta_colour"] = RED_TEXT
    return tiles


def kpi_row(w, other):
    default_caption = (f"vs {other['tabLabel']}"
                       if other is not None and w.get("showArrows", True)
                       else "baseline week")
    cells = ""
    for t in kpis(w, other):
        alert = t.get("alert")
        bg = ALERT_BG if alert else SURFACE
        edge = f"border:1px solid {ALERT_RULE};" if alert else ""
        cells += f"""      <td width="25%" align="center" valign="top" style="background:{bg};border-radius:8px;padding:14px 8px;{edge}">
        <div style="font-size:26px;font-weight:700;color:{t['colour']};line-height:1.1;">{t['value']}</div>
        <div style="font-size:11px;color:{INK_MUTED};padding:4px 0 6px;">{t['label']}</div>
        <div style="font-size:11px;font-weight:700;color:{t['delta_colour']};">{t['delta_html']}</div>
        <div style="font-size:11px;color:{INK_DELTA};">{t.get('caption') or default_caption}</div></td>
"""
    return cells


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
            f'background:{NAVY};color:#ffffff;font-size:11px;font-weight:700;'
            f'letter-spacing:.06em;text-transform:uppercase;'
            f'border:1px solid {NAVY};">{title}</td></tr>\n')


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
             f"font-variant-numeric:tabular-nums;color:{INK_DELTA};"),
            (html, "right", f"color:{colour};font-weight:700;font-size:12px;"),
        ], bold=bold)

    h = ('  <table width="100%" cellspacing="0" style="font-size:13px;'
         'border-collapse:collapse;margin-top:8px;">\n')
    h += row([
        ("Metric", "left", ""),
        (f"{cur['tabLabel']}<br><span style='font-weight:400;font-size:11px;'>"
         f"{cur['periodDays']} days</span>", "right", ""),
        (f"{prev['tabLabel']}<br><span style='font-weight:400;font-size:11px;'>"
         f"{prev['periodDays']} days</span>", "right", ""),
        ("Change", "right", ""),
    ], bold=True, shade=True)

    h += section_row("Vessel trips")
    for v in ("CA1", "CA3", "CA5", "Charlie-3"):
        h += line(v, cur["vesselTrips"][v], prev["vesselTrips"][v])
    h += line("Total vessel trips", trips(cur), trips(prev), bold=True)

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
    return h + "  </table>\n"


def rig_table(rig, accent, name):
    ov = " &nbsp;|&nbsp; ".join(
        (f'{k}: <span style="color:{RED};font-weight:700;">{v}</span>' if v
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
    return (f'  <div style="font-size:15px;font-weight:700;color:{NAVY};'
            f'border-left:4px solid {accent};padding-left:10px;">{name}</div>\n'
            f'  <table width="100%" cellspacing="0" style="margin-top:8px;'
            f'font-size:13px;border-collapse:collapse;">\n{body}  </table>\n')


def heading(text, accent):
    return (f'  <div style="font-size:15px;font-weight:700;color:{NAVY};'
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
        tone = INK_DELTA if status.lower() == "normal" else NOTE_INK
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
    <summary style="cursor:pointer;font-size:13px;font-weight:600;color:{NAVY};padding:8px 10px;background:{SURFACE};border:1px solid {RULE};border-radius:6px;">{title} &nbsp;<span style="font-weight:400;color:{INK_MUTED};">{len(days)} days, {n} operations</span></summary>
  <table width="100%" cellspacing="0" style="font-size:13px;border-collapse:collapse;margin-top:8px;">
{rows}  </table>
  </details>
"""


DEFAULT_SIGNATURE = {
    "name": "Naser M Gh Hassan",
    "lines": ["Kuwait Oil Company (KOC)",
              "Engineer Drilling &amp; Workover | "
              "Drilling &amp; Workover Engineering Group"],
    "muted": ["NHassan@kockw.com | www.kockw.com | Tel +965 238 72718",
              "P.O Box 9758 | Ahmadi | Postal Code 61008 | Kuwait"],
}


def signature(w):
    """Per week, because the author changes. Report 24 came from a different
    sender and carried no signature block at all, so nothing beyond the name and
    the address on the From line is invented here."""
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
    cap = (f'\n    <{inner} style="font-size:11px;color:{INK_DELTA};'
           f'padding:6px 2px 0;">{caption}</{inner}>' if caption else "")
    return (f'  <{outer} style="margin:14px 0 0;">\n'
            f'    <img src="data:image/png;base64,{b64}" alt="{alt}"\n'
            f'      style="width:100%;max-width:100%;display:block;'
            f'border:1px solid {RULE};border-radius:8px;">{cap}\n'
            f'  </{outer}>\n')


def week_body(w, other, log, with_comparison, email=False):
    """Everything inside one week, used by both formats."""
    h = ""
    h += f'  <table width="100%" cellspacing="8"><tr>\n{kpi_row(w, other)}  </tr></table>\n'

    if other is not None and w.get("showArrows", True):
        basis = (f"Arrows compare against {other['periodLabel']}, counted on "
                 f"the same rule. Prior value in brackets.")
    else:
        # The earliest week in the set. Its own report measured against 06 to
        # 12 Aug 2026, which is not in this dashboard, so that stays as a
        # sentence rather than becoming arrows to a week nobody can open.
        base = w.get("publishedBaseline") or {}
        basis = "Earliest week in this dashboard, so no comparison is drawn."
        if base:
            basis += (f" The {w['reportLabel']} report compared these against "
                      f"06 to 12 Aug 2026: {base.get('trips')} vessel trips, "
                      f"{base.get('truckMoves')} truck moves, "
                      f"{base.get('activeRigs')} active rigs, nil overstay "
                      f"crew.")
        if w["trucks"].get("publishedTotal"):
            basis += (f" Truck moves read {truck_total(w)} here against the "
                      f"{w['trucks']['publishedTotal']} that report published; "
                      f"see the method note below.")
    h += (f'  <div style="font-size:11px;color:{INK_DELTA};padding:8px 2px 0;'
          f'text-align:right;">{basis}</div>\n')

    h += figure(chart_trips(w, other), alt_trips(w, other), email=email)
    h += figure(chart_ground(w), alt_ground(w), email=email)
    h += figure(chart_fluids(w, other), alt_fluids(w, other),
                slops_caption(w, other), email=email)

    if with_comparison:
        h += "\n" + heading("Week on week comparison", NAVY)
        h += comparison_table(w, other)

    h += "\n" + rig_table(w["rigs"]["OD1"], AMBER, "Rig OD1 Status")
    h += "\n" + rig_table(w["rigs"]["OPH"], GREY, "Rig OPH Status")

    h += "\n" + heading("Key highlights", TEAL)
    lis = "".join(f"<li>{x}</li>" for x in w["highlights"])
    h += (f'  <ul style="font-size:13px;color:{INK_SOFT};margin:10px 0 0;'
          f'padding-left:20px;line-height:1.6;">{lis}</ul>\n')

    if log:
        h += "\n" + heading("Daily log", GREY)
        h += daily_log(log, "port", "Port operations")
        h += daily_log(log, "vessel", "Vessel movements")

    h += (f'  <div style="background:{SURFACE};border:1px solid {RULE};'
          f'border-radius:6px;padding:10px 12px;font-size:12px;'
          f'color:{INK_MUTED};margin-top:12px;">{METHOD}</div>\n')
    return h


# ── Format: email ──────────────────────────────────────────────────────────

def build_email(cur, prev):
    body = week_body(cur, prev, None, with_comparison=True, email=True)
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Offshore Logistics Weekly Update {cur['reportDate'].replace('-', '.')}</title></head>
<body style="margin:0;padding:0;background:{PAGE};font-family:'Segoe UI',Arial,sans-serif;color:{INK};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{PAGE};padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="720" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.08);">
  <tr><td style="background:{NAVY};padding:22px 28px;">
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

CSS = f""".wrap{{max-width:1000px;margin:0 auto;padding:0 16px 40px}}
.card{{background:#fff;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.08);overflow:hidden}}
.top{{position:sticky;top:0;z-index:5;background:{NAVY};box-shadow:0 2px 8px rgba(0,0,0,.14)}}
.top-in{{max-width:1000px;margin:0 auto;padding:16px 16px 0;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 16px}}
.top h1{{margin:0;color:#fff;font-size:19px;font-weight:700;letter-spacing:-.01em}}
.top .sub{{color:#9FC0D4;font-size:12.5px;margin:0}}
[role=tablist]{{max-width:1000px;margin:0 auto;padding:12px 16px 0;display:flex;flex-wrap:wrap;gap:4px}}
[role=tab]{{appearance:none;background:transparent;border:0;border-bottom:3px solid transparent;
  color:#9FC0D4;font:inherit;font-size:13.5px;font-weight:600;text-align:left;
  padding:8px 14px 9px;cursor:pointer;border-radius:6px 6px 0 0;
  transition:color 120ms cubic-bezier(0,0,.2,1),border-color 120ms cubic-bezier(0,0,.2,1),background-color 120ms cubic-bezier(0,0,.2,1)}}
[role=tab] .rep{{display:block;font-weight:400;font-size:11px;color:#8CACC1}}
[role=tab][aria-selected=true] .rep{{color:#D6E4EE}}
[role=tab]:hover .rep{{color:#D6E4EE}}
[role=tab]:hover{{color:#fff;background:rgba(255,255,255,.07)}}
[role=tab][aria-selected=true]{{color:#fff;border-bottom-color:{AMBER};background:rgba(255,255,255,.10)}}
[role=tab]:focus-visible{{outline:2px solid #fff;outline-offset:-2px}}
[role=tabpanel]{{padding:20px 24px 26px}}
[role=tabpanel]:focus-visible{{outline:2px solid {NAVY};outline-offset:-2px}}
.panel-head{{border-bottom:1px solid {RULE};padding-bottom:12px;margin-bottom:4px}}
.panel-head h2{{margin:0;font-size:17px;color:{NAVY}}}
.panel-head p{{margin:4px 0 0;font-size:12.5px;color:{INK_MUTED}}}
.sig{{border-top:1px solid {RULE};padding:18px 24px 24px}}
details[open] summary{{border-radius:6px 6px 0 0}}
summary::marker{{color:{GREY}}}
table{{width:100%}}
@media (max-width:760px){{
  [role=tabpanel]{{padding:16px 12px 20px}}
  .top h1{{font-size:17px}}
  [role=tab]{{flex:1 1 auto;font-size:12.5px;padding:8px 10px 9px}}
}}
@media print{{
  .top{{position:static}}
  [role=tablist]{{display:none}}
  [role=tabpanel][hidden]{{display:block!important}}
  .card{{box-shadow:none}}
}}
@media (prefers-reduced-motion:reduce){{
  [role=tab]{{transition:none}}
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
    if(history.replaceState)history.replaceState(null,'','#'+tabs[i].dataset.week);
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
    var h=location.hash.replace('#','');
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
})();"""


def build_dashboard(weeks, logs):
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
                         with_comparison=has_predecessor)
        panels += f"""    <div role="tabpanel" id="panel-{wid}" aria-labelledby="tab-{wid}" tabindex="0">
      <div class="panel-head">
        <h2>{w['periodLabel']}</h2>
        <p>Report of {w['reportLabel']} &nbsp;&middot;&nbsp; {w['periodDays']} days &nbsp;&middot;&nbsp; MARSEC {w['marsec']}</p>
        <p>{w['provenance']}</p>
      </div>
{body}    </div>
"""
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Offshore Logistics Dashboard {cur['periodLabel']}</title>
<style>
body{{margin:0;background:{PAGE};font-family:'Segoe UI',Arial,sans-serif;color:{INK};-webkit-text-size-adjust:100%}}
{CSS}
</style></head>
<body>
  <header class="top">
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
</body></html>
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
    dates = args or ["2026-09-10", "2026-09-03", "2026-08-26"]

    picked = flags & {"--dashboard", "--email", "--notes"}
    want = {name: (f"--{name}" in flags or not picked)
            for name in ("dashboard", "email", "notes")}

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

    if want["dashboard"]:
        # A stable filename: the dashboard covers every week, so the tab strip
        # says which, and each rebuild replaces the file rather than adding one.
        write("dashboard", "Offshore_Logistics_Weekly_Dashboard.html",
              build_dashboard(weeks, {w["reportDate"]: load(w["reportDate"], ".log")
                                      for w in weeks}))
    if want["email"]:
        d, m, y = cur["reportDate"][8:10], cur["reportDate"][5:7], cur["reportDate"][:4]
        write("email", f"Offshore_Logistics_Weekly_Update_{d}-{m}-{y}.html",
              build_email(cur, prev))
    if want["notes"]:
        write("notes", "data-queries.md", build_notes(weeks))


if __name__ == "__main__":
    main()
