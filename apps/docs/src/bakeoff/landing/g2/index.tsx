/**
 * Direction G v2 — "Wellsite drawing", the daily-use round (V2-BRIEF.md).
 *
 * v1 optimised for the first visit: a to-scale drawing of the wellsite as the
 * hero, the dashboards four sections down. v2 optimises for the hundredth:
 *   - a real search field in the header, Ctrl+K from anywhere;
 *   - every KPI in one compact Petronex hairline band, no count-ups;
 *   - Pinned and Recent right under it;
 *   - all 28 links in one dense grid of team "asset cards", visible at once
 *     on a desktop, each with a pin beside it;
 *   - the live drawing moved to a large footer, mounted only as it approaches,
 *     where naming a team still lights its corner of the wellsite.
 * The Petronex language stays: hairline grids, two-weight titles, numbered
 * section rules, mono codes, and line drawings of each team's equipment.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { ArrowUp, ArrowUpRight, Search, X } from "lucide-react";

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
  type DashboardLink,
  type Kpi,
  type Platform,
  type Team,
} from "../data";
import {
  DashboardAnchor,
  PLATFORM_ICON,
  PinToggle,
  SENTIMENT_TEXT,
  deltaSpeech,
  formatDelta,
  kpiSentiment,
  matchDashboards,
  useDashboardMemory,
  useFindShortcut,
  useReducedMotion,
  type RememberedLink,
} from "../shared";
import { PART_TEAMS } from "./gl/rig";
import { PART } from "./gl/scene";
import { Ticks } from "./micro";
import { useWellsiteThumbnails } from "./thumbs";
import { Wellsite, type TeamTag } from "./Wellsite";

const BASE = "#/landing/g2";

/** What each team's part of the wellsite is called. */
const PART_NAME: Record<number, string> = {
  [PART.office]: "Site office",
  [PART.rig]: "Mast, substructure and rig floor",
  [PART.logistics]: "Water, fuel and the water truck",
  [PART.wellControl]: "BOP stack, accumulator, choke manifold",
  [PART.well]: "The well: casing programme",
  [PART.materials]: "Pipe racks and catwalk",
  [PART.producer]: "Producing well and its tree",
};

/** Platform marker colours — Petronex's legend squares, in semantic tokens. */
const PLATFORM_SQUARE: Record<Platform, string> = {
  "power-bi": "bg-chart-2",
  sharepoint: "bg-info",
  "web-app": "bg-primary",
};

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const pinClass =
  "rounded-sm text-muted-foreground transition-colors duration-fast ease-out hover:bg-accent hover:text-foreground aria-pressed:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const teamId = (t: Team) => `g2-team-${t.code.toLowerCase()}`;

/**
 * Scroll to an element and move focus to it (or its first `tabIndex=-1` child).
 * Never through `href="#…"`: the viewer is hash-routed, a hash link would leave.
 */
function useJump() {
  const reduced = useReducedMotion();
  return (id: string, block: ScrollLogicalPosition = "start") => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block });
    const target = el.matches("[tabindex='-1']") ? el : el.querySelector<HTMLElement>("[tabindex='-1']");
    target?.focus({ preventScroll: true });
  };
}

function Square({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-1.5 shrink-0", className)} />;
}

/** Petronex's section index: a label, a three-digit count, a ruled progress line. */
function SectionLabel({ label, index, total = 4 }: { label: string; index: number; total?: number }) {
  return (
    <div className="w-40" aria-hidden="true">
      <div className="flex items-baseline justify-between text-2xs">
        <span className="text-foreground">{label}</span>
        <span className="font-mono text-muted-foreground tabular-nums">{String(index).padStart(3, "0")}</span>
      </div>
      <div className="relative mt-1.5 h-px bg-border">
        <span className="absolute -top-1 left-0 h-2 w-px bg-foreground" />
        <span className="absolute inset-y-0 left-0 bg-foreground" style={{ width: `${(index / total) * 100}%` }} />
        <span className="absolute -top-1 h-2 w-px bg-foreground" style={{ left: `${(index / total) * 100}%` }} />
      </div>
    </div>
  );
}

// ── header: identity and the search field ───────────────────────────────────

function Header({
  query,
  onQuery,
  onFirstResult,
  onSkip,
}: {
  query: string;
  onQuery: (q: string) => void;
  onFirstResult: () => void;
  onSkip: (e: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  useFindShortcut(field);
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && query) {
      e.preventDefault();
      onQuery("");
    } else if ((e.key === "ArrowDown" || e.key === "Enter") && query) {
      e.preventDefault();
      onFirstResult();
    }
  };
  return (
    <header className="relative border-b border-border">
      {/* First tab stop. Inside the banner so it sits in a landmark: axe only
          exempts skip links that target an in-page id, and this one has to keep
          the viewer's hash route. */}
      <a
        href={`${BASE}/dashboards`}
        onClick={onSkip}
        className={cn(
          "sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground",
          focusRing,
        )}
      >
        Skip to dashboards
      </a>
      <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6 lg:flex-nowrap lg:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center bg-primary">
            <img src="/koc-logo.svg" alt="" className="size-7" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-2xs text-muted-foreground">{GROUP.company}</div>
            <div className="truncate text-sm font-semibold">
              {GROUP.abbr} <span className="font-light text-muted-foreground">Engineering hub</span>
            </div>
          </div>
        </div>
        <div role="search" className="order-last w-full lg:order-none lg:max-w-xl lg:flex-1">
          <label htmlFor="g2-find" className="sr-only">
            Find a dashboard or team
          </label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={field}
              id="g2-find"
              type="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              onKeyDown={onKey}
              placeholder="Find a dashboard, team or platform"
              aria-describedby="g2-find-hint"
              autoComplete="off"
              spellCheck={false}
              className={cn(
                "h-10 w-full rounded-sm border border-input bg-card pl-9 pr-24 text-sm text-foreground placeholder:text-muted-foreground",
                "[&::-webkit-search-cancel-button]:hidden",
                focusRing,
              )}
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {query && (
                <button
                  type="button"
                  onClick={() => onQuery("")}
                  aria-label="Clear search"
                  className={cn("inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent", focusRing)}
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              )}
              <kbd aria-hidden="true" className="rounded-sm border border-border bg-secondary px-1.5 py-0.5 font-mono text-2xs text-secondary-foreground">
                Ctrl K
              </kbd>
            </div>
          </div>
          <p id="g2-find-hint" className="sr-only">
            Ctrl+K focuses this field from anywhere. Results filter the directory below; press Down to reach the first one.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-2xs text-muted-foreground lg:ml-0">
          <span className="hidden font-mono tabular-nums xl:inline">As of {DATA_AS_OF}</span>
          <span className="inline-flex items-center gap-1.5 bg-secondary px-1.5 py-0.5 text-secondary-foreground">
            Placeholder data
            <Square className="bg-warning" />
          </span>
        </div>
      </div>
    </header>
  );
}

// ── KPIs: one compact hairline band ─────────────────────────────────────────

function KpiCell({ k, big = false }: { k: Kpi; big?: boolean }) {
  const s = kpiSentiment(k.delta, k.intent);
  return (
    <div data-kpi={k.id} className="flex min-w-0 flex-col bg-card px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-2xs leading-tight text-muted-foreground">{k.label}</span>
        {big && (
          <span aria-hidden="true" className="shrink-0 bg-secondary px-1 font-mono text-2xs leading-4 text-secondary-foreground">
            {k.tag}
          </span>
        )}
      </div>
      <div className="mt-auto flex items-end justify-between gap-2 pt-1">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1">
            <span data-slot="kpi-value" className={cn("leading-none tracking-tight tabular-nums", big ? "text-2xl font-light" : "text-lg font-semibold")}>
              {formatKpi(k, k.value)}
            </span>
            {k.unit && <span className="text-2xs text-muted-foreground">{k.unit}</span>}
          </div>
          {k.delta !== undefined ? (
            <div className="mt-1 truncate text-2xs leading-tight">
              <span aria-hidden="true">
                <span className={cn("font-medium tabular-nums", SENTIMENT_TEXT[s])}>{formatDelta(k)}</span>{" "}
                <span className="text-muted-foreground">{k.deltaLabel}</span>
              </span>
              <span className="sr-only">{deltaSpeech(k)}</span>
            </div>
          ) : (
            <div aria-hidden="true" className="mt-1 truncate text-2xs leading-tight text-muted-foreground">
              {k.tag === "COST" ? "of annual budget, YTD" : " "}
            </div>
          )}
        </div>
        {/* only the wide company cells have room for a trend beside the delta */}
        {big && <Ticks values={k.trend} relative className="h-6 w-20 shrink-0" />}
      </div>
    </div>
  );
}

function Kpis() {
  return (
    <section aria-labelledby="g2-kpi-title">
      <h2 id="g2-kpi-title" className="sr-only">
        Key figures, as of {DATA_AS_OF}
      </h2>
      <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-[6.5rem_repeat(4,minmax(0,1fr))]">
        <div aria-hidden="true" className="hidden flex-col justify-between bg-background px-3 py-2 sm:flex">
          <span className="font-mono text-2xs text-foreground">KOC</span>
          <span className="text-2xs leading-tight text-muted-foreground">Company</span>
        </div>
        {COMPANY_KPIS.map((k) => (
          <KpiCell key={k.id} k={k} big />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-px border border-t-0 border-border bg-border sm:grid-cols-[6.5rem_repeat(4,minmax(0,1fr))] xl:grid-cols-[6.5rem_repeat(8,minmax(0,1fr))]">
        <div aria-hidden="true" className="hidden flex-col justify-between bg-background px-3 py-2 sm:flex sm:row-span-2 xl:row-span-1">
          <span className="font-mono text-2xs text-foreground">{GROUP.abbr}</span>
          <span className="text-2xs leading-tight text-muted-foreground">Group</span>
        </div>
        {KPIS.map((k) => (
          <KpiCell key={k.id} k={k} />
        ))}
      </div>
    </section>
  );
}

// ── your dashboards ─────────────────────────────────────────────────────────

function Chip({
  item,
  pinned,
  onTogglePin,
}: {
  item: RememberedLink;
  pinned: boolean;
  onTogglePin: (id: string) => void;
}) {
  const Icon = PLATFORM_ICON[item.link.platform];
  return (
    <li className="flex items-center gap-0.5 border border-border bg-card pr-1">
      <DashboardAnchor
        link={item.link}
        className={cn(
          "group flex min-w-0 items-center gap-2 py-1.5 pl-2.5 pr-1 text-sm transition-colors duration-fast ease-out hover:text-primary",
          focusRing,
        )}
      >
        <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
        <span className="truncate">{item.link.label}</span>
        <span className="font-mono text-2xs text-muted-foreground">{item.team.code}</span>
      </DashboardAnchor>
      <PinToggle link={item.link} pinned={pinned} onTogglePin={onTogglePin} className={pinClass} />
    </li>
  );
}

function YourDashboards({ memory }: { memory: ReturnType<typeof useDashboardMemory> }) {
  const { pinned, recent, isPinned, togglePin, clearRecent } = memory;
  return (
    <div className="grid gap-x-6 gap-y-3 lg:grid-cols-2">
      <section aria-label="Pinned dashboards" className="min-w-0">
        <div className="flex items-baseline justify-between border-b border-foreground pb-1.5 text-2xs">
          <span className="text-foreground">Pinned</span>
          <span className="font-mono text-muted-foreground tabular-nums">{String(pinned.length).padStart(2, "0")}</span>
        </div>
        {pinned.length ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {pinned.map((p) => (
              <Chip key={p.link.id} item={p} pinned onTogglePin={togglePin} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-2xs text-muted-foreground">Pin a dashboard with the pin icon to keep it here.</p>
        )}
      </section>
      <section aria-label="Recent dashboards" className="min-w-0">
        <div className="flex items-baseline justify-between border-b border-foreground pb-1.5 text-2xs">
          <span className="text-foreground">Recent</span>
          {recent.length > 0 && (
            <button
              type="button"
              onClick={clearRecent}
              className={cn("rounded-sm text-muted-foreground transition-colors duration-fast ease-out hover:text-foreground", focusRing)}
            >
              Clear
            </button>
          )}
        </div>
        {recent.length ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {recent.map((r) => (
              <Chip key={r.link.id} item={r} pinned={isPinned(r.link.id)} onTogglePin={togglePin} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-2xs text-muted-foreground">Dashboards you open appear here.</p>
        )}
      </section>
    </div>
  );
}

// ── the directory: eight team asset cards ───────────────────────────────────

function LinkRow({ link, pinned, onTogglePin }: { link: DashboardLink; pinned: boolean; onTogglePin: (id: string) => void }) {
  const Icon = PLATFORM_ICON[link.platform];
  return (
    <li className="flex items-center gap-1 pr-2">
      <DashboardAnchor
        link={link}
        className={cn(
          "group flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-4 pr-1 text-sm transition-colors duration-fast ease-out hover:bg-accent hover:text-primary",
          focusRing,
        )}
      >
        <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
        <span className="min-w-0 flex-1">{link.label}</span>
        <ArrowUpRight
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-fast ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
        />
      </DashboardAnchor>
      <PinToggle link={link} pinned={pinned} onTogglePin={onTogglePin} className={pinClass} />
    </li>
  );
}

function TeamCard({
  team,
  links,
  thumb,
  isPinned,
  onTogglePin,
}: {
  team: Team;
  links: DashboardLink[];
  thumb?: string;
  isPinned: (id: string) => boolean;
  onTogglePin: (id: string) => void;
}) {
  const part = PART_TEAMS[team.code];
  const headingId = `${teamId(team)}-name`;
  return (
    <article id={teamId(team)} aria-labelledby={headingId} className="flex scroll-mt-6 flex-col border-b border-r border-border bg-card">
      <div className="flex items-start gap-3 border-b border-border px-4 pb-2.5 pt-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-2xs">
            <span className="border border-input px-1 font-mono text-foreground">{team.code}</span>
            <span className="font-mono text-muted-foreground tabular-nums">
              {String(team.links.length).padStart(2, "0")}
            </span>
          </div>
          <h3 id={headingId} tabIndex={-1} className="mt-1.5 text-sm leading-tight outline-none">
            <span className="font-semibold">{team.shortName}</span>
            {team.abbr && <span className="font-light text-muted-foreground"> {team.abbr}</span>}
          </h3>
          <p className="mt-0.5 line-clamp-1 text-2xs text-muted-foreground" title={team.name}>
            {team.name}
          </p>
        </div>
        {/* Beside the title, never under the links: the team's corner of the wellsite. */}
        <div aria-hidden="true" className="h-[4.5rem] w-[6.5rem] shrink-0" title={PART_NAME[part]}>
          {thumb ? <img src={thumb} alt="" className="size-full object-contain" /> : null}
        </div>
      </div>
      <ul className="flex-1 divide-y divide-border py-0.5">
        {links.map((l) => (
          <LinkRow key={l.id} link={l} pinned={isPinned(l.id)} onTogglePin={onTogglePin} />
        ))}
      </ul>
    </article>
  );
}

function Directory({
  query,
  thumbs,
  memory,
}: {
  query: string;
  thumbs: Record<number, string>;
  memory: ReturnType<typeof useDashboardMemory>;
}) {
  const results = useMemo(() => matchDashboards(query), [query]);
  const count = results.reduce((n, r) => n + r.links.length, 0);
  const jump = useJump();
  return (
    <section id="g2-dashboards" aria-labelledby="g2-dashboards-title" className="scroll-mt-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h2 id="g2-dashboards-title" tabIndex={-1} className="text-xl leading-none tracking-tight outline-none">
          <span className="font-semibold">Dashboards</span> <span className="font-light">by team</span>
        </h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-muted-foreground">
          {(Object.keys(PLATFORM_LABEL) as Platform[]).map((p) => {
            const Icon = PLATFORM_ICON[p];
            return (
              <span key={p} className="inline-flex items-center gap-1.5">
                <Icon aria-hidden="true" className="size-3" />
                {PLATFORM_LABEL[p]}
                <Square className={PLATFORM_SQUARE[p]} />
              </span>
            );
          })}
          <span role="status" className="font-mono tabular-nums text-foreground">
            {query ? `${count} of ${DASHBOARD_COUNT} match` : `${DASHBOARD_COUNT} dashboards · ${TEAMS.length} teams`}
          </span>
        </div>
      </div>
      {/* A jump bar where the teams stack out of sight; on a desktop they are all in view already. */}
      {!query && (
        <nav aria-label="Jump to a team" className="mt-3 lg:hidden">
          <ul className="flex flex-wrap gap-1.5">
            {TEAMS.map((t) => (
              <li key={t.code}>
                <button
                  type="button"
                  onClick={() => jump(teamId(t))}
                  className={cn("border border-input px-1.5 py-1 font-mono text-2xs hover:bg-accent", focusRing)}
                >
                  {t.code}
                  <span className="sr-only">{` ${t.shortName}`}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {results.length ? (
        <div className="mt-3 grid border-l border-t border-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {/* per-card borders, not gap-over-background hairlines: a filtered grid leaves no grey filler */}
          {results.map(({ team, links }) => (
            <TeamCard
              key={team.code}
              team={team}
              links={links}
              thumb={thumbs[PART_TEAMS[team.code]]}
              isPinned={memory.isPinned}
              onTogglePin={memory.togglePin}
            />
          ))}
        </div>
      ) : (
        <p className="mt-3 border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          No dashboard matches “{query}”. Try a team code such as EN71, a platform, or fewer words.
        </p>
      )}
    </section>
  );
}

// ── the footer: the wellsite, in full ───────────────────────────────────────

/** True once the element is within `margin` of the viewport; heavy renderers mount on it. */
function useNear<T extends Element>(margin = "300px") {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [margin, near]);
  return [ref, near] as const;
}

function WellsiteFooter() {
  const [stageRef, near] = useNear<HTMLDivElement>();
  const [tagged, setTagged] = useState<Team | null>(null);
  const jump = useJump();
  const tag: TeamTag | null = tagged ? { code: tagged.code, name: tagged.shortName, part: PART_TEAMS[tagged.code] } : null;
  const stage = "h-[28rem] sm:h-[34rem] lg:h-[min(46rem,calc(100vh-7rem))] lg:min-h-[36rem]";
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto max-w-[90rem] px-4 pt-10 sm:px-6 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionLabel label="Wellsite" index={4} />
            <h2 className="mt-6 text-3xl leading-tight tracking-tight">
              <span className="block font-semibold">The wellsite,</span>
              <span className="block font-light">drawn to scale</span>
            </h2>
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              A 2,000 HP land rig and its pad, above grade to scale. Every team has a home on it — point at one to
              find it.
            </p>
            <nav aria-label="Teams on the wellsite" className="mt-8">
              <div className="flex items-baseline justify-between border-b border-foreground pb-2 text-2xs text-muted-foreground">
                <span>Find your team on the wellsite</span>
                <span className="font-mono">Code</span>
              </div>
              <ul>
                {TEAMS.map((t) => {
                  const on = tagged?.code === t.code;
                  return (
                    <li key={t.code}>
                      <button
                        type="button"
                        onClick={() => jump(teamId(t), "center")}
                        onMouseEnter={() => setTagged(t)}
                        onMouseLeave={() => setTagged(null)}
                        onFocus={() => setTagged(t)}
                        onBlur={() => setTagged(null)}
                        aria-describedby="g2-index-hint"
                        className={cn(
                          "grid w-full grid-cols-[2rem_1fr_auto] items-baseline gap-2 border-b border-border py-2 text-left text-sm transition-colors duration-fast ease-out",
                          on ? "text-primary" : "text-foreground hover:text-primary",
                          focusRing,
                        )}
                      >
                        <span className="font-mono text-2xs text-muted-foreground tabular-nums">{t.index}</span>
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate">{t.shortName}</span>
                          <Square className={cn("transition-opacity duration-fast ease-out", on ? "bg-primary opacity-100" : "opacity-0")} />
                        </span>
                        <span className="font-mono text-2xs text-muted-foreground">{t.code}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p id="g2-index-hint" className="mt-2 text-2xs text-muted-foreground">
                Point at a team to light its equipment; select it to go to its dashboards.
              </p>
            </nav>
          </div>
          <div ref={stageRef} className="lg:col-span-8">
            {near ? (
              <Wellsite tag={tag} stageClassName={stage} />
            ) : (
              // Same footprint before mount, so nothing jumps when the drawing arrives.
              <div aria-hidden="true" className={cn(stage, "w-full")} />
            )}
          </div>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border pb-20 pt-6 text-2xs text-muted-foreground">
          <p>
            {GROUP.company} · {GROUP.name} · {GROUP.directorate}
          </p>
          <p>Every dashboard name, link and figure on this page is a placeholder. Data as of {DATA_AS_OF}.</p>
          <button
            type="button"
            onClick={() => jump("g2-top")}
            className={cn("inline-flex items-center gap-1.5 rounded-sm px-1 hover:text-foreground", focusRing)}
          >
            <ArrowUp aria-hidden="true" className="size-3" />
            Back to top
          </button>
        </div>
      </div>
    </footer>
  );
}

// ── page ────────────────────────────────────────────────────────────────────

export default function DirectionG2() {
  const [query, setQuery] = useState("");
  const memory = useDashboardMemory();
  const thumbs = useWellsiteThumbnails();
  const jump = useJump();

  const skip = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    jump("g2-dashboards");
  };
  const firstResult = () => {
    const a = document.querySelector<HTMLAnchorElement>("#g2-dashboards article a");
    a?.focus();
  };

  return (
    <div id="g2-top" className="min-h-screen bg-background text-foreground">
      <Header query={query} onQuery={setQuery} onFirstResult={firstResult} onSkip={skip} />
      <main className="mx-auto max-w-[90rem] px-4 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 pb-3 pt-4">
          <h1 tabIndex={-1} className="text-2xl leading-none tracking-tight outline-none">
            <span className="font-semibold">Drilling &amp; Workover</span>{" "}
            <span className="font-light">Engineering Group</span>
          </h1>
          <p className="text-2xs text-muted-foreground">
            Welcome back, {VIEWER.firstName} · {DASHBOARD_COUNT} dashboards · {TEAMS.length} teams
          </p>
        </div>
        <Kpis />
        <div className="mt-5">
          <YourDashboards memory={memory} />
        </div>
        <div className="mt-7">
          <Directory query={query} thumbs={thumbs} memory={memory} />
        </div>
      </main>
      <WellsiteFooter />
    </div>
  );
}
