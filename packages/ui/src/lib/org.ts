/**
 * KOC organisational model — the shape a team dashboard is configured from.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * KOC nests four levels deep: Directorate → Group → Team → Unit. Exploration &
 * Drilling alone holds 6 groups; Drilling & Workover Engineering holds 6 teams;
 * the Operational Support team holds 7 units. Multiply that out across 8
 * directorates and there are on the order of a few hundred teams that will each
 * eventually want a dashboard.
 *
 * If each of those is a hand-built sidebar, the standard is dead on arrival —
 * the second team forks the first team's component and the two drift within a
 * month. So the shell is a *component*, the org chart is *data*, and building a
 * new team dashboard means writing a config object, never touching JSX.
 *
 * THE SCOPE DECISION
 * ------------------
 * One dashboard = one **team**. Not one directorate (too coarse — nothing an
 * Admin & Finance user does overlaps with a drilling engineer) and not one unit
 * (too fine — the invoicing and GIS apps are shared, and you would duplicate
 * them seven times).
 *
 * Within a team dashboard, the unit is a **context**, not a nav section. That is
 * the load-bearing choice, so it is worth stating why:
 *
 *   - Unit-as-nav-section means 7 units × ~5 apps = 35 permanent nav items, and
 *     34 of them are irrelevant to any given user on any given day.
 *   - Unit-as-context means the nav shows *your* unit's apps, and switching unit
 *     is a deliberate act that changes what you are looking at.
 *
 * It also resolves the team-wide vs unit-scoped question structurally rather
 * than by convention: they live in different zones of the shell, so a team
 * adding an app never has to *decide* where it goes — the scope determines it.
 * `ALL_UNITS` covers the team lead who genuinely needs to see across units.
 */

import type { LucideIcon } from "lucide-react";

/** A destination — a workflow, a web app, a report. */
export interface NavItem {
  /** Stable id. Used for the active-item check and for routing. */
  id: string;
  label: string;
  href: string;
  icon?: LucideIcon;
  /** Optional count badge — open items, pending approvals. */
  badge?: number | string;
  /** Nested destinations. One level only; deeper than that is a menu, not nav. */
  children?: NavItem[];
}

/** A named grouping of items inside a unit's nav. */
export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

/**
 * A unit inside a team, with the apps scoped to it.
 *
 * Note on naming: KOC's DWOS team mixes numbered units (Unit 1–4) with named
 * ones (Water Well, Offshore Logistics, Well Intervention). Numbers carry no
 * information about what a unit does, which makes the switcher harder to use
 * than it needs to be. `description` exists so a numbered unit can at least say
 * what it covers in the switcher.
 */
export interface Unit {
  id: string;
  label: string;
  description?: string;
  groups: NavGroup[];
}

/** The sentinel unit id meaning "show every unit's work at once". */
export const ALL_UNITS = "__all__";

/**
 * A team dashboard's full configuration.
 *
 * `directorate` and `group` are identity, not navigation — a user does not
 * navigate up to the directorate from here, they need to know which one they are
 * in. They render as context in the header, not as links.
 */
export interface TeamConfig {
  id: string;
  /** Full name, e.g. "Drilling & Workover Operational Support Team". */
  name: string;
  /** What fits in a sidebar header, e.g. "D&W Operational Support". */
  shortName: string;
  /** e.g. "Exploration & Drilling" */
  directorate: string;
  /** e.g. "Drilling & Workover Engineering" */
  group: string;
  units: Unit[];
  /**
   * Apps that belong to the whole team regardless of unit — invoicing, GIS,
   * shared reporting. Always visible, never filtered by the unit switcher.
   */
  teamWide: NavGroup[];
}

/** Every nav item in a unit, flattened — for search and active-route matching. */
export function unitItems(unit: Unit): NavItem[] {
  return unit.groups.flatMap((g) => g.items.flatMap(flatten));
}

/** Every nav item a team exposes, across all units plus team-wide. */
export function teamItems(team: TeamConfig): NavItem[] {
  return [
    ...team.units.flatMap(unitItems),
    ...team.teamWide.flatMap((g) => g.items.flatMap(flatten)),
  ];
}

function flatten(item: NavItem): NavItem[] {
  return [item, ...(item.children?.flatMap(flatten) ?? [])];
}

/**
 * The groups to render for a given unit selection.
 *
 * With `ALL_UNITS`, each unit's groups are returned prefixed with the unit name,
 * so a team lead sees "Unit 3 · Well Reports" rather than four identically
 * labelled "Well Reports" entries with no way to tell them apart.
 */
export function groupsForUnit(team: TeamConfig, unitId: string): NavGroup[] {
  if (unitId !== ALL_UNITS) {
    return team.units.find((u) => u.id === unitId)?.groups ?? [];
  }

  return team.units.flatMap((unit) =>
    unit.groups.map((g) => ({
      ...g,
      id: `${unit.id}:${g.id}`,
      label: `${unit.label} · ${g.label}`,
    })),
  );
}
