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
 * Directorate, group, team and the seven unit names come from KOC's MyPortal.
 * The workflows and web apps under each unit are plausible stand-ins for
 * drilling operational support, invented to give the shell something realistic
 * to hold. Replace them with the actual apps before this is shown to a KOC team
 * — a nav full of things that do not exist is worse than an empty one.
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
 * The four numbered units run the same operational workflows on different well
 * portfolios, so they share a nav shape. Generating it keeps them genuinely
 * identical — hand-copying four blocks is how three of them end up subtly
 * different a year later.
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

  units: [
    {
      id: "unit-1",
      label: "Unit 1",
      // The numbered units say nothing about what they cover. A description is
      // the cheapest fix short of renaming them, which is not ours to do.
      description: "Operational support — portfolio 1",
      groups: drillingUnitGroups("unit-1"),
    },
    {
      id: "unit-2",
      label: "Unit 2",
      description: "Operational support — portfolio 2",
      groups: drillingUnitGroups("unit-2"),
    },
    {
      id: "unit-3",
      label: "Unit 3",
      description: "Operational support — portfolio 3",
      groups: drillingUnitGroups("unit-3"),
    },
    {
      id: "unit-4",
      label: "Unit 4",
      description: "Operational support — portfolio 4",
      groups: drillingUnitGroups("unit-4"),
    },
    {
      id: "water-well",
      label: "Water Well Unit",
      groups: [
        {
          id: "operations",
          label: "Operations",
          items: [
            {
              id: "ww-wells",
              label: "Water well register",
              href: "/water-well/register",
              icon: Waves,
            },
            {
              id: "ww-ddr",
              label: "Daily reports",
              href: "/water-well/ddr",
              icon: ClipboardList,
            },
            {
              id: "ww-maintenance",
              label: "Maintenance schedule",
              href: "/water-well/maintenance",
              icon: Wrench,
            },
          ],
        },
      ],
    },
    {
      id: "offshore-logistics",
      label: "Offshore Logistics",
      groups: [
        {
          id: "operations",
          label: "Operations",
          items: [
            {
              id: "ol-vessels",
              label: "Vessel movements",
              href: "/offshore-logistics/vessels",
              icon: Ship,
            },
            {
              id: "ol-manifests",
              label: "Cargo manifests",
              href: "/offshore-logistics/manifests",
              icon: Boxes,
            },
            {
              id: "ol-crew",
              label: "Crew rotation",
              href: "/offshore-logistics/crew",
              icon: HardHat,
            },
          ],
        },
      ],
    },
    {
      id: "well-intervention",
      label: "Well Intervention",
      groups: [
        {
          id: "operations",
          label: "Operations",
          items: [
            {
              id: "wi-jobs",
              label: "Intervention jobs",
              href: "/well-intervention/jobs",
              icon: Wrench,
              badge: 12,
            },
            {
              id: "wi-slickline",
              label: "Slickline & coiled tubing",
              href: "/well-intervention/slickline",
              icon: Drill,
            },
            {
              id: "wi-reports",
              label: "Job reports",
              href: "/well-intervention/reports",
              icon: FileBarChart,
            },
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
