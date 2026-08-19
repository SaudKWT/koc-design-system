# The freeze pack — what cybersecurity approves

Assembled per [BASE-UI-MIGRATION.md](../BASE-UI-MIGRATION.md) Phase 5. The
pack freezes the *library*; the platform's own modules continue to ship
against it. Current artifacts were generated at **v0.2.0** (the
migration-complete tag) and MUST be regenerated at the freeze tag (`v1.0.0`)
before submission — the commands are below and take under a minute.

## Contents

| artifact | file | state |
|---|---|---|
| Release tag | `v0.2.0` (annotated) | ✅ cut; `v1.0.0` at freeze |
| Vendored snapshot | dwos-platform `web/vendor/koc-registry/` @ the tag | ✅ wholesale re-take verified (its commit `d37e018`) |
| SBOM — component library | [koc-ui.cdx.json](koc-ui.cdx.json) | ✅ CycloneDX, production deps, every version exact-pinned |
| SBOM — consumer app | [dwos-web.cdx.json](dwos-web.cdx.json) | ✅ CycloneDX, production deps |
| License inventory | [LICENSES.md](LICENSES.md) | ✅ generated from the SBOMs — **read the flags below** |
| Gate evidence | CI outputs at the tag | ✅ 42 Playwright tests, contrast (63 assertions), drift, motion, typecheck, registry, parity; consumer: tsc, build, 9-test a11y suite, roundtrip parity |
| Exposure audit + plan | [MIGRATION.md](../MIGRATION.md), [BASE-UI-MIGRATION.md](../BASE-UI-MIGRATION.md) | ✅ with per-phase measured results |
| **NVDA + Edge pass** | — | ❌ **PENDING — belongs in the approval evidence, not after it.** Windows + NVDA, over the docs site and the DWOS screens: menu/select/dialog announcement, `aria-sort` voicing, live-region politeness, table navigation mode. |

## License flags, stated plainly

1. **`react-leaflet@5.0.0` and `@react-leaflet/core@3.0.0` are
   Hippocratic-2.1** — an ethical-source license with use restrictions, not
   OSI-approved. It is a dependency of the **DWOS app's map**, not of the
   design system (`@koc/ui` is clean: MIT/ISC/BSD/Apache-2.0 throughout).
   Corporate legal review commonly rejects use-restricted licenses; the
   decision to keep, replace (leaflet itself is BSD-2-Clause — a thin
   hand-rolled wrapper is a day's work), or accept it belongs to whoever
   signs the approval. Do not let this surface for the first time inside
   the cybersecurity review.
2. The two `UNDECLARED` entries are this repo's own private workspace
   packages (`tokens`, `ui`), deliberately unpublished and `UNLICENSED`.

## Regenerating at the freeze tag

```bash
# from the design-system root, at the tag
npm sbom --omit dev --sbom-format cyclonedx -w @koc/ui > docs/freeze/koc-ui.cdx.json

# from dwos-platform/web, at its matching commit
npm sbom --omit dev --sbom-format cyclonedx > /tmp/dwos-web.cdx.json
```

Then re-run the inventory script (in git history of this file's commit) and
re-read the flags section against the diff.
