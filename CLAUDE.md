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

## The build gates

Each one exists because documentation already failed to hold the line:

| Gate | Catches | Why a test and not a comment |
| --- | --- | --- |
| `test:tokens` | contrast regressions | 63 assertions; a guideline drifts the first time someone is in a hurry |
| `check:drift` | redefinition of KOC tokens | `shadcn add` appends stock theme blocks that silently de-brand the app — it appended one *directly beneath the warning comment telling it not to* |
| `check:motion` | off-scale duration/easing | the motion scale sat unused from the first commit; a hand-written `duration-200` appeared in the same session it was fixed |
| `test:a11y` | broken ARIA, unreachable controls, invisible focus, unannounced state | Playwright + axe in a real browser. Found a `Tabs` with no `TabsContent` — `aria-controls` pointing at an id that didn't exist — on its first run |
| `registry` (in `build`) | components missing from the registry | 12 had gone missing, uninstallable, silently |

Behaviour tests live in `apps/docs/tests/`. Chromium only, deliberately: KOC is a
Windows/Edge organisation, and WebKit would be testing a browser no KOC user has.
`color-contrast` is disabled in axe because the token tests already assert it more
strictly, over pairs no page happens to render.

## Decisions already made — don't re-litigate without new information

- **Distribution is hybrid.** `@koc/tokens` via npm (central brand control) + components via
  the `@koc/*` shadcn registry (teams own the source they pull).
- **Recharts 3.8, deliberately.** It arrived as a side effect of installing `dashboard-01`
  and was then kept on purpose: today the blast radius is one file, and once chart wrappers
  land in `@koc/ui` and teams consume them a major-version move gets expensive. It fixes
  nothing about the StrictMode bug below — that workaround stays either way.
- **English-only, no RTL.** [ADR 0001](docs/adr/0001-english-only-no-rtl.md). Re-confirmed
  2026-08-09 against the wider org-standard scope, with the retrofit cost stated. Settled.
- **npm workspaces, not pnpm.** KOC teams will have npm.
- **Code is the source of truth; Figma is the sketching and handoff surface.**
- **Radix, not Base UI — for now.** Checked 2026-08-10, not assumed:
  shadcn's canonical registry still ships Radix (`radix-ui`, `asChild`,
  `data-[state=open]`); Base UI is `1.0.0-rc.0`, pre-stable; Radix 1.6.7 shipped
  more recently than Base UI did and has 1.7 in flight; adoption is ~28× wider.
  Migrating now would *break* invariant 5, which is defined against shadcn
  upstream. **Revisit when shadcn canonical moves** — that is the trigger, not
  when an individual kit does. Some kits (shadcn-space) have already moved and
  their components will not compile here; port the design, not the code.
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
- **39 registry items.** Dialog, tabs, combobox, date-range, page header, page nav, confirm
  dialog, notification menu and user menu all exist. The **list view** pattern is built.
- **Still missing:** toast, form layout, chart wrappers — plus the **detail view** and
  **KPI dashboard** patterns. Some of this is an *install* from the shadcn ecosystem rather
  than a build, because of invariant 5.
- **There is no data table in the shadcn registry.** `@shadcn/data-table` is named as a
  registry dependency but never published; only a `registry:example` exists, which the CLI
  will not install. Don't go looking for it again.
- **Installing a block pulls a lot.** `dashboard-01` added 12 dependencies — four `@dnd-kit`
  packages, `@tabler/icons-react` (a second icon library beside lucide), `next-themes`,
  `sonner`, `vaul`, `zod` — and silently bumped **recharts 2.15 → 3.8**. Check
  `git diff package.json` after every block install.
- **The registry hostname is aspirational.** `design.kockw.com` is a placeholder.
- **All DWOS app lists and the DDR column shape are placeholder.** The org structure is real;
  the workflows under each unit are invented. Replace before showing a KOC team.
- **Behaviour is tested in Chromium; no screen reader has been run.** The harness proves
  keyboard reach, visible focus, ARIA correctness and announced state. It cannot tell you what
  NVDA actually says — live-region politeness, table navigation mode, how `aria-sort` is
  voiced. That needs a real screen reader on Windows, periodically. KOC is a Windows/Edge
  organisation, so test NVDA + Edge, not VoiceOver.
- **Third-party registry items can write outside your configured aliases** and can inject
  theme blocks into your CSS entry. `@shadcn-space` items landed in `src/components/` despite
  `components.json` mapping components to `@/bakeoff`. Argument for `@koc` being the sanctioned
  registry, and for checking `git status` after any third-party install.

## Traps that have already cost time

- **Recharts lines render invisible under React 19 StrictMode.** Set
  `isAnimationActive={false}` on every `<Line>`. Diagnose via `stroke-dasharray` on
  `path.recharts-line-curve` — if it starts with `0px`, this is it.
  **Still present in recharts 3.8** — retested 2026-08-09 by removing the workaround under
  StrictMode: `stroke-dasharray: "0px, 858.606px"` on an 858px path at opacity 1. The
  workaround is not obsolete; do not remove it on the assumption that a major version fixed it.
- **WCAG contrast is the wrong tool for hue separation.** Use CIEDE2000 ΔE (`culori`'s
  `differenceCiede2000`), threshold ~15. But test luminance separately for greyscale.
- **A blank page after changing a dependency is Vite's dep cache, not your code.**
  Vite pre-bundles `node_modules` into `apps/docs/node_modules/.vite` and does not always
  re-optimise when the set of imported names changes. The tell is a console error naming an
  export that demonstrably exists — `does not provide an export named 'Form'` while
  `require('lucide-react').Form` is fine — usually with a stale `?v=<hash>` on the module URL.
  Run `npm run dev:clean`. It bit twice in one session: once blanking the site, once failing
  all 18 behaviour tests at once for reasons unrelated to the code under test. **If the whole
  suite goes red after a dependency change, suspect the cache before the change.**
  Confirm the code is fine with `npm run build --workspace=@koc/docs`, which is cache-independent.

- **Vite string aliases are prefix matches**, so an alias on `@koc/tokens` swallows
  `@koc/tokens/css`. Import generated CSS by relative path.
- **`StatCard` must not guess sentiment.** At an oil company "up" is not always good —
  production up is good, flaring up is reportable. `delta` carries arithmetic, `intent`
  carries meaning, and `intent` defaults to `"neutral"`.
