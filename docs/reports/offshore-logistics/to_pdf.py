#!/usr/bin/env python3
"""
Render a built HTML report to PDF.

    python3 to_pdf.py dashboard/Offshore_Logistics_Weekly_Dashboard.html
    python3 to_pdf.py <file>.html --week latest        # just the current week
    python3 to_pdf.py <file>.html --week 2026-09-03    # one named week

Why this exists: SharePoint Online does not serve a custom .html file from a
document library as a rendered page. It hands the browser a download, and where
a tenant does render one it blocks the inline <script> the tab strip needs. A
PDF previews inline on every SharePoint tenant with no script and no settings
change, so it is the format that actually reaches a reader there.

The tab strip cannot survive the trip, and does not need to: build.py's print
stylesheet already unhides every tab panel and hides the strip, so the PDF
carries all weeks stacked in one document, oldest first.

--week trims it to one. The other panels are removed from the DOM before
printing, which is why this reads the built HTML rather than re-rendering from
data: one source, and the PDF cannot disagree with the page it came from.

Needs playwright and the Chromium it points at. Kept out of build.py so the
HTML build stays a matplotlib-only job.
"""

import glob
import sys
from pathlib import Path


def find_chromium():
    """Prefer the pinned browser this environment ships, then let playwright
    fall back to its own download."""
    for pattern in ("/opt/pw-browsers/chromium-*/chrome-linux/chrome",
                    "/opt/pw-browsers/chromium-*/chrome-*/chrome"):
        hits = sorted(glob.glob(pattern))
        if hits:
            return hits[0]
    return None


def main():
    argv = sys.argv[1:]
    week = None
    if "--week" in argv:
        i = argv.index("--week")
        if i + 1 >= len(argv):
            sys.exit("--week needs a report date, or 'latest'")
        week = argv[i + 1]
        del argv[i:i + 2]
    if not argv:
        sys.exit(__doc__.strip())
    src = Path(argv[0]).resolve()
    if not src.exists():
        sys.exit(f"no such file: {src}")
    out = src.with_suffix(".pdf")

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit("playwright is not installed: pip install playwright")

    exe = find_chromium()
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=exe, args=["--no-sandbox"])
        page = browser.new_page()
        page.goto(src.as_uri())
        # The charts are inline base64, so nothing is fetched, but give the
        # layout a moment to settle before measuring page breaks.
        page.wait_for_timeout(900)
        kept = None
        if week:
            kept = page.evaluate("""want => {
                const panels = Array.from(document.querySelectorAll('[role=tabpanel]'));
                let keep = null;
                if (want === 'latest') {
                    const sel = document.querySelector('[role=tab][aria-selected="true"]');
                    keep = sel && document.getElementById(sel.getAttribute('aria-controls'));
                } else {
                    keep = document.getElementById('panel-' + want);
                }
                if (!keep) return null;
                panels.forEach(p => { if (p !== keep) p.remove(); });
                const strip = document.querySelector('[role=tablist]');
                if (strip) strip.remove();
                const h = keep.querySelector('.panel-head h2');
                return h ? h.textContent.trim() : keep.id;
            }""", week)
            if kept is None:
                sys.exit(f"no panel for week {week!r} in {src.name}")
            stem = week if week != "latest" else page.evaluate(
                "document.querySelector('[role=tabpanel]').id.replace('panel-','')")
            d, m, y = stem[8:10], stem[5:7], stem[:4]
            out = src.with_name(f"{src.stem}_{d}-{m}-{y}.pdf")

        # The daily log is a collapsed <details> on screen. A PDF has nothing
        # to click, and a collapsed one prints as a heading with nothing under
        # it, so open every one before printing. This is what makes the PDF a
        # complete document rather than a summary of one.
        opened = page.evaluate("""() => {
            const d = Array.from(document.querySelectorAll('details'));
            d.forEach(x => x.open = true);
            return d.length;
        }""")
        page.emulate_media(media="print")
        page.wait_for_timeout(400)
        panels = page.locator("[role=tabpanel]").count()
        shown = page.locator("[role=tabpanel]:visible").count()
        # 0.95 is imperceptible and buys about 55px a page, which is the
        # difference between two charts fitting on page one and the second
        # one being bumped, leaving a third of a page blank.
        page.pdf(path=str(out), format="A4", print_background=True, scale=0.95,
                 margin={"top": "10mm", "bottom": "12mm",
                         "left": "8mm", "right": "8mm"},
                 display_header_footer=True,
                 header_template="<div></div>",
                 footer_template=(
                     '<div style="width:100%;font-family:Arial,sans-serif;'
                     'font-size:8pt;color:#5B6B78;padding:0 10mm;">'
                     '<span style="float:left">Offshore Logistics Weekly '
                     'Dashboard</span>'
                     '<span style="float:right">Page '
                     '<span class="pageNumber"></span> of '
                     '<span class="totalPages"></span></span></div>'))
        browser.close()

    print(f"  {out.relative_to(Path.cwd()) if str(out).startswith(str(Path.cwd())) else out}"
          f"  ({out.stat().st_size / 1024:.0f} KB)")
    print(f"  {shown} of {panels} week panels visible under print media"
          + ("" if shown == panels else "   <-- the print rule is not applying"))
    if kept:
        print(f"  trimmed to: {kept}")
    print(f"  {opened} daily-log sections opened for print")


if __name__ == "__main__":
    main()
