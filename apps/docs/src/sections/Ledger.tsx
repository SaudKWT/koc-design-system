import { useState, type ReactNode } from "react";
import {
  ClipboardList,
  Drill,
  Gauge,
  LogOut,
  Settings,
  UserRound,
} from "lucide-react";

import {
  Button,
  ConfirmDialog,
  DateRangeFilter,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  NotificationMenu,
  PageNav,
  StatusBadge,
  UserMenu,
  resolvePreset,
  toast,
  type DateRangeValue,
} from "@koc/ui";

import { LEDGER, ledgerSummary, type Stage } from "../bakeoff/ledger";
import { DEMO_TODAY } from "../examples/ddr-data";
import { PageHead, Section, Note, Pre } from "./parts";

/**
 * The staging ledger, rendered — and clickable.
 *
 * Answers three questions a design system usually cannot: what have we
 * evaluated, what did we keep, and what did it cost to keep it. Every promoted
 * entry ships a live instance, because a ledger you cannot poke is a document,
 * and documents are what this system exists to replace.
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

const NAV = [
  {
    label: "Reports",
    icon: ClipboardList,
    items: [
      { label: "Daily drilling", href: "/ddr" },
      { label: "NPT log", href: "/npt" },
    ],
  },
  { label: "Rigs", icon: Drill, href: "/rigs" },
  { label: "Performance", icon: Gauge, href: "/kpi" },
];

/** Live instances of what shipped, keyed by ledger id. */
function useDemos(): Record<string, ReactNode> {
  const [range, setRange] = useState<DateRangeValue>({
    preset: "7d",
    range: resolvePreset("7d", DEMO_TODAY),
  });
  const [confirm, setConfirm] = useState(false);
  const [record, setRecord] = useState(false);

  return {
    "@shadcn/sidebar": (
      <p className="text-sm text-muted-foreground">
        The full shell is on <strong className="text-foreground">Team dashboard shell</strong> —
        switch units, collapse the rail, open notifications. Too large to embed twice.
      </p>
    ),

    "@shadcn-space/radix/dialog-02": (
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setRecord(true)}>
          Record dialog
        </Button>
        <Button variant="outline" size="sm" onClick={() => setConfirm(true)}>
          Destructive confirm
        </Button>

        <Dialog open={record} onOpenChange={setRecord}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                BG-1042 <StatusBadge status="producing" />
              </DialogTitle>
              <DialogDescription>09 Aug · Rig KDC-12</DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Both dialogs rise from below rather than scaling from 95% — the entrance ported from
              dialog-02, on the KOC motion scale.
            </p>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title="Void report"
          subject="BG-1042"
          description="A voided report stays in the record with its figures excluded from unit totals."
          confirmLabel="Void report"
          onConfirm={() => {
            setConfirm(false);
            toast.success("Report BG-1042 voided");
          }}
        />
      </div>
    ),

    "@shadcn-space/radix/calendar-16": (
      <DateRangeFilter value={range} onChange={setRange} today={DEMO_TODAY} />
    ),

    "@shadcn-space/radix/calendar-14": (
      <div className="space-y-2">
        <DateRangeFilter value={range} onChange={setRange} today={DEMO_TODAY} />
        <p className="text-xs text-muted-foreground">
          Open it — the grouped Days / Weeks / Months presets are calendar-14's model.
        </p>
      </div>
    ),

    "@shadcn-space/radix/topbar-05": (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <NotificationMenu
            items={[
              {
                id: "1",
                severity: "critical",
                title: "MN-118 stuck pipe",
                description: "NPT past 24 hrs.",
                timestamp: "12 min ago",
              },
              {
                id: "2",
                severity: "warning",
                title: "RA-207 mud losses",
                timestamp: "1 hr ago",
              },
              { id: "3", severity: "info", title: "Reports submitted", read: true },
            ]}
            onMarkAllRead={() => toast.success("All notifications marked read")}
          />
          <UserMenu
            variant="compact"
            user={{ name: "Saud Alkharji", role: "Operational Support" }}
            groups={[
              [
                { id: "p", label: "Profile", icon: UserRound },
                { id: "s", label: "Settings", icon: Settings },
              ],
              [{ id: "o", label: "Sign out", icon: LogOut, destructive: true }],
            ]}
          />
          <span className="text-xs text-muted-foreground">← notifications, account</span>
        </div>
        <PageNav groups={NAV} activeHref="/ddr" />
      </div>
    ),
  };
}

export function Ledger() {
  const counts = ledgerSummary();
  const demos = useDemos();

  return (
    <>
      <PageHead
        title="Staging ledger"
        lead="Every third-party component this system has evaluated, what happened to it, and what
              the rewrite had to fix. Promoted entries render live — click them."
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
          which is why the “fixed on promotion” lists are worth reading before installing something
          new from the same source.
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
            {rows.map((e) => {
              const demo = demos[e.id];
              return (
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

                  {/* The live instance, where something shipped. This is what
                      makes the ledger a thing you can check rather than read. */}
                  {demo && (
                    <div className="border-b border-border bg-muted/30 px-4 py-4">
                      <p className="mb-3 text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Try what shipped
                      </p>
                      {demo}
                    </div>
                  )}

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
              );
            })}
          </Section>
        );
      })}
    </>
  );
}
