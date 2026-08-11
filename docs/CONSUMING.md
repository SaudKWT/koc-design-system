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

## Updating

There is no automatic update. Re-run `add` for a component to take the newer
version, and read the diff — you may have local edits.

Pin `?ref=v0.1.0` in `components.json` if you want a fixed version rather than
whatever is on `main`.

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
