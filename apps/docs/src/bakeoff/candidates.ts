/**
 * Bake-off manifest — sidebar / nav candidates.
 *
 * Everything here is measured rather than described: LOC and file counts come
 * from what actually landed on disk, licences from the source repositories'
 * own metadata, and the "de-brands on install" flag from running the install
 * and diffing the app's CSS entry.
 *
 * NOT CANONICAL — see ./README.md.
 */

import type { ComponentType } from "react";

import { AppSidebar as Shadcn07 } from "./candidates/shadcn-07/app-sidebar";
import { AppSidebar as Sidebar01 } from "./candidates/sidebar-01/app-sidebar";
import { AppSidebar as Sidebar16 } from "./candidates/sidebar-16/app-sidebar";

export interface Candidate {
  id: string;
  name: string;
  source: string;
  url: string;
  licence: string;
  /** Files written into the repo, excluding the shared ui/ primitives. */
  files: number;
  loc: number;
  /** Did installing it append its own theme tokens to the app's CSS entry? */
  deBrandsOnInstall: boolean;
  /** What this variant is actually for. */
  summary: string;
  /** Things worth knowing before adopting — honest, including the bad. */
  notes: string[];
  Component: ComponentType<Record<string, unknown>>;
  /** `inset` needs SidebarInset wrapping and a different page background. */
  variant?: "inset";
}

export const CANDIDATES: Candidate[] = [
  {
    id: "sidebar-01",
    name: "Simple + search",
    source: "shadcn/ui blocks",
    url: "https://ui.shadcn.com/blocks",
    licence: "MIT",
    files: 3,
    loc: 272,
    deBrandsOnInstall: true,
    summary:
      "Flat grouped nav with a search field and a version switcher. No collapse, no submenus.",
    notes: [
      "Smallest surface by a wide margin — a third of the code of the others.",
      "No collapse-to-icon. On a 1366×768 field laptop the nav costs 16rem permanently.",
      "The version switcher is a dropdown in the header; for KOC it maps more naturally to an asset or field selector than to a version.",
    ],
    Component: Sidebar01,
  },
  {
    id: "shadcn-07",
    name: "Collapsible to icon",
    source: "shadcn/ui blocks",
    url: "https://ui.shadcn.com/blocks",
    licence: "MIT",
    files: 5,
    loc: 538,
    deBrandsOnInstall: true,
    summary:
      "Grouped collapsible nav that collapses to an icon rail, with a team switcher and a user footer.",
    notes: [
      "The icon rail is the feature that matters for dense dashboards — it reclaims 13rem without losing navigation.",
      "Collapsed state relies on tooltips for labels, so tooltip behaviour becomes an accessibility surface, not a nicety.",
      "Team switcher is dead weight for KOC unless it becomes a directorate or field switcher.",
    ],
    Component: Shadcn07,
  },
  {
    id: "sidebar-16",
    name: "Inset + site header",
    source: "shadcn/ui blocks",
    url: "https://ui.shadcn.com/blocks",
    licence: "MIT",
    files: 7,
    loc: 573,
    deBrandsOnInstall: true,
    summary:
      "Inset (floating card) sidebar with a separate top site header, primary/secondary nav split, and breadcrumbs.",
    notes: [
      "Largest surface. The inset variant tints the page background with --sidebar, so KOC's primary-800 becomes the whole page frame — a much stronger brand statement than the others.",
      "The primary/secondary nav split is the only candidate that models 'main tasks vs settings/help', which most real dashboards need.",
      "Two navigation chromes (sidebar + header) means two places a KOC team can put the same link inconsistently.",
    ],
    Component: Sidebar16,
    variant: "inset",
  },
];
