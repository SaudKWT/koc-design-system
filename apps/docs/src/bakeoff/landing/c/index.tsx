/**
 * Direction C — "Drill Floor".
 *
 * The driller's console for the 06:30 check. A dark instrument faceplate — one weight-indicator
 * dial for budget with a year-elapsed tattletale, and seven mono readouts with 12-bar micro
 * histograms — sits over a grid of eight bordered team panels holding every dashboard link.
 * The whole page is one screen: at 1440 × 900 all eight teams and all 28 links are visible.
 *
 * ── MOTION INVENTORY ─────────────────────────────────────────────────────────────────────────
 *  Needle settle (CSS keyframe) ...... once on mount, rotate 0 → 73 % (262.8°), duration-slower
 *                                      (300ms) with ease-spring after a duration-slow hold. The
 *                                      base style is the final angle. Reduced (OS media query or
 *                                      the viewer's html[data-force-reduced-motion]): animation
 *                                      none — the needle is drawn at 73 %. The tattletale never
 *                                      moves.
 *  Viewfinder snap (CSS transition) .. on pointer-move / focus-in of a panel: transform + width +
 *                                      height at duration-base (180ms) ease-spring; appear/hide
 *                                      opacity at duration-fast ease-out. It travels only between
 *                                      panels while showing: every appearance lands in place and
 *                                      fades in. Reduced: transition none — it jumps, but shows.
 *  Link rows (CSS) ................... background → bg-muted, transition-colors duration-fast
 *                                      ease-out; ↗ nudges 2px, transition-transform duration-fast
 *                                      ease-out. Reduced: instant — the token base layer under
 *                                      the OS setting, drill-floor.css under the viewer's toggle.
 *  Channel keys, jump button (CSS) ... colours, transition-colors duration-fast ease-out (keys
 *                                      show below 1280). Reduced: instant, as above.
 *  Palette pick → row (JS) ........... focus({ preventScroll: false }) on the launched row: the
 *                                      browser's instant scroll, never smooth.
 *  Channel key → panel (JS) .......... scrollIntoView smooth; `auto` under reduced motion.
 *  Jump palette (@koc/ui Dialog) ..... the library's own rise-in and exit; not this direction's.
 * Nothing else moves: no loop, no pulse, no count-up, no draw-on, no wipe, no fade entrance.
 * The histograms are static. No number moves, ever.
 */

import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { ArrowUpRight, Search } from "lucide-react";

import { Button, cn } from "@koc/ui";

import {
  DASHBOARD_COUNT,
  DATA_AS_OF,
  GROUP,
  KPIS,
  TEAMS,
  formatKpi,
  type Kpi,
  type Team,
} from "../data";
import {
  DashboardAnchor,
  PLATFORM_ICON,
  SENTIMENT_TEXT,
  deltaSpeech,
  formatDelta,
  kpiSentiment,
  useReducedMotion,
} from "../shared";
import { Dial, NeedleGlyph, TattletaleGlyph } from "./Dial";
import { Graticule } from "./Graticule";
import { JumpPalette } from "./JumpPalette";
import { PLATFORM_CODE } from "./platform";
import { useViewfinder } from "./Viewfinder";
import "./drill-floor.css";

// ── Derived facts ───────────────────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Read DATA_AS_OF ("28 Sep 2026, 06:00") into the clock time and the share of the year elapsed.
 * 28 Sep is day 271 of 365 → 74 %. Derived, never typed, so the tattletale follows the stamp.
 */
function readAsOf(stamp: string) {
  const m = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4}), (\d{2}:\d{2})$/.exec(stamp);
  if (!m) return { time: stamp, yearElapsed: null };
  const [, d, mon, y, time] = m;
  const year = Number(y);
  const month = MONTHS.indexOf(mon);
  const day = (Date.UTC(year, month, Number(d)) - Date.UTC(year, 0, 1)) / 86_400_000 + 1;
  const daysInYear = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000;
  return { time, yearElapsed: Math.round((day / daysInYear) * 100) };
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const kpi = (id: string) => KPIS.find((k) => k.id === id)!;

// ── Page ────────────────────────────────────────────────────────────────────────────────────

export default function DrillFloor() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const asOf = useMemo(() => readAsOf(DATA_AS_OF), []);
  const sync = kpi("sync");

  return (
    <div className="c-page bg-background text-foreground">
      <Faceplate />

      <header className="dark relative border-b border-border text-foreground">
        <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 md:px-6 md:py-2.5">
          <div className="flex w-full min-w-0 items-center gap-3 md:w-auto">
            <span className="grid size-10 shrink-0 place-items-center rounded-sm border border-border bg-background">
              <img src="/koc-logo.svg" alt="" width={32} height={32} className="size-8" />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-2xs uppercase tracking-widest text-muted-foreground">
                <span className="font-semibold text-foreground">{GROUP.abbr}</span>
                <span aria-hidden="true"> · </span>
                <span className="sr-only">, </span>
                {GROUP.directorate}
                {/* The company joins the line only where the strip has room for it, so the
                    freshness chip and the jump button stay on the identity row at 1024. */}
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
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setPaletteOpen(true)}
              aria-label="Jump to dashboard"
              className="ml-auto size-10 shrink-0 self-start md:hidden"
            >
              <Search aria-hidden="true" />
            </Button>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 md:ml-auto md:w-auto">
            <FreshnessStatus>
              Updated {asOf.time} · DDR lag {formatKpi(sync, sync.value)}
              {/* Units keep their case: an uppercase "H" is the henry, not the hour. */}
              {sync.unit && <span className="normal-case">{` ${sync.unit}`}</span>} · Sample data
            </FreshnessStatus>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPaletteOpen(true)}
              aria-keyshortcuts="Control+K"
              className="hidden h-8 gap-2.5 font-mono text-2xs tracking-wider uppercase md:inline-flex"
            >
              <span>
                Jump
                {/* Visually "Jump" at 1024–1279, where the strip is one row; the name stays whole. */}
                <span className="lg:max-xl:sr-only"> to dashboard</span>
              </span>
              <kbd className="rounded-sm border border-border bg-muted px-1.5 py-px font-mono text-2xs tracking-normal text-muted-foreground">
                Ctrl K
              </kbd>
            </Button>
          </div>

          <ChannelKeys />
        </div>
      </header>

      <main>
        <Readings yearElapsed={asOf.yearElapsed} />
        <TeamGrid />
      </main>

      {/* Below md the viewer's bar floats over the page foot: pad the footer clear of it, so the
          one line carrying the full as-of stamp can always be scrolled into view. */}
      <footer className="mx-auto w-full max-w-[90rem] px-4 pb-20 md:px-6 md:pb-2">
        <p className="border-t border-border pt-2.5 font-mono text-2xs tracking-wider text-muted-foreground uppercase md:text-right">
          {GROUP.abbr} · {GROUP.name} · {GROUP.directorate}
          <span className="mx-2 hidden md:inline" aria-hidden="true">
            │
          </span>
          <br className="md:hidden" />
          {/* The stamp wraps as a whole, never between "28" and "Sep". */}
          <span className="whitespace-nowrap">Data as of {DATA_AS_OF} · Sample data</span>
        </p>
      </footer>

      <JumpPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

// ── Faceplate surface ───────────────────────────────────────────────────────────────────────

/** The band's surface: dark card, graticule, and the four static L-bracket corners. Decorative. */
function Faceplate() {
  return (
    <div aria-hidden="true" className="c-plate dark relative overflow-hidden border-b border-border bg-card">
      <Graticule />
      <div className="relative mx-auto h-full max-w-[90rem] text-muted-foreground">
        <div className="absolute inset-1.5 md:inset-x-2">
          {(["tl", "tr", "bl", "br"] as const).map((at) => (
            <span key={at} data-at={at} className="c-corner" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The freshness chip — Kibo UI's Status anatomy (indicator + label), ported with the ping
 * removed entirely. The indicator is a static neutral square: this is a fixed stamp, not a feed.
 */
function FreshnessStatus({ children }: { children: ReactNode }) {
  return (
    <p
      data-status="neutral"
      className="inline-flex h-8 items-center gap-2 rounded-sm border border-border bg-background px-2.5 font-mono text-2xs tracking-wider text-muted-foreground uppercase"
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 bg-muted-foreground" />
      <span>{children}</span>
    </p>
  );
}

// ── Channel keys (phones) ───────────────────────────────────────────────────────────────────

/** "Engineering I" never strands its numeral on a line of its own. */
const keepNumeral = (s: string) => s.replace(/ (?=I+$)/, "\u00a0");

/**
 * A phone key's label (below 768, where a key is ~76px of text): the team's own abbreviation
 * where it has one, else its short name with its long words in standard short form, because
 * "INTERVENTION" is wider than a phone key and would break mid-word. From 768 the keys are wide
 * enough for the short name itself, which is what the panels say. A display rule over the shared
 * data; nothing is renamed.
 */
const KEY_SHORT: Record<string, string> = { Engineering: "Eng", Management: "Mgmt", Intervention: "Interv." };
const phoneKeyLabel = (t: Team) =>
  t.abbr ?? keepNumeral(t.shortName.replace(/\b[A-Z][a-z]+\b/g, (w) => KEY_SHORT[w] ?? w));

/**
 * Below 1280 the panel grid no longer fits one screen, so the eight teams come first as a
 * keypad of channel keys, before any reading: 4 × 2 up to 1023, one row of eight from 1024.
 * A key scrolls to its panel and focuses it, which also brings the viewfinder onto it.
 */
function ChannelKeys() {
  const reduced = useReducedMotion();
  const jump = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    // The docs app routes on the hash, so an in-page fragment must not reach the location bar.
    e.preventDefault();
    target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    target.focus({ preventScroll: true });
  };
  return (
    <nav aria-label="Team channels" className="w-full xl:hidden">
      <ul className="grid grid-cols-4 gap-px overflow-hidden rounded-sm border border-border bg-border lg:grid-cols-8">
        {TEAMS.map((t) => {
          const id = teamId(t);
          return (
            <li key={t.code} className="bg-background">
              <a
                href={`#${id}`}
                onClick={(e) => jump(e, id)}
                className="flex h-full min-h-13 flex-col gap-1 px-1.5 py-1.5 transition-colors duration-fast ease-out -outline-offset-2 hover:bg-muted"
              >
                <span className="font-mono text-xs font-semibold text-primary">{t.code}</span>
                <span className="font-mono text-2xs leading-tight text-muted-foreground uppercase [overflow-wrap:anywhere]">
                  <span className="md:hidden">{phoneKeyLabel(t)}</span>
                  <span className="hidden md:inline">{keepNumeral(t.shortName)}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ── Readings: the dial and seven readouts ───────────────────────────────────────────────────

function Readings({ yearElapsed }: { yearElapsed: number | null }) {
  const budget = kpi("budget");
  const readouts = KPIS.filter((k) => k.id !== "budget");
  const pace = yearElapsed === null ? null : budget.value - yearElapsed;

  return (
    <section aria-labelledby="c-readings" className="dark relative text-foreground">
      {/* The dial sits beside the readouts from 1024. Below that it heads them, and the readouts
          run four across from 768 — beside a 2-column strip four cells deep, the dial would float
          in a tall field of empty graticule. */}
      <div className="mx-auto flex max-w-[90rem] flex-col gap-4 px-4 pt-4 pb-5 md:px-6 md:pt-3.5 md:pb-4 lg:flex-row lg:items-stretch lg:gap-5">
        {/* Dial + its legend */}
        <div className="flex shrink-0 items-center gap-4 md:gap-5">
          <div className="relative size-40 shrink-0 md:size-44">
            <Dial value={budget.value} marker={yearElapsed ?? budget.value} />
            {/* The dial's own figure. Hidden from AT: the legend states the same facts. */}
            <div aria-hidden="true" className="absolute inset-0 grid place-content-center text-center">
              {/* The figure alone: the legend beside the dial names it, once. */}
              <p className="font-mono text-2xl leading-none font-semibold tabular-nums">
                {formatKpi(budget, budget.value)}
                <span className="text-sm font-normal text-muted-foreground">{budget.unit}</span>
              </p>
            </div>
          </div>

          <div className="flex w-40 flex-col gap-2.5 font-mono text-2xs tracking-wider uppercase">
            <h2 id="c-readings" className="font-semibold tracking-widest text-muted-foreground">
              <span aria-hidden="true">Readings</span>
              <span className="sr-only">Group figures</span>
            </h2>
            <p className="text-xs leading-snug font-semibold tracking-wide text-foreground">{budget.label}</p>
            <ul className="flex flex-col gap-1.5 border-y border-border py-2 text-muted-foreground">
              <li className="flex items-center gap-2">
                <NeedleGlyph />
                <span className="flex-1">Spent</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {formatKpi(budget, budget.value)}
                  {budget.unit}
                </span>
              </li>
              {yearElapsed !== null && (
                <li className="flex items-center gap-2">
                  <TattletaleGlyph />
                  <span className="flex-1">Year elapsed</span>
                  <span className="font-semibold text-foreground tabular-nums">{yearElapsed}%</span>
                </li>
              )}
            </ul>
            {pace !== null && (
              <p className="leading-snug text-muted-foreground">
                {Math.abs(pace) <= 2 ? "On pace" : pace > 0 ? "Ahead of calendar" : "Behind calendar"}
                {" · "}
                {pace === 0 ? "level" : `${pace > 0 ? "+" : "−"}${Math.abs(pace)} pt`}
              </p>
            )}
            <p className="sr-only">{budget.description}</p>
          </div>
        </div>

        {/* Seven readouts — a docked, bordered strip (Exebenus), mono LABEL / value (Cerebrium) */}
        <ul className="grid flex-1 grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border md:grid-cols-4 xl:grid-cols-7">
          {readouts.map((k) => (
            <Readout key={k.id} k={k} />
          ))}
          {/* Seven readouts in a 2- or 4-column grid leave one slot: it becomes the bars' key
              rather than a hole. (At 1440 the seven share one row and there is no slot.) */}
          <HistogramKey />
        </ul>
      </div>
    </section>
  );
}

function Readout({ k }: { k: Kpi }) {
  const s = kpiSentiment(k.delta, k.intent);
  const delta = formatDelta(k);
  // "YTD" folds into the label; the no-break spaces keep "· YTD" off the start of a line.
  const label = k.tag === "YTD" ? `${k.label}\u00a0·\u00a0YTD` : k.label;
  const glyph = k.delta === undefined || k.delta === 0 ? "■" : k.delta > 0 ? "▲" : "▼";
  return (
    <li className="flex min-w-0 flex-col bg-background px-3 pt-2.5 pb-3">
      <p className="min-h-[2lh] font-mono text-2xs leading-snug tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-2 font-mono text-2xl leading-none font-semibold whitespace-nowrap tabular-nums">
        {formatKpi(k, k.value)}
        {k.unit && (
          // Units keep their case: "18.4 d", "2.5 h" — an uppercase H is the henry.
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {k.unit}
            <span className="sr-only"> ({unitWord(k.unit)})</span>
          </span>
        )}
      </p>
      {/* The delta and its comparator read as one statement under the value — "▲ +0.4 WORSE
          VS LAST MONTH" — wrapping only between whole parts. The arrow is arithmetic; BETTER /
          WORSE is the meaning, so sentiment never rests on colour alone. Neutral KPIs (rigs)
          carry no verdict. Screen readers get deltaSpeech() instead of the glyphs. */}
      {delta && (
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 font-mono leading-snug">
          <span
            aria-hidden="true"
            className={cn("text-xs font-semibold whitespace-nowrap tabular-nums", SENTIMENT_TEXT[s])}
          >
            {glyph} {delta}
            {s !== "flat" && (
              <span className="ml-1.5 text-2xs tracking-wide uppercase">{s === "good" ? "Better" : "Worse"}</span>
            )}
          </span>
          <span aria-hidden="true" className="text-2xs tracking-wide whitespace-nowrap text-muted-foreground uppercase">
            {k.deltaLabel}
          </span>
          <span className="sr-only">{deltaSpeech(k)}</span>
        </p>
      )}
      <div className="mt-auto pt-3">
        <Histogram values={k.trend} />
      </div>
    </li>
  );
}

const unitWord = (u: string) => ({ d: "days", h: "hours", "%": "percent" })[u] ?? u;

/**
 * The key plate for the micro histograms, in the slot the 2- and 4-column grids leave empty.
 * Hidden from assistive tech along with the bars it explains — the figures are the text.
 */
function HistogramKey() {
  const n = KPIS[0].trend.length;
  return (
    <li
      aria-hidden="true"
      className="flex flex-col bg-background px-3 pt-2.5 pb-3 font-mono text-2xs leading-snug tracking-wide text-muted-foreground uppercase xl:hidden"
    >
      <p>Key</p>
      <p className="mt-2">Bars · last {n} readings, oldest first</p>
      <div className="mt-auto flex flex-col gap-1.5 pt-3">
        <p className="flex items-center gap-2">
          <span className="h-3 w-1 shrink-0 bg-muted-foreground/45" />
          Earlier
        </p>
        <p className="flex items-center gap-2">
          <span className="h-3 w-1 shrink-0 bg-primary" />
          Latest
        </p>
      </div>
    </li>
  );
}

/**
 * Twelve bars of `k.trend`, oldest first — Vista Energy's mini production bars, never a line.
 * The last bar is the current reading, in instrument blue. Floored just below the series
 * minimum so a flat-ish series still shows its shape; the figure above is the value. Static.
 */
function Histogram({ values }: { values: number[] }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const floor = Math.max(0, min - (max - min) * 0.6);
  const H = 36;
  const step = 6;
  return (
    <svg
      viewBox={`0 0 ${values.length * step - 2} ${H + 2}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className="block h-9 w-full"
      shapeRendering="crispEdges"
    >
      {values.map((v, i) => {
        const h = 2 + ((v - floor) / (max - floor || 1)) * (H - 2);
        const last = i === values.length - 1;
        return (
          <rect
            key={i}
            x={i * step}
            y={H - h}
            width={step - 2}
            height={h}
            className={last ? "fill-primary" : "fill-muted-foreground/45"}
          />
        );
      })}
      <rect x={0} y={H + 1} width={values.length * step - 2} height={1} className="fill-border" />
    </svg>
  );
}

// ── Team panels ─────────────────────────────────────────────────────────────────────────────

const teamId = (t: Team) => `team-${t.code.toLowerCase()}`;

/**
 * True when the abbreviation only shortens the short name printed beside it — "HSE & DE" for
 * "HSE & Drilling Excellence" — rather than naming the team another way ("DWOS" for
 * "Operational Support"). Where panels are narrow (drill-floor.css, `.c-abbr[data-echo]`) the
 * echo is the first thing to go, visually only: it would otherwise take a header line of its own
 * and, through the subgrid, lengthen every panel in the row.
 */
const letters = (s: string) => s.replace(/[^A-Z]/g, "");
const echoesShortName = (t: Team) =>
  !!t.abbr &&
  letters(t.abbr) === letters(t.shortName.split(/\s+/).map((w) => (/^[A-Z&]+$/.test(w) ? w : w[0])).join(""));

function TeamGrid() {
  const { gridRef, handlers, frame } = useViewfinder<HTMLDivElement>();
  return (
    <section aria-labelledby="c-teams" className="mx-auto w-full max-w-[90rem] px-4 pt-4 md:px-6 md:pt-3.5">
      <div className="mb-2 flex items-baseline gap-3 font-mono text-2xs tracking-wider text-muted-foreground uppercase">
        <h2 id="c-teams" className="font-semibold tracking-widest text-foreground">
          Teams
        </h2>
        <p>
          {pad2(TEAMS.length)} channels · {DASHBOARD_COUNT} dashboards
        </p>
        <p className="ml-auto hidden items-center gap-1 sm:inline-flex">
          Each opens in a new tab
          <ArrowUpRight aria-hidden="true" className="size-3" />
        </p>
      </div>
      <div
        ref={gridRef}
        {...handlers}
        className="c-teams relative grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-x-3"
      >
        {TEAMS.map((t) => (
          <TeamPanel key={t.code} t={t} />
        ))}
        {frame}
      </div>
    </section>
  );
}

/** Terminal Industries' numbered entry card, tightened into an instrument channel. */
function TeamPanel({ t }: { t: Team }) {
  const id = teamId(t);
  return (
    <section
      id={id}
      data-panel
      tabIndex={-1}
      aria-labelledby={`${id}-h`}
      aria-describedby={`${id}-name`}
      className="row-span-2 mb-3 grid scroll-mt-4 grid-rows-subgrid rounded-sm border border-border bg-card text-card-foreground"
    >
      <div className="c-panel-head px-3 pt-2.5 pb-1.5">
        {/* Top-aligned, so when a long name wraps its abbreviation (EN41 at 1024) the count
            stays on the code chip's line instead of floating to the middle. */}
        <div className="flex items-start gap-2">
          <h3 id={`${id}-h`} className="flex min-h-5 min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="shrink-0 rounded-sm border border-primary/45 px-1 py-px font-mono text-2xs font-semibold tracking-wider text-primary">
              {t.code}
            </span>
            <span className="font-mono text-xs font-semibold uppercase">{t.shortName}</span>
            {t.abbr && (
              <span
                data-echo={echoesShortName(t) || undefined}
                className="c-abbr shrink-0 font-mono text-2xs text-muted-foreground uppercase"
              >
                <span className="sr-only">(</span>
                {t.abbr}
                <span className="sr-only">)</span>
              </span>
            )}
          </h3>
          <p className="ml-auto shrink-0 font-mono text-2xs leading-5 text-muted-foreground tabular-nums">
            <span aria-hidden="true">{pad2(t.links.length)}</span>
            <span className="sr-only">
              {t.links.length} {t.links.length === 1 ? "dashboard" : "dashboards"}
            </span>
          </p>
        </div>
        <p className="mt-1 text-xs leading-snug tracking-tight text-muted-foreground">{t.blurb}</p>
      </div>

      <ul className="flex flex-col border-t border-border">
        {t.links.map((l) => {
          const Icon = PLATFORM_ICON[l.platform];
          return (
            <li key={l.id} className="border-t border-border first:border-t-0">
              <DashboardAnchor
                link={l}
                data-link-id={l.id}
                className="c-row group/row flex min-h-8 items-center gap-2.5 px-3 text-foreground transition-colors duration-fast ease-out -outline-offset-2 hover:bg-muted focus-visible:bg-muted"
              >
                <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 py-1.5 text-sm leading-tight font-medium">{l.label}</span>
                <span
                  aria-hidden="true"
                  className="c-chip grid h-5 w-9 shrink-0 place-items-center rounded-sm border border-border font-mono text-2xs leading-none tracking-wider text-muted-foreground"
                >
                  {PLATFORM_CODE[l.platform]}
                </span>
                <ArrowUpRight
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-fast ease-out group-hover/row:translate-x-0.5 group-hover/row:-translate-y-0.5 group-focus-visible/row:translate-x-0.5 group-focus-visible/row:-translate-y-0.5"
                />
              </DashboardAnchor>
            </li>
          );
        })}
        {/* The panel foot: one closing rule under the last link, then plain card — closed by the
            team's full MyPortal name where the row leaves room for it (drill-floor.css). */}
        <li aria-hidden="true" className="c-slots flex-1">
          <p
            id={`${id}-name`}
            className="c-nameplate px-3 pb-2.5 font-mono text-2xs leading-snug tracking-wider text-muted-foreground uppercase"
          >
            {t.name}
          </p>
        </li>
      </ul>
    </section>
  );
}
