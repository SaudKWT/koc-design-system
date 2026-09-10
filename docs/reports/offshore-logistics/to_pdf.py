#!/usr/bin/env python3
"""
Render a built HTML report to PDF.

    python3 to_pdf.py dashboard/Offshore_Logistics_Weekly_Dashboard.html

Why this exists: SharePoint Online does not serve a custom .html file from a
document library as a rendered page. It hands the browser a download, and where
a tenant does render one it blocks the inline <script> the tab strip needs. A
PDF previews inline on every SharePoint tenant with no script and no settings
change, so it is the format that actually reaches a reader there.

The tab strip cannot survive the trip, and does not need to: build.py's print
stylesheet already unhides every tab panel and hides the strip, so the PDF
carries all weeks stacked in one document, oldest first.

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
    if len(sys.argv) < 2:
        sys.exit(__doc__.strip())
    src = Path(sys.argv[1]).resolve()
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
        page.emulate_media(media="print")
        page.wait_for_timeout(200)
        panels = page.locator("[role=tabpanel]").count()
        shown = page.locator("[role=tabpanel]:visible").count()
        page.pdf(path=str(out), format="A4", print_background=True,
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


if __name__ == "__main__":
    main()
