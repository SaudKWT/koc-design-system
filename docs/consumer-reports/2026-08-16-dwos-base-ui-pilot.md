# DWOS takes the Base UI dialog pilot — measured in the built app

**Date:** 2026-08-16 · **Registry:** `94ee245` (pilot commits `cb90bb2` +
`94ee245`) · **Consumer:** dwos-platform `e565bc5` · **Verdict: clean take,
one forced ripple.**

The Base UI migration's Phase 1 (dialog + confirm-dialog, see
[BASE-UI-MIGRATION.md](../BASE-UI-MIGRATION.md)) was re-added into
dwos-platform from the vendored registry and verified there, in the app, not
inferred from the monorepo. Everything below was measured.

## What was run

1. `sync-registry.mjs 94ee245 --from <this repo>` — wholesale vendored
   snapshot; VERSION now records `94ee245`.
2. `koc-registry.mjs add @koc/dialog --yes --overwrite`, then
   `@koc/confirm-dialog` — one item per invocation, as the CLI requires.
3. `tsc -b` → **failed**, see the ripple below → `@koc/command` re-added →
   green. Then `vite build` green, the 9-test a11y suite green against the
   live API, and the installed confirm-dialog exercised in the app's own
   runtime with real input.

## The finding that changes Phases 2–3: re-add the importers

The type error the design system fixed in its own `command.tsx` (Base Roots
type `children` as `ReactNode | PayloadChildRenderFunction`; a wrapper that
re-parents children must narrow it) reproduced **in the consumer's vendored
copy** the moment `dialog.tsx` was updated underneath it. `tsc -b` failed in
a file nobody had asked to change.

The registry records dependencies in one direction (`command` →
`@koc/dialog`); a port flows breakage in the other. **When a ported component
lands, every installed component that imports it must be re-added in the same
sitting** — for the remaining phases that reverse map is small enough to read
off the registry JSONs (`grep -l '"@koc/<item>"' vendor/koc-registry/*.json`).

## The pin behaves, with one manual step

The registry now declares `@base-ui/react@1.7.0` (exact, carried through from
`packages/ui`). The shadcn CLI installed exactly 1.7.0 — but npm wrote
`^1.7.0` into `web/package.json`, npm's default save prefix. It was re-pinned
to `1.7.0` by hand. Every future consumer install of a pinned dependency will
need the same one-line manifest fix until the freeze pack locks everything.

## The distribution surface held

The class of bug this report series exists for — the docs app renders
something a consumer cannot — did not appear:

- The consumer's Tailwind generated the new `data-open:` / `data-closed:`
  variants from the vendored source (verified via computed styles, not
  presence of classes).
- In the app's runtime: popup mounts with `data-open`, entrance runs `enter`
  at 0.3s `cubic-bezier(0, 0, 0.2, 1)` (the KOC scale, arriving through the
  `@koc/theme` duration utilities), initial focus lands on **Cancel**,
  Escape flips it to `data-closed`, the exit animation runs, and the node
  unmounts only after it finishes.
- `radix-ui` remains in the consumer's manifest — correct: 12 installed
  components still use it until Phases 2–3. Remove it there only when the
  last one is re-added.

## For the next sync

Nothing to fix in the design system. Two process notes: budget for the
importer ripple (above), and note that a wholesale vendor sync at a commit
also refreshes catalogue entries for unreleased work (this one carried the
shell rework's `app-shell`/`card`/`stat-card` JSONs; the installed components
were deliberately not re-added, which is the documented model).
