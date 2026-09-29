/**
 * Direction H v2 — "Asset View", daily-use round (V2-BRIEF.md).
 *
 * v1 was Mineralsoft's landing: a hero you look at. v2 is Mineralsoft's
 * DASHBOARD — the screen an operator opens every morning — which was the
 * better reference for this job all along:
 *
 *   Mineralsoft search ("Search hub location…")  →  the header's search, Ctrl+K
 *   its readout widgets ("Today Mined Oil ···")   →  a two-row KPI strip, static
 *   the asset panel on the left                    →  a rail: Pinned, Recent, team index
 *   the map with its selected block                →  the directory, every link visible
 *   the floating structure card + block model      →  the footer: the v1 hero, in full
 *
 * At 1440×900 every KPI and all 28 links are on the first screen. The WebGL
 * lives only in the footer, lazily mounted, and never behind anything you use.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { ArrowUpRight, Search, X } from "lucide-react";

import { cn } from "@koc/ui";

import {
  COMPANY_KPIS,
  DASHBOARD_COUNT,
  DATA_AS_OF,
  GROUP,
  KPIS,
  PLATFORM_LABEL,
  TEAMS,
  VIEWER,
  formatKpi,
  type Kpi,
  type Platform,
  type Team,
} from "../data";
import {
  DashboardAnchor,
  PLATFORM_ICON,
  PinToggle,
  matchDashboards,
  useDashboardMemory,
  useFindShortcut,
  type RememberedLink,
} from "../shared";
import { FieldScene } from "./FieldScene";
import { RigCard } from "./RigCard";
import { CONTACTS, FORMATIONS, fmtFt } from "./scene/strata";
import { ACTIVE_SURVEY, SURVEYS } from "./scene/surveys";
import { Delta, Eyebrow, TickHistogram, TwoWeight } from "./widgets";

const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

// Every well figure on the page is read back from the surveyed path.
const A = ACTIVE_SURVEY;
const BUILDS = A.plan.sections.flatMap((s) => (s.kind === "build" ? [s.rate] : []));
const LANDING_TVD = A.landing ? Math.round(A.landing.tvd / 10) * 10 : 0;
const BURGAN_OWC = CONTACTS.find((c) => c.fromTop === 3400)!.owc;
const COMPLETED = SURVEYS.filter((s) => s.plan.status !== "drilling").length;

const SCENE_CAPTION =
  `Illustrative cutaway of a Burgan-type anticline in Kuwait, drawn at true scale. ` +
  `A land rig on pad A is drilling a horizontal well: vertical to a kick-off point at ${fmtFt(A.kop)}, ` +
  `building at ${BUILDS.join(" then ")} degrees per 100 ft, landing in the Burgan sandstone at about ` +
  `${fmtFt(LANDING_TVD)} true vertical depth and running a ${fmtFt(A.lateral)} lateral above the oil–water contact. ` +
  `${WORDS[COMPLETED]} further wells are shown, one of them a deep exploration well to the Marrat. ` +
  `Formations from surface: ${FORMATIONS.map((f) => f.name).join(", ")}. Depths are illustrative.`;

const SHORT_PLATFORM: Record<Platform, string> = { "power-bi": "Power BI", sharepoint: "SharePoint", "web-app": "Web app" };

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export default function DirectionH2() {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLHeadingElement>(null);
  const teamRefs = useRef<Record<string, HTMLHeadingElement | null>>({});
  const memory = useDashboardMemory();
  useFindShortcut(searchRef);
  const searching = query.trim().length > 0;

  const jumpTo = (code: string) => {
    // A filtered-out team has no card to scroll to: clear the search first.
    if (searching) setQuery("");
    requestAnimationFrame(() => {
      const el = teamRefs.current[code];
      el?.scrollIntoView({ block: "start", behavior: "smooth" });
      el?.focus({ preventScroll: true });
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* First tab stop. A button, not href="#…": the viewer is hash-routed. */}
      <button
        type="button"
        onClick={() => {
          dirRef.current?.scrollIntoView({ block: "start" });
          dirRef.current?.focus({ preventScroll: true });
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-foreground focus:px-3 focus:py-2 focus:text-sm focus:text-background focus:outline-2 focus:outline-offset-2 focus:outline-ring"
      >
        Skip to dashboards
      </button>

      <SiteHeader query={query} setQuery={setQuery} searchRef={searchRef} dirRef={dirRef} />

      <main>
        <div className={cn(searching && "max-lg:hidden")}>
          <KpiStrip />
        </div>

        <div className="mx-auto grid max-w-[96rem] gap-6 px-4 pt-5 pb-12 sm:px-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className={cn("flex flex-col gap-5", searching && "max-lg:hidden")} aria-label="Your dashboards and teams">
            <YourDashboards {...memory} />
            <TeamIndex onJump={jumpTo} />
          </aside>
          <Directory
            query={query}
            dirRef={dirRef}
            teamRefs={teamRefs}
            isPinned={memory.isPinned}
            togglePin={memory.togglePin}
            onClear={() => {
              setQuery("");
              searchRef.current?.focus();
            }}
          />
        </div>
      </main>

      <AssetFooter />
    </div>
  );
}

// ── Header: identity + the search ──────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function SiteHeader({
  query,
  setQuery,
  searchRef,
  dirRef,
}: {
  query: string;
  setQuery: (q: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  dirRef: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[96rem] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 sm:px-8 lg:flex-nowrap">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary">
            <img src="/koc-logo.svg" alt="" className="size-7" />
          </span>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-sm font-semibold">
              {GROUP.abbr} Engineering Hub
              <span className="sr-only"> — {GROUP.name}</span>
            </h1>
            <p className="truncate text-2xs text-muted-foreground" aria-hidden="true">
              {GROUP.name}
            </p>
          </div>
        </div>

        {/* Mineralsoft's "Search hub location…" field, as the page's front door. */}
        <div role="search" className="order-last w-full lg:order-none lg:ml-6 lg:w-auto lg:max-w-xl lg:flex-1">
          <label htmlFor="h2-find" className="sr-only">
            Find a dashboard
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              ref={searchRef}
              id="h2-find"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Enter or ↓ goes straight to the first match; Enter again opens it.
                if (e.key === "Enter" || e.key === "ArrowDown") {
                  const first = dirRef.current
                    ?.closest("section")
                    ?.querySelector<HTMLAnchorElement>('a[target="_blank"]');
                  if (first) {
                    e.preventDefault();
                    first.focus();
                  }
                } else if (e.key === "Escape" && query) {
                  e.preventDefault();
                  setQuery("");
                }
              }}
              placeholder="Search dashboards, teams, platforms"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="h2-find-hint"
              className="h-10 w-full rounded-sm border border-input bg-card pr-20 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring [&::-webkit-search-cancel-button]:appearance-none"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : (
              <kbd
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded-sm bg-foreground px-1.5 py-0.5 font-mono text-2xs text-background"
              >
                {IS_MAC ? "⌘K" : "Ctrl K"}
              </kbd>
            )}
          </div>
          <p id="h2-find-hint" className="sr-only">
            {IS_MAC ? "Command K" : "Control K"} focuses this field from anywhere. Enter moves to the first match.
          </p>
        </div>

        <div className="ml-auto hidden shrink-0 items-center gap-3 text-right md:flex">
          <div className="leading-tight">
            <p className="text-xs">
              {greeting()}, {VIEWER.firstName}
            </p>
            <p className="font-mono text-2xs text-muted-foreground">As of {DATA_AS_OF}</p>
          </div>
          <div className="flex gap-1">
            <span className="rounded-sm bg-primary px-1.5 py-0.5 text-2xs font-medium text-primary-foreground">
              {TEAMS.length} teams
            </span>
            <span className="rounded-sm bg-foreground px-1.5 py-0.5 text-2xs font-medium text-background">
              {DASHBOARD_COUNT} dashboards
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

// ── KPIs: a readout strip, two rows, nothing moves ─────────────────────────

function KpiStrip() {
  return (
    <section aria-label="Key figures" className="border-b bg-card">
      <div className="mx-auto max-w-[96rem] px-4 sm:px-8">
        <KpiRow title="Kuwait Oil Company" tab="KOC" kpis={COMPANY_KPIS} className="border-b" />
        <KpiRow title={GROUP.name} tab={GROUP.abbr} kpis={KPIS} />
      </div>
    </section>
  );
}

function KpiRow({ title, tab, kpis, className }: { title: string; tab: string; kpis: Kpi[]; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 py-2 lg:flex-row lg:items-stretch lg:gap-0", className)}>
      {/* The dark tab from Mineralsoft's cards, as a row header. */}
      <h2 className="self-start lg:w-24 lg:shrink-0 lg:self-center">
        <span className="inline-block rounded-sm bg-foreground px-2 py-1 font-mono text-2xs text-background">{tab}</span>
        <span className="sr-only"> — {title}</span>
      </h2>
      {/* Each cell draws its own left rule; the list clips the first column's. */}
      <ul
        className={cn(
          "grid flex-1 grid-cols-2 gap-y-1 overflow-hidden",
          kpis.length > 4 ? "sm:grid-cols-4 xl:grid-cols-8" : "sm:grid-cols-4",
        )}
      >
        {kpis.map((k) => (
          <KpiCell key={k.id} k={k} />
        ))}
      </ul>
    </div>
  );
}

function KpiCell({ k }: { k: Kpi }) {
  return (
    <li data-kpi={k.id} className="-ml-px flex min-w-0 flex-col gap-0.5 border-l py-1 pr-2 pl-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-2xs leading-tight text-muted-foreground">{k.label}</h3>
        <TickHistogram values={k.trend} lead={0} className="h-3.5 w-10 shrink-0" />
      </div>
      <p className="flex items-baseline gap-1 leading-none">
        <span className="text-xl font-light tracking-tight tabular-nums">{formatKpi(k, k.value)}</span>
        {k.unit && <span className="text-2xs text-muted-foreground">{k.unit}</span>}
      </p>
      <Delta k={k} className="leading-tight" />
      <p className="sr-only">{k.description}</p>
    </li>
  );
}

// ── Your dashboards: Pinned + Recent ───────────────────────────────────────

function YourDashboards({
  pinned,
  recent,
  isPinned,
  togglePin,
  clearRecent,
}: ReturnType<typeof useDashboardMemory>) {
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Pinned dashboards">
        <RailHeading>Pinned</RailHeading>
        {pinned.length ? (
          <RememberedList items={pinned} isPinned={isPinned} togglePin={togglePin} />
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">Pin a dashboard with the pin icon to keep it here.</p>
        )}
      </section>
      <section aria-label="Recent dashboards">
        <RailHeading
          action={
            recent.length > 0 && (
              <button
                type="button"
                onClick={clearRecent}
                className="rounded-sm px-1 text-2xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                Clear
              </button>
            )
          }
        >
          Recent
        </RailHeading>
        {recent.length ? (
          <RememberedList items={recent} isPinned={isPinned} togglePin={togglePin} />
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">Dashboards you open will appear here.</p>
        )}
      </section>
    </div>
  );
}

function RailHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-xs font-medium text-foreground">
        <span aria-hidden="true" className="size-1.5 bg-primary" />
        {children}
      </h2>
      {action}
    </div>
  );
}

function RememberedList({
  items,
  isPinned,
  togglePin,
}: {
  items: RememberedLink[];
  isPinned: (id: string) => boolean;
  togglePin: (id: string) => void;
}) {
  return (
    <ul className="border-y">
      {items.map(({ link, team }) => (
        <LinkRow key={link.id} link={link} team={team} pinned={isPinned(link.id)} togglePin={togglePin} showTeam />
      ))}
    </ul>
  );
}

/** Mineralsoft's "My Units / My Hubs" tiles, as a jump index to the eight teams. */
function TeamIndex({ onJump }: { onJump: (code: string) => void }) {
  return (
    <nav aria-label="Jump to a team">
      <RailHeading>Teams</RailHeading>
      <ul className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-2">
        {TEAMS.map((t) => (
          <li key={t.code}>
            <button
              type="button"
              onClick={() => onJump(t.code)}
              className={cn(
                "flex h-full w-full flex-col items-start gap-1 rounded-sm px-2.5 py-2 text-left transition-colors duration-fast ease-out",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                // Neutral on purpose: Mineralsoft's orange and dark tiles meant
                // something ("mine", "overseen"); here no team outranks another.
                "border bg-card hover:bg-muted",
              )}
            >
              <span className="flex w-full items-baseline justify-between gap-2 font-mono text-2xs text-muted-foreground">
                <span>{t.code}</span>
                <span>{String(t.links.length).padStart(2, "0")}</span>
              </span>
              <span className="text-xs leading-tight font-medium">{t.shortName}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ── The directory ──────────────────────────────────────────────────────────

function Directory({
  query,
  dirRef,
  teamRefs,
  isPinned,
  togglePin,
  onClear,
}: {
  query: string;
  dirRef: RefObject<HTMLHeadingElement | null>;
  teamRefs: RefObject<Record<string, HTMLHeadingElement | null>>;
  isPinned: (id: string) => boolean;
  togglePin: (id: string) => void;
  onClear: () => void;
}) {
  const matches = useMemo(() => matchDashboards(query), [query]);
  const searching = query.trim().length > 0;
  const count = matches.reduce((n, m) => n + m.links.length, 0);
  // Announce results after typing settles, not on every keystroke.
  const [announce, setAnnounce] = useState("");
  useEffect(() => {
    if (!searching) {
      setAnnounce("");
      return;
    }
    const t = window.setTimeout(
      () =>
        setAnnounce(
          count
            ? `${count} ${count === 1 ? "dashboard" : "dashboards"} in ${matches.length} ${matches.length === 1 ? "team" : "teams"}`
            : `No dashboard matches “${query.trim()}”`,
        ),
      350,
    );
    return () => window.clearTimeout(t);
  }, [searching, count, matches.length, query]);

  return (
    <section aria-labelledby="h2-dir-title" className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id="h2-dir-title" ref={dirRef} tabIndex={-1} className="flex items-center gap-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <span aria-hidden="true" className="size-1.5 bg-primary" />
          {searching ? "Matching dashboards" : "All dashboards"}
        </h2>
        <p role="status" className="text-2xs text-muted-foreground">
          {announce}
        </p>
        {/* The directory drops visible platform names for width; the icons carry it. */}
        <p aria-hidden="true" className="ml-auto hidden items-center gap-3 text-2xs text-muted-foreground sm:flex">
          {(Object.keys(PLATFORM_LABEL) as Platform[]).map((p) => {
            const Icon = PLATFORM_ICON[p];
            return (
              <span key={p} className="inline-flex items-center gap-1">
                <Icon className="size-3.5" />
                {SHORT_PLATFORM[p]}
              </span>
            );
          })}
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-sm border border-dashed p-6">
          <p className="text-sm">
            Nothing matches <span className="font-medium">“{query.trim()}”</span>.
          </p>
          <p className="text-xs text-muted-foreground">Try a team code (EN71), a platform (Power BI) or part of a name.</p>
          <button
            type="button"
            onClick={onClear}
            className="rounded-sm bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Show all dashboards
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {matches.map(({ team, links }) => (
            <TeamCard
              key={team.code}
              team={team}
              links={links}
              headingRef={(el) => {
                teamRefs.current[team.code] = el;
              }}
              isPinned={isPinned}
              togglePin={togglePin}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TeamCard({
  team,
  links,
  headingRef,
  isPinned,
  togglePin,
}: {
  team: Team;
  links: Team["links"];
  headingRef: (el: HTMLHeadingElement | null) => void;
  isPinned: (id: string) => boolean;
  togglePin: (id: string) => void;
}) {
  const id = `h2-team-${team.code}`;
  return (
    <article aria-labelledby={id} className="flex flex-col rounded-sm border bg-card">
      <div className="flex items-start justify-between gap-2">
        {/* Mineralsoft's dark tab: "Insight 1 / The Fragmentation Issue". */}
        <h3
          id={id}
          ref={headingRef}
          tabIndex={-1}
          className="scroll-mt-24 rounded-tl-sm rounded-br-sm bg-foreground px-2.5 py-1 text-xs text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span className="font-mono text-background/65">{team.code}</span>
          <span aria-hidden="true" className="px-1 text-background/45">/</span>
          <span className="font-medium">{team.shortName}</span>
          <span className="sr-only">
            {" "}
            — {team.name}
            {team.abbr ? ` (${team.abbr})` : ""}
          </span>
        </h3>
        <span aria-hidden="true" className="shrink-0 px-2.5 pt-1 font-mono text-2xs text-muted-foreground">
          {String(team.links.length).padStart(2, "0")}
        </span>
      </div>
      <ul className="mt-1">
        {links.map((l) => (
          <LinkRow key={l.id} link={l} team={team} pinned={isPinned(l.id)} togglePin={togglePin} />
        ))}
      </ul>
    </article>
  );
}

/** One dashboard: the anchor, and the pin BESIDE it (never inside). */
function LinkRow({
  link,
  team,
  pinned,
  togglePin,
  showTeam = false,
}: {
  link: Team["links"][number];
  team: Team;
  pinned: boolean;
  togglePin: (id: string) => void;
  showTeam?: boolean;
}) {
  const Icon = PLATFORM_ICON[link.platform];
  return (
    <li className="flex items-center border-t first:border-t-0">
      <DashboardAnchor
        link={link}
        className={cn(
          "group flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1 pl-2.5 text-sm transition-colors duration-fast ease-out hover:bg-muted",
          "focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1 leading-snug">{link.label}</span>
        {showTeam && (
          <span aria-hidden="true" className="shrink-0 font-mono text-2xs text-muted-foreground">
            {team.code}
          </span>
        )}
        <ArrowUpRight
          className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-fast ease-out group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden="true"
        />
      </DashboardAnchor>
      <PinToggle
        link={link}
        pinned={pinned}
        onTogglePin={togglePin}
        className={cn(
          "mr-1 rounded-sm transition-colors duration-fast ease-out hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
          pinned ? "text-primary" : "text-muted-foreground/70 hover:text-foreground",
        )}
      />
    </li>
  );
}

// ── Footer: the v1 hero, in full ───────────────────────────────────────────

function AssetFooter() {
  // Mount the WebGL only as the footer approaches; FieldScene and RigCard
  // then pause themselves offscreen and when the tab is hidden.
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const wide = useMedia("(min-width: 80rem)");
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: "300px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto grid max-w-[96rem] lg:grid-cols-[minmax(20rem,5fr)_minmax(0,9fr)]">
        <div className="flex flex-col gap-6 px-4 py-10 sm:px-8 lg:py-14">
          <Eyebrow>Asset view · illustrative</Eyebrow>
          <TwoWeight light="Drilling & Workover" strong="Engineering Group" className="text-3xl leading-[1.05] sm:text-4xl" />
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            A section through a Burgan-type anticline, <span className="text-foreground">drawn at true scale</span>: the
            rig on pad A is drilling a horizontal well into the Burgan sands. Everything in it is built in code, from the
            strata to the rig.
          </p>
          <dl className="max-w-md divide-y border-y text-sm">
            <FooterRow swatch="bg-primary" term="Active well">
              KOP {fmtFt(A.kop)} · {BUILDS.join("→")}°/100 ft
            </FooterRow>
            <FooterRow swatch="bg-primary/40" term="Landing, lateral">
              {fmtFt(LANDING_TVD)} TVD · {fmtFt(A.lateral)}
            </FooterRow>
            <FooterRow swatch="bg-foreground" term="Completed wells">
              {COMPLETED} · 1 to the Marrat
            </FooterRow>
            <FooterRow swatch="bg-chart-2" term="Oil column">
              OWC {fmtFt(BURGAN_OWC)}
            </FooterRow>
          </dl>
          <div className="mt-auto space-y-2 text-2xs leading-relaxed text-muted-foreground">
            <p>
              {GROUP.name} · {GROUP.directorate} · {GROUP.company}
            </p>
            <p>
              Dashboard names, links and figures are placeholders. Formation names and order follow published Kuwait
              stratigraphy; depths are illustrative and are not any well&apos;s tops.
            </p>
          </div>
        </div>
        <div ref={ref} className="relative flex flex-col border-t lg:border-t-0 lg:border-l">
          <div className="relative h-[34rem] sm:h-[42rem] lg:h-[50rem]">
            {near && <FieldScene caption={SCENE_CAPTION} />}
          </div>
          {near && (
            <RigCard
              className={cn(
                wide ? "absolute bottom-6 left-6 w-60" : "mx-4 mb-8 sm:mx-8 sm:max-w-sm",
              )}
            />
          )}
        </div>
      </div>
    </footer>
  );
}

function FooterRow({ swatch, term, children }: { swatch: string; term: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="flex shrink-0 items-center gap-2 text-foreground">
        <span aria-hidden="true" className={cn("size-2 shrink-0", swatch)} />
        {term}
      </dt>
      <dd className="text-right font-mono text-xs text-muted-foreground">{children}</dd>
    </div>
  );
}
