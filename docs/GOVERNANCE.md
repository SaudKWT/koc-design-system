# Governance — who changes what, and how a change reaches a KOC team

This codifies how the system already runs; nothing here is aspirational.
Where a rule has a reason, the reason is stated, because rules without
reasons get "simplified" away by the first person in a hurry.

## Roles

- **The design owner** (Saud) owns tokens, components, the registry, and
  this repo's decisions. Design happens here; Figma is a sketching and
  handoff surface, never a source of truth (a colour edited in Figma has
  passed no test).
- **The deploying developer** (KOC) builds and ships consuming apps. They
  install from the registry and own the source they pull — the shadcn
  model. They do not edit this repo.
- **Consuming teams** get components the same way and inherit the same
  contract: what the registry ships is the product; the docs site is not.

## How a change ships

1. Change lands on `main` with **every gate green** — contrast, drift,
   motion, typecheck, registry, parity, behaviour. A red gate is not a
   negotiation; the gates exist because each one marks a place
   documentation already failed.
2. A change reaches a consumer **only at a tag**. Vendored consumers read
   `git show <tag>` — an untagged commit is invisible in the worst way:
   nothing fails, the app just builds against yesterday. `npm run
   release:status` shows the gap and the consumer-visible payload diff,
   which is the honest changelog (hand-written notes have already missed a
   type-scale change that reflowed every table in a consuming app).
3. The consumer re-adds changed items **and their importers** — a type
   change flows through vendored copies, and `tsc` in the consumer names
   the ripple (`command` broke first; the rule is in their HANDOFF).

## The freeze

KOC approves the component library through cybersecurity **once**; it
freezes at approval. That constraint shaped the Base UI migration and it
shapes everything after:

- `v1.0.0` is the freeze tag. What is approved is the tag's bytes — the
  vendored snapshot, the SBOM, the license inventory, the gate evidence and
  the NVDA pass, assembled in [freeze/](freeze/README.md).
- The freeze covers the **library**. Consuming apps keep shipping their own
  modules against it.
- Post-freeze, exactly three kinds of change exist:
  1. **Security patch** — a CVE in a pinned dependency. Fix on `main`, tag,
     and take it through re-approval as a delta (the SBOM diff *is* the
     submission). This is why every version is exact-pinned: the delta is
     enumerable.
  2. **Defect fix** — same path. A defect report from a consumer starts as
     a consumer report (below), not as a patch in the consuming app;
     locally patched vendored files die at the next re-add.
  3. **New component** — batched into the next approval cycle, not slipped
     into a "patch". Between cycles a team may build app-side against the
     frozen tokens; candidates for promotion go through the bakeoff ledger
     like everything else (nothing has ever crossed from `bakeoff/` to
     `@koc/ui` unchanged).

## The contribution bar

- Tokens: never a hand-written hex outside `packages/tokens/src`; contrast
  assertions change only when the colour does.
- Components: semantic tokens only; motion from the scale; **Base UI only**
  — no new Radix or other primitive coupling. Third-party components are
  **ports, not installs**, permanently under the freeze; shadcn's registry
  flipping to Base is the only event that reopens that question, and then
  as reconciliation, not as free-install.
- Every third-party origin is logged in the staging ledger with what the
  rewrite had to fix.

## Feedback

Consumer reports (`docs/consumer-reports/`) are the channel, because the
monorepo structurally cannot see distribution bugs — five shipped ones were
invisible from inside. A report is measured in a built app, not inferred.
"It looks right on the docs site" is no evidence at all.

## Reopening decisions

Settled decisions (the list in CLAUDE.md) reopen on **new information
only** — the Base UI migration is the model: a settled wait-for-upstream
call, reopened by the approve-once constraint, with the reasoning recorded
before the work started. Preference is not new information. Record
reversals where the original decision lives; keep the superseded reasoning
in place, marked, because deleted history is how the same argument gets
re-had a year later.
