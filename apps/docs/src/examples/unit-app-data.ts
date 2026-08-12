/**
 * Derived views over the DDR sample set, for the full-application mockup.
 *
 * Everything here is DERIVED rather than invented — NPT entries are the DDR rows
 * that recorded non-productive time, rig status is each rig's most recent
 * report. That is a deliberate constraint, not a shortcut.
 *
 * A mockup made of independently invented datasets looks convincing and lies:
 * the NPT screen and the DDR screen disagree, the rig list contradicts both, and
 * nobody notices until a KOC engineer does. Deriving everything from one set
 * means the screens cannot disagree, so what a reviewer is judging is the
 * *design* rather than the bookkeeping.
 *
 * ⚠️ The underlying rows are still placeholder — see ddr-data.ts.
 */

import type { OperationalStatus } from "@koc/ui";

import { DDR_ROWS, type DdrRow } from "./ddr-data";

export interface NptRow extends Record<string, unknown> {
  id: string;
  date: string;
  well: string;
  rig: string;
  hours: number;
  /**
   * Planned downtime is a schedule item; unplanned is an incident. Rolling them
   * into one "NPT" figure is how a rig with a booked BOP test looks as bad as a
   * rig with a stuck pipe.
   */
  planned: boolean;
  category: string;
  status: OperationalStatus;
}

/**
 * Which bucket an NPT entry falls in, inferred from the report's own status.
 *
 * `maintenance` is planned work; everything else that lost time was an event.
 * In a real app this is a field on the record, not a derivation — an operations
 * system that infers planned-vs-unplanned from a status code will be wrong the
 * first time someone books maintenance under a different code.
 */
function categorise(row: DdrRow): { planned: boolean; category: string } {
  if (row.status === "maintenance") return { planned: true, category: "Planned maintenance" };
  if (row.status === "critical") return { planned: false, category: "Well control / stuck pipe" };
  if (row.status === "warning") return { planned: false, category: "Hole problems" };
  return { planned: false, category: "Other" };
}

export const NPT_ROWS: NptRow[] = DDR_ROWS.filter((r) => r.npt > 0).map((r) => ({
  id: `npt-${r.id}`,
  date: r.date,
  well: r.well,
  rig: r.rig,
  hours: r.npt,
  status: r.status,
  ...categorise(r),
}));

export interface RigState {
  rig: string;
  well: string;
  status: OperationalStatus;
  depth: number;
  lastReport: string;
  nptTotal: number;
}

/** Each rig's latest report, plus its NPT across the whole sample period. */
export const RIG_STATE: RigState[] = [...new Set(DDR_ROWS.map((r) => r.rig))]
  .sort()
  .map((rig) => {
    const forRig = DDR_ROWS.filter((r) => r.rig === rig);
    // Sorted rather than assumed: the sample is in roughly reverse date order,
    // and "roughly" is how a dashboard ends up showing a stale row as current.
    const latest = [...forRig].sort((a, b) => b.date.localeCompare(a.date))[0];
    return {
      rig,
      well: latest.well,
      status: latest.status,
      depth: latest.depth,
      lastReport: latest.date,
      nptTotal: forRig.reduce((n, r) => n + r.npt, 0),
    };
  });

/** Totals for the KPI tiles, so tiles and tables cannot disagree. */
export const TOTALS = {
  npt: DDR_ROWS.reduce((n, r) => n + r.npt, 0),
  footage: DDR_ROWS.reduce((n, r) => n + r.footage, 0),
  rigs: RIG_STATE.length,
  reports: DDR_ROWS.length,
};

/** The most severe open item, for the page-level alert. */
export const CRITICAL = DDR_ROWS.find((r) => r.status === "critical");

// ── Unit home ───────────────────────────────────────────────────────────────

/**
 * What needs a person's attention, derived rather than curated.
 *
 * A hand-written "attention" list is a list that goes stale the first time the
 * data moves and nobody notices, because nothing connects the two. These are
 * the reports whose own status says something is wrong, ordered worst first —
 * so the home screen cannot claim things are fine while the DDR table shows a
 * stuck pipe.
 */
const SEVERITY: Record<string, number> = { critical: 0, warning: 1, maintenance: 2 };

export const NEEDS_ATTENTION = DDR_ROWS.filter((r) => r.status in SEVERITY).sort(
  (a, b) => SEVERITY[a.status] - SEVERITY[b.status] || b.date.localeCompare(a.date),
);

export interface UnitTask {
  id: string;
  label: string;
  /** What it is about — a well, a rig, an invoice. Shown as quiet context. */
  context?: string;
  due?: string;
  done?: boolean;
}

/**
 * ⚠️ PLACEHOLDER, and a different KIND of placeholder from the rest of this file.
 *
 * Everything else here is derived from the DDR sample set. These are invented
 * outright, because a personal task list has no source in the reports — it would
 * come from whatever assigns work at KOC, and nobody has told us what that is.
 *
 * They are written as things a drilling operational-support engineer would
 * plausibly owe someone by end of day, so the shape is arguable even though the
 * content is fiction. Replace wholesale.
 */
export const MY_TASKS: UnitTask[] = [
  { id: "t1", label: "Approve DDR", context: "MN-118 · 08 Aug", due: "Today" },
  { id: "t2", label: "Chase mud losses report", context: "RA-207", due: "Today" },
  { id: "t3", label: "Review casing programme", context: "BG-1201", due: "Tomorrow" },
  { id: "t4", label: "Sign off materials request", context: "MR-2291", due: "Thu" },
  { id: "t5", label: "Update rig move schedule", context: "KDC-19", done: true },
];
