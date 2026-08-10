# KOC Design System — working notes

A React + shadcn/ui design system for Kuwait Oil Company. Scope as of 2026-08-09: **the
standard for future KOC applications and dashboards**, not just one app.

Saud designs; a separate KOC developer builds and deploys. Optimise for consumers outside
this repo — other KOC teams and that developer — over internal convenience.

## Commands

```bash
npm run build:tokens   # regenerate CSS / DTCG JSON / Figma JSON / report
npm test               # contrast + token drift + motion scale. All three gate the build.
npm run dev            # docs site → http://localhost:4180
npm run registry       # regenerate the @koc shadcn registry
```

## The invariants

These are the things that make this system worth more than a PDF styleguide. Breaking one
silently is the worst outcome in this repo.

1. **Never hand-write a hex outside `packages/tokens/src/`.** Everything downstream is
   generated. If a colour is wrong, it is wrong in the source, not in the consumer.
2. **`npm run test:tokens` must pass.** It fails the build on contrast regression. Do not
   weaken an assertion to make a colour fit — change the colour.
3. **Components consume semantic tokens, never raw ramp steps.** `--primary`, not
   `primary[600]`. That indirection is what makes dark mode a re-mapping rather than a
   second codebase.
4. **`border` and `input` are different tokens and must stay that way.** A card edge is
   decorative and exempt from WCAG 1.4.11; an input's boundary is the only cue the control
   exists and must clear 3:1.
5. **Semantic token names follow the shadcn contract exactly.** This is load-bearing, not
   cosmetic: it means any component from ui.shadcn.com, Origin UI, or Kibo UI is on-brand
   with no restyling. Renaming a token to something "clearer" breaks that for free.
6. **Motion comes from the scale, never from a literal.** `duration-fast` / `-base` / `-slow`
   / `-slower` and `ease-out` / `-in` / `-spring`, defined in `foundation.ts`. Never
   `duration-200`, never `ease-linear`, never an arbitrary value. `npm run check:motion`
   fails the build on any off-scale literal.

## The three build gates

Each one exists because documentation already failed to hold the line:

| Gate | Catches | Why a test and not a comment |
| --- | --- | --- |
| `test:tokens` | contrast regressions | 63 assertions; a guideline drifts the first time someone is in a hurry |
| `check:drift` | redefinition of KOC tokens | `shadcn add` appends stock theme blocks that silently de-brand the app — it appended one *directly beneath the warning comment telling it not to* |
| `check:motion` | off-scale duration/easing | the motion scale sat unused from the first commit; a hand-written `duration-200` appeared in the same session it was fixed |

## Decisions already made — don't re-litigate without new information

- **Distribution is hybrid.** `@koc/tokens` via npm (central brand control) + components via
  the `@koc/*` shadcn registry (teams own the source they pull).
- **English-only, no RTL.** [ADR 0001](docs/adr/0001-english-only-no-rtl.md). Re-confirmed
  2026-08-09 against the wider org-standard scope, with the retrofit cost stated. Settled.
- **npm workspaces, not pnpm.** KOC teams will have npm.
- **Code is the source of truth; Figma is the sketching and handoff surface.**
- **Paper (paper.design) considered and declined** as the standard — technically closer to
  this architecture, but too new to bet an org standard on, and KOC vendors all have Figma.

## The Figma loop

It is a **cycle, not a bidirectional sync**. One direction is authoritative at a time.

- **Figma → code is a proposal.** A human implements it deliberately.
- **Code → Figma is a regeneration.** It overwrites the mirror. If a regenerated component
  doesn't match the sketch, the implementation diverged — regeneration is a test.
- **Tokens never round-trip.** Colour flows code → Figma only. A colour edited in Figma has
  passed no test.

Token push goes through the **Tokens Studio plugin**, fed by
`packages/tokens/dist/koc-tokens.figma.json` (emitted by `packages/tokens/src/figma.ts`).
Figma's Variables REST API is Enterprise-only, and Saud is on a personal Professional plan.

Keep two labelled shelves in the Figma file — **"Sketch kit — not canonical"** (a community
shadcn kit with its variables repointed at KOC tokens) and **"KOC components — canonical"**
(generated from `@koc/ui`). Anything handed to the developer gets rebuilt from the second.

Code Connect needs Figma Organization and is unavailable. Substitute: Figma component names
match registry item names exactly, `npx shadcn add @koc/*` goes in each component's
description field, and Figma variants map 1:1 to real props.

## Known state

- **The app shell and data table exist.** `AppShell` is configured from a `TeamConfig`
  (Directorate → Group → Team → Unit); adding a KOC team is a config file, never a component.
  `DataTable` is TanStack Table v9 with loading, empty and filtered-empty as distinct states
  and numeric alignment declared via column `meta`.
- **Still missing:** dialog, tabs, combobox, date-range, toast, form layout, page header,
  chart wrappers — plus patterns (list view, detail view, KPI dashboard). Much of this is an
  *install* from the shadcn ecosystem rather than a build, because of invariant 5.
- **There is no data table in the shadcn registry.** `@shadcn/data-table` is named as a
  registry dependency but never published; only a `registry:example` exists, which the CLI
  will not install. Don't go looking for it again.
- **Installing a block pulls a lot.** `dashboard-01` added 12 dependencies — four `@dnd-kit`
  packages, `@tabler/icons-react` (a second icon library beside lucide), `next-themes`,
  `sonner`, `vaul`, `zod` — and silently bumped **recharts 2.15 → 3.8**. Check
  `git diff package.json` after every block install.
- **The registry hostname is aspirational.** `design.kockw.com` is a placeholder.
- **Contrast is tested; behaviour is not.** Nothing here proves focus order, screen-reader
  output, or keyboard traps in composed views.

## Traps that have already cost time

- **Recharts lines render invisible under React 19 StrictMode.** Set
  `isAnimationActive={false}` on every `<Line>`. Diagnose via `stroke-dasharray` on
  `path.recharts-line-curve` — if it starts with `0px`, this is it.
  *Possibly obsolete on recharts 3:* after the unintended 2.15 → 3.8 bump, the docs charts
  render with `stroke-dasharray: none`. Verify properly before removing the workaround.
- **WCAG contrast is the wrong tool for hue separation.** Use CIEDE2000 ΔE (`culori`'s
  `differenceCiede2000`), threshold ~15. But test luminance separately for greyscale.
- **Vite string aliases are prefix matches**, so an alias on `@koc/tokens` swallows
  `@koc/tokens/css`. Import generated CSS by relative path.
- **`StatCard` must not guess sentiment.** At an oil company "up" is not always good —
  production up is good, flaring up is reportable. `delta` carries arithmetic, `intent`
  carries meaning, and `intent` defaults to `"neutral"`.
