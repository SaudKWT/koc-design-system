#!/usr/bin/env python3
"""Assert the contrast of text axe cannot evaluate.

axe returns every <text> node inside the detail charts as **incomplete**, not
as a pass, for two reasons of its own: it treats an <svg> as an image node and
so cannot resolve what is behind the text, and it skips a one-character label
like "0" as "too short to determine if it is actual text content". Eighty-six
nodes per tab come back that way.

Incomplete is not a pass. So the pairs are asserted here, against the darkest
surface the translucent rig3 card can show, at the 4.5:1 that applies: nothing
small on this page is WCAG "large text", and large starts at 18.66px bold.
The small type outside the charts -- eyebrows, tags, change rows -- sits on the
same cards and is asserted with it.

Run it after any change to the chart palette. It reads the same tokens
build.py does, so a colour changed at source is checked here without edit.
"""
import importlib.util
import sys
from pathlib import Path

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location("build", HERE / "build.py")
B = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B)


def _lum(hexcol):
    h = hexcol.lstrip("#")
    ch = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    ch = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
          for c in ch]
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]


def ratio(fg, bg):
    a, b = _lum(fg), _lum(bg)
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)


def _hex(c):
    return "#" + "".join(f"{round(v):02X}" for v in c)


def _over(fg, a, bg):
    """fg at opacity a, composited over bg. Both hex."""
    f = [int(fg.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)]
    g = [int(bg.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)]
    return _hex([a * x + (1 - a) * y for x, y in zip(f, g)])


def main():
    # The rig3 card is the card colour at 70% over the page's fog, so the text
    # sits on a composite, not on the card. Asserted against the darkest one
    # the page can produce: the page with both fog washes at full strength
    # (primary 8%, success 6%) under the card at 70%.
    fog = _over(B.GOOD, 0.06, _over(B.PRIMARY, 0.08, B.PAGE))
    card = _over(B.CARD, 0.7, fog)
    pairs = [
        ("chart title, 13px medium", B.INK),
        ("chart subtitle, 12px", B.INK_MUTED),
        ("axis tick labels, 11px", B.INK_MUTED),
        ("legend text, 11px", B.INK_MUTED),
        ("value label, this week, 11.5px semibold", B.PRIMARY),
        ("value label, previous week, 11.5px semibold", B.INK_MUTED),
        ("value label, arrivals, 11.5px semibold", B.INK_MUTED),
        ("column readout, 12px", B.INK),
        ("slops note, 12px", B.INK_MUTED),
        ("eyebrow and tags, 11px", B.INK_MUTED),
        ("section number, 11px mono", B.PRIMARY),
        ("good change, 11px", B.GOOD),
        ("bad change, 11px", B.DANGER),
    ]
    need, bad = 4.5, []
    print(f"Text on the translucent card, worst composite {card}. Floor {need}:1.\n")
    for name, fg in pairs:
        r = ratio(fg, card)
        if r < need:
            bad.append((name, fg, r))
        print(f"  {'pass' if r >= need else 'FAIL'}  {r:5.2f}:1  {fg}  {name}")

    # Bar fills are non-text and exempt from 1.4.3. The pale one is *why* a
    # direct value label on every bar is mandatory rather than decorative.
    print("\nBar fills (non-text; the value labels are the required relief):")
    for name, fg in (("this week / dispatched", B.CHART[0]),
                     ("previous week", B.PRIOR),
                     ("arrived (in)", B.CHART[1])):
        print(f"        {ratio(fg, card):5.2f}:1  {fg}  {name}")

    if bad:
        print(f"\n{len(bad)} pair(s) below {need}:1. Change the colour at "
              f"source in packages/tokens/src, never here.")
        return 1
    print(f"\nAll {len(pairs)} pairs clear {need}:1.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
