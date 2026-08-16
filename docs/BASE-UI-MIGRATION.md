# Base UI migration — decision and plan

**Decided 2026-08-16 by Saud.** The library migrates from Radix to
`@base-ui/react` and Base UI becomes the standard. This document records why,
what it costs, and the plan. The measurement it executes against is
[MIGRATION.md](MIGRATION.md) — read that first; nothing here repeats it.

## Why now, honestly

The recorded trigger has **not** fired. Verified live on 2026-08-16:
`ui.shadcn.com/r/styles/new-york-v4/dialog.json` still declares `radix-ui`
(`asChild` ×1, `data-[state=` ×12, `@base-ui` ×0), and `/r/styles/base/` is a
404. shadcn's docs default to Base; its registry still ships Radix. Migrating
now is a deliberate early move, and the reason is new information, which is
what CLAUDE.md requires to reopen a settled decision:

**KOC approves the component library through internal cybersecurity once, and
it freezes at approval.** No updates after. That constraint does two things:

1. It **inverts MIGRATION.md's strongest argument for waiting** — "the same
   work, charged twice: hand-port now, reconcile against shadcn's Base versions
   when they land." A frozen library reconciles with nothing, ever. There is no
   second charge. Waiting for the registry flip means waiting for updates we
   would not be permitted to consume.
2. It makes the foundation choice permanent, so the question is which primitive
   we want to be frozen on. Radix is in maintenance; Base UI (1.7.0, stable,
   React 17–19) is where the shadcn ecosystem's development is going — its docs
   and redirects already flipped. Freezing on the outgoing primitive is the
   worse permanent state.

## What this costs, stated before the work starts

**Invariant 5 changes meaning.** Today any component from ui.shadcn.com,
Origin UI or Kibo UI installs on-brand with no restyling because we match what
the canonical registry ships. After migration and until shadcn's registry
flips, every third-party component is a **port** (`asChild`→`render`,
`data-[state=open]`→`data-open`, `--radix-*`→Base positioner variables), not an
install. The invariant is redefined: **semantic token names still follow the
shadcn contract exactly** (that part is primitive-independent and keeps theme
compatibility), but component-level free-install is suspended until upstream
lands on Base — after which it resumes against shadcn's base track.

Under approve-once this cost is smaller than it looks: post-freeze, *nothing*
installs without re-approval anyway. Free-install was already going to die at
the freeze; this moves its death earlier.

**The animation model is not a find-and-replace.** Radix holds mounted content
with `data-state`; our entrance/exit motion keys `tw-animate-css` classes off
those attributes. Base UI's convention (`data-open` / `data-closed` /
`data-starting-style` / `data-ending-style`) is structurally different.
MIGRATION.md flags the attribute names **unverified** — the pilot verifies them
empirically, in a browser, before the mechanical phase begins. `check:motion`
now covers animations, so an off-scale or silently-dead entrance fails the
build rather than shipping.

## The plan

Definition of done for **every** migrated component — no component is "done"
at fewer than all seven:

1. Ported in `packages/ui/src`, zero `radix-ui` import, zero `asChild`, zero
   `data-[state=` , zero `--radix-*`.
2. Attribute names and CSS variables verified **empirically** against the
   installed `@base-ui/react`, not assumed from docs.
3. Any of the five divergences it carries **re-solved and re-tested**, not
   re-typed (MIGRATION.md § the five divergences).
4. All gates green in this repo: contrast, drift, motion, parity, behaviour,
   a11y, typecheck.
5. Registry rebuilt; the item's `dependencies` declare `@base-ui/react`.
6. Consumer proof: re-added into `dwos-platform/web` from the vendored
   registry, its gates green (tsc, build, motion, a11y suite, parity), and the
   component exercised in a real browser there.
7. Registry `docs` prose updated where behaviour changed.

### Phase 0 — ground truth (start here)

- Install `@base-ui/react` pinned **exact** (`1.7.0`, no caret — the freeze
  discipline starts now). Record whether `date-fns` peers are optional.
- Build one throwaway probe page rendering Base Dialog, Menu, Select, Popover,
  Tooltip open/closed; read the **actual** data attributes and CSS variables
  off the DOM. That table goes in this file and drives every later phase.

### Phase 0 results — the verified attribute model (2026-08-16)

Read off the live DOM of `@base-ui/react@1.7.0` via the bakeoff probe
(`apps/docs/src/bakeoff/BaseUiProbe.tsx`), not from documentation. This table is
the porting key for every later phase.

| Radix convention | Base UI, as rendered | notes |
|---|---|---|
| `data-[state=open]` on popup/panel | `data-open` (bare attribute) | Tailwind: `data-open:` |
| `data-[state=open]` on a **trigger** | `data-popup-open` | different from the popup's own attr |
| `data-[state=open]` on Collapsible trigger | `data-panel-open` | trigger vs panel again |
| `data-[state=checked]` | `data-checked` / `data-unchecked` | both sides explicit |
| `data-[state=active]` (tabs) | `data-active` | |
| `data-[highlighted]` (menu/select item) | `data-highlighted`, selected item also `data-selected` | |
| `data-[disabled]` | `data-disabled` | **unchanged** — 10 sites port as-is |
| `data-[side=…]` / align | `data-side` / `data-align` | **same shape** — most of the 31 sites port as-is; Select reports `side="none"` when item-aligned |
| `data-[orientation=…]` | `data-orientation` | unchanged |
| `--radix-*-trigger-width/-height` | `--anchor-width` / `--anchor-height` | on the **Positioner** |
| `--radix-*-content-available-height` | `--available-height` (+ `--available-width`) | Positioner |
| `--radix-*-content-transform-origin` | `--transform-origin` | Positioner and Popup |
| *(no Radix equivalent)* | `--nested-dialogs` on Dialog popup | |

**Divergence #1 likely evaporates.** Base's `Tabs.Indicator` ships
`--active-tab-left/-right/-top/-bottom/-width/-height` as live inline variables
— the entire `TabsValueContext` measurement workaround (four failed attempts
before it worked under Radix) is superseded by positioning against these. The
pilot for tabs is therefore *deletion*, not porting. Verify the sliding
behaviour, then remove the context.

**Structural note:** Base inserts a **Positioner** element between Portal and
Popup for anchored components (menu, select, popover, tooltip). Radix had no
such node; width/height/origin variables land there, so selectors and styles
that assumed trigger→content adjacency get a third element.

**Internal markers, never style against:** `data-base-ui-click-trigger`,
`data-base-ui-focusable`, `data-base-ui-inert`, `data-rootownerid`.

**Still unverified, deliberately flagged rather than guessed:**
- `navigation-menu` and a Sheet/Drawer equivalent were not probed —
  `--radix-navigation-menu-viewport-*` has no confirmed mapping yet, and
  whether Sheet ports onto Dialog-styled-as-panel or a Base drawer primitive
  is a Phase 3 question.
- Closed/exit attributes (`data-closed`, `data-starting-style`,
  `data-ending-style`): popups unmount when closed, so exit-state attrs only
  exist mid-transition. The pilot verifies them with real transitions — the
  animation model is where `tw-animate-css` keyframes meet Base's
  starting/ending-style convention, and `check:motion` guards the result.

### Phase 1 — pilot: `dialog` + `confirm-dialog`

Dialog is the canonical hard case: 20 `data-[state=` selectors, portal + focus
behaviour, and `confirm-dialog` carries divergence #2 (initial focus must land
on Cancel, not the destructive action — Radix's focus-first-child made that a
deliberate ordering; Base's initial-focus behaviour must be re-tested, and Base
exposes `initialFocus` if ordering alone no longer holds).

The pilot's deliverable is not two components — it is the **verified porting
recipe** (attribute map, `render` mechanics, animation-class mapping) written
into this file, so the remaining twelve coupled files are execution, not
research.

### Phase 2 — mechanical singles

avatar · checkbox · collapsible · separator · tooltip · popover · button ·
breadcrumb · page-nav · combobox · data-table · user-menu · notification-menu ·
date-range-filter. One or two coupling sites each; the recipe applies directly.
The 24 radix-free components are untouched by construction.

### Phase 3 — the heavy five, and the divergences

dropdown-menu (22 selectors, 4 `--radix-*`) · select (10 + 4 vars) ·
navigation-menu (27 + 2 vars) · sheet (23) · tabs (divergence #1 — the
indicator context workaround may become unnecessary; test, don't port) ·
filter-tabs (divergence #3 re-check) · **sidebar and app-shell last** (16 + 7
`asChild`, divergences #4 and #5).

⚠️ Coordination: an unreleased shell rework (`a53af5e`) touches `app-shell.tsx`
in this repo. Whoever migrates it reconciles with that work — do not let the
port and the rework race each other in the same file.

### Phase 4 — the consumer, wholesale

`dwos-platform/web` re-adds every installed component at the migration tag,
re-applies its documented local patches, and runs everything: its a11y suite,
motion gate, parity, and a browser pass over the five real screens. Its own
code styles `data-[state=]` in a few places (task-log rows use data attributes
of its own — verify none key off Radix's). This is DoD #6 at scale, and it is
what catches the class of bug the design system structurally cannot see.

### Phase 5 — the freeze pack

What cybersecurity approves is a named artifact, assembled once the port is
green everywhere:

- A tag (`v1.0.0`), and the vendored registry snapshot in the consumer at that
  tag — the approved bytes, not "latest".
- **SBOM** for `packages/ui` and the consumer (`npm sbom`, CycloneDX), every
  version exact-pinned, `@base-ui/react` included.
- License inventory (MIT throughout is expected — verify, list, attach).
- Evidence bundle: gate outputs (contrast assertions, motion, parity,
  behaviour, both a11y suites), the audit and this plan, and the **NVDA + Edge
  pass** — still undone, and it belongs in the approval evidence, not after it.
- Per-component docs: the registry `docs` prose is the documentation of record;
  Phase 5 reviews it component-by-component for accuracy post-port.

### What deliberately does not change

Tokens, the theme, `check:parity`, the type/motion/radius/shadow scales, the
org model, every radix-free component, all application code (measured: zero
Radix exposure), and the distribution model (registry → vendored consumer).
The freeze pack freezes the *library*; the platform's own modules continue to
ship against it.
