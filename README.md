# KOC Design System

A React + shadcn/ui foundation for Kuwait Oil Company dashboards and internal
applications. One brand, one accessibility standard, one set of tokens.

```bash
npm install
npm run build:tokens     # generate CSS / DTCG JSON / report
npm run test:tokens      # 63 WCAG assertions — fails the build on regression
npm run dev              # docs site → http://localhost:4180
npm run registry         # generate the @koc shadcn registry
```

## What this is

| Package        | What it is                                                          | How teams get it            |
| -------------- | ------------------------------------------------------------------- | --------------------------- |
| `@koc/tokens`  | Source of truth. Colour, type, space, radius, elevation, motion.     | npm — versioned, central    |
| `@koc/ui`      | shadcn primitives in KOC's design language + KOC-specific components | shadcn registry — teams own |
| `@koc/docs`    | Live documentation, component gallery, contrast report, registry host | —                           |

Tokens are centrally versioned so KOC can push a brand fix everywhere at once.
Components come through the registry so teams own the source and can fork without
waiting on anyone. See [Overview](apps/docs/src/sections/Overview.tsx) for why
that split.

## The brand is evidence, not taste

Every colour traces to a source recorded in
[`packages/tokens/src/brand.ts`](packages/tokens/src/brand.ts). The palette was
recovered by loading kockw.com in a real browser and reading `document.styleSheets`,
counting colours **per sheet** so KOC's hand-authored `custom.css` could be
separated from the Bootstrap 4 defaults the site happens to ship.

**`#0060A9`** — 29 rule-level uses in KOC's own CSS, applied to `h1, h2`; 182
computed uses on the rendered page. It is pinned byte-exact at `koc-primary-600`
and the whole ramp is generated around it in OKLCH. A build assertion fails if it
ever drifts.

> **A correction.** Public brand aggregators and several AI-generated SEO pages
> describe the KOC logo as a "blue, gold and red oil droplet". This is false. The
> real mark — verified by rendering the official SVG — is a white falcon in an
> oval ring with bilingual Arabic/English wordmarks, and it carries no colour of
> its own. Do not reintroduce gold or red on the strength of those pages.

### Why the generated ramp is trustworthy

The generator only ever saw `#0060A9`. Its `primary-700` lands within ~0.02
lightness of the darker blues KOC already uses for hover and pressed states
(`#054C82`, `#0C538A`) — colours it never saw. The ramp independently reproduced
how KOC already reaches for its blue on interaction.

## Accessibility is enforced, not documented

`npm run test:tokens` runs 63 assertions and **fails the build**. Accessibility
written into a guideline drifts the first time someone is in a hurry; encoded as
a test, a regression cannot merge.

What's structural rather than advisory:

- **`StatusBadge` takes a status, not a colour** — it derives colour, icon and
  label together. There is no prop that keeps the red and drops the icon, so
  WCAG 1.4.1 can't be violated by omission.
- **`border` and `input` are different tokens.** A card edge is decorative and
  out of WCAG 1.4.11's scope; an input's boundary is the only cue the control
  exists, so it clears 3:1. Most systems conflate them and ship inputs at ~1.6:1.
- **Chart series alternate 600/500.** Hue is not enough — a greyscale printout or
  a reader with achromatopsia sees only tone. An early revision had two series at
  ΔE 42 (vividly different) yet 1.11:1 in luminance: identical in greyscale. A
  test now asserts both.
- **Dark mode is a re-mapping, not an inversion.** `primary` lifts 600→400
  because `#0060A9` manages only ~3.2:1 on a dark surface.

### The colour-blindness decision

Chart and status hues derive from the **Okabe–Ito colour-universal palette**.
This matters more than usual: deuteranopia affects roughly 1 in 12 men, and KOC's
operational readership skews heavily male — a red/green status pair separated by
hue alone is unreadable for a meaningful share of the people these dashboards are
for.

The happy accident: Okabe–Ito's blue is `#0072B2`; KOC's is `#0060A9`. **The brand
colour is already a member of the colour-universal set**, so the most accessible
palette available is also the most on-brand one.

## Things worth knowing before you build

- **`StatCard` won't guess sentiment.** At an oil company "up" is not always good
  — production up is good, flaring up is reportable. `delta` carries the
  arithmetic, `intent` carries the meaning, and `intent` defaults to `"neutral"`.
  An honest grey delta beats a confident wrong colour.
- **Recharts needs `isAnimationActive={false}`.** Under React 19 StrictMode,
  react-smooth's mount tween never advances past frame zero and leaves every line
  with `stroke-dasharray: "0px <len>"` — correct `d`, correct stroke, opacity 1,
  zero pixels rendered. Not a style preference; a correctness fix.
- **Body text is 14px, not 16.** Dashboards are dense; 16px body forces scrolling
  that costs more than the legibility it buys. Long-form prose overrides to `md`.
- **Right-align numeric table columns.** Tabular figures are applied
  automatically; the alignment is the part you have to bring, and without it the
  figures buy nothing.

## Decisions

- [ADR 0001 — English-only, no RTL](docs/adr/0001-english-only-no-rtl.md).
  Deliberate, and the retrofit cost is recorded honestly.

## Known gaps

- **No RTL/Arabic.** See ADR 0001. Worth revisiting.
- **Contrast is tested; behaviour is not.** These tests prove colour conformance.
  They say nothing about focus order, screen-reader output, or keyboard traps in
  composed views. Those need a real audit against real screens.
- **The registry hostname is aspirational.** `design.kockw.com` is a placeholder;
  point it at wherever `apps/docs/public/r/` actually gets served.

## Stack

Node 20+ · npm workspaces · React 19 · Tailwind CSS v4 · shadcn/ui · TypeScript ·
culori (OKLCH + ΔE2000) · Recharts

npm workspaces rather than pnpm, deliberately: KOC teams will have npm already.
