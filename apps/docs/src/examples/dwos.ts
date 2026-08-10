/**
 * Drilling & Workover Operational Support Team — the worked example.
 *
 * Exploration & Drilling Directorate → Drilling & Workover Engineering Group →
 * D&W Operational Support Team → 7 units.
 *
 * This is the reference every other KOC team dashboard is cloned from. Building
 * one for another team means copying this file, changing the data, and changing
 * nothing else — no component is edited, no JSX is written.
 *
 * ⚠️ THE ORG STRUCTURE IS REAL. THE APP LISTS ARE PLACEHOLDER.
 * Directorate, group and team come from KOC's MyPortal; the seven units and
 * what each covers came from Saud directly. The workflows and web apps under
 * each unit are plausible stand-ins for drilling operational support, invented
 * to give the shell something realistic to hold. Replace them with the actual
 * apps before this is shown to a KOC team — a nav full of things that do not
 * exist is worse than an empty one.
 */

import {
  Boxes,
  ClipboardList,
  Drill,
  FileBarChart,
  FileText,
  Gauge,
  HardHat,
  Map,
  Package,
  Receipt,
  Ship,
  Timer,
  Waves,
  Wrench,
} from "lucide-react";

import type { TeamConfig, NavGroup } from "@koc/ui";

/**
 * Units 1–4 are the drilling units — North & West + Heavy Oil, South & East,
 * Deep, and Offshore. They run the same operational workflows against different
 * asset areas, so they share a nav shape. Generating it keeps them genuinely
 * identical; hand-copying four blocks is how three of them end up subtly
 * different a year later.
 *
 * Units 5–7 (Water Well, Well Intervention, Support) have their own workflows
 * and are written out individually below.
 */
function drillingUnitGroups(unitId: string): NavGroup[] {
  return [
    {
      id: "operations",
      label: "Operations",
      items: [
        {
          id: `${unitId}-ddr`,
          label: "Daily drilling reports",
          href: `/${unitId}/ddr`,
          icon: ClipboardList,
        },
        {
          id: `${unitId}-rig-status`,
          label: "Rig status",
          href: `/${unitId}/rigs`,
          icon: Drill,
        },
        {
          id: `${unitId}-npt`,
          label: "NPT tracking",
          href: `/${unitId}/npt`,
          icon: Timer,
          badge: 3,
        },
      ],
    },
    {
      id: "planning",
      label: "Planning",
      items: [
        {
          id: `${unitId}-programmes`,
          label: "Well programmes",
          href: `/${unitId}/programmes`,
          icon: FileText,
        },
        {
          id: `${unitId}-materials`,
          label: "Materials requests",
          href: `/${unitId}/materials`,
          icon: Package,
        },
      ],
    },
    {
      id: "performance",
      label: "Performance",
      items: [
        {
          id: `${unitId}-kpi`,
          label: "Unit KPIs",
          href: `/${unitId}/kpi`,
          icon: Gauge,
        },
        {
          id: `${unitId}-availability`,
          label: "Rig availability",
          href: `/${unitId}/availability`,
          icon: Gauge,
        },
      ],
    },
  ];
}

export const DWOS: TeamConfig = {
  id: "dwos",
  name: "Drilling & Workover Operational Support Team",
  shortName: "D&W Operational Support",
  directorate: "Exploration & Drilling",
  group: "Drilling & Workover Engineering",

  /**
   * The seven units, with what each actually covers.
   *
   * The numbers are KOC's and are not going away, but on their own they tell a
   * user nothing — "Unit 3" is unguessable, "Deep" is not. Every unit therefore
   * carries a `description`, which the switcher renders under the label. That is
   * the cheap fix; renaming is KOC's call, not this repo's.
   */
  units: [
    {
      id: "unit-1",
      label: "Unit 1",
      description: "North & West Kuwait + Heavy Oil",
      groups: drillingUnitGroups("unit-1"),
    },
    {
      id: "unit-2",
      label: "Unit 2",
      description: "South & East Kuwait",
      groups: drillingUnitGroups("unit-2"),
    },
    {
      id: "unit-3",
      label: "Unit 3",
      description: "Deep",
      groups: drillingUnitGroups("unit-3"),
    },
    {
      id: "unit-4",
      label: "Unit 4",
      description: "Offshore",
      groups: drillingUnitGroups("unit-4"),
    },
    {
      id: "unit-5",
      label: "Unit 5",
      description: "Water Well",
      groups: [
        {
          id: "operations",
          label: "Operations",
          items: [
            { id: "u5-register", label: "Water well register", href: "/unit-5/register", icon: Waves },
            { id: "u5-ddr", label: "Daily reports", href: "/unit-5/ddr", icon: ClipboardList },
            { id: "u5-maintenance", label: "Maintenance schedule", href: "/unit-5/maintenance", icon: Wrench },
          ],
        },
      ],
    },
    {
      id: "unit-6",
      label: "Unit 6",
      description: "Well Intervention",
      groups: [
        {
          id: "operations",
          label: "Operations",
          items: [
            { id: "u6-jobs", label: "Intervention jobs", href: "/unit-6/jobs", icon: Wrench, badge: 12 },
            { id: "u6-slickline", label: "Slickline & coiled tubing", href: "/unit-6/slickline", icon: Drill },
            { id: "u6-reports", label: "Job reports", href: "/unit-6/reports", icon: FileBarChart },
          ],
        },
      ],
    },
    {
      id: "unit-7",
      label: "Unit 7",
      description: "Support",
      groups: [
        {
          id: "operations",
          label: "Operations",
          items: [
            { id: "u7-logistics", label: "Logistics & vessels", href: "/unit-7/logistics", icon: Ship },
            { id: "u7-materials", label: "Materials & manifests", href: "/unit-7/materials", icon: Boxes },
            { id: "u7-crew", label: "Crew rotation", href: "/unit-7/crew", icon: HardHat },
          ],
        },
      ],
    },
  ],

  /**
   * Team-wide — deliberately a separate zone rather than an eighth unit.
   * Invoicing and GIS do not belong to any unit, and duplicating them under all
   * seven is how a nav rots.
   */
  teamWide: [
    {
      id: "shared",
      label: "Team-wide",
      items: [
        { id: "invoicing", label: "Invoicing", href: "/invoicing", icon: Receipt },
        { id: "gis", label: "Map & GIS", href: "/gis", icon: Map },
        {
          id: "reports",
          label: "Team reporting",
          href: "/reports",
          icon: FileBarChart,
        },
      ],
    },
  ],
};
