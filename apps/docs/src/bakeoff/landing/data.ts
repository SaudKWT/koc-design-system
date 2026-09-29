/**
 * D&W Engineering Group landing page — the shared data every direction renders.
 *
 * Evaluation-only (see ../README.md). Every direction reads THIS file and none
 * of them may carry its own copy, so the comparison is between designs, never
 * between datasets.
 *
 * ⚠️ WHAT IS REAL AND WHAT IS NOT
 *   REAL        the eight teams, their EN codes and the link count per team —
 *               copied from the current DWEG "Engineering Workspace" design
 *               Saud supplied on 2026-09-28. There is no EN21; that gap is in
 *               the source, not a typo here.
 *   PLACEHOLDER every dashboard name, platform and href, and every KPI figure.
 *               The source design itself shows "Link-1…" and "TITLE 1…". The
 *               names below are plausible stand-ins so link typography can be
 *               judged at realistic lengths. Replace before showing a KOC team.
 *
 * KPI scope is the D&W group only (decided 2026-09-28) — not KOC company-wide.
 *
 * UPDATED later on 2026-09-28, for directions E–I: BOTH. A KOC-wide headline
 * row (`COMPANY_KPIS`, end of file) sits above the eight group `KPIS`. Saud's
 * call, answering the round-two brief "high level KPI cards for the company".
 * Every company figure is placeholder too — none is a published KOC number.
 */

import type { StatIntent } from "@koc/ui";

/** Where a dashboard lives. Decides the badge and the icon, nothing else. */
export type Platform = "power-bi" | "sharepoint" | "web-app";

export const PLATFORM_LABEL: Record<Platform, string> = {
  "power-bi": "Power BI",
  sharepoint: "SharePoint",
  "web-app": "Web app",
};

export interface DashboardLink {
  id: string;
  label: string;
  platform: Platform;
  /**
   * `.invalid` is reserved by RFC 2606 and can never resolve — a placeholder
   * that cannot accidentally point at something real. `DashboardAnchor`
   * intercepts these and says so instead of opening a dead tab.
   */
  href: string;
}

export interface Team {
  /** KOC's organisational code, e.g. "EN31". The identifier people quote. */
  code: string;
  /** The code's number alone, e.g. "31" — for index-style layouts. */
  index: string;
  /** Full official name, as MyPortal writes it. */
  name: string;
  /** What fits on a tile. Drops the "Drilling & Workover … Team" frame every name shares. */
  shortName: string;
  /** Common abbreviation, where one is in use. */
  abbr?: string;
  /** One line on what the team covers. Placeholder wording. */
  blurb: string;
  links: DashboardLink[];
}

const link = (team: string, slug: string, label: string, platform: Platform): DashboardLink => ({
  id: `${team}-${slug}`,
  label,
  platform,
  href: `https://${slug}.${team}.dweg.invalid/`,
});

export const GROUP = {
  name: "Drilling & Workover Engineering Group",
  abbr: "DWEG",
  directorate: "Exploration & Drilling Directorate",
  company: "Kuwait Oil Company",
} as const;

/** The person the greeting addresses. Placeholder, taken from the source design. */
export const VIEWER = { firstName: "Saud" } as const;

export const TEAMS: Team[] = [
  {
    code: "EN01",
    index: "01",
    name: "Drilling & Workover Engineering Group Admin",
    shortName: "Group Admin",
    blurb: "Manpower, budget and correspondence for the group.",
    links: [
      link("en01", "manpower", "Group manpower & headcount", "power-bi"),
      link("en01", "correspondence", "Correspondence tracker", "sharepoint"),
      link("en01", "budget", "Budget & commitments", "power-bi"),
    ],
  },
  {
    code: "EN11",
    index: "11",
    name: "Drilling & Workover Contracts Management Team",
    shortName: "Contracts Management",
    blurb: "Rig and service contracts from tender to close-out.",
    links: [
      link("en11", "register", "Contract register", "sharepoint"),
      link("en11", "expiry", "Rig contract expiry", "power-bi"),
      link("en11", "call-offs", "Call-off orders", "web-app"),
      link("en11", "invoices", "Invoice status", "power-bi"),
      link("en11", "performance", "Contractor performance", "power-bi"),
      link("en11", "tenders", "Tender pipeline", "sharepoint"),
      link("en11", "variations", "Variation orders", "web-app"),
    ],
  },
  {
    code: "EN31",
    index: "31",
    name: "Drilling & Workover Operational Support Team",
    shortName: "Operational Support",
    abbr: "DWOS",
    blurb: "Logistics, water wells and field support for the rigs.",
    links: [link("en31", "dwos", "DWOS platform", "web-app")],
  },
  {
    code: "EN41",
    index: "41",
    name: "Health, Safety, Environment & Drilling Excellence",
    shortName: "HSE & Drilling Excellence",
    abbr: "HSE & DE",
    blurb: "Safety performance, benchmarking and lessons learned.",
    links: [
      link("en41", "incidents", "HSE incident dashboard", "power-bi"),
      link("en41", "benchmarking", "Drilling KPIs & benchmarking", "power-bi"),
      link("en41", "lessons", "Lessons learned library", "sharepoint"),
      link("en41", "audits", "Audit & inspection tracker", "web-app"),
    ],
  },
  {
    code: "EN51",
    index: "51",
    name: "Drilling & Workover Engineering Team I",
    shortName: "Engineering I",
    blurb: "Well design and rig programmes, North & West Kuwait.",
    links: [
      link("en51", "programmes", "Well programmes", "sharepoint"),
      link("en51", "rig-schedule", "Rig schedule — North & West", "power-bi"),
      link("en51", "performance", "Drilling performance", "power-bi"),
    ],
  },
  {
    code: "EN61",
    index: "61",
    name: "Drilling & Workover Engineering Team II",
    shortName: "Engineering II",
    blurb: "Well design and rig programmes, South & East Kuwait.",
    links: [
      link("en61", "rig-schedule", "Rig schedule — South & East", "power-bi"),
      link("en61", "design-review", "Well design review", "web-app"),
    ],
  },
  {
    code: "EN71",
    index: "71",
    name: "Drilling & Workover Contracts Support Team",
    shortName: "Contracts Support",
    blurb: "Service orders, materials and payment certificates.",
    links: [
      link("en71", "service-orders", "Service orders", "web-app"),
      link("en71", "requisitions", "Materials requisitions", "power-bi"),
      link("en71", "vendors", "Vendor directory", "sharepoint"),
      link("en71", "payments", "Payment certificates", "power-bi"),
      link("en71", "kpis", "Contract KPIs", "power-bi"),
    ],
  },
  {
    code: "EN81",
    index: "81",
    name: "Well Intervention Team",
    shortName: "Well Intervention",
    blurb: "Workover, coiled tubing and wireline operations.",
    links: [
      link("en81", "schedule", "Workover schedule", "power-bi"),
      link("en81", "ct-wireline", "Coiled tubing & wireline jobs", "web-app"),
      link("en81", "reports", "Intervention reports", "sharepoint"),
    ],
  },
];

export const DASHBOARD_COUNT = TEAMS.reduce((n, t) => n + t.links.length, 0);

export interface Kpi {
  id: string;
  label: string;
  /** Raw number, so a direction can count up to it. Format with `formatKpi`. */
  value: number;
  decimals: number;
  unit?: string;
  /** The source design's category chip, kept so its mapping is traceable. */
  tag:
    | "LIVE" | "YTD" | "OPS" | "QUALITY" | "WO" | "COST" | "SUPPORT" | "SYNC"
    // Company headline tags — COMPANY_KPIS only.
    | "PRODUCTION" | "CAPACITY" | "GAS" | "SAFETY";
  /** Signed change against `deltaLabel`. */
  delta?: number;
  deltaFormat?: "percent" | "absolute";
  deltaLabel?: string;
  /**
   * Whether a rise is good. NEVER inferred from direction — see StatCard.
   * Rigs up is neither; NPT up is bad; wells up is good.
   */
  intent: StatIntent;
  /** A short trailing series for sparklines, oldest first. Placeholder. */
  trend: number[];
  /** What the figure means, for a tooltip or sr-only note. */
  description: string;
}

/**
 * Eight D&W group figures, one per chip in the source design's metric strip.
 *
 * Deliberately missing: a safety figure (LTIF, days without LTI). The source
 * design has no SAFETY chip, and at a drilling group that is usually the first
 * number on the wall. Raised with Saud rather than silently added.
 */
export const KPIS: Kpi[] = [
  {
    id: "rigs",
    label: "Active rigs",
    value: 24,
    decimals: 0,
    tag: "LIVE",
    delta: 2,
    deltaFormat: "absolute",
    deltaLabel: "vs last month",
    intent: "neutral",
    trend: [19, 20, 20, 21, 22, 22, 21, 22, 23, 22, 22, 24],
    description: "Drilling and workover rigs currently on contract and operating.",
  },
  {
    id: "wells",
    label: "Wells completed",
    value: 156,
    decimals: 0,
    tag: "YTD",
    delta: 8.3,
    deltaLabel: "vs plan",
    intent: "higher-is-better",
    trend: [11, 24, 37, 49, 62, 76, 89, 103, 118, 131, 144, 156],
    description: "Wells reaching rig release this calendar year.",
  },
  {
    id: "days",
    label: "Avg days per well",
    value: 18.4,
    decimals: 1,
    unit: "d",
    tag: "OPS",
    delta: -1.2,
    deltaFormat: "absolute",
    deltaLabel: "vs last quarter",
    intent: "lower-is-better",
    trend: [21.2, 20.8, 20.9, 20.1, 19.7, 19.9, 19.4, 19.0, 19.2, 18.8, 18.6, 18.4],
    description: "Spud to rig release, averaged over wells completed this quarter.",
  },
  {
    id: "npt",
    label: "Non-productive time",
    value: 4.2,
    decimals: 1,
    unit: "%",
    tag: "QUALITY",
    delta: 0.4,
    deltaFormat: "absolute",
    deltaLabel: "vs last month",
    intent: "lower-is-better",
    trend: [5.1, 4.8, 4.6, 4.9, 4.4, 4.1, 3.9, 4.0, 3.7, 3.9, 3.8, 4.2],
    description: "Share of rig time lost to unplanned events.",
  },
  {
    id: "workovers",
    label: "Workover jobs",
    value: 87,
    decimals: 0,
    tag: "WO",
    delta: 5.1,
    deltaLabel: "vs plan",
    intent: "higher-is-better",
    trend: [6, 13, 21, 28, 35, 43, 50, 57, 64, 72, 79, 87],
    description: "Workover and intervention jobs completed this year.",
  },
  {
    id: "budget",
    label: "Budget utilisation",
    value: 73,
    decimals: 0,
    unit: "%",
    tag: "COST",
    intent: "neutral",
    trend: [8, 15, 22, 29, 36, 43, 49, 55, 61, 66, 70, 73],
    description: "Year-to-date spend against the approved annual budget.",
  },
  {
    id: "requests",
    label: "Open support requests",
    value: 12,
    decimals: 0,
    tag: "SUPPORT",
    delta: -3,
    deltaFormat: "absolute",
    deltaLabel: "vs last week",
    intent: "lower-is-better",
    trend: [18, 17, 19, 16, 15, 17, 14, 15, 13, 14, 15, 12],
    description: "Support requests from the rigs not yet closed.",
  },
  {
    id: "sync",
    label: "DDR sync lag",
    value: 2.5,
    decimals: 1,
    unit: "h",
    tag: "SYNC",
    intent: "lower-is-better",
    delta: -0.5,
    deltaFormat: "absolute",
    deltaLabel: "vs yesterday",
    trend: [3.4, 3.1, 3.6, 2.9, 3.2, 2.8, 3.0, 2.7, 3.1, 2.6, 3.0, 2.5],
    description: "Time since the most recent daily drilling report was received.",
  },
];

/**
 * KOC-wide headline figures — the row above the group KPIs (directions E–I).
 *
 * PLACEHOLDER, every one. Plausible magnitudes so typography and count-ups can
 * be judged at realistic lengths; none is a published KOC figure and none may
 * be shown to a KOC team as one. Safety is here because the group row has no
 * safety figure, and at a drilling company it is usually the first number on
 * the wall.
 */
export const COMPANY_KPIS: Kpi[] = [
  {
    id: "crude",
    label: "Crude production",
    value: 2.41,
    decimals: 2,
    unit: "mb/d",
    tag: "PRODUCTION",
    delta: 1.7,
    deltaLabel: "vs last month",
    intent: "higher-is-better",
    trend: [2.31, 2.33, 2.32, 2.35, 2.36, 2.34, 2.37, 2.38, 2.37, 2.39, 2.37, 2.41],
    description: "Company crude oil production, million barrels per day, trailing 7-day average.",
  },
  {
    id: "capacity",
    label: "Sustainable capacity",
    value: 3.15,
    decimals: 2,
    unit: "mb/d",
    tag: "CAPACITY",
    delta: 0.05,
    deltaFormat: "absolute",
    deltaLabel: "vs last year",
    intent: "higher-is-better",
    trend: [3.05, 3.06, 3.06, 3.08, 3.09, 3.1, 3.1, 3.11, 3.12, 3.13, 3.14, 3.15],
    description: "Crude production the company can sustain for 90 days, million barrels per day.",
  },
  {
    id: "gas",
    label: "Gas production",
    value: 1540,
    decimals: 0,
    unit: "MMscf/d",
    tag: "GAS",
    delta: 3.2,
    deltaLabel: "vs last month",
    intent: "higher-is-better",
    trend: [1402, 1418, 1431, 1440, 1455, 1462, 1470, 1486, 1497, 1511, 1492, 1540],
    description: "Associated and non-associated gas, million standard cubic feet per day.",
  },
  {
    id: "ltif",
    label: "Lost-time injury frequency",
    value: 0.12,
    decimals: 2,
    tag: "SAFETY",
    delta: -0.03,
    deltaFormat: "absolute",
    deltaLabel: "vs last year",
    intent: "lower-is-better",
    trend: [0.18, 0.17, 0.17, 0.16, 0.16, 0.15, 0.15, 0.14, 0.14, 0.13, 0.13, 0.12],
    description: "Lost-time injuries per million man-hours, company and contractors, rolling 12 months.",
  },
];

/** Format a KPI value the one way every direction shows it. */
export function formatKpi(k: Pick<Kpi, "decimals">, v: number): string {
  return v.toLocaleString("en-GB", {
    minimumFractionDigits: k.decimals,
    maximumFractionDigits: k.decimals,
  });
}

/** "As of" stamp for the figures. Fixed, so screenshots are reproducible. */
export const DATA_AS_OF = "28 Sep 2026, 06:00";
