/**
 * Daily Drilling Report rows — the sample data behind the list-view pattern.
 *
 * ⚠️ EVERY FIELD HERE IS A PLACEHOLDER.
 *
 * The column shape is a plausible guess at what a KOC daily drilling report
 * carries — date, well, rig, depth, footage, rotating hours, NPT, status,
 * operations summary. It has NOT been checked against a real DDR. Well names,
 * rig numbers and every number are invented.
 *
 * This is fine for building and testing the pattern and wrong for showing a
 * drilling engineer. Before this goes in front of anyone at KOC, replace the
 * columns with the real report fields — a screen full of fields nobody
 * recognises does more damage to a standard than an empty one.
 *
 * What is real: the units (ft, hrs), the convention that NPT is tracked
 * separately from rotating hours, and that a report belongs to one well on one
 * day.
 */

import type { OperationalStatus } from "@koc/ui";

export interface DdrRow extends Record<string, unknown> {
  id: string;
  /** ISO date. One report per well per day. */
  date: string;
  well: string;
  rig: string;
  /** Measured depth at end of period, ft. */
  depth: number;
  /** Footage made in the period, ft. */
  footage: number;
  /** Rotating hours. */
  hours: number;
  /** Non-productive time, hrs. Tracked apart from rotating hours on purpose. */
  npt: number;
  status: OperationalStatus;
  summary: string;
}

/** Deterministic sample set — no random generation, so tests stay stable. */
export const DDR_ROWS: DdrRow[] = [
  { id: "ddr-001", date: "2026-08-09", well: "BG-1042", rig: "KDC-12", depth: 9450, footage: 312, hours: 21.5, npt: 2.5, status: "producing", summary: "Drilled 12¼\" hole section. No incidents." },
  { id: "ddr-002", date: "2026-08-09", well: "BG-1088", rig: "KDC-12", depth: 11200, footage: 288, hours: 22.0, npt: 0, status: "producing", summary: "Continued 8½\" section to TD." },
  { id: "ddr-003", date: "2026-08-09", well: "RA-207", rig: "KDC-04", depth: 7310, footage: 96, hours: 11.75, npt: 8.25, status: "warning", summary: "Mud losses at 7290 ft. LCM pill pumped." },
  { id: "ddr-004", date: "2026-08-08", well: "SA-3391", rig: "KDC-19", depth: 13980, footage: 401, hours: 23.0, npt: 1.0, status: "producing", summary: "Drilling ahead, parameters stable." },
  { id: "ddr-005", date: "2026-08-08", well: "MN-118", rig: "KDC-07", depth: 8600, footage: 0, hours: 0, npt: 24.0, status: "critical", summary: "Stuck pipe at 8600 ft. Fishing operations ongoing." },
  { id: "ddr-006", date: "2026-08-08", well: "BG-1155", rig: "KDC-04", depth: 10450, footage: 154, hours: 16.5, npt: 6.5, status: "maintenance", summary: "Top drive repair. Resumed 14:00." },
  { id: "ddr-007", date: "2026-08-07", well: "RA-302", rig: "KDC-19", depth: 6120, footage: 0, hours: 0, npt: 0, status: "shutin", summary: "Rig released. Awaiting move." },
  { id: "ddr-008", date: "2026-08-07", well: "SA-3402", rig: "KDC-07", depth: 15310, footage: 205, hours: 19.25, npt: 4.75, status: "warning", summary: "High torque observed. Reamed twice." },
  { id: "ddr-009", date: "2026-08-07", well: "MN-140", rig: "KDC-12", depth: 7890, footage: 366, hours: 22.5, npt: 0, status: "producing", summary: "Drilled to casing point. Circulating clean." },
  { id: "ddr-010", date: "2026-08-06", well: "BG-1201", rig: "KDC-19", depth: 12040, footage: 178, hours: 18.0, npt: 5.0, status: "maintenance", summary: "BOP function test. 5 hrs planned downtime." },
  { id: "ddr-011", date: "2026-08-06", well: "RA-355", rig: "KDC-04", depth: 5980, footage: 421, hours: 23.5, npt: 0.5, status: "producing", summary: "Fast drilling in upper section." },
  { id: "ddr-012", date: "2026-08-06", well: "SA-3450", rig: "KDC-07", depth: 14220, footage: 240, hours: 20.0, npt: 3.0, status: "normal", summary: "Wiper trip completed. Hole in good condition." },
  { id: "ddr-013", date: "2026-08-05", well: "BG-1042", rig: "KDC-12", depth: 9138, footage: 298, hours: 21.0, npt: 2.0, status: "producing", summary: "Drilled 12¼\" hole section." },
  { id: "ddr-014", date: "2026-08-05", well: "MN-118", rig: "KDC-07", depth: 8600, footage: 62, hours: 6.0, npt: 17.5, status: "critical", summary: "Pack-off event. Circulation restored after 17 hrs." },
  { id: "ddr-015", date: "2026-08-05", well: "RA-207", rig: "KDC-04", depth: 7214, footage: 187, hours: 19.0, npt: 4.0, status: "normal", summary: "Drilling ahead after LCM treatment." },
];

/** Unique rigs, for the filter. */
export const RIGS = [...new Set(DDR_ROWS.map((r) => r.rig))].sort();

/** Unique wells, for the searchable filter. */
export const WELLS = [...new Set(DDR_ROWS.map((r) => r.well))].sort();

/**
 * The "today" the pattern's date presets resolve against.
 *
 * Pinned rather than read from the clock, so the demo and its tests show the
 * same thing every day. A real app passes its own.
 */
export const DEMO_TODAY = new Date("2026-08-09T00:00:00Z");
