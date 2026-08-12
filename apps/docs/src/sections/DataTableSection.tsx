import { useState } from "react";

import {
  Button,
  DataTable,
  StatusBadge,
  FilterTabs,
  cn,
  kocColumnHelper,
  type OperationalStatus,
} from "@koc/ui";

import { PageHead, Section, Note, Pre } from "./parts";

/**
 * The DataTable, shown against a realistic KOC row shape.
 *
 * Every state a table can be in is reachable from the controls, because the
 * states nobody builds — loading, empty, filtered-empty — are exactly the ones
 * that get discovered in production.
 */

type Asset = "North" | "West" | "South" | "Heavy Oil";

interface WellRow extends Record<string, unknown> {
  well: string;
  asset: Asset;
  rig: string;
  depth: number;
  npt: number;
  status: OperationalStatus;
}

/**
 * Asset is a *scope*, so it is a tab rather than a column filter.
 *
 * The distinction matters: a column filter is a question you ask of one list
 * ("show me rigs called KDC-04"), while a tab switches which list you are
 * looking at. Assets partition the wells — every well belongs to exactly one —
 * and people work within one asset for hours at a time, so it belongs in the
 * chrome where the current scope stays visible, not buried in a filter someone
 * has to remember they applied.
 *
 * Same reasoning as the unit switcher in AppShell, one level down.
 */
const ASSETS: Asset[] = ["North", "West", "South", "Heavy Oil"];

const ROWS: WellRow[] = [
  { well: "BG-1042", asset: "North", rig: "KDC-12", depth: 9450, npt: 4.5, status: "producing" },
  { well: "BG-1088", asset: "West", rig: "KDC-12", depth: 11200, npt: 0, status: "producing" },
  { well: "RA-207", asset: "South", rig: "KDC-04", depth: 7310, npt: 18.25, status: "warning" },
  { well: "SA-3391", asset: "Heavy Oil", rig: "KDC-19", depth: 13980, npt: 2, status: "producing" },
  { well: "MN-118", asset: "North", rig: "KDC-07", depth: 8600, npt: 41.75, status: "critical" },
  { well: "BG-1155", asset: "West", rig: "KDC-04", depth: 10450, npt: 6.5, status: "maintenance" },
  { well: "RA-302", asset: "South", rig: "KDC-19", depth: 6120, npt: 0, status: "shutin" },
  { well: "SA-3402", asset: "Heavy Oil", rig: "KDC-07", depth: 15310, npt: 9.25, status: "warning" },
  { well: "MN-140", asset: "North", rig: "KDC-12", depth: 7890, npt: 0, status: "producing" },
  { well: "BG-1201", asset: "West", rig: "KDC-19", depth: 12040, npt: 13.5, status: "maintenance" },
  { well: "RA-355", asset: "South", rig: "KDC-04", depth: 5980, npt: 1.25, status: "producing" },
  { well: "SA-3450", asset: "Heavy Oil", rig: "KDC-07", depth: 14220, npt: 0, status: "normal" },
];

const col = kocColumnHelper<WellRow>();

const COLUMNS = col.columns([
  col.accessor("well", { header: "Well" }),
  col.accessor("rig", { header: "Rig" }),
  col.accessor("depth", {
    header: "Depth (ft)",
    // `numeric` right-aligns the cells AND the header, together. Tabular figures
    // are already applied by the base layer; alignment is the half you have to
    // declare, so it is declared once here rather than in a cell renderer.
    meta: { numeric: true },
    cell: ({ row }) => row.original.depth.toLocaleString("en-US"),
  }),
  col.accessor("npt", {
    header: "NPT (hrs)",
    meta: { numeric: true },
    cell: ({ row }) => row.original.npt.toFixed(2),
  }),
  col.accessor("status", {
    header: "Status",
    // StatusBadge derives colour, icon and label together from the status —
    // there is no prop that keeps the red and drops the icon, so WCAG 1.4.1
    // cannot be violated by omission.
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  }),
]);

type Demo = "data" | "loading" | "empty";

export function DataTableSection() {
  const [demo, setDemo] = useState<Demo>("data");
  const [asset, setAsset] = useState<Asset>("North");

  const countFor = (a: Asset) => ROWS.filter((r) => r.asset === a).length;

  return (
    <>
      <PageHead
        title="Data table"
        lead="Sorting, filtering, column visibility and pagination on TanStack Table v9 — plus the
              three states most tables skip: loading, empty, and filtered-empty."
      />

      <Note kind="note" title="Built, not installed">
        There is no data table in the shadcn registry — <code>@shadcn/data-table</code> is named as
        a dependency but never published, and the only match is a docs example the CLI won't
        install. <code>dashboard-01</code> ships one at 814 lines, but most of it is demo
        scaffolding: drag-and-drop reordering, a drawer with a chart, toasts, a zod schema. Twelve
        dependencies for one table. We kept the TanStack wiring and the pagination layout.
      </Note>

      <Section
        title="Numeric columns are declared, not remembered"
        description="A column of depths left-aligned shimmies by digit count and can't be scanned.
                     Tabular figures are applied automatically by the base layer — alignment is the
                     half you have to bring, so it rides on the column definition."
      >
        <Pre>{`col.accessor("depth", {
  header: "Depth (ft)",
  meta: { numeric: true },   // right-aligns cells AND header, together
})`}</Pre>
      </Section>

      <Section
        title="Every state, reachable"
        description="Loading and empty are the states that get discovered in production because
                     nobody builds them. Switch between them here."
      >
        <div className="flex flex-wrap gap-2 pb-4">
          {(
            [
              ["data", "With data"],
              ["loading", "Loading"],
              ["empty", "Empty"],
            ] as [Demo, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setDemo(id)}
              aria-pressed={demo === id}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm transition-colors duration-fast ease-out",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                demo === id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {label}
            </button>
          ))}
          <p className="w-full pt-1 text-sm text-muted-foreground">
            For <strong>filtered-empty</strong>, stay on “With data” and search for something that
            matches nothing — it's a different message with a different way out.
          </p>
        </div>

        {/*
         * The table lives INSIDE a TabsContent, not beside the TabsList.
         *
         * Radix wires `aria-controls` from each trigger to its panel. With no
         * TabsContent the attribute points at an id that does not exist — axe
         * flags it critical, and a screen reader announces a tab that controls
         * nothing. Putting the table in the panel makes the relationship real:
         * the table IS what the tab switches.
         *
         * Radix mounts only the active panel, so this renders one table, not four.
         *
         * Counts on the triggers so you can see where the work is without
         * switching, and so an empty asset is visibly empty rather than a tab
         * you click and find nothing behind.
         */}
        <FilterTabs
          label="Filter by asset"
          options={ASSETS.map((a) => ({ value: a, label: a, count: countFor(a) }))}
          value={asset}
          onChange={setAsset}
          renderPanel={(value) => (
            <DataTable
                  caption={`Wells in the ${value} asset, by rig, depth, non-productive time and operational status`}
                  columns={COLUMNS}
                  data={demo === "empty" ? [] : ROWS.filter((r) => r.asset === value)}
                  loading={demo === "loading"}
                  filterColumn="well"
                  filterPlaceholder="Search wells…"
                  pageSize={10}
                  empty={{
                    title: `No wells in ${value}`,
                    description: "Wells appear here once they're assigned to this asset.",
                    action: <Button size="sm">Assign a well</Button>,
                  }}
                />
          )}
        />
      </Section>

      <Section
        title="What it deliberately doesn't do"
        description="Scope decisions worth stating, so nobody assumes they were oversights."
      >
        <ul className="space-y-2 text-sm">
          {[
            "Row selection — needs bulk actions to select for. Nothing to do with selected rows yet, so the checkbox column would be decoration.",
            "Drag-to-reorder — the reference block spends four @dnd-kit packages on it. Row order in an operations table comes from sorting, not from dragging.",
            "Virtualisation — TanStack supports it and the wrapper doesn't block it. Worth adding when a real table exceeds a few thousand rows, not before.",
            "Server-side pagination — the current API paginates client-side. Real KOC data volumes may force this; the TanStack engine handles it, the wrapper needs a prop.",
          ].map((t) => (
            <li key={t} className="flex gap-2">
              <span
                aria-hidden
                className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground"
              />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
