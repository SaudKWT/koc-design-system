/**
 * Direction I v2 — "Exploded View", daily-use round (V2-BRIEF.md).
 *
 * v1 staged the plate first and made you scroll to the parts list. v2 is the
 * same catalogue plate read the other way round: the parts list is the page,
 * and the exploded bit is its colophon.
 *
 *   masthead   the group's name in INFRA's staggered uppercase, and the one
 *              search field (Ctrl+K)
 *   figures    twelve spec cells in a single strip — company, then group
 *   yours      pinned and recently opened dashboards
 *   parts list all eight teams, every link visible, packed into columns so the
 *              whole directory fits the first screen at 1440×900
 *   footer     Plate I: the exploded PDC bit, lazy-mounted, never behind
 *              anything you click
 */

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { ArrowDownRight, ArrowUpRight, Pause, Play, Search, X } from "lucide-react";

import { cn } from "@koc/ui";

import {
  COMPANY_KPIS,
  DASHBOARD_COUNT,
  DATA_AS_OF,
  GROUP,
  KPIS,
  TEAMS,
  PLATFORM_LABEL,
  formatKpi,
  type DashboardLink,
  type Kpi,
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
  useInView,
  useReducedMotion,
  type RememberedLink,
  type TeamMatch,
} from "../shared";
import { Mark } from "./Fallback";
import { Plate } from "./Plate";

const pad = (n: number) => String(n).padStart(2, "0");

type Memory = ReturnType<typeof useDashboardMemory>;

/** Scroll to a section and move focus with it, so the next Tab continues there. */
function focusSection(id: string, reduced: boolean) {
  document.getElementById(id)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  document.getElementById(`${id}-h`)?.focus({ preventScroll: true });
}

export default function DirectionI2() {
  const reduced = useReducedMotion();
  const memory = useDashboardMemory();
  const [query, setQuery] = useState("");
  const matches = useMemo(() => matchDashboards(query), [query]);
  const findRef = useRef<HTMLInputElement>(null);
  useFindShortcut(findRef);

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* First tab stop. A button, not href="#…": the viewer is hash-routed. */}
      <button
        type="button"
        onClick={() => focusSection("i2-teams", reduced)}
        className="sr-only rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50"
      >
        Skip to dashboards
      </button>

      <div className="space-y-3 px-2 pt-2 md:px-3 md:pt-3">
        {/* The plate's pale field, carried over from v1 — now a band, not a screen. */}
        <div
          className={cn(
            "rounded-2xl border",
            "bg-[radial-gradient(90%_140%_at_70%_0%,color-mix(in_oklab,var(--primary)_9%,var(--background))_0%,var(--background)_70%)]",
          )}
        >
          <Masthead findRef={findRef} query={query} setQuery={setQuery} matches={matches} />
          <Figures />
        </div>
        <YourDashboards memory={memory} />
        <PartsList matches={matches} query={query} clear={() => setQuery("")} memory={memory} reduced={reduced} />
      </div>

      <PlateFooter reduced={reduced} />
    </main>
  );
}

// ── Masthead ────────────────────────────────────────────────────────────────

function Masthead({
  findRef,
  query,
  setQuery,
  matches,
}: {
  findRef: RefObject<HTMLInputElement | null>;
  query: string;
  setQuery: (q: string) => void;
  matches: TeamMatch[];
}) {
  const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
  const found = matches.reduce((n, m) => n + m.links.length, 0);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && query) {
      e.preventDefault();
      setQuery("");
    } else if (e.key === "ArrowDown" || (e.key === "Enter" && query)) {
      // Straight to the first result: Enter again opens it.
      const first = document.querySelector<HTMLAnchorElement>("#i2-teams a[href]");
      if (first) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <header className="flex flex-col gap-4 px-4 pt-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:px-6 lg:pt-5">
      <div className="flex items-center gap-3">
        <Mark className="h-12 w-9 shrink-0" />
        <div className="min-w-0">
          <h1 className="text-[clamp(1.35rem,2vw,1.85rem)] font-medium uppercase leading-[0.9] tracking-[-0.035em] text-primary">
            <span className="block">Drilling &amp; Workover</span>
            <span className="block pl-[1.2em]">
              Engineering <span aria-hidden="true">—</span> Group
            </span>
          </h1>
          <p className="mt-1.5 text-xs text-muted-foreground">
            <span className="font-semibold text-primary">{GROUP.abbr}</span> · {GROUP.company}
            <span className="hidden sm:inline"> · {GROUP.directorate}</span>
          </p>
        </div>
      </div>

      <div role="search" className="relative w-full lg:max-w-xl">
        <label htmlFor="i2-find" className="sr-only">
          Find a dashboard
        </label>
        <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id="i2-find"
          ref={findRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Find a dashboard, team or EN code"
          autoComplete="off"
          spellCheck={false}
          aria-describedby="i2-find-hint"
          className="h-12 w-full rounded-full border border-input bg-card pl-11 pr-24 text-md shadow-xs transition-colors duration-fast ease-out placeholder:text-muted-foreground hover:border-primary/60 [&::-webkit-search-cancel-button]:hidden"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {query ? null : (
            <kbd aria-hidden="true" className="hidden rounded border bg-background px-1.5 py-0.5 font-mono text-2xs text-muted-foreground sm:inline">
              {isMac ? "⌘ K" : "Ctrl K"}
            </kbd>
          )}
        </span>
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              findRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors duration-fast ease-out hover:bg-accent hover:text-foreground"
            aria-label="Clear the search"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
        <p id="i2-find-hint" className="sr-only">
          {`Shortcut: ${isMac ? "Command" : "Control"} K. Filters the teams below as you type; Down arrow moves to the first result.`}
        </p>
        <p className="sr-only" aria-live="polite">
          {query ? `${found} ${found === 1 ? "dashboard matches" : "dashboards match"}` : ""}
        </p>
      </div>
    </header>
  );
}

// ── Figures: twelve spec cells ──────────────────────────────────────────────

function Figures() {
  return (
    <section aria-labelledby="i2-figures-h" className="px-4 pb-4 pt-4 lg:px-6 lg:pb-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="i2-figures-h" className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">
          Key figures
        </h2>
        <p className="text-2xs text-muted-foreground">
          <span className="font-serif text-xs italic">Placeholder values ·</span> as of {DATA_AS_OF}
        </p>
      </div>
      {/* One strip at xl: the company's four, then the group's eight. */}
      <div className="mt-2 grid gap-2 xl:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <FigureGroup label="Kuwait Oil Company" kpis={COMPANY_KPIS} cols="grid-cols-2 sm:grid-cols-4" />
        <FigureGroup label={`${GROUP.abbr} · Drilling & Workover`} kpis={KPIS} cols="grid-cols-2 sm:grid-cols-4 lg:grid-cols-8" />
      </div>
    </section>
  );
}

function FigureGroup({ label, kpis, cols }: { label: string; kpis: Kpi[]; cols: string }) {
  return (
    <div>
      <p className="mb-1 truncate font-serif text-xs italic text-muted-foreground">{label}</p>
      <ul className={cn("grid gap-px overflow-hidden rounded-lg border bg-border", cols)}>
        {kpis.map((k) => (
          <li key={k.id} data-kpi={k.id} className="flex flex-col bg-card px-2.5 py-2">
            <KpiCell k={k} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function KpiCell({ k }: { k: Kpi }) {
  const d = formatDelta(k);
  const s = kpiSentiment(k.delta, k.intent);
  const Arrow = (k.delta ?? 0) < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <>
      {/* The tag chip (LIVE, YTD…) was dropped here: at twelve cells a row it
          clipped the label, and the delta's basis already says the period. */}
      <p className="line-clamp-2 min-h-[2lh] text-xs leading-tight" title={k.description}>
        {k.label}
      </p>
      <p className="mt-1 flex flex-wrap items-start gap-x-0.5 text-primary">
        <span className="text-xl font-normal leading-none tracking-[-0.03em] tabular-nums">{formatKpi(k, k.value)}</span>
        {k.unit && <span className="text-2xs font-medium leading-none">{k.unit}</span>}
      </p>
      <p className="mt-1 text-2xs leading-tight">
        {d ? (
          <>
            <span aria-hidden="true" className={cn("inline-flex items-center font-medium tabular-nums", SENTIMENT_TEXT[s])}>
              {k.delta !== 0 && <Arrow className="size-3" />}
              {d}
            </span>{" "}
            <span aria-hidden="true" className="text-muted-foreground">
              {k.deltaLabel}
            </span>
            <span className="sr-only">{deltaSpeech(k)}</span>
          </>
        ) : (
          <span className="text-muted-foreground">No comparison</span>
        )}
      </p>
    </>
  );
}

// ── Your dashboards ─────────────────────────────────────────────────────────

function YourDashboards({ memory }: { memory: Memory }) {
  const { pinned, recent, isPinned, togglePin, clearRecent } = memory;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section aria-label="Pinned dashboards" className="rounded-xl border bg-card px-4 py-2.5">
        <SlotHeading>Pinned</SlotHeading>
        {pinned.length ? (
          <ChipList items={pinned} isPinned={isPinned} togglePin={togglePin} />
        ) : (
          <p className="font-serif text-sm italic text-muted-foreground">
            Pin a dashboard with the pin icon to keep it here.
          </p>
        )}
      </section>
      <section aria-label="Recent dashboards" className="rounded-xl border bg-card px-4 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <SlotHeading>Recent</SlotHeading>
          {recent.length > 0 && (
            <button
              type="button"
              onClick={clearRecent}
              className="rounded px-1.5 text-2xs text-muted-foreground transition-colors duration-fast ease-out hover:text-foreground"
            >
              Clear recent
            </button>
          )}
        </div>
        {recent.length ? (
          <ChipList items={recent} isPinned={isPinned} togglePin={togglePin} />
        ) : (
          <p className="font-serif text-sm italic text-muted-foreground">Dashboards you open will appear here.</p>
        )}
      </section>
    </div>
  );
}

function SlotHeading({ children }: { children: ReactNode }) {
  return <h2 className="mb-1.5 font-mono text-2xs uppercase tracking-wider text-muted-foreground">{children}</h2>;
}

function ChipList({
  items,
  isPinned,
  togglePin,
}: {
  items: RememberedLink[];
  isPinned: (id: string) => boolean;
  togglePin: (id: string) => void;
}) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map(({ link, team }) => {
        const Icon = PLATFORM_ICON[link.platform];
        return (
          <li key={link.id} className="flex items-center rounded-full border bg-background pl-3 pr-0.5">
            <DashboardAnchor
              link={link}
              className="flex items-center gap-1.5 rounded-sm py-1 text-sm font-medium transition-colors duration-fast ease-out hover:text-primary"
            >
              <Icon aria-hidden="true" className="size-3.5 text-primary" />
              {link.label}
              <span aria-hidden="true" className="font-mono text-2xs font-normal text-muted-foreground">
                {team.code}
              </span>
            </DashboardAnchor>
            <PinToggle
              link={link}
              pinned={isPinned(link.id)}
              onTogglePin={togglePin}
              className="ml-0.5 rounded-full text-muted-foreground transition-colors duration-fast ease-out hover:bg-accent hover:text-primary aria-pressed:text-primary"
            />
          </li>
        );
      })}
    </ul>
  );
}

// ── Parts list: the directory ───────────────────────────────────────────────

function PartsList({
  matches,
  query,
  clear,
  memory,
  reduced,
}: {
  matches: TeamMatch[];
  query: string;
  clear: () => void;
  memory: Memory;
  reduced: boolean;
}) {
  const found = matches.reduce((n, m) => n + m.links.length, 0);
  return (
    <section id="i2-teams" aria-labelledby="i2-teams-h" className="scroll-mt-3 rounded-2xl border bg-card px-4 py-4 lg:px-6">
      <div className="flex flex-col gap-2 border-b pb-3 md:flex-row md:items-baseline md:justify-between">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="font-mono text-xs text-muted-foreground">
            01 <span aria-hidden="true">—</span> Parts list
          </p>
          <h2 id="i2-teams-h" tabIndex={-1} className="text-lg font-medium tracking-tight outline-none">
            Teams &amp; dashboards
          </h2>
          <p className="font-serif text-sm italic text-muted-foreground">
            {query
              ? `${found} of ${DASHBOARD_COUNT} match “${query.trim()}”.`
              : `Eight teams, ${DASHBOARD_COUNT} dashboards. Each opens in a new tab; pin the ones you use.`}
          </p>
        </div>
        {!query && (
          <nav aria-label="Jump to a team" className="flex flex-wrap gap-0.5">
            {TEAMS.map((t) => (
              <button
                key={t.code}
                type="button"
                aria-label={`${t.code} ${t.shortName}`}
                onClick={() => focusSection(`i2-team-${t.code}`, reduced)}
                className="rounded px-1.5 py-1 font-mono text-xs text-primary transition-colors duration-fast ease-out hover:bg-accent"
              >
                {t.index}
              </button>
            ))}
          </nav>
        )}
      </div>

      {matches.length ? (
        // Columns, not rows: eight parts of uneven length pack into the first screen.
        <ol className="mt-4 gap-x-8 sm:columns-2 lg:columns-3 xl:columns-4">
          {matches.map((m) => (
            <TeamBlock key={m.team.code} match={m} memory={memory} />
          ))}
        </ol>
      ) : (
        <div className="py-8 text-center">
          <p className="font-serif text-md italic text-muted-foreground">No dashboard matches “{query.trim()}”.</p>
          <button
            type="button"
            onClick={clear}
            className="mt-3 rounded-full border border-input px-3 py-1 text-sm transition-colors duration-fast ease-out hover:bg-accent"
          >
            Clear the search
          </button>
        </div>
      )}
    </section>
  );
}

function TeamBlock({ match, memory }: { match: TeamMatch; memory: Memory }) {
  const { team: t, links } = match;
  const id = `i2-team-${t.code}`;
  return (
    <li id={id} className="mb-6 scroll-mt-3 break-inside-avoid">
      <div className="flex items-baseline gap-3 border-b border-foreground/15 pb-1.5">
        <span aria-hidden="true" className="w-11 shrink-0 text-3xl font-normal leading-none tracking-[-0.05em] text-primary tabular-nums">
          {t.index}
        </span>
        <div className="min-w-0">
          <h3 id={`${id}-h`} tabIndex={-1} className="text-sm font-semibold leading-tight outline-none">
            {t.shortName}
            {t.abbr && <span className="ml-1.5 font-mono text-2xs font-normal text-muted-foreground">{t.abbr}</span>}
          </h3>
          <p className="font-mono text-2xs text-muted-foreground">
            {t.code} ·{" "}
            <span aria-hidden="true">Qty {pad(t.links.length)}</span>
            <span className="sr-only">{`${t.links.length} ${t.links.length === 1 ? "dashboard" : "dashboards"}`}</span>
          </p>
        </div>
      </div>
      <ul>
        {links.map((l) => (
          <li key={l.id} className="flex items-center gap-1 border-b border-border/70">
            <LinkRow link={l} />
            <PinToggle
              link={l}
              pinned={memory.isPinned(l.id)}
              onTogglePin={memory.togglePin}
              className="rounded text-muted-foreground/70 transition-colors duration-fast ease-out hover:bg-accent hover:text-primary aria-pressed:text-primary"
            />
          </li>
        ))}
      </ul>
    </li>
  );
}

function LinkRow({ link: l }: { link: DashboardLink }) {
  const Icon = PLATFORM_ICON[l.platform];
  return (
    <DashboardAnchor
      link={l}
      className="group/link flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-sm py-1 text-sm transition-colors duration-fast ease-out hover:text-primary"
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 leading-snug">{l.label}</span>
      <span aria-hidden="true" className="hidden shrink-0 text-2xs text-muted-foreground 2xl:inline">
        {PLATFORM_LABEL[l.platform]}
      </span>
      <ArrowUpRight
        aria-hidden="true"
        className="size-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-fast ease-out group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5 group-hover/link:text-primary"
      />
    </DashboardAnchor>
  );
}

// ── Footer: Plate I ─────────────────────────────────────────────────────────

const WORDMARK = [
  { text: "Drilling &", indent: "" },
  { text: "Workover", indent: "pl-[1.55em]" },
  { text: "Engineering", indent: "" },
  { text: "— Group", indent: "pl-[2.3em]" },
];

function PlateFooter({ reduced }: { reduced: boolean }) {
  const [exploded, setExploded] = useState<boolean | null>(null);
  const [paused, setPaused] = useState(false);
  const [drawing, setDrawing] = useState(false);
  // The renderer mounts as the footer approaches, not at page load: the
  // directory above is what people come for, and it must not wait on WebGL.
  const [ref, near] = useInView<HTMLElement>("800px 0px 800px 0px");

  return (
    <footer
      ref={ref}
      className={cn(
        "relative mt-3 overflow-hidden border-t",
        "bg-[radial-gradient(110%_90%_at_72%_45%,color-mix(in_oklab,var(--primary)_10%,var(--background))_0%,var(--background)_70%)]",
      )}
    >
      <div className="relative flex min-h-[36rem] flex-col px-4 pb-6 pt-10 md:px-8 lg:h-[min(100svh,52rem)]">
        <div className="relative z-10 lg:max-w-[38%]">
          <p className="font-mono text-xs text-muted-foreground">
            02 <span aria-hidden="true">—</span> Plate I
          </p>
          {/* The group's name at INFRA's scale — decorative here; the h1 is above. */}
          <p
            aria-hidden="true"
            className="mt-4 text-[clamp(2.5rem,5vw,5.75rem)] font-medium uppercase leading-[0.86] tracking-[-0.04em] text-primary"
          >
            {WORDMARK.map((l) => (
              <span key={l.text} className={cn("block", l.indent)}>
                {l.text}
              </span>
            ))}
          </p>
          <p className="mt-6 max-w-sm font-serif text-sm italic leading-snug text-muted-foreground">
            {drawing
              ? "Fig. 1 — An 8½ in PDC drill bit in elevation: 16 mm cutters on the profile, API 4½ in REG pin. Drawn flat because this device has no hardware 3D."
              : "Fig. 1 — An 8½ in PDC drill bit: six blades, 16 mm cutters, API 4½ in REG pin. Modelled in code and exploded along its axis."}
          </p>
          <div role="group" aria-label="Plate controls" className="mt-4 flex items-center gap-1" hidden={drawing}>
            {(
              [
                [false, "Assembled"],
                [true, "Exploded"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={exploded === v}
                onClick={() => setExploded(v)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-fast ease-out",
                  exploded === v
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-accent",
                )}
              >
                {label}
              </button>
            ))}
            {!reduced && (
              <button
                type="button"
                aria-pressed={paused}
                aria-label="Pause the animation"
                onClick={() => setPaused(!paused)}
                className="ml-1 inline-flex size-7 items-center justify-center rounded-full border border-input bg-background transition-colors duration-fast ease-out hover:bg-accent"
              >
                {paused ? <Play className="size-3.5" aria-hidden="true" /> : <Pause className="size-3.5" aria-hidden="true" />}
              </button>
            )}
          </div>
        </div>

        {/* Below the text on narrow screens; the right 58% on desktop. Nothing
            functional ever sits on it. */}
        <div className="relative -mx-4 mt-6 h-[min(122vw,40rem)] md:-mx-8 lg:absolute lg:inset-y-0 lg:left-[42%] lg:right-0 lg:m-0 lg:h-auto">
          {near && (
            <Plate exploded={exploded} paused={paused} reduced={reduced} onFallback={() => setDrawing(true)} />
          )}
        </div>

        <div className="relative z-10 mt-6 flex flex-col gap-1 text-xs text-muted-foreground lg:mt-auto lg:max-w-[38%]">
          <p>
            <span className="font-semibold text-primary">{GROUP.abbr}</span> · {GROUP.name} · {GROUP.company}
          </p>
          <p className="font-serif italic">Dashboard names, links and every figure on this page are placeholders.</p>
        </div>
      </div>
    </footer>
  );
}
