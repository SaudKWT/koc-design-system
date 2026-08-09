# ADR 0001 — English-only, no RTL support

- **Status:** Accepted
- **Date:** 2026-07-16
- **Decision-maker:** Saud AlKharji (KOC)

## Context

Kuwait Oil Company is a Kuwaiti state entity. Arabic is Kuwait's official language,
and KOC's own logo is bilingual — the mark carries both `شركة نفط الكويت` and
"Kuwait Oil Company", plus a bilingual KPC endorsement line. That made
Arabic/RTL support a genuine open question for the design system rather than an
obvious no.

The choice is architectural, not cosmetic. It determines:

- **Font.** An Arabic-capable family (IBM Plex Sans Arabic, Noto Sans Arabic)
  versus a Latin-only one (Inter).
- **Layout properties.** Logical (`padding-inline-start`, `margin-inline-end`)
  versus physical (`padding-left`, `margin-right`).
- **Component APIs.** Direction-aware icons, chevrons, progress and slider
  affordances all need a direction input.
- **Iconography.** Anything implying forward/back must mirror.

## Decision

**The system is English-only. No RTL considerations.**

Tokens and components use **physical** CSS properties, matching upstream
shadcn/ui exactly. Type is **Inter**.

The alternative offered — "English-only now, RTL-ready foundation" (logical
properties + an Arabic-capable font from day one, at near-zero present cost) —
was explicitly considered and declined.

## Consequences

### Positive

- Components stay byte-identical in shape to upstream shadcn/ui. Anything copied
  from ui.shadcn.com, Origin UI or Kibo UI drops in with no translation, which is
  a large ongoing saving.
- No direction-handling complexity in component APIs.
- Inter is the best-in-class choice for dense Latin dashboard UI, with true
  tabular figures.

### Negative — recorded plainly

- **Retrofitting RTL later means touching every component.** Not a config flag: a
  sweep across spacing, layout, icon direction and every `left`/`right` in the
  library, plus a font migration that will shift metrics on every screen.
- The system cannot serve Arabic-first KOC users or any future public-facing
  Arabic surface without that rework.
- There is some tension with KOC's own bilingual brand mark, which sits in the
  sidebar of every dashboard this system will produce.

### Revisit if

- A KOC dashboard is required to serve Arabic-language users.
- Any surface goes public-facing, where Arabic is likely non-optional for a state
  entity.
- An accessibility or government-digital-standards review raises language access.

If any of those land, budget the rework as a **major version**, not a patch.

## Notes

Documented rather than assumed. The negative consequences above are the reason
this ADR exists: if RTL is needed in eighteen months, the cost should surprise
nobody, and the decision should be re-litigated on its merits rather than
discovered by accident in a sprint planning session.
