/**
 * Direction F v2 — "Burgan", for daily use.
 *
 * v1 opened on a full-screen diorama and made you scroll for your dashboard.
 * v2 is built for the hundredth visit: find field and figures at the top, your
 * pinned and recent dashboards under them, all 28 links on the first screen,
 * and the diorama — with its four history chapters — moved whole into a large
 * footer, where nothing functional sits on or under it.
 *
 * Still Burgan: the fog palette, the horizon streak (static here), light
 * figures, tracked micro-labels, the teams' numerals in KOC blue.
 * Evaluation-only, like everything in bakeoff/landing.
 */

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowUpRight, Minus, Search, TrendingDown, TrendingUp, X } from "lucide-react";

import { cn } from "@koc/ui";

import {
  COMPANY_KPIS,
  DASHBOARD_COUNT,
  DATA_AS_OF,
  GROUP,
  KPIS,
  PLATFORM_LABEL,
  TEAMS,
  formatKpi,
  type DashboardLink,
  type Kpi,
  type Platform,
} from "../data";
import {
  DashboardAnchor,
  PLATFORM_ICON,
  PinToggle,
  SENTIMENT_TEXT,
  Sparkline,
  deltaSpeech,
  formatDelta,
  kpiSentiment,
  matchDashboards,
  useDashboardMemory,
  useFindShortcut,
  type RememberedLink,
  type TeamMatch,
} from "../shared";
import { Diorama, scrollToId } from "./Diorama";
import { CHAPTERS } from "./history";

const FOG_BG = {
  background:
    "radial-gradient(70% 45% at 0% 0%, color-mix(in oklab, var(--primary) 8%, transparent), transparent 70%), radial-gradient(60% 50% at 100% 30%, color-mix(in oklab, var(--success) 6%, transparent), transparent 70%), var(--background)",
};

const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

type Memory = ReturnType<typeof useDashboardMemory>;

export default function DirectionF2() {
  const memory = useDashboardMemory();
  const [query, setQuery] = useState("");
  const matches = useMemo(() => matchDashboards(query), [query]);
  return (
    <div className="min-h-screen text-foreground" style={FOG_BG}>
      <Header query={query} setQuery={setQuery} />
      <main className="mx-auto max-w-[90rem] px-4 sm:px-8">
        <Figures />
        <YourDashboards memory={memory} />
        <Directory matches={matches} query={query} setQuery={setQuery} memory={memory} />
      </main>
      <PageFooter />
    </div>
  );
}

// ── Header: identity and the find field ────────────────────────────────────

function Header({ query, setQuery }: { query: string; setQuery: (q: string) => void }) {
  const field = useRef<HTMLInputElement>(null);
  useFindShortcut(field);
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && query) {
      e.preventDefault();
      setQuery("");
    } else if (e.key === "Enter") {
      // Enter goes to the first result, so Enter again opens it.
      e.preventDefault();
      document.querySelector<HTMLAnchorElement>("#f2-directory a[href]")?.focus();
    }
  };
  return (
    <header className="relative mx-auto max-w-[90rem] px-4 pt-4 sm:px-8 sm:pt-5">
      <button
        type="button"
        onClick={() => scrollToId("f2-directory")}
        className={cn(
          "sr-only rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-2 focus-visible:z-50",
          FOCUS_RING,
        )}
      >
        Skip to dashboards
      </button>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="mr-auto min-w-0">
          <p className="text-2xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {GROUP.company}
            <span className="hidden md:inline"> · {GROUP.directorate}</span>
          </p>
          <h1 className="mt-0.5 text-base font-medium tracking-tight sm:text-lg">{GROUP.name}</h1>
        </div>
        <div role="search" className="relative w-full sm:w-[28rem]">
          <label htmlFor="f2-find" className="sr-only">
            Find a dashboard
          </label>
          <Search className="pointer-events-none absolute left-3.5 z-10 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            ref={field}
            id="f2-find"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="f2-find-hint"
            aria-controls="f2-directory"
            placeholder="Find a dashboard or team"
            className={cn(
              "h-10 w-full rounded-full border border-input bg-background/85 pl-10 pr-20 text-sm backdrop-blur placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden",
              FOCUS_RING,
            )}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                field.current?.focus();
              }}
              className={cn("absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground", FOCUS_RING)}
            >
              <X className="size-4" aria-hidden="true" />
              <span className="sr-only">Clear the search</span>
            </button>
          )}
          {/* Kept in the DOM while typing: the field's aria-describedby points at it. */}
          <kbd
            id="f2-find-hint"
            hidden={!!query}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border px-1.5 py-0.5 font-sans text-2xs text-muted-foreground"
          >
            <span className="sr-only">Shortcut: </span>Ctrl K
          </kbd>
        </div>
      </div>
      <Horizon />
    </header>
  );
}

/** Burgan's light-streak, at rest: a thin line and its glint under the header. No animation near the controls. */
function Horizon() {
  return (
    <div aria-hidden="true" className="relative mt-3 h-px">
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, transparent, color-mix(in oklab, var(--primary) 45%, transparent) 25%, color-mix(in oklab, var(--primary) 45%, transparent) 75%, transparent)",
        }}
      />
      <div
        className="absolute left-[22%] top-1/2 h-[3px] w-24 -translate-y-1/2 rounded-full blur-[2px]"
        style={{ background: "color-mix(in oklab, var(--primary) 70%, transparent)" }}
      />
    </div>
  );
}

// ── Figures: compact, all visible at 1280×630 ──────────────────────────────

function Delta({ k }: { k: Kpi }) {
  const d = formatDelta(k);
  if (!d) return <p className="truncate text-2xs text-muted-foreground">No comparison</p>;
  const s = kpiSentiment(k.delta, k.intent);
  const Icon = k.delta! > 0 ? TrendingUp : k.delta! < 0 ? TrendingDown : Minus;
  return (
    <p className={cn("flex min-w-0 items-center gap-1 text-2xs", SENTIMENT_TEXT[s])}>
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span aria-hidden="true" className="shrink-0 font-medium tabular-nums">
        {d}
        {k.deltaFormat === "absolute" && k.unit ? ` ${k.unit}` : ""}
      </span>
      <span aria-hidden="true" className="hidden truncate text-muted-foreground sm:inline">
        {k.deltaLabel}
      </span>
      <span className="sr-only">{deltaSpeech(k)}</span>
    </p>
  );
}

function KpiCell({ k, wide }: { k: Kpi; wide?: boolean }) {
  return (
    <li data-kpi={k.id} title={k.description} className="relative min-w-0 rounded-lg border bg-card/70 px-3 py-1.5 backdrop-blur sm:py-2">
      <p className="truncate text-2xs text-muted-foreground">{k.label}</p>
      <p className="mt-0.5 flex items-baseline gap-1 whitespace-nowrap">
        <span className={cn("font-light tabular-nums tracking-tight", wide ? "text-2xl leading-7" : "text-xl leading-6")}>{formatKpi(k, k.value)}</span>
        {k.unit && <span className="text-2xs text-muted-foreground">{k.unit}</span>}
      </p>
      <Delta k={k} />
      {wide && <Sparkline values={k.trend} className="absolute right-3 top-3 hidden h-6 w-16 text-primary/60 sm:block" />}
    </li>
  );
}

function Figures() {
  return (
    <section aria-labelledby="f2-figures-h" className="mt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 id="f2-figures-h" className="text-2xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Figures
        </h2>
        <p className="text-2xs text-muted-foreground">
          As of {DATA_AS_OF} · <span className="font-medium text-foreground">placeholder figures</span>
        </p>
      </div>
      <div className="mt-2 grid items-center gap-2 lg:grid-cols-[7rem_1fr]">
        <h3 className="text-2xs font-medium leading-snug text-muted-foreground">{GROUP.company}</h3>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {COMPANY_KPIS.map((k) => (
            <KpiCell key={k.id} k={k} wide />
          ))}
        </ul>
        <h3 className="mt-1 text-2xs font-medium leading-snug text-muted-foreground lg:mt-0">
          D&amp;W Engineering Group
        </h3>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {KPIS.map((k) => (
            <KpiCell key={k.id} k={k} />
          ))}
        </ul>
      </div>
    </section>
  );
}

// ── Your dashboards: pinned and recent ─────────────────────────────────────

function Chip({ item, memory }: { item: RememberedLink; memory: Memory }) {
  const Icon = PLATFORM_ICON[item.link.platform];
  const pinned = memory.isPinned(item.link.id);
  return (
    <li className="flex min-w-0 max-w-full items-center rounded-full border bg-card/80 backdrop-blur">
      <DashboardAnchor
        link={item.link}
        className={cn("flex min-w-0 items-center gap-1.5 whitespace-nowrap rounded-full py-1 pl-2.5 pr-1 text-xs font-medium transition-colors duration-fast ease-out hover:text-primary", FOCUS_RING)}
      >
        <Icon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span className="truncate">{item.link.label}</span>
        <span className="shrink-0 font-normal text-muted-foreground">· {item.team.code}</span>
      </DashboardAnchor>
      <PinToggle
        link={item.link}
        pinned={pinned}
        onTogglePin={memory.togglePin}
        className={cn("mr-0.5 rounded-full transition-colors duration-fast ease-out hover:bg-accent", pinned ? "text-primary" : "text-muted-foreground", FOCUS_RING)}
      />
    </li>
  );
}

function MemoryRegion({
  name,
  title,
  items,
  empty,
  memory,
  action,
}: {
  name: string;
  title: string;
  items: RememberedLink[];
  empty: string;
  memory: Memory;
  action?: ReactNode;
}) {
  return (
    <section aria-label={name} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-foreground/10 bg-background/40 px-3 py-1.5">
      <h2 className="w-full shrink-0 text-2xs sm:w-14 font-medium uppercase tracking-[0.2em] text-muted-foreground">{title}</h2>
      {items.length ? (
        <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {items.map((it) => (
            <Chip key={it.link.id} item={it} memory={memory} />
          ))}
        </ul>
      ) : (
        <p className="flex-1 text-xs text-muted-foreground">{empty}</p>
      )}
      {action}
    </section>
  );
}

function YourDashboards({ memory }: { memory: Memory }) {
  return (
    <div className="mt-3 grid gap-2 md:grid-cols-2">
      <MemoryRegion
        name="Pinned dashboards"
        title="Pinned"
        items={memory.pinned}
        empty="Pin a dashboard with the pin icon to keep it here."
        memory={memory}
      />
      <MemoryRegion
        name="Recent dashboards"
        title="Recent"
        items={memory.recent}
        empty="Dashboards you open will appear here."
        memory={memory}
        action={
          memory.recent.length > 0 && (
            <button
              type="button"
              onClick={memory.clearRecent}
              className={cn("shrink-0 rounded-full px-2 py-1 text-2xs text-muted-foreground hover:bg-accent hover:text-foreground", FOCUS_RING)}
            >
              Clear<span className="sr-only"> recent dashboards</span>
            </button>
          )
        }
      />
    </div>
  );
}

// ── The directory: every team, every link, first screen ────────────────────

function LinkRow({ link, memory }: { link: DashboardLink; memory: Memory }) {
  const Icon = PLATFORM_ICON[link.platform];
  const pinned = memory.isPinned(link.id);
  return (
    <li className="flex items-center gap-0.5 pr-1.5">
      <DashboardAnchor
        link={link}
        className="group flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-3 pr-1 text-sm transition-colors duration-fast ease-out hover:text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{link.label}</span>
        <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DashboardAnchor>
      <PinToggle
        link={link}
        pinned={pinned}
        onTogglePin={memory.togglePin}
        className={cn("rounded-md transition-colors duration-fast ease-out hover:bg-accent", pinned ? "text-primary" : "text-muted-foreground", FOCUS_RING)}
      />
    </li>
  );
}

const PLATFORMS: Platform[] = ["power-bi", "sharepoint", "web-app"];

function Directory({
  matches,
  query,
  setQuery,
  memory,
}: {
  matches: TeamMatch[];
  query: string;
  setQuery: (q: string) => void;
  memory: Memory;
}) {
  const found = matches.reduce((n, m) => n + m.links.length, 0);
  return (
    <section id="f2-directory" tabIndex={-1} aria-labelledby="f2-dir-h" className="mt-5 scroll-mt-4 pb-4 outline-none">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-foreground/15 pb-2">
        <h2 id="f2-dir-h" className="text-2xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Dashboards <span className="normal-case tracking-normal">· {TEAMS.length} teams · {DASHBOARD_COUNT}</span>
        </h2>
        {!query && (
          <nav aria-label="Jump to a team" className="-my-1 flex max-w-full gap-0.5 overflow-x-auto">
            {TEAMS.map((t) => (
              <button
                key={t.code}
                type="button"
                onClick={() => scrollToId(`f2-team-${t.code.toLowerCase()}`)}
                className={cn("shrink-0 rounded-full px-2 py-1 text-2xs font-medium tabular-nums text-muted-foreground hover:bg-accent hover:text-foreground", FOCUS_RING)}
              >
                {t.code}
                <span className="sr-only"> — {t.shortName}</span>
              </button>
            ))}
          </nav>
        )}
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {query && (found ? `${found} ${found === 1 ? "dashboard" : "dashboards"} for “${query}”` : "")}
        </p>
        <ul aria-label="Platforms" className="ml-auto hidden items-center gap-3 text-2xs text-muted-foreground md:flex">
          {PLATFORMS.map((p) => {
            const Icon = PLATFORM_ICON[p];
            return (
              <li key={p} className="flex items-center gap-1">
                <Icon className="size-3.5 text-primary" aria-hidden="true" />
                {PLATFORM_LABEL[p]}
              </li>
            );
          })}
        </ul>
      </div>

      {matches.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          No dashboard matches “{query}”.{" "}
          <button type="button" onClick={() => setQuery("")} className={cn("font-medium text-primary underline-offset-4 hover:underline", FOCUS_RING)}>
            Show all {DASHBOARD_COUNT}
          </button>
        </p>
      ) : (
        // Columns, not a grid: teams run 1 to 7 links, and a grid row is as tall as its tallest.
        <ol className="mt-4 gap-x-7 sm:columns-2 lg:columns-3 xl:columns-4">
          {matches.map(({ team: t, links }) => (
            <li
              key={t.code}
              id={`f2-team-${t.code.toLowerCase()}`}
              tabIndex={-1}
              className="mb-5 break-inside-avoid scroll-mt-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <article aria-labelledby={`f2-team-${t.code.toLowerCase()}-h`}>
                <div className="flex items-end gap-3">
                  <span aria-hidden="true" className="text-3xl font-extralight leading-none tabular-nums text-primary">
                    {t.index}
                  </span>
                  <div className="min-w-0">
                    <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t.code}</p>
                    <h3 id={`f2-team-${t.code.toLowerCase()}-h`} title={t.name} className="truncate text-sm font-medium leading-snug">
                      <span className="sr-only">{t.code} — </span>
                      {t.shortName}
                      {t.abbr && <span className="font-normal text-muted-foreground"> · {t.abbr}</span>}
                    </h3>
                  </div>
                </div>
                <ul className="mt-2 divide-y divide-border overflow-hidden rounded-lg border bg-card/75 backdrop-blur">
                  {links.map((l) => (
                    <LinkRow key={l.id} link={l} memory={memory} />
                  ))}
                </ul>
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ── Footer: the diorama, the history, the provenance ───────────────────────

function PageFooter() {
  // One line per source, listing every chapter that leans on it.
  const byHref = new Map<string, { label: string; href: string; chapters: string[] }>();
  for (const c of CHAPTERS)
    for (const s of c.sources) {
      const hit = byHref.get(s.href);
      if (hit) hit.chapters.push(c.numeral);
      else byHref.set(s.href, { ...s, chapters: [c.numeral] });
    }
  const sources = [...byHref.values()];
  return (
    <footer className="mt-12 border-t border-foreground/10">
      <Diorama />
      <div className="border-t border-foreground/10 bg-background">
        <div className="mx-auto grid max-w-[90rem] gap-8 px-4 pb-24 pt-8 text-xs text-muted-foreground sm:px-8 md:grid-cols-[1fr_2fr]">
          <div>
            <p className="font-medium text-foreground">
              {GROUP.company} · {GROUP.name}
            </p>
            <p className="mt-2 max-w-md">
              Evaluation build. Every dashboard name, link and figure on this page is a placeholder. The diorama is modelled
              in code to period proportions; it is an illustration, not a record of any specific site layout.
            </p>
            <p className="mt-2">Figures as of {DATA_AS_OF}.</p>
          </div>
          <div>
            <p className="font-medium text-foreground">History, sourced</p>
            <ul className="mt-2 grid gap-1 lg:grid-cols-2 lg:gap-x-8">
              {sources.map((s) => (
                <li key={s.href}>
                  <span className="tabular-nums">{s.chapters.join(", ")}</span> ·{" "}
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn("underline-offset-4 hover:text-foreground hover:underline", FOCUS_RING)}
                  >
                    {s.label}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
