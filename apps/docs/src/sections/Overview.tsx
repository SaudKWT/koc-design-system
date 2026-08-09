import { Badge, Card } from "@koc/ui";
import { KOC_PRIMARY, KOC_LEGACY_STACK } from "@koc/tokens";

import { PageHead, Section, Pre, Note, Code } from "./parts";

export function Overview() {
  return (
    <>
      <PageHead
        title="KOC Design System"
        lead="A React and shadcn/ui foundation for Kuwait Oil Company's dashboards and internal
              applications. One brand, one accessibility standard, one set of tokens — so that
              every KOC team ships something that looks and behaves like KOC."
      />

      <Section
        title="Where the brand came from"
        description="Every colour in this system is traceable to evidence, not taste. The palette was
                     recovered by loading kockw.com in a real browser and reading its stylesheets,
                     counting colours per-sheet so KOC's hand-authored CSS could be separated from
                     the Bootstrap defaults the site happens to ship."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-5">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Brand anchor
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div
                className="size-12 shrink-0 rounded-md border"
                style={{ background: KOC_PRIMARY.value }}
              />
              <div>
                <div className="font-mono text-lg font-semibold">{KOC_PRIMARY.value}</div>
                <Badge variant="success" className="mt-1">
                  confirmed
                </Badge>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {KOC_PRIMARY.source}. It is pinned exactly at{" "}
              <Code>koc-primary-600</Code> and the whole ramp is generated around it.
            </p>
          </Card>

          <Card className="p-5">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              What we're replacing
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Type</dt>
                <dd className="text-right font-mono text-xs">{KOC_LEGACY_STACK.value.fonts}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">CSS</dt>
                <dd className="font-mono text-xs">{KOC_LEGACY_STACK.value.css}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Platform</dt>
                <dd className="font-mono text-xs">{KOC_LEGACY_STACK.value.platform}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              kockw.com today. Tahoma is a 1994 screen font with two weights and no tabular
              figures — the single biggest reason KOC dashboards read as dated.
            </p>
          </Card>
        </div>

        <div className="mt-4">
          <Note kind="warn" title="A correction worth recording">
            Public brand aggregators and several AI-generated SEO pages describe the KOC logo as a
            “blue, gold and red oil droplet”. That is false. The real mark — verified by rendering
            the official SVG — is a white falcon in an oval ring with bilingual Arabic/English
            wordmarks, and it carries no colour of its own. Do not reintroduce gold or red as brand
            colours on the strength of those pages.
          </Note>
        </div>
      </Section>

      <Section
        title="How it fits together"
        description="Three layers. Each one depends only on the layer beneath it, which is what lets
                     KOC re-theme centrally without any team rewriting a component."
      >
        <div className="space-y-3">
          {[
            {
              n: "1",
              name: "@koc/tokens",
              desc: "The source of truth. Ramps generated in OKLCH from the brand anchor; semantic tokens for light and dark; type, space, radius, elevation and motion. Emits CSS, DTCG JSON for Figma, and typed values for charts.",
              dist: "npm package — versioned, centrally controlled",
            },
            {
              n: "2",
              name: "@koc/ui",
              desc: "shadcn/ui primitives wearing the KOC design language, plus the components KOC actually needs that shadcn has no opinion about — operational status, KPI cards.",
              dist: "shadcn registry — teams own the source they pull",
            },
            {
              n: "3",
              name: "Your dashboard",
              desc: "Composes the above. Because the token names match the shadcn contract exactly, anything from ui.shadcn.com, Origin UI or Kibo UI drops in already on-brand.",
              dist: "per-team",
            },
          ].map((l) => (
            <Card key={l.n} className="flex gap-4 p-5">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {l.n}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{l.name}</span>
                  <Badge variant="outline">{l.dist}</Badge>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{l.desc}</p>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        title="Using it in a KOC project"
        description={
          <>
            Tokens arrive as a versioned package so KOC can push a brand fix everywhere at once.
            Components arrive through the registry so your team owns the source and can fork a
            component without waiting on anyone.
          </>
        }
      >
        <Pre>{`# 1. Tokens — the brand, centrally versioned
npm install @koc/tokens

# 2. Point shadcn at the KOC registry (components.json)
{
  "registries": {
    "@koc": "https://design.kockw.com/r/{name}.json"
  }
}

# 3. Pull components. The source lands in your repo — you own it.
npx shadcn@latest add @koc/button @koc/stat-card @koc/status-badge`}</Pre>

        <div className="mt-4">
          <Note title="Why this split">
            A pure npm component library would stop teams customising anything, which fights how
            shadcn works and guarantees they fork the whole thing. A pure registry would let the
            brand drift the moment someone edits a colour. Tokens centrally, components locally:
            KOC keeps control of what makes it KOC, teams keep control of everything else.
          </Note>
        </div>
      </Section>
    </>
  );
}
