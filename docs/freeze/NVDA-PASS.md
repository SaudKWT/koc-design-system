# NVDA + Edge pass — the script

Part of the freeze evidence ([README.md](README.md)). The Playwright suite
already proves keyboard reach, focus visibility, ARIA correctness and
announced state *in the DOM*; what it cannot prove is **what NVDA actually
says**. That is this hour. KOC is a Windows/Edge organisation — test NVDA +
Edge, not VoiceOver.

**Setup:** Windows, Edge, NVDA (free, nvaccess.org). Run both apps locally —
the docs site (`npm run dev` → localhost:4180) and the DWOS app (its
`.claude/launch.json`: API + web on :4200). Record NVDA and Edge versions at
the top of your results copy. Speech viewer (NVDA menu → Tools) lets you
read announcements instead of transcribing by ear.

**Keys you'll use:** `Tab` / `Shift+Tab` move focus. `NVDA+Space` toggles
browse/focus mode (NVDA usually switches automatically — note anywhere it
doesn't). `Ctrl+Alt+Arrows` navigate tables in browse mode. `D` jumps
between landmarks, `H` between headings.

**How to record:** duplicate this file as `NVDA-PASS-<date>.md`, fill the
"heard" column, mark ✓/✗. Anything ✗ becomes a fix before `v1.0.0`.

---

## 1 · Landmarks and headings (docs → Team dashboard shell; then any DWOS screen)

| step | expected | heard | ✓/✗ |
|---|---|---|---|
| Press `D` repeatedly | The sidebar announces as a **named** navigation landmark ("<team> navigation"); the breadcrumb as a second, differently named navigation; one main | | |
| Press `H` on a DWOS screen | Exactly one h1 (the page title from PageHeader), then sensible sub-headings — no h5-out-of-nowhere | | |

## 2 · Unit switcher (the dropdown menu) — shell page or any DWOS screen

| step | expected | heard | ✓/✗ |
|---|---|---|---|
| Tab to the switcher | Name (team/unit), "button", **"collapsed"** (from aria-expanded=false), and that it has a popup ("menu") | | |
| Press `Enter` | "menu" context; the first item is voiced. The directorate line ("… · …") is heard as plain text, not as an item | | |
| Arrow down through items | Each unit voiced; the checked/current unit is distinguishable | | |
| Press `Escape` | Menu closes; NVDA re-announces the trigger, now "collapsed" again — focus did not fall to the top of the page | | |
| Pick a different unit with `Enter` | Menu closes, and the page's h1/content change is discoverable (re-read with `NVDA+T` or arrow into content) | | |

## 3 · Collapsed icon rail (shell page)

| step | expected | heard | ✓/✗ |
|---|---|---|---|
| Click the rail toggle, then Tab through the rail | Every icon-only button still announces its **name** (Overview, Daily drilling reports, …) — never "button" alone | | |
| Land on a collapsible group trigger | Name plus expanded/collapsed state | | |

## 4 · Dialog + confirm (docs → List view, or DWOS daily reports)

| step | expected | heard | ✓/✗ |
|---|---|---|---|
| Open a row's record ("Open") | "dialog", then the **title** (the well name) and description (date · rig). Reading is trapped inside the dialog | | |
| Press `Escape` | Dialog closes; the "Open" button is re-announced (focus returned) | | |
| Open record → "Void report" | The confirm announces as a dialog titled "Void report <well>?" and **focus lands on Cancel — NVDA says "Cancel button"**, never the destructive action | | |
| Press `Escape` twice | Top dialog closes first, record dialog second — voiced in that order | | |

## 5 · Select and combobox (List view filters, or DWOS)

| step | expected | heard | ✓/✗ |
|---|---|---|---|
| Tab to the rig Select | Label ("Filter by rig"), current value, and that it opens a list | | |
| Open it; arrow through options | **Each arrow press voices the newly highlighted option** — silence here is a ✗ (highlight not reaching NVDA) | | |
| Choose one with `Enter` | Collapsed control re-announces with the **new** value | | |
| Tab to the well combobox; open; type to filter | Announced as combobox/expanded; filtered results voiced as you arrow; chosen value read back on the trigger | | |

## 6 · Data table (docs → Data table, or DWOS daily reports)

| step | expected | heard | ✓/✗ |
|---|---|---|---|
| Enter the table in browse mode (`Ctrl+Alt+Arrows`) | The **caption** is voiced on entry; cell navigation announces column headers with values | | |
| Focus a sortable header, press `Enter` | The header re-announces including **"sorted ascending"**, and again "descending" on the second press — aria-sort voiced, not just set | | |
| Type in the table search box | The row count ("N of M") arrives as a **polite** announcement after you stop typing — it must not interrupt every keystroke, and must not be silent | | |
| Filter to zero rows | The filtered-empty message (with its Clear filters action) is reachable and voiced | | |

## 7 · Tabs (docs → Detail view)

| step | expected | heard | ✓/✗ |
|---|---|---|---|
| Tab to the tab list | Active tab announced with "selected", position ("1 of N") | | |
| Arrow to another tab | New tab voiced as selected; its panel content is next in reading order | | |

## 8 · Checkbox, toast, notifications (docs → Full application)

| step | expected | heard | ✓/✗ |
|---|---|---|---|
| Tab to a task checkbox, press `Space` | "checked" / "not checked" voiced on each toggle, with the task's label | | |
| Void a report (List view) | The confirmation **toast is announced once** without stealing focus | | |
| Tab to the notification bell | The unread count is **in the name**: "Notifications, N unread" — never a bare "button" | | |
| Open it | Items voiced with severity + text; Escape returns to the bell | | |

## 9 · Page nav (Full application → Daily drilling screen)

| step | expected | heard | ✓/✗ |
|---|---|---|---|
| Tab to "Reports" in the page nav | Announced as a button with popup, collapsed | | |
| Open; arrow through the two report links | Each voiced as a link with its description | | |

---

**Done when:** every row has a mark, ✗ rows have a note precise enough to
reproduce, and the dated copy is committed to `docs/freeze/`. Fixes happen
before `v1.0.0`; the freeze pack ships the ✓ version.
