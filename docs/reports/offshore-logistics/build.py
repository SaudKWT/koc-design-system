#!/usr/bin/env python3
"""
Build the Offshore Logistics weekly update as one email-safe HTML file.

Run:  python3 docs/reports/offshore-logistics/build.py 2026-09-03 2026-08-26

Why a generator and not a hand-edited HTML file: the report states the same
figure in a KPI tile, a chart and a comparison table. Hand-editing three copies
is how they start to disagree. Every number below is read once from
data/<report-date>.json and rendered everywhere from that one value.

Why email-safe (nested tables, inline styles, base64 PNG charts): KOC is a
Windows/Outlook organisation. Outlook strips <svg>, external CSS and script, so
an interactive SVG chart would render as nothing. The charts therefore ship as
PNG, every bar carries a printed value, and the week-on-week comparison table
repeats all charted figures as text for the case where Outlook blocks images.

PALETTE NOTE: the colours here are the 26-08-2026 report's own palette, kept on
instruction so the weekly series stays visually continuous. They are NOT the
KOC token palette -- this navy is #1F3B57, the KOC brand blue is #0060A9. That
is why this file lives under docs/reports/ and not in packages/ or apps/: it is
an email deliverable, not design-system source, and invariant 1 (never
hand-write a hex outside packages/tokens/src/) is scoped to the system itself.
See README.md in this directory.
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
# Carried over from the 26-08-2026 report, with three contrast defects fixed.
# Fixes are listed in README.md with the measured before/after ratios.
NAVY = "#1F3B57"   # headings, primary series, header bar
TEAL = "#2E8B8B"   # secondary series
AMBER = "#E0A73C"  # arrivals series, OD1 accent
GREY = "#8A9AA5"   # OPH accent
RED = "#C0504D"    # overstay value
GREEN = "#2F7A55"  # improving delta  (added: the old file had no "good" colour)
PRIOR = "#AEBECB"  # prior-week reference bars

INK = "#243746"        # body
INK_SOFT = "#3B4C5A"   # list copy
INK_MUTED = "#4A5C6A"  # tile labels      (was #6B7C88, 3.99:1 -> 6.43:1)
INK_DELTA = "#5B6B78"  # neutral deltas   (was #7E8C97, 3.19:1 -> 5.08:1)

SURFACE = "#F4F6F8"   # tile fill
RULE = "#E5EAEE"      # table borders
PAGE = "#EDF1F4"      # page behind the card
ALERT_BG = "#FDF1F0"
ALERT_RULE = "#EBC9C7"
NOTE_BG = "#FFF8EC"
NOTE_RULE = "#F0DCB0"
NOTE_INK = "#7A5A16"

FONT = "DejaVu Sans"


# ── Chart helpers ──────────────────────────────────────────────────────────

def _frame(ax, ylabel):
    """Recessive axes: y grid only, no top/right spines."""
    ax.set_axisbelow(True)
    ax.yaxis.grid(True, color=RULE, linewidth=0.9)
    ax.xaxis.grid(False)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GREY)
        ax.spines[side].set_linewidth(0.9)
    ax.set_ylabel(ylabel, fontsize=11, color=INK, fontname=FONT)
    ax.tick_params(axis="both", labelsize=11, colors=INK, length=0)
    for lbl in ax.get_xticklabels() + ax.get_yticklabels():
        lbl.set_fontname(FONT)


def _png(fig):
    """Render at 2x the 664px display width, then quantise.

    These charts are a handful of flat fills plus antialiasing, so an adaptive
    128-colour palette is visually identical to truecolour and roughly a third
    of the bytes. That matters: the PNGs are base64-inlined, and base64 adds
    another 33% on top. The whole email has to stay in the size range of the
    report it replaces."""
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


def _label_bars(ax, bars, colour, fmt="{:g}", size=11):
    """Direct value labels. Required, not decorative: they are the relief that
    discharges the sub-3:1 contrast of the amber and prior-week fills."""
    for b in bars:
        h = b.get_height()
        ax.annotate(fmt.format(h),
                    (b.get_x() + b.get_width() / 2, h),
                    textcoords="offset points", xytext=(0, 4),
                    ha="center", va="bottom",
                    fontsize=size, fontweight="bold",
                    color=colour, fontname=FONT)


def chart_vessel_trips(cur, prev):
    """Grouped bars: trips per vessel, this week against the prior week."""
    names = ["CA1", "CA3", "CA5", "Charlie-3"]
    now = [cur["vesselTrips"][n] for n in names]
    was = [prev["vesselTrips"][n] for n in names]

    fig, ax = plt.subplots(figsize=(9.5, 4.0))
    x = range(len(names))
    w = 0.39
    # centres at +/-0.2025 leave a ~4px gap between the pair at render width
    b_prev = ax.bar([i - 0.2025 for i in x], was, w, color=PRIOR,
                    edgecolor="white", linewidth=1.2,
                    label=f"Prior week ({prev['periodLabel']})")
    b_now = ax.bar([i + 0.2025 for i in x], now, w, color=NAVY,
                   edgecolor="white", linewidth=1.2,
                   label=f"This week ({cur['periodLabel']})")

    _label_bars(ax, b_prev, INK_DELTA)
    _label_bars(ax, b_now, NAVY)

    ax.set_xticks(list(x))
    ax.set_xticklabels(names)
    ax.set_ylim(0, 7)                      # held at 7 to match the prior report
    ax.yaxis.set_major_locator(MaxNLocator(integer=True))
    _frame(ax, "No. of trips")
    ax.set_title(
        f"Vessel Trips by Vessel   ({sum(now)} this week vs {sum(was)} prior week)",
        fontsize=14, fontweight="bold", color=NAVY, fontname=FONT, pad=12)
    leg = ax.legend(loc="upper left", frameon=False, fontsize=10.5)
    for t in leg.get_texts():
        t.set_color(INK)
        t.set_fontname(FONT)
    return _png(fig)


def chart_ground_transport(cur):
    """Grouped bars: daily truck dispatches and arrivals."""
    days = cur["trucks"]["byDay"]
    labels = [d["label"] for d in days]
    out = [d["out"] for d in days]
    inn = [d["in"] for d in days]

    fig, ax = plt.subplots(figsize=(9.5, 4.0))
    x = range(len(labels))
    w = 0.39
    b_out = ax.bar([i - 0.2025 for i in x], out, w, color=NAVY,
                   edgecolor="white", linewidth=1.2, label="Dispatched (out)")
    b_in = ax.bar([i + 0.2025 for i in x], inn, w, color=AMBER,
                  edgecolor="white", linewidth=1.2, label="Arrived (in)")

    _label_bars(ax, b_out, NAVY)
    _label_bars(ax, b_in, INK_DELTA)

    ax.set_xticks(list(x))
    ax.set_xticklabels(labels)
    ax.set_ylim(0, 12)                     # held at 12 to match the prior report
    ax.yaxis.set_major_locator(MaxNLocator(integer=True))
    _frame(ax, "Trucks / tankers")
    ax.set_title(
        f"Daily Ground Transport Movements   "
        f"({sum(out)} out / {sum(inn)} in, {sum(out) + sum(inn)} total)",
        fontsize=14, fontweight="bold", color=NAVY, fontname=FONT, pad=12)
    leg = ax.legend(loc="upper left", frameon=False, fontsize=10.5, ncol=2)
    for t in leg.get_texts():
        t.set_color(INK)
        t.set_fontname(FONT)
    return _png(fig)


def chart_fluids(cur, prev):
    """Single series, coloured by direction. Colour earns its place here because
    it separates fluid bunkered into vessels from fluid delivered to rigs; the
    x axis already carries the category, so a fifth hue per bar would be noise."""
    items = cur["fluids"]
    labels = [i["label"] for i in items]
    vals = [i["value"] for i in items]
    cols = [TEAL if i["direction"] == "bunkered" else NAVY for i in items]

    fig, ax = plt.subplots(figsize=(9.5, 4.0))
    bars = ax.bar(range(len(items)), vals, 0.58, color=cols,
                  edgecolor="white", linewidth=1.2)
    for b, v in zip(bars, vals):
        ax.annotate(f"{v:,} m³",
                    (b.get_x() + b.get_width() / 2, v),
                    textcoords="offset points", xytext=(0, 5),
                    ha="center", va="bottom", fontsize=11.5,
                    fontweight="bold", color=NAVY, fontname=FONT)

    ax.set_xticks(range(len(items)))
    ax.set_xticklabels(labels)
    ax.set_ylim(0, max(vals) * 1.22)
    _frame(ax, "Cubic metres (m³)")

    cur_total, prev_total = sum(vals), sum(i["value"] for i in prev["fluids"])
    ax.set_title(
        f"Fluids & Bulk Managed   "
        f"({cur_total:,} m³ this week vs {prev_total:,} m³ prior week)",
        fontsize=14, fontweight="bold", color=NAVY, fontname=FONT, pad=12)

    slops = ("Slops: none recorded this week"
             if not cur["slopsBbl"]
             else f"Slops: {cur['slopsBbl']} bbl discharged to vacuum tankers")
    if prev["slopsBbl"]:
        slops += f" (prior week: {prev['slopsBbl']} bbl)."

    handles = [plt.Rectangle((0, 0), 1, 1, color=TEAL),
               plt.Rectangle((0, 0), 1, 1, color=NAVY)]
    # Below the axis, not inside it: at upper-centre the legend sat on top of
    # the slops annotation, and at upper-left it sat on the 234 m3 bar.
    leg = ax.legend(handles, ["Bunkered at port", "Delivered to rigs"],
                    loc="upper center", bbox_to_anchor=(0.5, -0.13),
                    frameon=False, fontsize=10.5, ncol=2)
    for t in leg.get_texts():
        t.set_color(INK)
        t.set_fontname(FONT)
    return _png(fig), slops


# ── Delta formatting ───────────────────────────────────────────────────────
# The StatCard rule from CLAUDE.md applies here: the arithmetic and the meaning
# are two different things. A fall in truck moves is neither good nor bad, it
# tracks the rig count. A fall in overstay crew is unambiguously good. So
# `intent` decides the colour, `delta` only decides the arrow.

UP, DOWN = "&#9650;", "&#9660;"


def delta(now, was, mode="abs", intent="neutral", unit=""):
    """Return (html, colour). intent: 'neutral' | 'lower-is-better'."""
    diff = now - was
    if diff == 0:
        return f"No change &nbsp;({was:,g}{unit})", INK_DELTA
    arrow = UP if diff > 0 else DOWN
    if mode == "pct":
        size = "&#8734;%" if was == 0 else f"{abs(diff) / was * 100:.0f}%"
    else:
        size = f"{abs(diff):,g}{unit}"
    colour = INK_DELTA
    if intent == "lower-is-better":
        colour = GREEN if diff < 0 else RED
    return f"{arrow} {size} &nbsp;({was:,g}{unit})", colour


def kpi_tile(value, label, value_colour, delta_html, delta_colour, alert=False):
    bg = ALERT_BG if alert else SURFACE
    edge = f"border:1px solid {ALERT_RULE};" if alert else ""
    return f"""      <td width="25%" align="center" valign="top" style="background:{bg};border-radius:8px;padding:14px 8px;{edge}">
        <div style="font-size:26px;font-weight:700;color:{value_colour};line-height:1.1;">{value}</div>
        <div style="font-size:11px;color:{INK_MUTED};padding:4px 0 6px;">{label}</div>
        <div style="font-size:11px;font-weight:700;color:{delta_colour};">{delta_html}</div>
        <div style="font-size:11px;color:{INK_DELTA};">vs prior week</div></td>
"""


# ── Table helpers ──────────────────────────────────────────────────────────

def row(cells, bold=False, shade=False):
    weight = "font-weight:700;" if bold else ""
    bg = f"background:{SURFACE};" if shade else ""
    tds = "".join(
        f'<td align="{a}" style="padding:7px 10px;border:1px solid {RULE};{bg}{weight}'
        f'{extra}">{v}</td>'
        for v, a, extra in cells)
    return f"    <tr>{tds}</tr>\n"


def section_row(title, span=4):
    return (f'    <tr><td colspan="{span}" style="padding:8px 10px;background:{NAVY};'
            f'color:#ffffff;font-size:11px;font-weight:700;letter-spacing:.06em;'
            f'text-transform:uppercase;border:1px solid {NAVY};">{title}</td></tr>\n')


def comparison_table(cur, prev):
    """The week-on-week comparison, and the text fallback for the three charts.
    Every charted figure appears here, so a recipient whose client blocks images
    still gets all of it."""
    ct, pt = cur["vesselTrips"], prev["vesselTrips"]
    cd, pd_ = cur["trucks"]["byDay"], prev["trucks"]["byDay"]
    c_out, c_in = sum(d["out"] for d in cd), sum(d["in"] for d in cd)
    p_out, p_in = sum(d["out"] for d in pd_), sum(d["in"] for d in pd_)
    c_fluid = sum(i["value"] for i in cur["fluids"])
    p_fluid = sum(i["value"] for i in prev["fluids"])
    c_days, p_days = cur["periodDays"], prev["periodDays"]

    c_over = {k: cur["rigs"]["OD1"]["overstay"][k] + cur["rigs"]["OPH"]["overstay"][k]
              for k in ("KOC", "HLB", "COSL")}
    p_over = {k: prev["rigs"]["OD1"]["overstay"][k] + prev["rigs"]["OPH"]["overstay"][k]
              for k in ("KOC", "HLB", "COSL")}

    def line(name, now, was, mode="abs", intent="neutral", unit="", bold=False, fmt="{:,g}"):
        html, colour = delta(now, was, mode, intent, unit)
        return row([
            (name, "left", ""),
            (fmt.format(now) + unit, "right", "font-family:Consolas,monospace;"),
            (fmt.format(was) + unit, "right", f"font-family:Consolas,monospace;color:{INK_DELTA};"),
            (html, "right", f"color:{colour};font-weight:700;font-size:12px;"),
        ], bold=bold)

    h = (f'  <table width="100%" cellspacing="0" style="font-size:13px;'
         f'border-collapse:collapse;margin-top:8px;">\n')
    h += row([
        ("Metric", "left", ""),
        (f"This week<br><span style='font-weight:400;font-size:11px;'>{cur['periodLabel']}</span>", "right", ""),
        (f"Prior week<br><span style='font-weight:400;font-size:11px;'>{prev['periodLabel']}</span>", "right", ""),
        ("Change", "right", ""),
    ], bold=True, shade=True)

    h += section_row("Vessel trips")
    for v in ("CA1", "CA3", "CA5", "Charlie-3"):
        h += line(v, ct[v], pt[v])
    h += line("Total vessel trips", sum(ct.values()), sum(pt.values()), bold=True)

    h += section_row("Ground transport")
    h += line("Dispatched (out)", c_out, p_out)
    h += line("Arrived (in)", c_in, p_in)
    h += line("Total truck / tanker moves", c_out + c_in, p_out + p_in, bold=True)
    h += line("Moves per day", round((c_out + c_in) / c_days, 1),
              round((p_out + p_in) / p_days, 1), fmt="{:.1f}")

    h += section_row("Fluids and bulk")
    h += line("Total fluids managed", c_fluid, p_fluid, unit=" m³", bold=True)

    h += section_row("Rigs and crew")
    h += line("Active rigs", cur["activeRigs"], prev["activeRigs"])
    h += line("OD1 personnel onboard", cur["rigs"]["OD1"]["personnelOnboard"],
              prev["rigs"]["OD1"]["personnelOnboard"])
    for k in ("KOC", "HLB", "COSL"):
        h += line(f"Overstay crew, {k}", c_over[k], p_over[k], intent="lower-is-better")
    h += line("Total overstay crew", sum(c_over.values()), sum(p_over.values()),
              intent="lower-is-better", bold=True)
    return h + "  </table>\n"


def rig_table(rig, accent, name):
    def nil(n):
        return "Nil" if not n else f"{n}"

    ov = rig["overstay"]
    ov_txt = " &nbsp;|&nbsp; ".join(
        (f'{k}: <span style="color:{RED};font-weight:700;">{v}</span>' if v
         else f"{k}: Nil")
        for k, v in ov.items())
    ov_style = ""
    pob = "Nil" if not rig["personnelOnboard"] else (
        f"{rig['personnelOnboard']} crew "
        f"(incl. {rig['visaHolders']} seaman / business visas)")

    rows = [
        ("Current operation", rig["currentOperation"], ""),
        ("Last week", rig["lastWeek"], ""),
        ("Personnel onboard", pob, ""),
        ("Overstay crew", ov_txt, ov_style),
        ("Next steps", rig["nextSteps"], ""),
    ]
    body = "".join(
        f'    <tr><td style="background:{SURFACE};padding:8px 10px;font-weight:600;'
        f'width:34%;border:1px solid {RULE};">{k}</td>'
        f'<td style="padding:8px 10px;border:1px solid {RULE};{st}">{v}</td></tr>\n'
        for k, v, st in rows)
    return f"""  <div style="font-size:15px;font-weight:700;color:{NAVY};border-left:4px solid {accent};padding-left:10px;">{name}</div>
  <table width="100%" cellspacing="0" style="margin-top:8px;font-size:13px;border-collapse:collapse;">
{body}  </table>
"""


# ── Document ───────────────────────────────────────────────────────────────

def build(cur, prev, show_notes=True):
    ct, pt = cur["vesselTrips"], prev["vesselTrips"]
    cd, pd_ = cur["trucks"]["byDay"], prev["trucks"]["byDay"]
    c_trips, p_trips = sum(ct.values()), sum(pt.values())
    c_truck = sum(d["out"] for d in cd) + sum(d["in"] for d in cd)
    p_truck = sum(d["out"] for d in pd_) + sum(d["in"] for d in pd_)
    c_over = sum(cur["rigs"][r]["overstay"][k]
                 for r in ("OD1", "OPH") for k in ("KOC", "HLB", "COSL"))
    p_over = sum(prev["rigs"][r]["overstay"][k]
                 for r in ("OD1", "OPH") for k in ("KOC", "HLB", "COSL"))

    d_trips = delta(c_trips, p_trips, "pct")
    d_truck = delta(c_truck, p_truck, "pct")
    d_rigs = delta(cur["activeRigs"], prev["activeRigs"])
    d_over = delta(c_over, p_over, "abs", intent="lower-is-better")

    tiles = (
        kpi_tile(c_trips, "Total vessel trips", NAVY, *d_trips)
        + kpi_tile(c_truck, "Truck / tanker moves", TEAL, *d_truck)
        + kpi_tile(cur["activeRigs"], "Active rig (OD1)", AMBER, *d_rigs)
        + kpi_tile(c_over, "Overstay crew", RED, *d_over, alert=True)
    )

    c1 = chart_vessel_trips(cur, prev)
    c2 = chart_ground_transport(cur)
    c3, slops = chart_fluids(cur, prev)
    c_out_t = sum(d["out"] for d in cd)
    c_in_t = sum(d["in"] for d in cd)
    c_fluid = sum(i["value"] for i in cur["fluids"])
    p_fluid = sum(i["value"] for i in prev["fluids"])

    def img(b64, alt, caption=""):
        cap = (f'\n    <div style="font-size:11px;color:{INK_DELTA};padding:6px 2px 0;">'
               f'{caption}</div>' if caption else "")
        return (f'  <tr><td style="padding:14px 28px 0;">\n'
                f'    <img src="data:image/png;base64,{b64}" width="664" alt="{alt}"\n'
                f'      style="width:100%;max-width:664px;border:1px solid {RULE};'
                f'border-radius:8px;">{cap}</td></tr>\n')

    alt1 = (f"Vessel trips by vessel. This week: "
            + ", ".join(f"{k} {v}" for k, v in ct.items())
            + f", total {c_trips}. Prior week: "
            + ", ".join(f"{k} {v}" for k, v in pt.items()) + f", total {p_trips}.")
    alt2 = ("Daily ground transport movements. "
            + "; ".join(f"{d['label']} {d['out']} out {d['in']} in" for d in cd)
            + f". Totals {c_out_t} out, {c_in_t} in, {c_truck} moves.")
    alt3 = ("Fluids and bulk managed. "
            + "; ".join(f"{i['label'].replace(chr(10), ' ')} {i['value']} cubic metres"
                        for i in cur["fluids"])
            + f". Total {c_fluid} cubic metres this week against {p_fluid} prior week.")

    notes_block = ""
    if show_notes and cur.get("dataNotes"):
        notes = "".join(f"<li>{n}</li>" for n in cur["dataNotes"])
        notes_block = f"""  <tr><td style="padding:18px 28px 0;">
    <div style="background:{NOTE_BG};border:1px solid {NOTE_RULE};border-radius:6px;padding:12px 14px;font-size:12px;color:{NOTE_INK};">
      <b>Data notes, for confirmation before circulation</b>
      <ul style="margin:8px 0 0;padding-left:18px;line-height:1.55;">{notes}</ul>
    </div></td></tr>
"""
    highs = "".join(f"<li>{h}</li>" for h in cur["highlights"])

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

  <tr><td style="padding:18px 28px 2px;">
    <table width="100%" cellspacing="8"><tr>
{tiles}    </tr></table></td></tr>
  <tr><td style="padding:0 28px;">
    <div style="font-size:11px;color:{INK_DELTA};text-align:right;">Arrows compare against the week {prev['periodLabel']}. Prior week value in brackets.</div>
  </td></tr>

{img(c1, alt1)}{img(c2, alt2)}{img(c3, alt3, slops)}
  <tr><td style="padding:22px 28px 4px;">
    <div style="font-size:15px;font-weight:700;color:{NAVY};border-left:4px solid {NAVY};padding-left:10px;">Week on week comparison</div>
{comparison_table(cur, prev)}  </td></tr>

  <tr><td style="padding:22px 28px 4px;">
{rig_table(cur['rigs']['OD1'], AMBER, 'Rig OD1 Status')}  </td></tr>

  <tr><td style="padding:16px 28px 4px;">
{rig_table(cur['rigs']['OPH'], GREY, 'Rig OPH Status')}  </td></tr>

  <tr><td style="padding:18px 28px 4px;">
    <div style="font-size:15px;font-weight:700;color:{NAVY};border-left:4px solid {TEAL};padding-left:10px;">Key highlights</div>
    <ul style="font-size:13px;color:{INK_SOFT};margin:10px 0 0;padding-left:20px;line-height:1.6;">{highs}</ul></td></tr>

{notes_block}
  <tr><td style="padding:12px 28px 0;">
    <div style="background:{SURFACE};border:1px solid {RULE};border-radius:6px;padding:10px 12px;font-size:12px;color:{INK_MUTED};">
      Trip, truck and bulk figures are consolidated from the daily port and vessel logs. One trip is one outbound voyage from Shuaiba Port plus its return. A truck move counts one truck unit per dispatch or arrival. Refer to the attached workbook for line item detail.
    </div></td></tr>

  <tr><td style="padding:20px 28px 26px;">
    <p style="font-size:13px;margin:0 0 12px;">Full daily port and vessel logs are attached. Happy to walk through any item.</p>
    <p style="font-size:13px;margin:0;">Thanks and Best Regards,</p>
    <p style="font-size:13px;margin:8px 0 0;line-height:1.5;">
      <b>Naser M Gh Hassan</b><br>
      Engineer, Drilling and Workover | Drilling and Workover Operations Support<br>
      Kuwait Oil Company (KOC) | NHassan@kockw.com
    </p></td></tr>

</table></td></tr></table></body></html>
"""


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    show_notes = "--no-notes" not in sys.argv
    cur_date = args[0] if len(args) > 0 else "2026-09-03"
    prev_date = args[1] if len(args) > 1 else "2026-08-26"
    cur = json.loads((HERE / "data" / f"{cur_date}.json").read_text())
    prev = json.loads((HERE / "data" / f"{prev_date}.json").read_text())

    # Guard the one failure mode that matters: a figure quoted in two places.
    assert len(cur["trucks"]["byDay"]) == cur["periodDays"], "day count mismatch"
    assert len(prev["trucks"]["byDay"]) == prev["periodDays"], "day count mismatch"

    suffix = "" if show_notes else "_clean"
    out = HERE / "dist" / (
        f"Offshore_Logistics_Weekly_Update_"
        f"{cur_date[8:10]}-{cur_date[5:7]}-{cur_date[0:4]}{suffix}.html")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(build(cur, prev, show_notes), encoding="utf-8")
    print(f"wrote {out}  ({out.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
