import { fontSize, fontWeight, spacing, radius } from "@koc/tokens";

import { PageHead, Section, Demo, Note, Code } from "./parts";

const SAMPLES: [keyof typeof fontSize, string][] = [
  ["5xl", "Display"],
  ["4xl", "Hero KPI value"],
  ["3xl", "KPI value"],
  ["2xl", "Page title"],
  ["xl", "Section heading"],
  ["lg", "Card title"],
  ["md", "Long-form reading"],
  ["base", "Body — the default"],
  ["sm", "Secondary body, table cells"],
  ["xs", "Labels, captions, axis ticks"],
  ["2xs", "Dense table cells, badges"],
];

export function Typography() {
  return (
    <>
      <PageHead
        title="Typography"
        lead="Inter, replacing Tahoma. Chosen for three things KOC dashboards need and Tahoma
              cannot provide: a real weight axis, legibility at small sizes, and true tabular
              figures."
      />

      <Section
        title="Why Inter"
        description="KOC currently renders 471 elements in Tahoma — a 1994 screen font designed for
                     800×600 CRTs. It ships regular and bold and nothing between, spaces loosely,
                     and has no tabular numerals."
      >
        <Demo>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tahoma — proportional figures
              </div>
              <table
                className="w-full text-sm"
                style={{ fontFamily: "Tahoma, sans-serif", fontVariantNumeric: "normal" }}
              >
                <tbody>
                  {["118,402", "97,111", "1,004,286", "11,911"].map((n) => (
                    <tr key={n}>
                      {/* Explicitly proportional, to show what KOC ships today. */}
                      <td className="py-0.5 text-right" style={{ fontVariantNumeric: "normal" }}>
                        {n}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                The 1s are narrow. Digits don't sit in columns, so the eye can't scan down.
              </p>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Inter — tabular figures
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {["118,402", "97,111", "1,004,286", "11,911"].map((n) => (
                    <tr key={n}>
                      <td className="py-0.5 text-right">{n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Every digit occupies the same width. The column aligns, so it can be compared.
              </p>
            </div>
          </div>
        </Demo>
        <div className="mt-4">
          <Note title="Tabular figures are applied automatically">
            Table body cells and anything marked <Code>data-slot="kpi-value"</Code> get{" "}
            <Code>font-variant-numeric: tabular-nums</Code> from the base layer. You do not need to
            remember — but do right-align numeric columns, or the alignment buys you nothing.
          </Note>
        </div>
      </Section>

      <Section
        title="Scale"
        description={
          <>
            Denser at the small end than an editorial scale, because dashboard chrome lives between
            11 and 14px and needs real steps there. Body defaults to <Code>base</Code> (14px), not
            16 — dashboards are information-dense and 16px body forces scrolling that costs more
            than the legibility it buys.
          </>
        }
      >
        <Demo className="space-y-3">
          {SAMPLES.map(([key, label]) => (
            <div key={key} className="flex items-baseline gap-5 border-b pb-3 last:border-0">
              <div className="w-28 shrink-0">
                <div className="font-mono text-xs font-medium">{key}</div>
                <div className="font-mono text-2xs text-muted-foreground">{fontSize[key]}</div>
              </div>
              <div
                className="min-w-0 flex-1 truncate"
                style={{
                  fontSize: fontSize[key],
                  lineHeight: 1.25,
                  letterSpacing: key.includes("xl") ? "-0.02em" : undefined,
                  fontWeight: key.includes("xl") || key === "lg" ? 600 : 400,
                }}
              >
                {label}
              </div>
            </div>
          ))}
        </Demo>
      </Section>

      <Section title="Weight" description="Four weights. UI labels default to medium — 400 reads limp in dense chrome.">
        <Demo className="space-y-2">
          {Object.entries(fontWeight).map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-5">
              <div className="w-28 shrink-0 font-mono text-xs text-muted-foreground">
                {k} · {v}
              </div>
              <div className="text-md" style={{ fontWeight: v }}>
                Kuwait Oil Company — production summary
              </div>
            </div>
          ))}
        </Demo>
      </Section>

      <Section
        title="Space & radius"
        description="A 4px base grid. Four, not eight, because dashboard chrome genuinely needs the
                     half-steps — a badge with 8px padding is bloated and 4px is cramped."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Demo>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Spacing
            </div>
            <div className="space-y-1.5">
              {(["1", "2", "3", "4", "6", "8", "12", "16"] as const).map((k) => (
                <div key={k} className="flex items-center gap-3">
                  <span className="w-8 font-mono text-2xs text-muted-foreground">{k}</span>
                  <div className="h-3 rounded-sm bg-primary" style={{ width: spacing[k] }} />
                  <span className="font-mono text-2xs text-muted-foreground">{spacing[k]}</span>
                </div>
              ))}
            </div>
          </Demo>
          <Demo>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Radius
            </div>
            <div className="flex flex-wrap gap-3">
              {Object.entries(radius).map(([k, v]) => (
                <div key={k} className="text-center">
                  <div
                    className="size-12 border-2 border-primary bg-primary/10"
                    style={{ borderRadius: v }}
                  />
                  <div className="mt-1 font-mono text-2xs text-muted-foreground">{k}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              6px on the default control. Fully rounded would read as a different company; square
              reads as unmaintained.
            </p>
          </Demo>
        </div>
      </Section>
    </>
  );
}
