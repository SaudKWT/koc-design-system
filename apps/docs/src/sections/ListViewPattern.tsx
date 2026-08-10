import { useMemo, useState } from "react";
import {
  ClipboardList,
  Download,
  Drill,
  FileBarChart,
  Gauge,
  Maximize2,
  Package,
  Plus,
  Timer,
  Trash2,
} from "lucide-react";

import {
  Button,
  Combobox,
  ConfirmDialog,
  DataTable,
  DateRangeFilter,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  PageHeader,
  PageNav,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  cn,
  kocColumnHelper,
  resolvePreset,
  toast,
  type DateRangeValue,
} from "@koc/ui";

import { DDR_ROWS, RIGS, WELLS, DEMO_TODAY, type DdrRow } from "../examples/ddr-data";
import { PageHead, Section, Note } from "./parts";

/**
 * List view — the pattern every KOC unit app is a variation of.
 *
 * Roughly forty apps across DWOS alone are "a list of things you filter, sort
 * and open". Building that once properly and configuring the rest is the same
 * bet TeamConfig makes for navigation, one level down.
 *
 * The composition, top to bottom: PageHeader (identity + actions) → filter bar
 * (scope) → DataTable (the list) → Dialog (one record). Nothing here is novel;
 * fixing the *arrangement* is the point, so a user moving between two KOC apps
 * finds the same things in the same places.
 */

const col = kocColumnHelper<DdrRow>();

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

export function ListViewPattern() {
  const [dateRange, setDateRange] = useState<DateRangeValue>({
    preset: "7d",
    range: resolvePreset("7d", DEMO_TODAY),
  });
  const [rig, setRig] = useState<string>("all");
  const [well, setWell] = useState<string | undefined>();
  const [open, setOpen] = useState<DdrRow | null>(null);
  const [confirming, setConfirming] = useState<DdrRow | null>(null);
  const [voided, setVoided] = useState<string[]>([]);

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("date", {
          header: "Date",
          cell: ({ row }) => fmtDate(row.original.date),
        }),
        col.accessor("well", { header: "Well" }),
        col.accessor("rig", { header: "Rig" }),
        col.accessor("depth", {
          header: "Depth (ft)",
          meta: { numeric: true },
          cell: ({ row }) => row.original.depth.toLocaleString("en-GB"),
        }),
        col.accessor("footage", {
          header: "Footage (ft)",
          meta: { numeric: true },
          cell: ({ row }) => row.original.footage.toLocaleString("en-GB"),
        }),
        col.accessor("npt", {
          header: "NPT (hrs)",
          meta: { numeric: true },
          cell: ({ row }) => row.original.npt.toFixed(2),
        }),
        col.accessor("status", {
          header: "Status",
          cell: ({ row }) =>
            voided.includes(row.original.id) ? (
              // A voided report stays in the list. Removing it would hide the
              // fact that it ever existed, which is the opposite of what an
              // auditable operations record needs.
              <span className="text-xs font-medium text-muted-foreground">Voided</span>
            ) : (
              <StatusBadge status={row.original.status} />
            ),
        }),
        col.display({
          id: "open",
          header: "",
          cell: ({ row }) => (
            <Button
              variant="ghost"
              size="sm"
              className="-my-1"
              onClick={() => setOpen(row.original)}
            >
              Open
            </Button>
          ),
        }),
      ]),
    // `voided` is a real dependency — without it the status cell would keep
    // rendering the pre-void badge from a stale closure.
    [voided],
  );

  // Filtering happens here rather than inside DataTable on purpose: scope
  // filters belong to the screen (they are what the URL should encode), while
  // the table's own search is a refinement within the current scope.
  const rows = useMemo(() => {
    const from = dateRange.range?.from;
    const to = dateRange.range?.to;
    return DDR_ROWS.filter((r) => {
      const d = new Date(r.date);
      if (from && d < new Date(from.toDateString())) return false;
      if (to && d > new Date(to.toDateString())) return false;
      if (rig !== "all" && r.rig !== rig) return false;
      if (well && r.well !== well) return false;
      return true;
    });
  }, [dateRange, rig, well]);

  return (
    <>
      <PageHead
        title="List view"
        lead="The pattern most KOC unit apps are a variation of — filter, scan, open. Page header,
              filter bar, data table, record dialog, composed in a fixed arrangement."
      />

      <Note kind="warn" title="Every field below is a placeholder">
        The column shape — date, well, rig, depth, footage, NPT, status — is a plausible guess at a
        daily drilling report and has <strong>not</strong> been checked against a real one. Well
        names, rig numbers and all figures are invented. Fine for building the pattern, wrong for
        showing a drilling engineer. Replace with the real report fields before this goes in front
        of anyone at KOC.
      </Note>

      <Section
        title="The screen"
        description="Rendered at full width below the docs chrome. In a real app this sits inside
                     AppShell, where the sidebar supplies the unit context."
      >
        <div className="rounded-lg border border-input p-5">
          <PageHeader
            title="Daily Drilling Reports"
            description="One report per well per day. Filter by period, rig or well; open a row for the full record."
            breadcrumbs={[
              { label: "Unit 1 — North & West + Heavy Oil", href: "#" },
              { label: "Daily Drilling Reports" },
            ]}
            actions={
              <>
                <Button variant="outline" size="sm">
                  <Download aria-hidden className="mr-1.5 size-3.5" />
                  Export
                </Button>
                <Button size="sm">
                  <Plus aria-hidden className="mr-1.5 size-3.5" />
                  New report
                </Button>
              </>
            }
            meta={
              <span className="text-xs text-muted-foreground">
                {rows.length} of {DDR_ROWS.length} reports · updated 06:00
              </span>
            }
          />

          {/* In-app navigation. The sidebar says which app you are in; this says
              which part of it. A unit app has several related screens and should
              not need a second global nav to move between them. */}
          <div className="border-b border-border py-2">
            <PageNav activeHref="/ddr" groups={APP_NAV} />
          </div>

          {/* Filter bar. Date first because it is the filter people change most,
              then the coarse scope (rig), then the fine one (well). */}
          <div className="flex flex-wrap items-center gap-3 py-4">
            <DateRangeFilter value={dateRange} onChange={setDateRange} today={DEMO_TODAY} />

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/* Short, stable list → Select. */}
              <Select value={rig} onValueChange={setRig}>
                <SelectTrigger size="sm" className="w-36" aria-label="Filter by rig">
                  <SelectValue placeholder="All rigs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All rigs</SelectItem>
                  {RIGS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Long list → searchable. A real well register runs to thousands. */}
              <Combobox
                label="Filter by well"
                placeholder="All wells"
                searchPlaceholder="Search wells…"
                className="w-44"
                options={WELLS.map((w) => ({ value: w, label: w }))}
                value={well}
                onChange={setWell}
              />
            </div>
          </div>

          <DataTable
            caption="Daily drilling reports for Unit 1, filtered by the selected period, rig and well"
            columns={columns}
            data={rows}
            filterColumn="well"
            filterPlaceholder="Search within results…"
            pageSize={10}
            empty={{
              title: "No reports in this period",
              description: "Widen the date range, or clear the rig and well filters.",
              action: (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDateRange({ preset: "30d", range: resolvePreset("30d", DEMO_TODAY) });
                    setRig("all");
                    setWell(undefined);
                  }}
                >
                  Reset filters
                </Button>
              ),
            }}
          />
        </div>
      </Section>

      <Section
        title="Why this arrangement"
        description="The components are ordinary. Fixing where they go is what makes it a standard."
      >
        <ul className="space-y-2 text-sm">
          {[
            "Page header before filters: identity before controls. A user landing from a link needs to know what they are looking at before they can narrow it.",
            "Scope filters live on the screen, not inside the table. They are what a shareable URL should encode; the table's own search is a refinement within that scope.",
            "Date presets before the calendar — 'this week' is one click, not four. The calendar stays for the genuine exception.",
            "Select for rigs, combobox for wells. Same job, different list lengths; a search box over four options is noise and a dropdown over four thousand is unusable.",
            "The empty state resets the filters that caused it. An empty list whose only escape is guessing which of three filters is too narrow is a dead end.",
          ].map((t) => (
            <li key={t} className="flex gap-2">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Record dialog. Modal because opening a report is a deliberate context
          switch — you read it, then return to the list you were scanning. */}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-lg">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {open.well}
                  <StatusBadge status={open.status} />
                </DialogTitle>
                <DialogDescription>
                  {fmtDate(open.date)} · Rig {open.rig}
                </DialogDescription>
              </DialogHeader>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {[
                  ["Depth", `${open.depth.toLocaleString("en-GB")} ft`],
                  ["Footage", `${open.footage.toLocaleString("en-GB")} ft`],
                  ["Rotating hours", open.hours.toFixed(2)],
                  ["NPT", `${open.npt.toFixed(2)} hrs`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className={cn("mt-0.5 font-medium tabular-nums")}>{v}</dd>
                  </div>
                ))}
              </dl>

              <div>
                <p className="text-xs text-muted-foreground">Operations summary</p>
                <p className="mt-1 text-sm">{open.summary}</p>
              </div>

              <div className="flex justify-between gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setConfirming(open)}
                >
                  <Trash2 aria-hidden className="mr-1.5 size-3.5" />
                  Void report
                </Button>
                <Button variant="outline" size="sm">
                  <Maximize2 aria-hidden className="mr-1.5 size-3.5" />
                  Open full report
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* The confirmation names the report. "Void report BG-1042?" is catchable;
          "Delete Item?" is what you click through three times and regret. */}
      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(o) => !o && setConfirming(null)}
        title="Void report"
        subject={confirming?.well ?? ""}
        description="A voided report stays in the record with its figures excluded from unit totals. This cannot be undone from here."
        confirmLabel="Void report"
        onConfirm={() => {
          if (confirming) {
            setVoided((v) => [...v, confirming.id]);
            // Confirms an action the user just took — which is what a toast is
            // for. An operational event would go to the notification menu
            // instead, where it persists until acknowledged.
            toast.success(`Report ${confirming.well} voided`, {
              description: "Its figures are excluded from unit totals.",
            });
          }
          setConfirming(null);
          setOpen(null);
        }}
      />
    </>
  );
}

/**
 * Screens within this app. Placeholder like everything else here, but the shape
 * is the point: one dropdown group plus flat links, no second level.
 */
const APP_NAV = [
  {
    label: "Reports",
    icon: ClipboardList,
    items: [
      { label: "Daily drilling", href: "/ddr", description: "One per well per day" },
      { label: "Job reports", href: "/jobs" },
      { label: "NPT log", href: "/npt", description: "Non-productive time" },
    ],
  },
  { label: "Rigs", icon: Drill, href: "/rigs" },
  { label: "Materials", icon: Package, href: "/materials" },
  { label: "Performance", icon: Gauge, href: "/kpi" },
];
