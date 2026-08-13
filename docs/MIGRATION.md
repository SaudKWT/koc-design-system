# Radix → Base UI: exposure audit

Measured 2026-08-13 against `packages/ui/src` at `v0.1.5` + unreleased. Every
number here came from a grep, not an estimate; the commands are in
[§ Reproducing](#reproducing-this-audit) so the figures can be re-derived rather
than trusted.

**This is not a migration plan and not an argument for one.** It is the map you
would need before writing one, made now while the decision is still open, so the
eventual port is a scoped checklist instead of a discovery project.

---

## Status of the decision

`CLAUDE.md` records this as **actively watched — when, not if**. Two of the three
conditions people usually wait for have already been met, and one has not:

| | Status |
|---|---|
| shadcn documents Base UI | **Met.** `/docs/components/base/dialog` returns 200; the unprefixed path 307-redirects there |
| Base UI is stable | **Met.** `@base-ui/react` is **1.7.0**, stable |
| shadcn's *registry* ships Base UI | **NOT met.** `/r/styles/new-york-v4/dialog.json` still declares `radix-ui`, `asChild` ×1, `base-ui` ×0 |

### A correction worth recording

`CLAUDE.md` has said since 2026-08-10 that "Base UI is `1.0.0-rc.0`, pre-stable",
and that was repeated in conversation as a reason to wait. **It is wrong, and it
was wrong because the wrong package was checked.**

```
@base-ui-components/react   1.0.0-rc.0   ← the OLD package name
@base-ui/react              1.7.0        ← what shadcn's base track imports
```

The maturity objection to migrating is therefore **retired**. The timing
objection is not: invariant 5 is defined against *what the registry ships*, and
it still ships Radix. But the honest position is now "one condition remains",
not "the library is not ready".

---

## The headline number

**24 of 38 components have no Radix import at all.** They port for free.

```
total components   38
radix-coupled      14
radix-free         24
```

And the finding that most changes the shape of the job:

**Application code has ZERO Radix exposure.** `apps/docs/src` outside `bakeoff/`
contains no `radix-ui` import, no `--radix-*` variable, and no `asChild` — across
every screen, pattern page and the full-application mockup. The coupling is
entirely inside `packages/ui/src/components`. A migration does not touch a single
screen, config or consumer-written page.

---

## Where the coupling actually is

Four distinct kinds, in increasing order of difficulty.

### 1. Imports — 13 primitives, one per file

`Slot` (×2, in `button.tsx` and `sidebar.tsx`) plus twelve namespace imports:
Avatar, Checkbox, Collapsible, Dialog, DropdownMenu, NavigationMenu, Popover,
Select, Separator, Sheet, Tabs, Tooltip.

**Base UI has an equivalent for every one.** Dialog, Menu (for DropdownMenu),
Select, Popover, Tooltip, Tabs, Checkbox, Avatar, Separator, Collapsible,
Navigation Menu, Drawer (for Sheet). No primitive would need to be hand-built.

### 2. `asChild` → `render` — 38 sites, 12 files

```
sidebar.tsx        16     ← half the total
app-shell.tsx       7
button.tsx          3
breadcrumb.tsx      3
page-nav.tsx        2
select · dialog · combobox · data-table · user-menu · notification-menu · date-range-filter   1 each
```

Mechanical but not blind: `asChild` clones a child element, `render` takes an
element or a function. The single-site files are trivial. **`sidebar.tsx` and
`app-shell.tsx` together hold 60% of it**, and `sidebar.tsx` is also where the
`asChild` + `DropdownMenuTrigger` interaction already bit us once — see § 4.

### 3. `data-[state=*]` and friends — ~198 selectors

```
data-[state=…]        132
data-[side=…]          31
data-[orientation=…]   16
data-[disabled]        10
data-[motion…]          8
data-[placeholder]      1
```

Base UI uses a different attribute convention (`data-open` rather than
`data-[state=open]`, per shadcn's own base-track components). This is the
**largest mechanical surface in the audit** and the most likely place for silent
visual regressions: a stale `data-[state=open]:` selector does not error, it just
never matches, and the styling quietly stops applying.

Concentrated in five files:

```
navigation-menu 27 · sheet 23 · dropdown-menu 22 · dialog 20 · popover 10 · select 10
```

⚠️ **Unverified:** the exact Base UI attribute names per component. Confirm
against `@base-ui/react` docs before porting — do not assume a uniform
`data-open` mapping.

### 4. `--radix-*` CSS variables — 13 sites, 12 distinct

```
--radix-dropdown-menu-trigger-width           ×2
--radix-dropdown-menu-content-transform-origin ×2
--radix-select-trigger-width / -height / -content-transform-origin / -content-available-height
--radix-popover-trigger-width / -content-transform-origin
--radix-navigation-menu-viewport-width / -height
--radix-tooltip-content-transform-origin
--radix-dropdown-menu-content-available-height
```

These carry real layout behaviour — matching a dropdown's width to its trigger,
sizing a menu to available viewport height, anchoring a transform origin. Base UI
exposes positioner variables but **under different names**, and this is the one
category where a wrong guess produces a visibly broken menu rather than a subtle
one. `app-shell.tsx` uses `--radix-dropdown-menu-trigger-width` on the account
menu; `select.tsx` uses four.

---

## The five divergences — the part that is not mechanical

These are Radix-specific fixes this repo has already paid for. Each one solved a
real defect, and **each has to be re-solved rather than re-typed**, because the
underlying behaviour is what differs between libraries.

| Where | What it fixes | Why it does not port mechanically |
|---|---|---|
| `tabs.tsx:12` — `TabsValueContext` | Radix keeps the active value in a context only *its* components consume, so a wrapper never re-renders and the sliding indicator measured once and never again. **Four attempts failed before this.** | The whole workaround exists because of a Radix internal. Base UI may expose the value differently — the fix may become unnecessary, or may need to be different. Do not port it blind. |
| `confirm-dialog.tsx:30,93` | Radix focuses the first focusable child on open; on a destructive dialog that must not be the destructive button. Cancel is ordered first deliberately. | Depends on Base UI's initial-focus behaviour, which must be re-tested, not assumed. |
| `filter-tabs.tsx:18` | A `Tabs` with no panel makes `aria-controls` point at a nonexistent id — axe-critical. `renderPanel` makes the panel structural. | The *component* API survives; whether the underlying hazard still exists needs re-checking. |
| `sidebar.tsx:492` — DIVERGES FROM UPSTREAM | Collapsed padding moved out of the base into per-size scoping, because base `p-2!` beat `lg`'s `p-0!` on source order. | A CSS-specificity fix against shadcn's own markup. Survives a primitive swap, but the file is regenerated from upstream on migration and **the comment says explicitly: keep this if regenerated.** |
| `app-shell.tsx` — `AccountMenu` | No `tooltip` prop on the trigger: with one, `SidebarMenuButton` returns a Tooltip root and `DropdownMenuTrigger asChild` clones a non-DOM component. **The menu silently never opens.** | This is precisely an `asChild`-cloning hazard. `render` has its own version of this class of bug; re-test rather than assume it evaporates. |

---

## What a migration would cost

**Inside this repo:** 14 files, ~198 data-attribute selectors, 38 `asChild`
sites, 13 CSS variables, 5 divergences to re-solve. The mechanical majority is
genuinely mechanical. The five divergences are where the time goes, and they are
the reason a "simple find-and-replace" estimate would be wrong.

**Outside this repo — the part that is easy to forget:** the DWOS app owns the
source of ~36 pulled components. Under the hybrid distribution model, a migration
means that consumer re-adds everything and re-applies every local edit. Multiply
by every future KOC team on an older tag.

**The cost of migrating early, specifically:** doing it before shadcn's registry
flips means hand-porting 14 components alone, then reconciling against shadcn's
own Base UI versions when they land — and they will differ. The same work,
charged twice. Waiting converts the port into re-pulling upstream and re-applying
five documented divergences.

---

## The trigger, restated

Migrate when this returns `@base-ui/react` instead of `radix-ui`:

```bash
curl -s https://ui.shadcn.com/r/styles/new-york-v4/dialog.json | grep -o '"dependencies":\[[^]]*\]'
```

Everything else has already happened. **Re-check on a schedule** — a claim in
this file's ancestor stopped being true within 24 hours of being verified, and
the "pre-stable" claim corrected above survived three days after it stopped being
accurate.

---

## Reproducing this audit

```bash
# radix-coupled vs radix-free
grep -l 'from "radix-ui"' packages/ui/src/components/*.tsx | wc -l

# asChild, per file, heaviest first
grep -c "asChild" packages/ui/src/components/*.tsx | grep -v ':0' | sort -t: -k2 -rn

# data-attribute selectors by kind
grep -oh 'data-\[\(state\|side\|orientation\|motion\|disabled\|placeholder\)[^]]*\]' \
  packages/ui/src/components/*.tsx | sed 's/=.*//' | sort | uniq -c | sort -rn

# radix CSS variables
grep -oh '\-\-radix-[a-z-]*' packages/ui/src/components/*.tsx | sort | uniq -c | sort -rn

# application-code exposure (expect zero)
grep -rn 'radix-ui\|--radix-\|asChild' apps/docs/src | grep -v bakeoff | wc -l
```
