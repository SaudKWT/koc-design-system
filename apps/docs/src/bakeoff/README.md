# Bake-off — NOT CANONICAL

Everything in this directory is **evaluation code**. It exists so candidates can
be compared rendered, on KOC tokens, with real interaction behaviour — rather
than judged from screenshots.

**Nothing here is part of the design system.** Do not import from `src/bakeoff/`
in `@koc/ui`, do not hand any of it to a developer as a build instruction, and do
not point the registry at it. This is the code equivalent of the "Sketch kit —
not canonical" shelf in the Figma file (see [CLAUDE.md](../../../../CLAUDE.md)).

When a candidate wins, it gets **reimplemented into `@koc/ui`** — against tokens,
with contrast assertions, with KOC-specific semantics applied — and its entry
here is deleted. Promotion is a rewrite, not a move.

## Why the candidates are already on-brand

None of these were restyled. `packages/tokens/src/semantic.ts` matches the
shadcn CSS-variable contract exactly, so anything built against that contract
picks up KOC colour the moment it renders. That is the whole reason a bake-off
in code is cheap — and it is also what the comparison is really testing: a
candidate that *doesn't* land on-brand is telling you it hardcodes values, which
is disqualifying on its own.

## Licences of sources used

Recorded per candidate in `candidates.ts`. Summary of what is permitted here:

| Source | Licence | Notes |
| --- | --- | --- |
| shadcn/ui blocks | MIT | Canonical upstream |
| Kibo UI | MIT | |
| Tremor | Apache-2.0 | Permissive; patent grant |
| shadcn-admin | MIT | Reference for shell composition |
| Shadcn Space (free tier) | Commercial use, unrestricted | Paid tiers not used |

**Origin UI is deliberately excluded.** Its repo is mixed-licence — AGPL-3.0 by
default, with only `apps/origin/` and `apps/ui/` retaining MIT — and its
successor project (Particles) is AGPL throughout. AGPL's §13 network clause is
an open question for a network-deployed application at a state-owned company, and
the project's own README describes Origin UI as a legacy snapshot with limited
maintenance. Not a foundation to build a standard on. Revisit only with legal
sign-off.
