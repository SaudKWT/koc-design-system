#!/usr/bin/env python3
"""Assert the contrast of text axe cannot evaluate.

axe returns every <text> node inside the detail charts as **incomplete**, not
as a pass, for two reasons of its own: it treats an <svg> as an image node and
so cannot resolve what is behind the text, and it skips a one-character label
like "0" as "too short to determine if it is actual text content". Eighty-six
nodes per tab come back that way.

Incomplete is not a pass. So the pairs are asserted here, against the card the
charts are drawn on, at the 4.5:1 that applies: nothing in these charts is
WCAG "large text" -- the biggest is a 15px bold title, and large starts at
18.66px bold.

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


def main():
    card = B.CARD
    pairs = [
        ("chart title, 15px bold", B.PRIMARY),
        ("y axis title, 11.5px", B.INK),
        ("axis tick labels, 11.5px", B.INK),
        ("legend text, 12px", B.INK),
        ("value label, this week, 11.5px bold", B.PRIMARY),
        ("value label, previous week, 11.5px bold", B.INK_MUTED),
        ("value label, arrivals, 11.5px bold", B.INK_MUTED),
        ("column readout, 12px", B.INK),
        ("slops caption, 11px", B.INK_MUTED),
    ]
    need, bad = 4.5, []
    print(f"Chart text against the card, {card}. Floor {need}:1.\n")
    for name, fg in pairs:
        r = ratio(fg, card)
        if r < need:
            bad.append((name, fg, r))
        print(f"  {'pass' if r >= need else 'FAIL'}  {r:5.2f}:1  {fg}  {name}")

    # Bar fills are non-text and exempt from 1.4.3. The pale one is *why* a
    # direct value label on every bar is mandatory rather than decorative.
    print("\nBar fills (non-text; the value labels are the required relief):")
    for name, fg in (("this week / dispatched", B.PRIMARY),
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
