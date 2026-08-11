import { useMemo, useState } from "react";
import { Download, History, Pencil, Trash2 } from "lucide-react";

import {
  Button,
  ConfirmDialog,
  DataTable,
  PageHeader,
  StatCard,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  kocColumnHelper,
  toast,
} from "@koc/ui";

import { DDR_ROWS, type DdrRow } from "../examples/ddr-data";
import { PageHead, Section, Note } from "./parts";

/**
 * Detail view — one record, in full.
 *
 * The third and last pattern. List view answers "show me the records", KPI
 * dashboard answers "how are we doing", this answers "what happened on this
 * one". Between them they cover almost every screen a KOC unit app needs.
 *
 * The dialog in list view is deliberately NOT this. A dialog is for a glance
 * you return from; this is for a record you work on — it has a URL, it can be
 * linked in an email, and it can hold more than fits in a modal.
 */

const RECORD = DDR_ROWS[0];

interface AuditRow extends Record<string, unknown> {
  id: string;
  at: string;
  who: string;
  action: string;
}

const AUDIT: AuditRow[] = [
  { id: "a1", at: "09 Aug 06:12", who: "A. Al-Rashidi", action: "Report submitted" },
  { id: "a2", at: "09 Aug 07:40", who: "S. Alkharji", action: "Depth corrected 9,438 → 9,450 ft" },
  { id: "a3", at: "09 Aug 08:05", who: "M. Haddad", action: "Approved" },
];

const auditCol = kocColumnHelper<AuditRow>();

export function DetailViewPattern() {
  const [confirming, setConfirming] = useState(false);
  const [voided, setVoided] = useState(false);

  const auditColumns = useMemo(
    () =>
      auditCol.columns([
        auditCol.accessor("at", { header: "When" }),
        auditCol.accessor("who", { header: "Who" }),
        auditCol.accessor("action", { header: "What changed" }),
      ]),
    [],
  );

  return (
    <>
      <PageHead
        title="Detail view"
        lead="One record, in full — what 'Open full report' leads to. The third pattern, completing
              list → detail → dashboard."
      />

      <Note kind="warn" title="Placeholder record">
        Same invented daily drilling report as list view. The audit entries and names are made up
        too. The arrangement is the argument, not the data.
      </Note>

      <Section
        title="The screen"
        description="In a real app this has its own URL and sits inside AppShell."
      >
        <div className="rounded-lg border border-input p-5">
          <PageHeader
            /* The record's own identity, not the screen's function. "Daily
               Drilling Report" is what the list is called; this page is about
               BG-1042 on 09 Aug, and that is what belongs in the h1 and the
               browser tab. */
            title={`${RECORD.well} — 09 Aug 2026`}
            description={`Rig ${RECORD.rig} · Unit 1, North & West + Heavy Oil`}
            /* The way back is not optional. Someone arriving from a link in an
               email has no list to press Back to, and browser-back is not a
               navigation affordance you can see. */
            breadcrumbs={[
              { label: "Daily Drilling Reports", href: "#" },
              { label: `${RECORD.well} — 09 Aug` },
            ]}
            meta={
              <>
                {voided ? (
                  <span className="rounded border border-input px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                    Voided
                  </span>
                ) : (
                  <StatusBadge status={RECORD.status} />
                )}
                <span className="text-xs text-muted-foreground">
                  Submitted 06:12 · approved 08:05
                </span>
              </>
            }
            actions={
              <>
                <Button variant="outline" size="sm">
                  <Download aria-hidden className="mr-1.5 size-3.5" />
                  Export
                </Button>
                <Button variant="outline" size="sm" disabled={voided}>
                  <Pencil aria-hidden className="mr-1.5 size-3.5" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  disabled={voided}
                  onClick={() => setConfirming(true)}
                >
                  <Trash2 aria-hidden className="mr-1.5 size-3.5" />
                  Void
                </Button>
              </>
            }
          />

          {/* The figures that matter, before anything you have to read. Same
              rule as the KPI dashboard: a number at a glance, then the detail. */}
          <div className="grid gap-4 py-5 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Depth" value={RECORD.depth.toLocaleString("en-GB")} unit="ft" />
            <StatCard label="Footage" value={RECORD.footage.toLocaleString("en-GB")} unit="ft" />
            <StatCard label="Rotating hours" value={RECORD.hours.toFixed(2)} />
            <StatCard
              label="NPT"
              value={RECORD.npt.toFixed(2)}
              unit="hrs"
              intent="lower-is-better"
            />
          </div>

          <Tabs defaultValue="report">
            <TabsList>
              <TabsTrigger value="report">Report</TabsTrigger>
              <TabsTrigger value="audit" className="gap-1.5">
                <History aria-hidden className="size-3.5" />
                History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="report" className="pt-4">
              {/* A definition list, not a table. One record's fields are pairs,
                  and a two-column table of them is a table with one row wearing
                  a disguise — it announces as tabular data to a screen reader
                  and sorts nothing. */}
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["Well", RECORD.well],
                  ["Rig", RECORD.rig],
                  ["Date", "09 Aug 2026"],
                  ["Hole section", '12¼"'],
                  ["Mud weight", "10.2 ppg"],
                  ["Bit hours", "18.5"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="mt-0.5 text-sm font-medium tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-6">
                <p className="text-xs text-muted-foreground">Operations summary</p>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed">{RECORD.summary}</p>
              </div>
            </TabsContent>

            <TabsContent value="audit" className="pt-4">
              {/* An operations record at a state company needs to say who changed
                  what and when. Nobody asks for this until the first time a
                  figure is disputed, and then it is the only thing anyone wants. */}
              <DataTable
                caption="Change history for this report — who changed what, and when"
                columns={auditColumns}
                data={AUDIT}
                pageSize={10}
                empty={{ title: "No changes recorded" }}
              />
            </TabsContent>
          </Tabs>
        </div>
      </Section>

      <Section
        title="Why this and not the dialog"
        description="List view already opens a record. This is a different job, and mixing them is
                     the usual mistake."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-card p-4">
            <div className="text-sm font-medium">Dialog — a glance</div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              You are scanning a list and want to check one row without losing your place. No URL,
              no history, holds only what fits.
            </p>
          </div>
          <div className="rounded-md border border-primary bg-accent/40 p-4">
            <div className="text-sm font-medium">Detail view — a record you work on</div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Has a URL, so it can be linked in an email or a ticket. Holds tabs, history and
              actions that change the record.
            </p>
          </div>
        </div>

        <ul className="mt-4 space-y-2 text-sm">
          {[
            "The h1 is the record's identity, not the screen's function. This page is about BG-1042 on 09 Aug — that is what belongs in the heading and the browser tab.",
            "The breadcrumb back to the list is not optional. Someone arriving from a link has no list to go back to, and browser-back is not an affordance you can see.",
            "State before content: voided or not, approved or not, visible in the header. A record whose status you discover by reading is a record someone will act on wrongly.",
            "Figures before prose — the same rule as the KPI dashboard.",
            "Fields are a definition list, not a two-column table. A table of one record announces as tabular data and sorts nothing.",
            "History is a tab, not a page. Nobody asks for an audit trail until a figure is disputed, and then it is the only thing they want.",
          ].map((t) => (
            <li key={t} className="flex gap-2">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </Section>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Void report"
        subject={`${RECORD.well} — 09 Aug`}
        description="A voided report stays in the record with its figures excluded from unit totals. The change is written to the history tab."
        confirmLabel="Void report"
        onConfirm={() => {
          setVoided(true);
          setConfirming(false);
          toast.success(`Report ${RECORD.well} voided`, {
            description: "Recorded in the change history.",
          });
        }}
      />
    </>
  );
}
