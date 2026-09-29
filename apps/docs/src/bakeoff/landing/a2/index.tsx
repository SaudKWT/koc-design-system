/**
 * Direction A v2 — "Multilateral", the daily-use round.
 *
 * Still the group drawn as one multilateral well, orthographic and side-on: a pale surface with
 * the group's eight readings standing on the ground line, and below it, on KOC blue, one mother
 * bore that kicks off eight laterals in code order, each team's dashboards sitting on its lateral
 * as stations. v1 already put all 28 stations on one screen; v2 keeps that and reworks the sheet
 * for the hundredth visit (V2-BRIEF.md):
 *  - a visible find field in the header (Ctrl K) that filters the drawing in place — the
 *    non-matching laterals drop out and the bore shortens to fit, so a match is always near the
 *    top; Enter opens the first match, ↓ moves to it, Esc clears;
 *  - the head of the sheet holds YOUR stations: a Pinned line and a Recent line, drawn as
 *    reference lines on the ruler, above EN01;
 *  - every station has a pin beside it;
 *  - the readings are tighter, and the title block is one line, so the ground line rises ~60px;
 *  - the directory is static: v1's construction draw-on and bit moved to the footer, which now
 *    holds the whole well as a to-scale drawing (Section A–A).
 *
 * ── MOTION INVENTORY ─────────────────────────────────────────────────────────────────────────
 *  Directory, readings, find field .... STATIC. Nothing moves on load, and nothing moves under
 *     or over a station, a reading or the field. Filtering is instant (no animated reflow).
 *  Row hover / focus-within (CSS) ....... the row's lateral, kick-off and toe go from 70% to full
 *     strength and 1 → 1.5px, duration-fast ease-out. Reduced: instant.
 *  Station hover / focus-visible (CSS) .. the label underline grows by background-size 0→100%,
 *     ↗ nudges 2px, a 10% tint; duration-fast ease-out. Reduced: instant.
 *  Pin hover / focus (CSS) .............. tint and full-strength ink, duration-fast ease-out.
 *     Reduced: instant.
 *  Jump strip (phone) ................... scrolls smoothly to the team (browser smooth scroll).
 *     Reduced: an instant jump.
 *  Footer · Section A–A (AMBIENT, CSS) .. (1) construction draw-on, once per page view, when the
 *     footer first comes into view: the ground line rules out from the wellhead (duration-slower),
 *     the casing walls draw down, the bore draws to TD (2 × duration-slower), and each lateral
 *     draws out from its kick-off as the bore passes it (2 × duration-slower), its station ticks
 *     dropping 60ms apart (duration-fast). Last line ≈ 1.3s. LINES ONLY — every label is
 *     always visible. Base style = drawn; keyframes animate only `from`.
 *     (2) the bit, after the draw-on: a 10×4 capsule runs down the bore and out along one
 *     lateral (offset-path, ease-in-out, 1.4s), fades at the toe, and the next lateral's run
 *     starts 2s after the last — a 16s cycle through all eight, looping. It plays only while the
 *     footer is on screen AND the tab is visible (IntersectionObserver + visibilitychange);
 *     otherwise its animation is removed, not merely paused. While a search is in the field
 *     (which can pull the footer up under the results) the drawing holds still: no draw-on, no
 *     bit. Reduced (OS or the viewer's flag): no draw-on, no bit (`display: none`).
 * No count-ups, no marquee, no canvas, no blur, no fade-in entrances. No figure ever moves.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { ArrowUpRight, Pin, Search } from "lucide-react";

import { cn } from "@koc/ui";

import {
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
  type TeamMatch,
} from "../shared";

import { LevelMark, Shoe, Wellhead } from "./glyphs";
import { SectionDrawing } from "./Section";
import "./multilateral.css";

/** The h1 is the group's name without its "Group" frame — derived, never typed. */
const TITLE = GROUP.name.replace(/\s+Group$/, "");

const PLATFORMS = Object.keys(PLATFORM_LABEL) as Platform[];

/** Which team's row carries the liner shoe on the bore (the intermediate string). */
const LINER_CODE = TEAMS[4].code;

const teamId = (t: Team) => `ms2-team-${t.code.toLowerCase()}`;

type Memory = ReturnType<typeof useDashboardMemory>;

/** Live `matchMedia`, for the one string CSS cannot swap: the field's placeholder. */
function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatch(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);
  return match;
}

export default function DirectionA2() {
  const memory = useDashboardMemory();
  const [query, setQuery] = useState("");
  const results = useMemo(() => matchDashboards(query), [query]);
  const searching = query.trim().length > 0;

  const fieldRef = useRef<HTMLInputElement>(null);
  useFindShortcut(fieldRef);
  const dashboardsRef = useRef<HTMLHeadingElement>(null);
  const directoryRef = useRef<HTMLOListElement>(null);

  const clear = useCallback(() => {
    setQuery("");
    fieldRef.current?.focus();
  }, []);

  return (
    <div className="ms2 min-h-screen bg-background text-foreground">
      <SkipToDashboards target={dashboardsRef} />
      <SheetHeader
        fieldRef={fieldRef}
        directoryRef={directoryRef}
        query={query}
        onQuery={setQuery}
        searching={searching}
      />
      <main>
        <Surface />
        <Subsurface
          memory={memory}
          results={results}
          query={query}
          searching={searching}
          onClear={clear}
          headingRef={dashboardsRef}
          directoryRef={directoryRef}
        />
      </main>
      <SheetFooter quiet={searching} />
    </div>
  );
}

/* ── Skip link ─────────────────────────────────────────────────────────────────────────── */

/**
 * The first tab stop. A button, not `href="#…"`: this viewer routes on the hash, so a fragment
 * link would navigate away. It moves focus to the dashboards' heading, at the head of the sheet;
 * the next Tab is the first pinned station, or EN01's first.
 */
function SkipToDashboards({ target }: { target: RefObject<HTMLHeadingElement | null> }) {
  const reduced = useReducedMotion();
  return (
    <button
      type="button"
      onClick={() => {
        const h = target.current;
        if (!h) return;
        h.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
        h.focus({ preventScroll: true });
      }}
      className="sr-only rounded-sm border border-input bg-background px-3 py-2 text-sm font-medium text-foreground shadow-md focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
    >
      Skip to dashboards
    </button>
  );
}

/* ── Header: identity and the find field ────────────────────────────────────────────────── */

function SheetHeader({
  fieldRef,
  directoryRef,
  query,
  onQuery,
  searching,
}: {
  fieldRef: RefObject<HTMLInputElement | null>;
  directoryRef: RefObject<HTMLOListElement | null>;
  query: string;
  onQuery: (q: string) => void;
  searching: boolean;
}) {
  const roomy = useMedia("(min-width: 640px)");
  const firstMatch = () => directoryRef.current?.querySelector<HTMLAnchorElement>("a[data-ms2-station]") ?? null;

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && query) {
      e.preventDefault();
      onQuery("");
    } else if (e.key === "Enter" && searching) {
      // Enter opens the first match: the same DashboardAnchor click a pointer would make.
      e.preventDefault();
      firstMatch()?.click();
    } else if (e.key === "ArrowDown" && searching) {
      const a = firstMatch();
      if (!a) return;
      e.preventDefault();
      a.focus();
    }
  };

  return (
    <header className="ms2-wrap flex h-14 items-center gap-4 border-b border-border">
      <div className="flex min-w-0 shrink-0 items-center gap-3">
        <span className="ms2-logo-tile grid size-8 shrink-0 place-items-center rounded-sm">
          <img src="/koc-logo.svg" alt="" className="size-6" />
        </span>
        <p className="min-w-0 leading-tight">
          <span className="block text-sm font-semibold tracking-wide">{GROUP.abbr}</span>
          <span className="hidden truncate text-xs text-muted-foreground lg:block">{GROUP.name}</span>
        </p>
      </div>

      <search className="relative ml-auto w-full min-w-0 max-w-md">
        <label htmlFor="ms2-find" className="sr-only">
          Find a dashboard
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          ref={fieldRef}
          id="ms2-find"
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={roomy ? "Find a dashboard — name, EN code or platform" : "Find a dashboard"}
          aria-keyshortcuts="Control+K"
          aria-describedby="ms2-find-hint"
          autoComplete="off"
          spellCheck={false}
          className="ms2-find h-9 w-full rounded-sm border border-input bg-background pr-3 pl-8 text-sm text-foreground placeholder:text-muted-foreground sm:pr-16"
        />
        {/* The shortcut reaches assistive technology as aria-keyshortcuts, so this is hidden. */}
        {!query && (
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded-sm border border-border bg-muted px-1.5 py-0.5 font-sans text-2xs font-medium text-muted-foreground sm:inline-block"
          >
            Ctrl K
          </kbd>
        )}
        <span id="ms2-find-hint" className="sr-only">
          {`Filters the ${DASHBOARD_COUNT} dashboards below as you type. Enter opens the first match; Down arrow moves to it.`}
        </span>
      </search>
    </header>
  );
}

/* ── Surface: one-line title block and the eight readings ──────────────────────────────── */

function Surface() {
  return (
    <div className="bg-background">
      <div className="ms2-wrap ms2-title flex flex-wrap items-end justify-between gap-x-10 gap-y-1 pt-4">
        <div className="min-w-0">
          <p className="text-2xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {GROUP.directorate}
          </p>
          {/* Draughtsman's type: one line, 30px — the linework carries this page, not the h1. */}
          <h1 className="mt-1 text-2xl font-semibold leading-tight tracking-tight text-foreground md:text-3xl">
            {TITLE}
          </h1>
        </div>
        {/* The freshness stamp, directly above the readings it qualifies. Derived, never typed. */}
        <p className="pb-1 text-xs text-muted-foreground">
          Readings as of <span className="tabular-nums">{DATA_AS_OF}</span> ·{" "}
          <span className="font-medium text-foreground">Sample data</span>
        </p>
      </div>
      <JumpStrip />
      <Readings />
    </div>
  );
}

/**
 * Phone only: the eight teams as a mini scale, straight under the h1 — 4×2, one tick each.
 * Buttons, never `href="#…"` (the viewer is hash-routed). Focus moves to the team's heading, so a
 * keyboard or screen reader user lands where a sighted one does.
 */
function JumpStrip() {
  const reduced = useReducedMotion();
  const jump = useCallback(
    (t: Team) => {
      const section = document.getElementById(teamId(t));
      if (!section) return;
      section.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      section.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
    },
    [reduced],
  );
  return (
    <nav aria-label="Teams" className="ms2-wrap mt-4 mb-1 md:hidden">
      <ul className="ms2-strip grid grid-cols-4 gap-y-3">
        {TEAMS.map((t) => (
          <li key={t.code}>
            <button
              type="button"
              onClick={() => jump(t)}
              className="block min-h-11 w-full rounded-sm pt-2 pr-1 pl-2 text-left transition-colors duration-fast ease-out hover:bg-muted"
            >
              <span className="block font-mono text-xs font-medium text-primary">{t.code}</span>
              <span className="mt-0.5 block text-2xs leading-tight text-foreground/80">{t.abbr ?? t.shortName}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** "· YTD" where the data implies a year-to-date figure. Derived from the tag or definition. */
function periodOf(k: Kpi): string | null {
  return k.tag === "YTD" || /this (calendar )?year|year-to-date/i.test(k.description) ? "YTD" : null;
}

function Readings() {
  return (
    <section
      aria-labelledby="ms2-readings-h"
      className="ms2-wrap ms2-surface relative pt-5 md:grid md:grid-cols-[calc(var(--ms2-ruler)+var(--ms2-kick))_1fr] md:pt-4"
    >
      <div className="pb-3 md:pb-0">
        <h2
          id="ms2-readings-h"
          className="text-2xs font-medium uppercase leading-4 tracking-[0.14em] text-muted-foreground md:max-w-[8ch]"
        >
          Surface readings
        </h2>
      </div>

      {/* The wellhead at the head of the mother bore, straddling the ground line, and its
          ground-level mark. */}
      <Wellhead className="absolute bottom-0 left-[calc(var(--ms2-pad)+var(--ms2-ruler)-32px)] hidden text-foreground md:block" />
      <Wellhead compact className="absolute bottom-0 left-[calc(var(--ms2-pad)+var(--ms2-ruler)-16px)] text-foreground md:hidden" />
      <span
        aria-hidden="true"
        className="absolute bottom-1 left-[calc(var(--ms2-pad)+var(--ms2-ruler)-68px)] hidden items-center gap-1 text-2xs font-medium leading-none tracking-[0.08em] text-muted-foreground md:inline-flex"
      >
        <LevelMark className="text-foreground/70" />
        GL
      </span>

      <ul className="ms2-readings grid grid-cols-2 gap-x-4 pl-9 md:grid-cols-4 md:gap-x-6 md:pl-0 xl:grid-cols-8 xl:gap-x-5">
        {KPIS.map((k) => (
          <Reading key={k.id} k={k} />
        ))}
      </ul>
    </section>
  );
}

function Reading({ k }: { k: Kpi }) {
  const period = periodOf(k);
  const sentiment = kpiSentiment(k.delta, k.intent);
  const unit = k.unit ? ` ${k.unit}` : "";

  // A's KPI grammar: before → after, where the change is absolute.
  let figure: string | null = null;
  if (k.delta !== undefined) {
    figure =
      k.deltaFormat === "absolute"
        ? `${formatKpi(k, k.value - k.delta)} → ${formatKpi(k, k.value)}${unit}`
        : formatDelta(k);
  }

  return (
    <li className="ms2-reading min-w-0" data-kpi={k.id}>
      <p className="self-end text-xs leading-4 text-balance text-muted-foreground">
        {k.label}
        {/* No-break spaces: the period stays with the label's last word, never orphaned. */}
        {period && ` · ${period}`}
      </p>
      <p className="mt-0.5 text-2xl font-medium leading-7 tracking-tight tabular-nums text-foreground">
        {formatKpi(k, k.value)}
        {k.unit && <span className="ml-0.5 text-sm font-normal text-muted-foreground">{k.unit}</span>}
      </p>
      {figure ? (
        <p className="mt-0.5 text-xs leading-4">
          <span aria-hidden="true">
            {/* Phone: one line ("22 → 24 · vs last month"), so the 2×4 readings stay short. */}
            <span className={cn("font-medium tabular-nums md:block", SENTIMENT_TEXT[sentiment])}>{figure}</span>
            <span className="text-muted-foreground md:hidden"> · </span>
            <span className="text-muted-foreground md:block">{k.deltaLabel}</span>
          </span>
          <span className="sr-only">{deltaSpeech(k)}</span>
        </p>
      ) : (
        <p className="mt-0.5 min-h-8 text-xs leading-4 text-muted-foreground">of annual budget</p>
      )}
      <span className="ms2-leader" aria-hidden="true" />
    </li>
  );
}

/* ── Subsurface: your stations, then the eight laterals ─────────────────────────────────── */

function Subsurface({
  memory,
  results,
  query,
  searching,
  onClear,
  headingRef,
  directoryRef,
}: {
  memory: Memory;
  results: TeamMatch[];
  query: string;
  searching: boolean;
  onClear: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
  directoryRef: RefObject<HTMLOListElement | null>;
}) {
  const { pinned, recent, isPinned, togglePin, clearRecent } = memory;
  const shown = results.reduce((n, r) => n + r.links.length, 0);
  const q = query.trim();

  return (
    <div className="ms2-sub">
      <div className="ms2-wrap ms2-sheet">
        {/* Surface casing under the wellhead: two walls and their shoes. */}
        <span className="ms2-casing" aria-hidden="true" />
        <Shoe variant="surface" className="ms2-shoe ms2-shoe--surface" />

        <h2 ref={headingRef} tabIndex={-1} className="sr-only">
          Dashboards
        </h2>

        {/* The head of the sheet: your stations, on two reference lines. */}
        <div className="ms2-mine">
          <Shelf kind="pinned" items={pinned} isPinned={isPinned} onTogglePin={togglePin} />
          <Shelf kind="recent" items={recent} isPinned={isPinned} onTogglePin={togglePin} onClear={clearRecent} />
        </div>

        <div className="ms2-status" data-ms2-on={searching ? "" : undefined}>
          <p role="status" className="ms2-t text-sm">
            {searching &&
              (shown
                ? `${shown} of ${DASHBOARD_COUNT} dashboards match “${q}”`
                : `No dashboard matches “${q}”. Try a team code such as EN71, or a platform.`)}
          </p>
          {searching && (
            <>
              {shown > 0 && (
                <p className="ms2-t85 hidden text-xs md:block" aria-hidden="true">
                  Enter opens the first · Esc clears
                </p>
              )}
              <button type="button" onClick={onClear} className="ms2-textbtn ms2-t text-xs font-medium">
                Clear search
              </button>
            </>
          )}
        </div>

        <ol ref={directoryRef} className="ms2-ol" aria-label="Teams, in code order">
          {results.map(({ team, links }) => (
            <Row
              key={team.code}
              team={team}
              links={links}
              i={TEAMS.indexOf(team)}
              isPinned={isPinned}
              onTogglePin={togglePin}
            />
          ))}
        </ol>

        <div className="ms2-td">
          {/* The ruler's caption, at its foot: depth is code order, never rank. */}
          <p aria-hidden="true" className="ms2-caption ms2-t90 text-2xs leading-3">
            Order =<br />
            team code
          </p>
          <span
            aria-hidden="true"
            className="ms2-t90 absolute top-[9px] left-[calc(var(--ms2-ruler)+12px)] text-2xs leading-3 font-medium tracking-[0.08em]"
          >
            TD
          </span>
          {/* The drawing's legend: the platform glyphs as they sit on the stations. */}
          <ul
            aria-label="Platform key"
            className="ms2-t85 absolute top-1.5 right-0 hidden items-center gap-x-4 text-xs leading-5 md:flex"
          >
            {PLATFORMS.map((p) => {
              const Icon = PLATFORM_ICON[p];
              return (
                <li key={p} className="inline-flex items-center gap-1.5">
                  <Icon aria-hidden="true" className="ms2-t90 size-3.5" />
                  {PLATFORM_LABEL[p]}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * Pinned or Recent: a reference line at the head of the sheet, labelled on the ruler, with the
 * same stations as the laterals below (each with its team code, since the line mixes teams). An
 * empty shelf is one quiet line, never a box.
 */
function Shelf({
  kind,
  items,
  isPinned,
  onTogglePin,
  onClear,
}: {
  kind: "pinned" | "recent";
  items: RememberedLink[];
  isPinned: (id: string) => boolean;
  onTogglePin: (id: string) => void;
  onClear?: () => void;
}) {
  const label = kind === "pinned" ? "Pinned" : "Recent";
  return (
    <section aria-label={`${label} dashboards`} className="ms2-shelf" data-ms2-empty={items.length ? undefined : ""}>
      <h3 className="ms2-shelf-h ms2-t90 text-2xs font-medium uppercase tracking-[0.12em]">{label}</h3>
      {items.length ? (
        <div className="ms2-shelf-line">
          <div className="ms2-lat ms2-lat--ref">
            <ul className="ms2-stations">
              {items.map(({ link, team }, j) => (
                <Station
                  key={link.id}
                  link={link}
                  team={team}
                  j={j}
                  last={j === items.length - 1}
                  pinned={isPinned(link.id)}
                  onTogglePin={onTogglePin}
                />
              ))}
            </ul>
          </div>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear recent dashboards"
              className="ms2-textbtn ms2-t85 shrink-0 text-xs"
            >
              Clear
            </button>
          )}
        </div>
      ) : (
        <p className="ms2-shelf-empty ms2-t85 text-xs">
          {kind === "pinned" ? (
            <>
              Pin a dashboard with the <Pin aria-hidden="true" className="inline size-3 align-[-1px]" /> pin icon
              to keep it here.
            </>
          ) : (
            "Dashboards you open appear here, latest first."
          )}
        </p>
      )}
    </section>
  );
}

function Row({
  team,
  links,
  i,
  isPinned,
  onTogglePin,
}: {
  team: Team;
  links: DashboardLink[];
  i: number;
  isPinned: (id: string) => boolean;
  onTogglePin: (id: string) => void;
}) {
  const id = teamId(team);
  const n = team.links.length;
  return (
    <li className="ms2-row" style={{ "--ms2-i": i } as CSSProperties}>
      {team.code === LINER_CODE && (
        <>
          <span className="ms2-liner" aria-hidden="true" />
          <Shoe variant="liner" className="ms2-shoe ms2-shoe--liner" />
        </>
      )}
      <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6">
        <div className="ms2-head flex flex-wrap items-baseline gap-x-3">
          {/* NVDA reads code and name together: "EN11 Contracts Management". */}
          <h3 id={`${id}-h`} tabIndex={-1} className="ms2-t shrink-0 text-md font-semibold">
            <span className="ms2-code ms2-t90 mr-1 font-mono text-xs font-medium md:mr-0">{team.code}</span>
            {/* An explicit space: below md the code span is inline, and without a text node
                between them the accessible name runs together as "EN11Contracts Management". */}
            {" "}
            {team.shortName}
            {team.abbr && <span className="ms2-t85 font-normal"> {team.abbr}</span>}
          </h3>
          <p className="ms2-t85 shrink-0 text-xs tabular-nums">
            {links.length === n ? n : `${links.length} of ${n}`} {n === 1 ? "dashboard" : "dashboards"}
          </p>
          <p className="ms2-t85 w-full text-xs md:w-auto md:min-w-0 md:truncate">{team.blurb}</p>
        </div>

        <div className="ms2-lat">
          <span className="ms2-kick" aria-hidden="true">
            <svg width="58" height="50" viewBox="0 0 58 50" focusable="false">
              {/* the ruler tick at the kick-off depth */}
              <path className="ms2-kick-tick" d="M0 0.5H9.25" />
              {/* the build curve: vertical off the bore, horizontal on the lateral's row */}
              <path className="ms2-kick-path" d="M10 0.5A48 48 0 0 0 58 48.5" />
            </svg>
            {i === 0 && <span className="ms2-kop">KOP</span>}
          </span>

          <ul className="ms2-stations">
            {links.map((l, j) => (
              <Station
                key={l.id}
                link={l}
                j={j}
                last={j === links.length - 1}
                pinned={isPinned(l.id)}
                onTogglePin={onTogglePin}
                directory
              />
            ))}
          </ul>
        </div>
      </section>
    </li>
  );
}

/**
 * One station: the platform glyph on its tick, the label and ↗ — the DashboardAnchor — and the
 * pin BESIDE it, never inside it. On a shelf the team code leads the label, because a shelf
 * mixes teams.
 */
function Station({
  link,
  team,
  j,
  last,
  pinned,
  onTogglePin,
  directory = false,
}: {
  link: DashboardLink;
  team?: Team;
  j: number;
  last: boolean;
  pinned: boolean;
  onTogglePin: (id: string) => void;
  directory?: boolean;
}) {
  const Icon = PLATFORM_ICON[link.platform];
  return (
    <li className="ms2-station" style={{ "--ms2-j": j } as CSSProperties}>
      <DashboardAnchor
        link={link}
        data-ms2-station={directory ? link.id : undefined}
        className="ms2-station-a text-sm"
      >
        <Icon className="ms2-glyph" aria-hidden="true" />
        {team && (
          <>
            <span className="ms2-st-code font-mono text-2xs">{team.code}</span>{" "}
          </>
        )}
        <span className="ms2-label">{link.label}</span>
        <ArrowUpRight className="ms2-arrow" aria-hidden="true" />
      </DashboardAnchor>
      <PinToggle link={link} pinned={pinned} onTogglePin={onTogglePin} className="ms2-pin rounded-sm" />
      {last && <span className="ms2-toe" aria-hidden="true" />}
    </li>
  );
}

/* ── Footer: Section A–A, and the sheet's title block ──────────────────────────────────── */

function SheetFooter({ quiet }: { quiet: boolean }) {
  const cells: [string, string][] = [
    ["Group", GROUP.name],
    ["Drawing", "Dashboard section"],
    ["Sheet", "1 of 1"],
    ["As of", DATA_AS_OF],
    ["Status", "Sample data"],
    ["Company", GROUP.company],
  ];
  return (
    <footer className="ms2-sub ms2-foot">
      <div className="ms2-footrule">
        <div className="ms2-wrap ms2-sec-caption pt-5">
          <p className="ms2-t90 text-2xs font-medium uppercase tracking-[0.14em]">Section A–A</p>
          <p className="ms2-t85 mt-1.5 max-w-[56ch] text-xs leading-4">
            <span className="ms2-t font-semibold">The group as one well. </span>
            {`${TEAMS.length} laterals, one per team, in code order; each is drawn one unit long per dashboard, ${DASHBOARD_COUNT} in all.`}
          </p>
        </div>
        <SectionDrawing quiet={quiet} />
      </div>
      <div className="flex flex-col md:flex-row md:justify-between">
        <div className="ms2-wrap flex items-start gap-3 pt-6 pb-8 md:pb-10">
          <img src="/koc-logo.svg" alt="" className="size-9 shrink-0" />
          <p className="leading-tight">
            <span className="ms2-t block text-sm font-semibold">{GROUP.name}</span>
            <span className="ms2-t85 mt-0.5 block text-xs">{GROUP.directorate}</span>
          </p>
        </div>
        {/* The title block sits in the sheet's corner: ruled on its open sides only, flush to
            the page's right and bottom edges, which are the sheet's own border. */}
        <div className="ms2-titleblock grid grid-cols-2 self-stretch pb-20 sm:grid-cols-3 md:self-end md:pb-0">
          {cells.map(([label, value]) => (
            <div key={label} className="px-3.5 pt-2.5 pb-3 md:min-w-44">
              <p className="ms2-t90 text-2xs font-medium uppercase leading-3 tracking-[0.12em]">{label}</p>
              <p className="ms2-t mt-1 text-xs leading-4">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
