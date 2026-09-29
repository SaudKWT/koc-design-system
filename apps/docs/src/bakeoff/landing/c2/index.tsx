/**
 * Direction C, v2 — "Drill Floor", the daily-use round.
 *
 * The driller's console for the 06:30 check, rebuilt for the hundredth visit rather than the
 * first. v1 spent the faceplate on one large dial and seven tall readouts; v2 keeps the dark
 * faceplate, the console mono and the one-screen promise, and spends the same band on what a
 * daily reader reaches for:
 *
 *   HEADER     identity, and a visible FIND field (Ctrl K) that filters the directory in place;
 *   READINGS   all eight figures as one compact strip of instrument cells (`data-kpi`), budget
 *              keeping the weight indicator in miniature;
 *   PRESETS    your dashboards — Pinned and Recent — as the console's preset bank;
 *   DIRECTORY  v1's eight bordered panels, every link visible, a pin beside each;
 *   FOOTER     a second faceplate holding the weight indicator at full size: the showpiece.
 *
 * At 1440 × 900 all 28 links are still on the first screen, with the readings and the presets
 * above them.
 *
 * ── MOTION INVENTORY ─────────────────────────────────────────────────────────────────────────
 *  Footer needle swing (CSS keyframe, AMBIENT) .. once, when the footer gauge is first well in
 *                                      view (shared useInView, disconnects after): parked at 0,
 *                                      then a damped swing to 73 % over 1350ms (--ease-out legs).
 *                                      It lives in the footer only, over no link, figure or field.
 *                                      Reduced (OS media query or the viewer's html[data-force-
 *                                      reduced-motion]): never parked, never swings — drawn at 73 %.
 *  Viewfinder snap (CSS transition) .. on pointer-move / focus-in of a panel: transform + width +
 *                                      height at duration-base (180ms) ease-spring; appear/hide
 *                                      opacity at duration-fast ease-out. Reduced: it jumps.
 *  Link rows, preset keys (CSS) ...... background → bg-muted, transition-colors duration-fast
 *                                      ease-out; ↗ nudges 1–2px, transition-transform duration-fast
 *                                      ease-out. Reduced: instant (token base layer for the OS
 *                                      setting, drill-floor.css for the viewer's toggle).
 *  Pins, clear, channel keys (CSS) ... colours, transition-colors duration-fast ease-out.
 *  Find → directory (none) ........... filtering shows and hides rows instantly; nothing slides.
 *  Channel key → panel (JS) .......... scrollIntoView smooth; `auto` under reduced motion.
 * Nothing else moves: no loop, no pulse, no count-up, no draw-on, no wipe, no fade entrance.
 * The readings are static. No figure moves, ever.
 */

import { useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { Search, X } from "lucide-react";

import { DATA_AS_OF, GROUP, TEAMS, type Team } from "../data";
import { matchDashboards, useDashboardMemory, useFindShortcut, useReducedMotion } from "../shared";
import { Console } from "./Console";
import { Corners } from "./Corners";
import { Directory, teamId } from "./Directory";
import { Graticule } from "./Graticule";
import { Presets } from "./Presets";
import { Readings, type AsOf } from "./Readings";
import "./drill-floor.css";

// ── Derived facts ───────────────────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Read DATA_AS_OF ("28 Sep 2026, 06:00") into the clock time and the share of the year elapsed.
 * 28 Sep is day 271 of 365 → 74 %. Derived, never typed, so the tattletale follows the stamp.
 */
function readAsOf(stamp: string): AsOf {
  const m = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4}), (\d{2}:\d{2})$/.exec(stamp);
  if (!m) return { time: stamp, yearElapsed: null };
  const [, d, mon, y, time] = m;
  const year = Number(y);
  const month = MONTHS.indexOf(mon);
  const day = (Date.UTC(year, month, Number(d)) - Date.UTC(year, 0, 1)) / 86_400_000 + 1;
  const daysInYear = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000;
  return { time, yearElapsed: Math.round((day / daysInYear) * 100) };
}

// ── Page ────────────────────────────────────────────────────────────────────────────────────

export default function DrillFloor() {
  const asOf = useMemo(() => readAsOf(DATA_AS_OF), []);
  const memory = useDashboardMemory();
  const [query, setQuery] = useState("");
  const matches = useMemo(() => matchDashboards(query), [query]);
  const finding = query.trim().length > 0;

  const fieldRef = useRef<HTMLInputElement>(null);
  const directoryRef = useRef<HTMLElement>(null);
  useFindShortcut(fieldRef);

  /** The directory's own anchor for a link (the presets may hold a second one). */
  const rowFor = (id: string) =>
    directoryRef.current?.querySelector<HTMLAnchorElement>(`a[data-df2-link-id="${id}"]`) ?? null;
  const firstVisibleRow = () =>
    finding
      ? matches[0]
        ? rowFor(matches[0].links[0].id)
        : null
      : (directoryRef.current?.querySelector<HTMLAnchorElement>("a[data-df2-link-id]") ?? null);

  const clear = () => {
    setQuery("");
    fieldRef.current?.focus();
  };

  return (
    <div className="df2-page bg-background text-foreground" data-df2-finding={finding || undefined}>
      <Faceplate />

      <header className="dark relative text-foreground">
        <SkipToDashboards />
        <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 md:px-6 md:py-2">
          <Identity />
          <FindField
            fieldRef={fieldRef}
            query={query}
            onQuery={setQuery}
            onClear={clear}
            // Enter opens the armed first match through its own DashboardAnchor — still inside
            // the keypress's user activation, so a real href may open its tab.
            onOpenFirst={() => {
              if (finding) firstVisibleRow()?.click();
            }}
            onStepDown={() => firstVisibleRow()?.focus()}
          />
          <ChannelKeys matched={finding ? new Set(matches.map((m) => m.team.code)) : null} />
        </div>
      </header>

      <main>
        <div className="df2-idle dark relative text-foreground">
          <div className="mx-auto flex max-w-[90rem] flex-col gap-2.5 px-4 pt-1 pb-4 md:px-6 md:pb-3.5">
            <Readings asOf={asOf} />
            <Presets memory={memory} />
          </div>
        </div>
        <Directory ref={directoryRef} query={query} matches={matches} memory={memory} onClear={clear} />
      </main>

      <Console asOf={asOf} />
    </div>
  );
}

// ── Faceplate surface ───────────────────────────────────────────────────────────────────────

/** The top band's surface: dark card, graticule, and the four static L-bracket corners. */
function Faceplate() {
  return (
    <div aria-hidden="true" className="df2-plate dark relative overflow-hidden border-b border-border bg-card">
      <Graticule />
      <Corners />
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────────────────────────────

/**
 * The first tab stop. A button, not an `href="#…"` link: the viewer routes on the hash, so a
 * fragment link would navigate away. It lands on the preset bank (the pins), or on the
 * directory when a phone-width find has set the bank aside.
 */
function SkipToDashboards() {
  const skip = () => {
    const bank = document.getElementById("df2-yours");
    const target = bank && bank.offsetParent !== null ? bank : document.getElementById("df2-directory");
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "start" });
  };
  return (
    <button
      type="button"
      onClick={skip}
      className="absolute top-2 left-2 z-20 -translate-y-[200%] rounded-sm border border-border bg-background px-3 py-1.5 font-mono text-2xs tracking-wider text-foreground uppercase focus-visible:translate-y-0"
    >
      Skip to dashboards
    </button>
  );
}

function Identity() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-sm border border-border bg-background">
        <img src="/koc-logo.svg" alt="" width={32} height={32} className="size-8" />
      </span>
      <div className="min-w-0">
        <p className="font-mono text-2xs tracking-widest text-muted-foreground uppercase">
          <span className="font-semibold text-foreground">{GROUP.abbr}</span>
          <span aria-hidden="true"> · </span>
          <span className="sr-only">, </span>
          {GROUP.directorate}
          <span className="hidden xl:inline">
            <span aria-hidden="true"> · </span>
            <span className="sr-only">, </span>
            {GROUP.company}
          </span>
        </p>
        <h1 className="font-mono text-base leading-snug font-semibold tracking-wide uppercase md:text-lg xl:text-xl">
          {GROUP.name}
        </h1>
      </div>
    </div>
  );
}

/**
 * FIND — the page's one search, always on the faceplate. It filters the directory in place
 * through the shared `matchDashboards` (every word must match the label, the platform, or the
 * team's code, name or abbreviation). Ctrl K / ⌘K focuses it from anywhere (shared
 * `useFindShortcut`, which also works with the Arabic layout active). Enter opens the first
 * match, ↓ steps into the results, Escape clears.
 */
function FindField({
  fieldRef,
  query,
  onQuery,
  onClear,
  onOpenFirst,
  onStepDown,
}: {
  fieldRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQuery: (q: string) => void;
  onClear: () => void;
  onOpenFirst: () => void;
  onStepDown: () => void;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && query) {
      e.preventDefault();
      onClear();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      onStepDown();
    }
  };
  return (
    <form
      role="search"
      aria-label="Dashboards"
      onSubmit={(e) => {
        e.preventDefault();
        onOpenFirst();
      }}
      className="w-full lg:ml-auto lg:w-[25rem] xl:w-[29rem]"
    >
      <div className="df2-find-box flex h-9 items-center gap-2 rounded-sm border border-input bg-background pr-1 pl-2.5 transition-colors duration-fast ease-out has-[input:focus-visible]:border-ring">
        <label
          htmlFor="df2-find"
          className="flex shrink-0 items-center gap-2 font-mono text-2xs font-semibold tracking-widest text-foreground uppercase"
        >
          <Search aria-hidden="true" className="size-3.5 text-muted-foreground" />
          Find<span className="sr-only"> a dashboard</span>
        </label>
        <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />
        <input
          ref={fieldRef}
          id="df2-find"
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={onKeyDown}
          aria-describedby="df2-find-hint"
          aria-keyshortcuts="Control+K"
          aria-controls="df2-directory"
          autoComplete="off"
          spellCheck={false}
          placeholder="Dashboard, team or code — e.g. EN71"
          className="df2-find min-w-0 flex-1 bg-transparent py-1 font-mono text-sm text-foreground placeholder:text-muted-foreground"
        />
        <span id="df2-find-hint" className="sr-only">
          Filters the team directory as you type. Enter opens the first match; Escape clears.
        </span>
        {query ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear find"
            className="grid size-7 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors duration-fast ease-out hover:bg-muted hover:text-foreground"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        ) : (
          <kbd
            aria-hidden="true"
            className="mr-0.5 shrink-0 rounded-sm border border-border bg-muted px-1.5 py-px font-mono text-2xs text-muted-foreground"
          >
            Ctrl K
          </kbd>
        )}
      </div>
    </form>
  );
}

// ── Channel keys (below 1280) ───────────────────────────────────────────────────────────────

/** "Engineering I" never strands its numeral on a line of its own. */
const keepNumeral = (s: string) => s.replace(/ (?=I+$)/, " ");

/**
 * A phone key's label (below 768, where a key is ~76px of text): the team's own abbreviation
 * where it has one, else its short name with its long words in standard short form. A display
 * rule over the shared data; nothing is renamed.
 */
const KEY_SHORT: Record<string, string> = { Engineering: "Eng", Management: "Mgmt", Intervention: "Interv." };
const phoneKeyLabel = (t: Team) =>
  t.abbr ?? keepNumeral(t.shortName.replace(/\b[A-Z][a-z]+\b/g, (w) => KEY_SHORT[w] ?? w));

/**
 * Below 1280 the directory no longer fits one screen, so the eight teams come first as a keypad
 * of channel keys: 4 × 2 up to 1023, one row of eight from 1024. Buttons, not fragment links
 * (the viewer routes on the hash). A key scrolls to its panel and focuses it. While finding, a
 * key whose team has no match is disabled — its panel has left the grid.
 */
function ChannelKeys({ matched }: { matched: Set<string> | null }) {
  const reduced = useReducedMotion();
  const jump = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    target.focus({ preventScroll: true });
  };
  return (
    <nav aria-label="Team channels" className="df2-idle w-full xl:hidden">
      <ul className="grid grid-cols-4 gap-px overflow-hidden rounded-sm border border-border bg-border lg:grid-cols-8">
        {TEAMS.map((t) => {
          const off = !!matched && !matched.has(t.code);
          return (
            <li key={t.code} className="bg-background">
              <button
                type="button"
                disabled={off}
                onClick={() => jump(teamId(t))}
                className="flex size-full min-h-13 flex-col items-start gap-1 px-1.5 py-1.5 text-left transition-colors duration-fast ease-out -outline-offset-2 hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <span className="font-mono text-xs font-semibold text-primary">{t.code}</span>
                <span className="font-mono text-2xs leading-tight text-muted-foreground uppercase [overflow-wrap:anywhere]">
                  <span className="md:hidden">{phoneKeyLabel(t)}</span>
                  <span className="hidden md:inline">{keepNumeral(t.shortName)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
