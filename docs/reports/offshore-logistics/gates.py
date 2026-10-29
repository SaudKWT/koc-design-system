"""Behaviour gates for the offshore logistics dashboard, run in Chromium.

    python3 gates.py <dashboard.html> <axe.min.js>

1. axe (WCAG 2.1 A/AA plus best-practice) on every tab, all folds open.
2. Tab strip: keyboard, deep links, phone overflow.
3. SharePoint: the page inside a sandboxed srcdoc frame, origin null.
   The four APIs that throw there must still throw, the page must not
   touch them, and there must be no console errors.
4. Touch, in that frame at 360px: sparkline and chart taps hold.
5. Phone: header not pinned, newest tab in view, no page sideways scroll.
Prints FAIL lines and exits 1 if any gate fails.
"""
import glob, json, pathlib, sys
from playwright.sync_api import sync_playwright

SRC = pathlib.Path(sys.argv[1]).resolve()
AXE = pathlib.Path(sys.argv[2]).read_text()
EXE = sorted(glob.glob("/opt/pw-browsers/chromium-*/chrome-linux/chrome"))[0]
L = "[role=tabpanel]:not([hidden]) "
fails = []
def check(ok, msg):
    print(("  ok    " if ok else "  FAIL  ") + msg)
    if not ok: fails.append(msg)

AXE_RUN = """axe.run(document, {runOnly:{type:'tag', values:
  ['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']}})
  .then(r => JSON.stringify(r.violations.map(v => v.id + ' x' + v.nodes.length)))"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE, args=["--no-sandbox"])

    # ── 1. axe on every tab ───────────────────────────────────────────────
    print("1. axe, every tab, folds open")
    pg = b.new_page(viewport={"width": 1200, "height": 1000})
    pg.goto(SRC.as_uri()); pg.wait_for_timeout(700)
    weeks = pg.evaluate("[...document.querySelectorAll('[role=tab]')].map(t=>t.dataset.week)")
    for wk in weeks:
        pg.goto(SRC.as_uri() + "#" + wk); pg.wait_for_timeout(500)
        pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)")
        pg.add_script_tag(content=AXE)
        v = json.loads(pg.evaluate(AXE_RUN))
        check(not v, f"axe {wk}: {v or 'no violations'}")
    pg.close()

    # ── 2. tab strip ──────────────────────────────────────────────────────
    print("2. tab strip")
    pg = b.new_page(viewport={"width": 1150, "height": 950})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(SRC.as_uri()); pg.wait_for_timeout(700)
    tabs = pg.locator("[role=tab]")
    n = tabs.count()
    sel = [tabs.nth(i).get_attribute("aria-selected") for i in range(n)]
    check(sel.index("true") == n - 1, f"{n} tabs, newest selected on load")
    for i in range(n):
        c = tabs.nth(i).get_attribute("aria-controls")
        check(pg.locator(f"#{c}").count() == 1, f"tab {i} controls #{c}, which exists")
    tabs.nth(0).focus(); pg.keyboard.press("End")
    check(pg.evaluate("document.activeElement.dataset.week") == weeks[-1], "End -> last tab")
    pg.keyboard.press("Home")
    check(pg.evaluate("document.activeElement.dataset.week") == weeks[0], "Home -> first tab")
    pg.keyboard.press("ArrowRight")
    check(pg.evaluate("document.activeElement.dataset.week") == weeks[1], "ArrowRight -> next tab")
    for wk in (weeks[0], weeks[len(weeks) // 2]):
        pg.goto(SRC.as_uri() + "#" + wk); pg.wait_for_timeout(400)
        got = pg.evaluate("document.querySelector('[role=tab][aria-selected=true]').dataset.week")
        check(got == wk, f"deep link #{wk}")
    check(not errs, f"page errors: {errs or 'none'}")
    pg.close()

    # ── 3. SharePoint frame ───────────────────────────────────────────────
    print("3. sandboxed srcdoc frame, origin null")
    html = SRC.read_text(encoding="utf-8")
    # The host needs a viewport meta. Without one, mobile emulation lays it out
    # at 980px and scales it to 0.37, and every coordinate tap misses -- a
    # fault in the harness, not the page. SharePoint's own viewer sets one.
    host = ('<!DOCTYPE html><html><head><meta name="viewport" '
            'content="width=device-width,initial-scale=1"></head>'
            '<body style="margin:0"><iframe id="f" '
            'sandbox="allow-scripts" style="width:{w}px;height:{h}px;border:0" '
            'srcdoc="__D__"></iframe></body></html>')
    esc = html.replace("&", "&amp;").replace('"', "&quot;")
    pg = b.new_page(viewport={"width": 1200, "height": 950})
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.set_content(host.format(w=1100, h=900).replace("__D__", esc)); pg.wait_for_timeout(1000)
    f = pg.frame_locator("#f")
    check(f.locator("body").evaluate("() => String(location.origin)") == "null", "frame origin is null")
    thr = f.locator("body").evaluate("""() => { const r = {};
      for (const [k, fn] of [['localStorage', () => localStorage.getItem('x')],
        ['sessionStorage', () => sessionStorage.getItem('x')],
        ['document.cookie', () => document.cookie],
        ['history.replaceState', () => history.replaceState(null, '', '#a')]])
        { try { fn(); r[k] = 'ok'; } catch (e) { r[k] = e.name; } } return r; }""")
    check(all(v == "SecurityError" for v in thr.values()), f"the four APIs still throw there: {thr}")
    # Code only: the script's comments name these APIs on purpose, to say why
    # they are absent. The one replaceState call must sit inside a try.
    import re
    js = "\n".join(re.findall(r"<script[^>]*>(.*?)</script>", html, re.S))
    code = re.sub(r"/\*.*?\*/", "", js, flags=re.S)
    code = re.sub(r"(?m)^\s*//.*$", "", code)
    for name in ("localStorage", "sessionStorage", "document.cookie"):
        check(name not in code, f"page script never calls {name}")
    calls = [m.start() for m in re.finditer(r"history\.replaceState\(", code)]
    guarded = all("try{" in code[max(0, i - 80):i].replace(" ", "") for i in calls)
    check(calls and guarded, f"replaceState called {len(calls)}x, all inside try")
    t1 = f.locator(L + ".k").first
    before = t1.locator(".k-value").inner_text()
    t1.locator(".h").first.hover(); pg.wait_for_timeout(250)
    during = t1.locator(".k-value").inner_text()
    f.locator(L + ".panel-head h2").hover(); pg.wait_for_timeout(250)
    after = t1.locator(".k-value").inner_text()
    # during != before as well: a scrub that changed the tile's height moved
    # the point out from under the mouse and reset it at once, and a check of
    # after == before alone passed through that flicker.
    check(during != before and after == before,
          f"sparkline hover scrubs and restores ({before} -> {during} -> {after})")
    f.locator("[role=tab]").nth(0).click(); pg.wait_for_timeout(300)
    check(f.locator(L + ".k .k-spark").count() == 0, "baseline tab draws no sparklines")
    f.locator("[role=tab]").last.click(); pg.wait_for_timeout(300)
    check(not errs, f"console errors in the frame: {errs or 'none'}")
    pg.close()

    # ── 4. touch, 360px frame ─────────────────────────────────────────────
    print("4. touch in a 360px frame")
    pg = b.new_page(viewport={"width": 360, "height": 700}, is_mobile=True, has_touch=True)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.set_content(host.format(w=360, h=700).replace("__D__", esc)); pg.wait_for_timeout(1000)
    f = pg.frame_locator("#f")
    fb = pg.locator("#f").bounding_box()
    def tap_center(loc):
        # Scroll first: a coordinate tap on an element outside the frame's
        # viewport lands on nothing, which is not the same as the page failing.
        loc.scroll_into_view_if_needed(); pg.wait_for_timeout(150)
        c = loc.evaluate("e=>{const r=e.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]}")
        pg.touchscreen.tap(fb["x"] + c[0], fb["y"] + c[1]); pg.wait_for_timeout(300)
    t1 = f.locator(L + ".k").first
    rest = t1.locator(".k-value").inner_text()
    t1.locator(".h").first.scroll_into_view_if_needed()
    tap_center(t1.locator(".h").first)
    held = t1.locator(".k-value").inner_text()
    check(held != rest and t1.locator(".k-week").is_visible(),
          f"sparkline tap holds after the finger lifts ({rest} -> {held})")
    tap_center(f.locator(L + ".panel-head h2"))
    check(t1.locator(".k-value").inner_text() == rest, "tap elsewhere resets the tile")
    tap_center(f.locator(L + "details > summary").first)
    fig = f.locator(L + "figure.cx").nth(1)
    fig.scroll_into_view_if_needed(); pg.wait_for_timeout(200)
    rd0 = fig.locator(".cx-read").inner_text()
    tap_center(fig.locator(".cx-g").nth(0).locator(".cx-hit"))
    rd1 = fig.locator(".cx-read").inner_text()
    check(rd1 != rd0 and "·" in rd1, f"chart column tap reads out: {rd1[:70]!r}")
    check(not errs, f"page errors: {errs or 'none'}")
    pg.close()

    # ── 5. phone layout ───────────────────────────────────────────────────
    print("5. phone layout")
    for w, h in ((390, 844), (360, 740)):
        pg = b.new_page(viewport={"width": w, "height": h}, is_mobile=True, has_touch=True)
        pg.goto(SRC.as_uri()); pg.wait_for_timeout(800)
        top = pg.locator(".top").bounding_box()["height"]
        pg.mouse.wheel(0, 1400); pg.wait_for_timeout(300)
        bb = pg.locator(".top").bounding_box()
        pinned = bb["y"] >= -1
        pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(200)
        vis = pg.evaluate("""()=>{const t=document.querySelector('[role=tab][aria-selected=true]'),
            r=t.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1}""")
        doc = pg.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
        rigs = pg.evaluate("""()=>[...document.querySelectorAll('[role=tabpanel]:not([hidden]) .rig')]
            .map(e=>Math.round(e.getBoundingClientRect().top))""")
        # 135, not the 110 of the old blue bar: the fei3 masthead carries the
        # emblem, a two-line title and the team, over the weeks bar. What the
        # phone complaint was about -- 222 to 237px pinned over the page --
        # is held by `not pinned`; this caps how much the first screen loses.
        check(top <= 135 and not pinned, f"{w}px: header {top:.0f}px, scrolls away")
        check(vis, f"{w}px: newest tab in view")
        check(doc[0] <= doc[1], f"{w}px: no page sideways scroll {doc}")
        # From report 30 a week can carry one rig, so stacked means one
        # card per row, whatever the number of cards.
        check(len(set(rigs)) == len(rigs), f"{w}px: {len(rigs)} rig card(s), one per row")
        pg.close()
    # ── 6. a frame as tall as the page, as OneDrive previews it ──────────
    print("6. frame sized to the content")
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    # The footer's bottom edge, not scrollHeight: scrollHeight is never less
    # than the frame, so it follows a tall frame whatever the page does.
    hs = []
    for fh in (900, 12000, 30000):
        pg.set_content(host.format(w=1280, h=fh).replace("__D__", esc)); pg.wait_for_timeout(600)
        hs.append(pg.frame_locator("#f").locator("body").evaluate(
            "() => Math.round(document.querySelector('.foot').getBoundingClientRect().bottom + scrollY)"))
    check(len(set(hs)) == 1, f"page height does not follow the frame height {hs}")
    pg.close()
    # ── 7. the same height before the script runs ─────────────────────────
    # The previewer measures before scripts run. Every panel was visible in
    # the markup and hidden by script, so it measured 14,914px for a
    # 2,505px page.
    print("7. height before and after the script")
    hh = []
    for js in (False, True):
        c = b.new_context(java_script_enabled=js, viewport={"width": 1280, "height": 900})
        pg = c.new_page(); pg.goto(SRC.as_uri()); pg.wait_for_timeout(500)
        hh.append(pg.evaluate("document.documentElement.scrollHeight"))
        c.close()
    check(hh[0] == hh[1], f"page height without script equals with it {hh}")
    b.close()

print(f"\n{'ALL GATES PASS' if not fails else str(len(fails)) + ' FAILED'}")
sys.exit(1 if fails else 0)
