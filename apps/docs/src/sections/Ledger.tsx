import { LEDGER, ledgerSummary, type Stage } from "../bakeoff/ledger";
import { PageHead, Section, Note, Pre } from "./parts";

/**
 * The staging ledger, rendered.
 *
 * Answers three questions a design system usually cannot: what have we
 * evaluated, what did we keep, and what did it cost to keep it.
 */

const STAGE: Record<Stage, { label: string; cls: string; blurb: string }> = {
  promoted: {
    label: "Promoted",
    cls: "border-success text-success",
    blurb: "Rewritten into @koc/ui. Subject to every gate.",
  },
  partial: {
    label: "Partly lifted",
    cls: "border-warning text-warning",
    blurb: "Pieces taken, the rest deliberately left.",
  },
  staged: {
    label: "Staged",
    cls: "border-primary text-primary",
    blurb: "Installed and rendering. Not yet decided.",
  },
  rejected: {
    label: "Declined",
    cls: "border-input text-muted-foreground",
    blurb: "Evaluated and not adopted. Kept for the record.",
  },
};

const ORDER: Stage[] = ["promoted", "partial", "staged", "rejected"];

export function Ledger() {
  const counts = ledgerSummary();

  return (
    <>
      <PageHead
        title="Staging ledger"
        lead="Every third-party component this system has evaluated, what happened to it, and what
              the rewrite had to fix. Read this before installing anything new."
      />

      <Section
        title="The pipeline"
        description="Two stages, and one rule that makes the second one mean something."
      >
        <Pre>{`install  →  bakeoff/      staged. Compiles, renders, gated by nothing.
                          Never imported by @koc/ui.
    ↓
approve  →  @koc/ui       promoted. Subject to every gate:
                          contrast · token drift · motion scale · a11y · registry`}</Pre>

        <Note kind="note" title="Promotion is a rewrite, not a move">
          Nothing has ever crossed unchanged. Every component arrived with at least one of:
          off-scale motion, hardcoded content that forty apps cannot share, or a coupling to its own
          shell. The rewrite is where those get fixed and where KOC-specific meaning gets added —
          which is also why the “fixed on promotion” lists below are worth reading before installing
          something new from the same source.
        </Note>

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          {ORDER.map((s) => (
            <div key={s} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">{STAGE[s].label}</span>
                <span className="text-2xl font-semibold tabular-nums">{counts[s]}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{STAGE[s].blurb}</p>
            </div>
          ))}
        </div>
      </Section>

      {ORDER.map((stage) => {
        const rows = LEDGER.filter((e) => e.stage === stage);
        if (!rows.length) return null;
        return (
          <Section key={stage} title={STAGE[stage].label} description={STAGE[stage].blurb}>
            {rows.map((e) => (
              <div key={e.id} className="mb-4 rounded-lg border border-border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{e.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{e.id}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {e.source} · installed {e.installed}
                  </span>
                </div>

                <div className="space-y-3 px-4 py-3">
                  {e.landedAs && (
                    <div>
                      <p className="text-xs font-medium text-success">Shipped as</p>
                      <p className="mt-0.5 font-mono text-sm">{e.landedAs.join(" · ")}</p>
                    </div>
                  )}

                  {e.fixedOnPromotion && e.fixedOnPromotion.length > 0 && (
                    <div>
                      <p className="text-xs font-medium">Fixed on promotion</p>
                      <ul className="mt-1 space-y-1">
                        {e.fixedOnPromotion.map((f) => (
                          <li key={f} className="flex gap-2 text-sm text-muted-foreground">
                            <span
                              aria-hidden
                              className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground"
                            />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {e.note && <p className="text-sm text-muted-foreground">{e.note}</p>}
                </div>
              </div>
            ))}
          </Section>
        );
      })}
    </>
  );
}
