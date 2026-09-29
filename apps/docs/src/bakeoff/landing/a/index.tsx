/**
 * Direction A — "Multilateral".
 *
 * The group drawn as one multilateral well, orthographic and side-on. Above a hard ground line:
 * the group, and its eight figures as surface readings on leader ticks. Below it, on KOC blue:
 * one mother bore drops from a wellhead and kicks off eight laterals in code order, one per
 * team, and each team's dashboards sit on its lateral as stations. A lateral runs as far as its
 * stations do, so its length only roughly tracks the dashboard count (label widths vary); the
 * count itself is printed on every row. The drawing IS the navigation; there is no other
 * illustration on the page.
 *
 * ── MOTION INVENTORY ─────────────────────────────────────────────────────────────────────────
 *  Construction draw-on (CSS, one-shot) ... once per page load, when the section first enters
 *     view (useInView). The bore scales down from the wellhead, duration-slower (300ms)
 *     ease-out. Each row then draws, 40ms apart in code order: its ruler tick and kick-off
 *     stroke on (pathLength 1, dashoffset 1→0, duration-slower ease-out); its lateral scales
 *     out from the bore side 90ms behind (duration-slower ease-out); its station ticks rise,
 *     duration-fast, 30ms apart; its toe is ruled as the lateral reaches it (duration-fast).
 *     The last line lands ≈ 670ms. LINES ONLY: stations and text are never hidden. The base
 *     style is the drawn state and keyframes animate only `from`; the data-draw attribute
 *     that carries the animations is removed at 1.1s. Phone: the gutter bore, header ticks
 *     and hanging laterals draw the same way.
 *     Reduced motion (OS or the viewer's flag): never armed, and `animation: none` in CSS.
 *  Row hover / focus-within (CSS) ....... the row's lateral, kick-off and toe go from 70% to
 *     full strength and 1 → 1.5px, duration-fast ease-out. Reduced: instant.
 *  Bit run (CSS, fired from JS) ......... a 9×4 capsule follows the kick-off curve
 *     (offset-path, duration-fast ease-in), runs the lateral to its toe (translateX on a
 *     full-width track, duration-slower ease-out), then fades (duration-fast). Once per row
 *     per page view (a Set in a ref), on keyboard focus within the row (:focus-visible) or a
 *     120ms pointer dwell — fine pointers only, never touch. ≥768px only. When the run ends
 *     (or is cancelled — reduced motion switched on, or the viewport crossing 768px mid-run)
 *     the row's data-bit is removed, so nothing can restart it later. Reduced: never fired,
 *     and `display: none`.
 *  Station hover / focus-visible (CSS) .. the label underline grows by background-size
 *     0→100%, ↗ nudges 2px, a 10% tint; duration-fast ease-out. Reduced: instant.
 *  Jump strip (phone) ................... scrolls smoothly to the team (browser smooth
 *     scroll). Reduced: an instant jump.
 *  Palette (@koc/command) ............... Base UI dialog's own rise/fade, on the scale.
 * No loops, no canvas, no count-ups, no blur, no fade-in entrances. No figure ever moves.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { ArrowUpRight, Search } from "lucide-react";

import { Button, cn } from "@koc/ui";

import {
  DASHBOARD_COUNT,
  DATA_AS_OF,
  GROUP,
  KPIS,
  PLATFORM_LABEL,
  TEAMS,
  formatKpi,
  type Kpi,
  type Platform,
  type Team,
} from "../data";
import {
  DashboardAnchor,
  PLATFORM_ICON,
  SENTIMENT_TEXT,
  deltaSpeech,
  formatDelta,
  kpiSentiment,
  useInView,
  useReducedMotion,
} from "../shared";

import { LevelMark, Shoe, Wellhead } from "./glyphs";
import { Palette } from "./Palette";
import "./multilateral.css";

/** The h1 is the group's name without its "Group" frame — derived, never typed. */
const TITLE = GROUP.name.replace(/\s+Group$/, "");

const PLATFORMS = Object.keys(PLATFORM_LABEL) as Platform[];

/** Which row carries the liner shoe on the bore (the intermediate string). */
const LINER_ROW = 4;

const teamId = (t: Team) => `team-${t.code.toLowerCase()}`;

export default function DirectionA() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);

  return (
    <div className="ms min-h-screen bg-background text-foreground">
      <SheetHeader onFind={openPalette} />
      <main>
        <Surface />
        <Subsurface />
      </main>
      <SheetFooter />
      <Palette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

/* ── Header ──────────────────────────────────────────────────────────────────────────── */

function SheetHeader({ onFind }: { onFind: () => void }) {
  return (
    <header className="ms-wrap flex h-14 items-center justify-between gap-4 border-b border-border">
      <div className="flex min-w-0 items-center gap-3">
        <span className="ms-logo-tile grid size-8 shrink-0 place-items-center rounded-sm">
          <img src="/koc-logo.svg" alt="" className="size-6" />
        </span>
        <p className="min-w-0 leading-tight">
          <span className="block text-sm font-semibold tracking-wide">{GROUP.abbr}</span>
          <span className="block truncate text-xs text-muted-foreground">{GROUP.name}</span>
        </p>
      </div>
      {/* The shortcut reaches assistive technology as aria-keyshortcuts ("Find a dashboard,
          button, Control+K"), so the visible <kbd> is not also read into the name. */}
      <Button
        variant="outline"
        size="sm"
        onClick={onFind}
        aria-keyshortcuts="Control+K"
        className="shrink-0 gap-2 pr-1.5"
      >
        <Search aria-hidden="true" />
        <span className="max-sm:sr-only">Find a dashboard</span>
        <kbd
          aria-hidden="true"
          className="hidden rounded-sm border border-border bg-muted px-1.5 py-0.5 font-sans text-2xs font-medium text-muted-foreground sm:inline-block"
        >
          Ctrl K
        </kbd>
      </Button>
    </header>
  );
}

/* ── Surface: title block and the eight readings ─────────────────────────────────────── */

function Surface() {
  return (
    <div className="bg-background">
      <div className="ms-wrap ms-title flex flex-wrap items-end justify-between gap-x-10 gap-y-3 pt-5 xl:pt-6">
        <div className="min-w-0">
          <p className="text-2xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {GROUP.directorate}
          </p>
          {/* Draughtsman's type: one line, 36px — the linework carries this page, not the h1. */}
          <h1 className="mt-1.5 text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl md:leading-[1.15]">
            {TITLE}
          </h1>
          <JumpStrip />
          <p className="mt-1.5 text-base text-muted-foreground">
            One sheet for every engineering dashboard in the group: {DASHBOARD_COUNT} dashboards on{" "}
            {TEAMS.length} laterals, one per team.
          </p>
        </div>
        {/* The freshness stamp: surface side, right end, directly above the readings it
            qualifies — as a drawing carries its revision date. Derived, never typed. */}
        <p className="pb-0.5 text-xs text-muted-foreground md:ml-auto">
          Readings as of <span className="tabular-nums">{DATA_AS_OF}</span> ·{" "}
          <span className="font-medium text-foreground">Sample data</span>
        </p>
      </div>
      <Readings />
    </div>
  );
}

/**
 * Phone only: the eight teams as a mini scale, straight under the h1 — 4×2, one tick each.
 *
 * The hrefs are real fragment links (`#team-en51`), so they copy, open and read correctly. The
 * click is handled here because this viewer routes on the hash (`#/landing/a`): letting the
 * browser follow `#team-en51` would navigate away from the page. On a page of its own the
 * handler is a plain in-page jump. Focus moves to the team's heading, so a keyboard or screen
 * reader user lands where a sighted one does.
 */
function JumpStrip() {
  const reduced = useReducedMotion();
  const jump = useCallback(
    (e: MouseEvent<HTMLAnchorElement>, t: Team) => {
      const section = document.getElementById(teamId(t));
      if (!section) return;
      e.preventDefault();
      section.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      section.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    },
    [reduced],
  );
  return (
    <nav aria-label="Teams" className="mt-4 mb-1 md:hidden">
      <ul className="ms-strip grid grid-cols-4 gap-y-3">
        {TEAMS.map((t) => (
          <li key={t.code}>
            <a
              href={`#${teamId(t)}`}
              onClick={(e) => jump(e, t)}
              className="block min-h-11 rounded-sm pt-2 pr-1 pl-2 transition-colors duration-fast ease-out hover:bg-muted"
            >
              <span className="block font-mono text-xs font-medium text-primary">{t.code}</span>
              <span className="mt-0.5 block text-2xs leading-tight text-foreground/80">{t.abbr ?? t.shortName}</span>
            </a>
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
      aria-labelledby="ms-readings-h"
      className="ms-wrap ms-surface relative pt-7 md:grid md:grid-cols-[calc(var(--ms-ruler)+var(--ms-kick))_1fr] md:pt-6"
    >
      <div className="pb-3 md:pb-0">
        <h2
          id="ms-readings-h"
          className="text-2xs font-medium uppercase leading-4 tracking-[0.14em] text-muted-foreground md:max-w-[8ch]"
        >
          Surface readings
        </h2>
      </div>

      {/* The wellhead at the head of the mother bore, straddling the ground line, and its
          ground-level mark. */}
      <Wellhead className="absolute bottom-0 left-[calc(var(--ms-pad)+var(--ms-ruler)-32px)] hidden text-foreground md:block" />
      <Wellhead compact className="absolute bottom-0 left-[calc(var(--ms-pad)+var(--ms-ruler)-16px)] text-foreground md:hidden" />
      <span
        aria-hidden="true"
        className="absolute bottom-1 left-[calc(var(--ms-pad)+var(--ms-ruler)-68px)] hidden items-center gap-1 text-2xs font-medium leading-none tracking-[0.08em] text-muted-foreground md:inline-flex"
      >
        <LevelMark className="text-foreground/70" />
        GL
      </span>

      <ul className="ms-readings grid grid-cols-2 gap-x-4 pl-9 md:grid-cols-4 md:gap-x-6 md:pl-0 xl:grid-cols-8 xl:gap-x-5">
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
    <li className="ms-reading min-w-0">
      <p className="self-end text-xs leading-4 text-balance text-muted-foreground">
        {k.label}
        {/* No-break spaces: the period stays with the label's last word, never orphaned. */}
        {period && `\u00a0·\u00a0${period}`}
      </p>
      <p className="mt-1 text-2xl font-medium leading-7 tracking-tight tabular-nums text-foreground">
        {formatKpi(k, k.value)}
        {k.unit && <span className="ml-0.5 text-sm font-normal text-muted-foreground">{k.unit}</span>}
      </p>
      {figure ? (
        <p className="mt-1 text-xs leading-4">
          <span aria-hidden="true">
            <span className={cn("block font-medium tabular-nums", SENTIMENT_TEXT[sentiment])}>{figure}</span>
            <span className="block text-muted-foreground">{k.deltaLabel}</span>
          </span>
          <span className="sr-only">{deltaSpeech(k)}</span>
        </p>
      ) : (
        <p className="mt-1 min-h-8 text-xs leading-4 text-muted-foreground">of annual budget</p>
      )}
      <span className="ms-leader" aria-hidden="true" />
    </li>
  );
}

/* ── Subsurface: the section drawing ─────────────────────────────────────────────────── */

/**
 * Reduced motion, read at the moment the bit would fire — the OS setting or the viewer's flag.
 * Read live rather than mirrored from `useReducedMotion()` into a ref, which would mean writing
 * a ref during render.
 */
const motionReduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
  document.documentElement.dataset.forceReducedMotion === "true";

/** The bit's last keyframe: when it ends, the run is over. */
const BIT_LAST = "ms-bit-off";

function Subsurface() {
  const reduced = useReducedMotion();

  // The draw-on runs once per page load. "armed" holds the lines at their start until the
  // section is in view; the attribute is dropped after the last line lands.
  const [sheetRef, inView] = useInView<HTMLDivElement>("0px");
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (!inView || drawn) return;
    const t = window.setTimeout(() => setDrawn(true), 1100);
    return () => window.clearTimeout(t);
  }, [inView, drawn]);
  const draw = reduced || drawn ? undefined : inView ? "run" : "armed";

  // The bit: once per row per page view.
  const ran = useRef(new Set<string>());
  const dwell = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(dwell.current), []);

  const runBit = useCallback((row: HTMLElement) => {
    const code = row.dataset.code;
    if (!code || motionReduced() || ran.current.has(code)) return;
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    ran.current.add(code);
    row.dataset.bit = "run";
  }, []);

  // `data-bit="run"` lives exactly as long as the run. Left on, it would replay the bit with no
  // input the moment its animations re-applied — the reduced-motion `animation: none` lifting,
  // or the ≥768px query re-matching after a resize. So it comes off when the last keyframe
  // ends, or when any of the bit's animations is cancelled mid-run (the same two causes). The
  // `ran` Set stays the once-per-row guard. Native listeners, delegated on the <ol>: React has
  // no onAnimationCancel. Both events bubble from the bit's own elements.
  const olRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const ol = olRef.current;
    if (!ol) return;
    const settle = (e: AnimationEvent) => {
      if (!e.animationName.startsWith("ms-bit-")) return;
      if (e.type === "animationend" && e.animationName !== BIT_LAST) return;
      const row = (e.target as Element).closest<HTMLElement>(".ms-row");
      if (row) delete row.dataset.bit;
    };
    ol.addEventListener("animationend", settle);
    ol.addEventListener("animationcancel", settle);
    return () => {
      ol.removeEventListener("animationend", settle);
      ol.removeEventListener("animationcancel", settle);
    };
  }, []);

  const onPointerEnter = useCallback(
    (e: PointerEvent<HTMLLIElement>) => {
      if (e.pointerType !== "mouse" || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
      const row = e.currentTarget;
      window.clearTimeout(dwell.current);
      dwell.current = window.setTimeout(() => runBit(row), 120);
    },
    [runBit],
  );
  const onPointerLeave = useCallback(() => window.clearTimeout(dwell.current), []);
  // Keyboard focus only: a tap or click also focuses the link, and must not fire the bit.
  const onFocus = useCallback(
    (e: FocusEvent<HTMLLIElement>) => {
      if (e.target instanceof HTMLElement && e.target.matches(":focus-visible")) runBit(e.currentTarget);
    },
    [runBit],
  );

  return (
    <div className="ms-sub">
      <div ref={sheetRef} className="ms-wrap ms-sheet" data-draw={draw}>
        {/* Surface casing under the wellhead, and the two annotations that sit on the ground
            line: the ruler's caption at the left, the freshness stamp at the right. */}
        <span className="ms-casing" aria-hidden="true" />
        <Shoe variant="surface" className="ms-shoe ms-shoe--surface" />
        <p
          aria-hidden="true"
          className="ms-t90 absolute top-2.5 left-[var(--ms-pad)] hidden w-[calc(var(--ms-ruler)-16px)] text-right text-2xs leading-3 md:block"
        >
          Order =<br />
          team code
        </p>
        {/* The drawing's legend: the platform glyphs as they sit on the stations below. */}
        <ul
          aria-label="Platform key"
          className="ms-t85 absolute top-2 right-[var(--ms-pad)] flex items-center gap-x-4 text-xs leading-5"
        >
          {PLATFORMS.map((p) => {
            const Icon = PLATFORM_ICON[p];
            return (
              <li key={p} className="inline-flex items-center gap-1.5">
                <Icon aria-hidden="true" className="ms-t90 size-3.5" />
                {PLATFORM_LABEL[p]}
              </li>
            );
          })}
        </ul>

        <ol ref={olRef} className="ms-ol">
          {TEAMS.map((t, i) => (
            <Row
              key={t.code}
              team={t}
              i={i}
              onPointerEnter={onPointerEnter}
              onPointerLeave={onPointerLeave}
              onFocus={onFocus}
            />
          ))}
        </ol>

        <div className="ms-td" aria-hidden="true">
          <span className="ms-t90 absolute top-[9px] left-[calc(var(--ms-ruler)+12px)] text-2xs leading-3 font-medium tracking-[0.08em]">
            TD
          </span>
        </div>
      </div>
    </div>
  );
}

function Row({
  team,
  i,
  onPointerEnter,
  onPointerLeave,
  onFocus,
}: {
  team: Team;
  i: number;
  onPointerEnter: (e: PointerEvent<HTMLLIElement>) => void;
  onPointerLeave: () => void;
  onFocus: (e: FocusEvent<HTMLLIElement>) => void;
}) {
  const id = teamId(team);
  const n = team.links.length;
  return (
    <li
      className="ms-row"
      style={{ "--i": i } as CSSProperties}
      data-code={team.code}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
    >
      {i === LINER_ROW && (
        <>
          <span className="ms-liner" aria-hidden="true" />
          <Shoe variant="liner" className="ms-shoe ms-shoe--liner" />
        </>
      )}
      <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6">
        <div className="ms-head flex flex-wrap items-baseline gap-x-3">
          {/* NVDA reads code and name together: "EN11 Contracts Management". */}
          <h2 id={`${id}-h`} tabIndex={-1} className="ms-t shrink-0 text-md font-semibold">
            <span className="ms-code ms-t90 mr-1 font-mono text-xs font-medium md:mr-0">{team.code}</span>
            {/* An explicit space: below md the code span is inline, and without a text node
                between them the accessible name runs together as "EN11Contracts Management". */}
            {" "}
            {team.shortName}
            {team.abbr && <span className="ms-t85 font-normal"> {team.abbr}</span>}
          </h2>
          <p className="ms-t85 shrink-0 text-xs tabular-nums">
            {n} {n === 1 ? "dashboard" : "dashboards"}
          </p>
          <p className="ms-t85 w-full text-xs md:w-auto md:min-w-0 md:truncate">{team.blurb}</p>
        </div>

        <div className="ms-lat">
          <span className="ms-kick" aria-hidden="true">
            <svg width="58" height="50" viewBox="0 0 58 50" focusable="false">
              {/* the ruler tick at the kick-off depth */}
              <path className="ms-kick-tick" d="M0 0.5H9.25" pathLength={1} />
              {/* the build curve: vertical off the bore, horizontal on the lateral's row */}
              <path className="ms-kick-path" d="M10 0.5A48 48 0 0 0 58 48.5" pathLength={1} />
            </svg>
            {i === 0 && <span className="ms-kop">KOP</span>}
            <span className="ms-bit-curve" />
          </span>

          <ul className="ms-stations">
            {team.links.map((l, j) => {
              const Icon = PLATFORM_ICON[l.platform];
              return (
                <li key={l.id} className="ms-station" style={{ "--j": j } as CSSProperties}>
                  <DashboardAnchor link={l} data-station={l.id} className="ms-station-a text-sm">
                    <Icon className="ms-glyph" aria-hidden="true" />
                    <span className="ms-label">{l.label}</span>
                    <ArrowUpRight className="ms-arrow" aria-hidden="true" />
                  </DashboardAnchor>
                  {j === n - 1 && <span className="ms-toe" aria-hidden="true" />}
                </li>
              );
            })}
          </ul>

          <span className="ms-bit-track" aria-hidden="true">
            <span className="ms-bit" />
          </span>
        </div>
      </section>
    </li>
  );
}

/* ── Footer: the bottom of the sheet, with its title block ───────────────────────────── */

function SheetFooter() {
  const cells: [string, string][] = [
    ["Group", GROUP.name],
    ["Drawing", "Dashboard section"],
    ["Sheet", "1 of 1"],
    ["As of", DATA_AS_OF],
    ["Status", "Sample data"],
    ["Company", GROUP.company],
  ];
  return (
    <footer className="ms-sub">
      <div className="ms-footrule flex flex-col md:flex-row md:justify-between">
        <div className="ms-wrap flex items-start gap-3 pt-6 pb-8 md:pb-24">
          <img src="/koc-logo.svg" alt="" className="size-9 shrink-0" />
          <p className="leading-tight">
            <span className="ms-t block text-sm font-semibold">{GROUP.name}</span>
            <span className="ms-t85 mt-0.5 block text-xs">{GROUP.directorate}</span>
          </p>
        </div>
        {/* The title block sits in the sheet's corner: ruled on its open sides only, flush to
            the page's right and bottom edges, which are the sheet's own border. */}
        <div className="ms-titleblock grid grid-cols-2 self-stretch pb-20 sm:grid-cols-3 md:self-end md:pb-0">
          {cells.map(([label, value]) => (
            <div key={label} className="px-3.5 pt-2.5 pb-3 md:min-w-44">
              <p className="ms-t90 text-2xs font-medium uppercase leading-3 tracking-[0.12em]">{label}</p>
              <p className="ms-t mt-1 text-xs leading-4">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
