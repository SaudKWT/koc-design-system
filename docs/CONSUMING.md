# Using the KOC Design System in an app

For the KOC developer building an application against this system.

The repository stays **private**. Nothing is published. Access is granted per
person, by adding them as a collaborator on the repo — which is exactly the
control we wanted and could not get from GitHub Pages, where a published site is
world-readable on every plan below Enterprise Cloud.

Verified working end to end on 2026-08-11: a fresh project installed
`@koc/theme`, `@koc/app-shell` and `@koc/data-table`, pulled 20 component files
and their whole transitive graph, compiled with zero errors, and the brand token
arrived byte-exact at `#0060A9`.

## One-time setup

### 1. Get access

Ask Saud to add you as a collaborator on `SaudKWT/koc-design-system` with read
access. That is the whole permission model — no tokens to share, no org, and
access is revoked by removing the collaborator.

### 2. Create a token

GitHub → Settings → Developer settings → **Fine-grained personal access token**

- Repository access: **only** `SaudKWT/koc-design-system`
- Permissions: **Contents → Read-only**
- Expiry: whatever your policy allows

Scope it to that one repo. A classic token with `repo` scope would also work and
would grant far more than this needs.

### 3. Put the token in your environment

```bash
# ~/.zshrc, or your project's .env — never commit it
export KOC_REGISTRY_TOKEN="github_pat_..."
```

If you use `.env`, make sure it is in `.gitignore`. The CLI reads the variable
from `process.env`.

### 4. Point `components.json` at the registry

```json
{
  "registries": {
    "@koc": {
      "url": "https://api.github.com/repos/SaudKWT/koc-design-system/contents/apps/docs/public/r/{name}.json?ref=main",
      "headers": {
        "Authorization": "Bearer ${KOC_REGISTRY_TOKEN}",
        "Accept": "application/vnd.github.raw"
      }
    }
  }
}
```

The GitHub **Contents API**, not `raw.githubusercontent.com`. Raw URLs for a
private repo carry a short-lived token in the query string and expire; this URL
is stable and authenticates with the header.

`?ref=main` pins to the branch. Change it to a tag — `?ref=v0.1.0` — to pin a
version, which is what a production app should do.

## Installing

```bash
npx shadcn@latest add @koc/theme
```

**Install the theme first.** It writes the whole token layer into your CSS, and
every component assumes those variables exist. Installing a component first will
render it unstyled or, worse, plausibly wrong.

### Then two things the CLI cannot do for you

Both are silent. Skip either one and the app builds, runs, and is wrong in a way
that looks like a slightly different design system rather than like a bug.

**1. Import `tw-animate-css` yourself.** Installing the theme adds the package,
but the import has to be the second line of your CSS entry — `@import` must
precede every other rule, and the CLI appends. Without it, `animate-in`,
`fade-in-0` and `zoom-in-95` are inert classes and every tooltip, dropdown,
dialog and sheet pops into place.

```css
@import "tailwindcss";
@import "tw-animate-css";   /* must be here, not further down */
```

**2. Load Inter.** `--font-sans` names it first and falls through to the system
stack without it, so the app renders in the wrong typeface and asks for
contextual alternates (`cv02`, `cv03`, `cv04`, `cv11`) that only exist in Inter.

```html
<link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
```

Then take what you need:

```bash
npx shadcn@latest add @koc/app-shell @koc/data-table
```

Registry dependencies resolve automatically. `@koc/app-shell` alone pulls
sidebar, collapsible, dropdown-menu, notification-menu, user-menu, avatar and
the org model — you do not list them.

Browse what exists at `registry.json`, or run the docs site (`npm run dev` in
this repo) and read the component pages.

## What you own after installing

The source is copied into **your** repo. You can edit it. That is the point of
the shadcn model, and it is why teams are not blocked waiting on this repo.

Two things to know before you do:

**Re-running `add` overwrites your edits.** There is no merge. If you have
customised a component, do not re-add it without checking the diff first.

**Some things are load-bearing and are commented as such.** They exist because
of a specific failure, and removing them re-introduces it:

- `isAnimationActive={false}` on charts — without it, Recharts draws nothing at
  all under React 19 StrictMode. Still true in recharts 3.8.
- `--input` is a different token from `--border`. An input's boundary is the only
  cue the control exists and must clear 3:1; a card edge is exempt.
- `StatCard`'s `intent` is separate from `delta`, because at an oil company "up"
  is not always good. Production up is good; flaring up is reportable.
- `StatusBadge` takes a status, not a colour — it derives colour, icon and label
  together, so colour alone can never be the only signal.

## No GitHub access? Vendor the registry

The setup above needs `api.github.com` reachable and a per-person token that
expires. Inside KOC that is not a safe assumption, and a build agent on a locked
-down network cannot use it at all.

The alternative is to copy the registry into your own repo. This is what the DWOS
platform does, and it is the recommended shape for anything being handed to KOC
for deployment.

**First, understand what is and isn't affected.** `shadcn add` is a one-shot
build-time operation — component source is copied into your repo and committed.
**Building and deploying never touch the registry or the network either way.**
Vendoring only changes where the CLI looks when you *add* a component.

**Copy the registry in:**

```bash
mkdir -p vendor/koc-registry
# from a checkout of this repo, at the tag you want
git -C <design-system> ls-tree --name-only v0.1.2:apps/docs/public/r \
  | xargs -I{} sh -c 'git -C <design-system> show v0.1.2:apps/docs/public/r/{} > vendor/koc-registry/{}'
echo v0.1.2 > vendor/koc-registry/VERSION
```

Read them at a **tag**, via `git show` rather than out of a working tree, so an
uncommitted experiment here cannot end up in someone's handoff.

**Point `components.json` at loopback, and serve the folder for the length of the
command:**

```json
{ "registries": { "@koc": "http://127.0.0.1:4183/{name}.json" } }
```

You cannot point the CLI at the folder directly. A relative path resolves against
`https://ui.shadcn.com/r/`, and a `file://` URL returns *"not implemented...
yet..."* — both verified against the CLI on 2026-08-12. Serving over loopback is
the workaround, and it keeps the real CLI in the loop, so `registryDependencies`,
import rewriting and overwrite behaviour all stay exactly as documented rather
than being reimplemented.

Any static server over `vendor/koc-registry/` on that port will do. The DWOS
platform's `web/scripts/koc-registry.mjs` does it in about fifty lines and wraps
`add` so the server's lifetime is one command; copy it rather than writing your
own.

**The tradeoff:** the vendored copy is a snapshot. It goes stale until someone
re-copies it. In exchange, a design-system update reaches you as a reviewable
diff in your own repo instead of a silent fetch, which is the better story when
the person deploying is not the person who changed the design system.

## Updating

There is no automatic update. Re-run `add` for a component to take the newer
version, and read the diff — you may have local edits.

Pin `?ref=v0.1.2` in `components.json` if you want a fixed version rather than
whatever is on `main`. A production app should.

### Three things that will cost you an afternoon

All three found in a real consumer, none of them obvious:

**`--overwrite` is required to refresh a file that already exists.** Without it
the CLI prompts, and in a script it simply stops with no error.

**One item per invocation.** Passing many items to a single `shadcn add` joins
them into one argument and 404s. Verified with 36.

**After a version bump, re-add *everything*, not just the theme.** This is the
one that actually bit. A consumer on `v0.1.0` bumped the pin to `v0.1.1` and
re-added only `@koc/theme`; twelve components then sat on the old version for a
day, carrying bugs this repo had already fixed. Nothing failed — they simply
weren't the current components.

```bash
# upgrade the whole app
for i in $(ls src/components/ui/*.tsx | xargs -n1 basename | sed 's/.tsx//'); do
  npx shadcn@latest add "@koc/$i" --yes --overwrite
done
npx tsx <design-system>/packages/tokens/src/check-motion.ts src
```

### What changes when you upgrade the type scale

`v0.1.2` shipped the KOC type scale for the first time. It is not additive —
KOC's steps differ from Tailwind's defaults, so text sizes move app-wide:

| | Tailwind default | KOC |
|---|---|---|
| `text-sm` | 0.875rem (14px) | **0.8125rem (13px)** |
| `text-base` | 1rem (16px) | **0.875rem (14px)** |
| `text-2xs` | *does not exist* | 0.6875rem (11px) |
| `text-md` | *does not exist* | 1rem (16px) |

Expect the whole app to re-flow slightly on that upgrade. Before it, `text-2xs`
and `text-md` matched no rule at all and the text silently inherited its parent
size — so badges, timestamps and `size="lg"` buttons were rendering too large.

## Troubleshooting

**`Failed to load tsconfig.json`** — the CLI needs one at the project root, even
for a non-TypeScript project.

**401 / 404 from the registry** — the token is missing, expired, or not scoped to
this repo. Check with:

```bash
echo $KOC_REGISTRY_TOKEN | head -c 8
```

**A component looks unstyled** — you installed it before `@koc/theme`.

## What is not here

- **Form layout.** Deliberately deferred until real KOC forms exist; every form
  abstraction encodes assumptions about validation and submission, and those
  should come from three real forms rather than from imagination.
- **The org chart.** `TeamConfig` is a shape; the real directorates, teams and
  units live in the app, not in the system.
- **Anything Base UI.** This system is Radix, matching shadcn canonical. Kits
  that have moved to Base UI (`render={<Button/>}`, `data-open:`) will not
  compile against these components — port the design, not the code.
