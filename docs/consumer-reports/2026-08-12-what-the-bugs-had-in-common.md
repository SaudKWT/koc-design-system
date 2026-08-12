# What all of them had in common

Six distribution defects were found from the consumer side in one day. Each was
diagnosed and reported separately. Reading them together, they are one bug with
six faces, and naming the shape is more useful than any individual fix.

**Every single one was a default that the two environments disagreed about, where
the design system happened to be on the side that never has to state it.**

| # | The gap | The default nobody stated |
|---|---|---|
| 1 | Borders drew in the text colour | Tailwind v4 dropped v3's `gray-200` border default; it is `currentColor` now. The base layer overrode it, and the base layer never shipped. |
| 2 | `rounded-md` 40% too tight | The shadcn CLI **invents** `--radius-md: calc(var(--radius) * 0.8)` when a theme does not declare one. |
| 3 | `shadow-sm` was Tailwind's grey | Tailwind ships a shadow scale. Not declaring KOC's does not mean "no shadow", it means "theirs". |
| 4 | `duration-fast` produced no CSS | Tailwind v4 has an `--ease-*` theme namespace and **no `--duration-*` one**, so the scale is unreachable without `@utility` rules. |
| 5 | Badges and timestamps too large | `text-2xs` and `text-md` do not exist in Tailwind — but `text-sm` and `text-base` **do**, at different values, so declaring KOC's re-points classes already in use. |
| 6 | Two components would not compile | `noUnusedLocals` is on by default in Vite's `react-ts` template and was set nowhere in this monorepo. |
| 7 | Entrance animations inert | `animate-in` / `fade-in-0` come from `tw-animate-css`, not from Tailwind, and the plugin was never declared. |

Seven, once the theme is split from the components.

## Why the monorepo cannot see any of them

Not because of insufficient testing. Because `apps/docs` **imports the generated
stylesheet by relative path** and therefore always receives the whole thing, and
because its tsconfig is not the tsconfig a consumer scaffolds with. Every default
above is one the docs app never encounters, so no test written here can fail on
it. `check:parity` closed the stylesheet half of that. The tsconfig half is now
closed too. The general form is still open.

## The check this suggests

`check:parity` asks *"does everything in the generated stylesheet reach a
consumer?"* That is the right question and it caught the type scale.

The question it does not ask is the inverse, and it is where four of the seven
came from:

> **For every default in a consumer's environment that we intend to override —
> do we actually override it, and does the override reach them?**

That needs a list of what a KOC consumer's environment supplies by default. It is
short and knowable: Tailwind v4's own `@theme` values, the shadcn CLI's invented
fallbacks, and Vite's `react-ts` tsconfig. A check that walks those three and
asserts KOC either matches or explicitly overrides each would have caught #1, #2,
#3 and #5 before any of them shipped.

The type-scale check added in `release:status` — comparing new theme variables
against Tailwind's defaults by value — is exactly this idea applied to one case.
Generalising it is the obvious next step.

## Three practices that earned their place

Offered because they were each learned by getting it wrong first.

**A gate that has never failed is not known to be a gate.** `migrate.sh`'s three
new checks were proven by breaking each invariant in turn and confirming a
non-zero exit with the right message. Worth noting that the *first* attempt at
that proof was itself wrong — deleting a journal row simply made the script
re-apply the migration, and the "restore" step then left a duplicate that
short-circuited the next two tests. The test needed testing.

**An allowlist rots unless something guards the hole it leaves.** The a11y suite
exempts `heading-order` because `@koc/alert` hardcodes `<h5>`. Paired with it is a
test asserting the app has no `h5`/`h6` outside an alert — so the exemption cannot
start hiding the app's own mistakes. An exemption without a guard is a slow leak.

**"Verified" should name the mechanism, not the outcome.** `CONSUMING.md` said
"verified working end to end" and what had been verified was that a colour arrived
byte-exact — true, and the one check that passes while the base layer, the scales
and the plugin are all missing. The current version, which states what was
executed and explicitly what was not, is the better pattern. `004` had the same
problem in the other direction: it shipped correct and unrun for a day.

## The one that is still open

Raised in the v0.1.4 report and repeated here because it is the same species as
everything above. `--accent`, `--secondary` and `--muted` are now byte-identical.
A consumer distinguishing two states by using two semantic tokens has no way to
know whether the system intends them to stay distinct — that is an unstated
default, and it broke a control in the DWOS form exactly as the seven above did.
