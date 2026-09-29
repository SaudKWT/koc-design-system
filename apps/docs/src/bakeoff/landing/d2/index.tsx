/**
 * Direction D v2 — "Datum", the daily-use round.
 *
 * v1 was a first visit: a stipple landscape flown over behind everything, the eight teams as
 * survey stations on the datum line at its foot, and a page that walked the field through a rig
 * and a reservoir as you scrolled down to the links. v2 is the hundredth visit. The top of the
 * page is a working surface that fits one screen: the group, a find field (Ctrl+K), the eight
 * readouts as one strip of instrument cells, your pinned and recent dashboards, and the whole
 * directory — the eight teams as survey stations standing on two ruled datum lines, every link
 * hanging from its station with a pin beside it. Nothing up there moves on its own.
 *
 * The field is still the showpiece, and it is all still here — the flyover, the rigs and their
 * wells, the morphs into a rig, a reservoir block, a PDC bit and a wellhead — but only in the
 * footer: a sticky stage the reader scrolls through on purpose, drawn only once they get near it.
 *
 * ── MOTION INVENTORY ─────────────────────────────────────────────────────────────────────────
 * The working surface (header, readouts, your dashboards, directory): nothing moves on its own.
 *  Title — Blur Fade (CSS) .......... the dotted h1 only: blur 6px→0 + 6px rise, 560ms, once per
 *                                     load. Reduced motion: none.
 *  Readouts ......................... static. No count-up, no marquee: a figure never moves.
 *  Hover / focus (CSS) .............. link rows, chips, pin toggles, jump buttons and the find
 *                                     field: transition-colors duration-fast ease-out. A station's
 *                                     datum segment when jumped to: transition-colors duration-slow.
 *  Jump / skip / back to top (JS) ... smooth scrollIntoView / scrollTo; `auto` under reduced motion.
 * The footer — the showpiece, and the only place the field lives:
 *  Particle field (JS, rAF, WebGL2) . one canvas in the footer's sticky stage, never fixed and never
 *                                     behind a link, KPI or the find field. Mounted only when the
 *                                     footer approaches (IntersectionObserver), faded in on its first
 *                                     frame (opacity, duration-slower ease-out). 160k / 90k / 50k
 *                                     specks by stage area, then by timing the first ~45 frames;
 *                                     software GL is pinned at 50k with no idle motion. The loop stops
 *                                     offscreen, in a hidden tab, and under reduced motion.
 *  · Terrain flyover ................ endless, ~1.1 world units/s at 30 fps (60 while the pointer is
 *                                     over it), only while the stage holds the terrain.
 *  · Scroll morph ................... terrain → rig → earth block → PDC bit → wellhead, walked by the
 *                                     reader's scroll through the footer (eased, τ 0.14 s); it stops
 *                                     when scrolling stops. Curl-noise swarm peaks mid-morph (sin πt),
 *                                     with a per-particle stagger.
 *  · Model idle ..................... rig, block and wellhead sway ±6–8° over ~40 s; the bit turns
 *                                     at 0.075 rad/s; drawn at 30 fps.
 *  · Pointer swell + parallax (JS) .. eased, τ 0.18–0.9 s, over the terrain only.
 *  · Rig hover label (CSS) .......... transition-opacity duration-slower ease-out.
 *    Reduced motion (OS or the viewer's flag, live): no flight, swarm, sway, spin, swell or
 *    parallax; each figure is one composed still and the field switches without a tween at the
 *    midpoint between two figures.
 *  Figure plates (CSS) .............. swap at the morph's midpoint, transition-opacity duration-slow
 *                                     ease-out; the rail's tick, transition-colors duration-slow.
 *                                     Reduced: instant (the base layer, and datum.css for the flag).
 *  Stage caption — Blur Fade (CSS) .. 560ms once, when the footer arrives. Reduced: none.
 *  Sign-off datum line (CSS) ........ scaleX 0→1, 900ms once, when it arrives. Reduced: none.
 * Static, never moving: the dotted headline and the DWEG sign-off (a CSS mask).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { ArrowDownRight, ArrowUp, ArrowUpRight, Minus, Pin, Search, X } from "lucide-react";

import { Badge, cn } from "@koc/ui";

import {
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
  Sparkline,
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
import { BlurFade } from "./BlurFade";
import { MODEL_INFO, ParticleField, type FieldKey, type ModelId, type ParticleFieldHandle } from "./ParticleField";
import { useStageScroll } from "./useStageScroll";
import "./datum.css";

const pad2 = (n: number) => String(n).padStart(2, "0");
const teamId = (t: Team) => `datum2-team-${t.code.toLowerCase()}`;
const UNIT_SPEECH: Record<string, string> = { "%": "percent", d: "days", h: "hours" };
const PLATFORMS = Object.keys(PLATFORM_LABEL) as Platform[];

/** The page gutter and measure, shared by every band so the columns line up down the page. */
const FRAME = "mx-auto w-full max-w-[90rem] px-4 sm:px-8 lg:px-10 xl:px-12 2xl:px-14";
/** Datum's section voice: a mono, uppercase eyebrow with the section's number in primary. */
const EYEBROW = "font-mono text-2xs font-medium uppercase tracking-[0.14em] text-muted-foreground";
/** The one pin style, in the directory and in your dashboards alike. 24px square (PinToggle). */
const PIN =
  "rounded-sm text-muted-foreground transition-colors duration-fast ease-out hover:bg-muted hover:text-foreground aria-pressed:text-primary";
/**
 * A solid surface over the field. 98%, not 100%: a fully opaque layer over the WebGL canvas makes
 * Chromium's software compositor (SwiftShader — what Edge and Chrome fall back to on a VM or a
 * remote desktop without a GPU) cull a vertically MIRRORED rectangle of the canvas, which then
 * shows as a blank band at the other edge. Found in v1; in v2 only the stage's own captions sit
 * over the canvas, and they keep the 98%.
 */
const SURFACE = "bg-background/98";

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

/** The KOC mark. The SVG is white-only, so it always sits on a dark tile. */
function LogoTile({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-md bg-primary dark:bg-card dark:ring-1 dark:ring-border",
        className,
      )}
    >
      <img src="/koc-logo.svg" alt="" className="size-[70%]" />
    </span>
  );
}

// ── Skip link: the first tab stop ───────────────────────────────────────────────────────────
/**
 * A real in-page link (so axe and screen readers know it as a skip link), but the jump is done by
 * script: the viewer routes on the hash, so letting the browser follow `#…` would leave the page.
 * Parked above the window until focused (not `sr-only`, whose reset would strip its padding).
 */
function SkipLink({ onSkip }: { onSkip: () => void }) {
  return (
    <a
      href="#datum2-yours"
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault();
        onSkip();
      }}
      className="fixed left-3 top-3 z-50 -translate-y-24 rounded-md bg-background px-3 py-2 text-sm font-medium text-foreground shadow-md ring-2 ring-ring focus:translate-y-0"
    >
      Skip to dashboards
    </a>
  );
}

// ── Header: who this is, and the find field ────────────────────────────────────────────────
function Find({
  inputRef,
  query,
  onQuery,
  onCommit,
  onNext,
  className,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQuery: (q: string) => void;
  /** Enter: open the only match, or go to the first. */
  onCommit: () => void;
  /** ArrowDown: go to the first match. */
  onNext: () => void;
  className?: string;
}) {
  const mac = useMemo(() => typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform), []);
  return (
    <form
      role="search"
      aria-label="Find a dashboard"
      onSubmit={(e) => {
        e.preventDefault();
        onCommit();
      }}
      className={cn("relative", className)}
    >
      <label htmlFor="datum2-find" className="sr-only">
        Find a dashboard, team or platform
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        ref={inputRef}
        id="datum2-find"
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && query) {
            e.preventDefault();
            onQuery("");
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            onNext();
          }
        }}
        placeholder="Find a dashboard, team or platform"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="go"
        aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
        aria-controls="datum2-directory"
        className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-16 text-sm text-foreground transition-colors duration-fast ease-out placeholder:text-muted-foreground hover:border-foreground/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      />
      {!query && (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-2xs text-muted-foreground"
        >
          {mac ? "⌘ K" : "Ctrl K"}
        </kbd>
      )}
    </form>
  );
}

function Header({ find }: { find: ReactNode }) {
  const today = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return (
    <header className="border-b border-border">
      <div className={cn(FRAME, "flex flex-wrap items-center gap-x-8 gap-y-3 py-3")}>
        <div className="flex min-w-0 items-center gap-3">
          <LogoTile className="size-9" />
          <p className="leading-tight">
            <span className="block font-mono text-sm font-semibold tracking-[0.08em] text-foreground">{GROUP.abbr}</span>
            <span className="block text-xs text-muted-foreground max-sm:hidden">{GROUP.name}</span>
          </p>
        </div>
        {find}
        <p className="ml-auto text-right leading-tight max-sm:hidden lg:ml-0">
          <span className="block text-sm font-medium text-foreground">
            {greeting()}, {VIEWER.firstName}
          </span>
          <span className="block font-mono text-2xs uppercase tracking-[0.12em] text-muted-foreground">{today}</span>
        </p>
      </div>
    </header>
  );
}

// ── The title: the one decorative moment on the working surface ─────────────────────────────
function Title({ className }: { className?: string }) {
  return (
    <div className={cn(FRAME, "flex flex-wrap items-end justify-between gap-x-10 gap-y-2 pb-5 pt-6", className)}>
      <div className="min-w-0">
        <p className={cn(EYEBROW, "tracking-[0.16em]")}>
          <span className="max-sm:hidden">
            {GROUP.company} <span aria-hidden="true">·</span>{" "}
          </span>
          {GROUP.directorate}
        </p>
        <BlurFade>
          {/* Display size beyond the text-5xl step: text-[clamp()] is allowed for the title.
              datum2-dotted is a halftone mask over real, selectable text (datum.css). */}
          <h1
            id="datum2-title"
            className="datum2-dotted mt-2 text-[clamp(2.25rem,4.3vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-foreground"
          >
            Drilling &amp; Workover Engineering
          </h1>
        </BlurFade>
      </div>
      <p className="pb-1 font-mono text-2xs uppercase tracking-[0.12em] text-muted-foreground tabular-nums max-md:hidden">
        {TEAMS.length} teams · {DASHBOARD_COUNT} dashboards
      </p>
    </div>
  );
}

// ── 01 Readouts: the eight group figures as one strip of instrument cells ──────────────────
function Trend({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const last = values[values.length - 1];
  // Mirrors Sparkline's own mapping (viewBox 100×28, 2px inset) so the end mark sits on the line.
  const y = (28 - ((last - min) / span) * 24 - 2) / 28;
  return (
    <div aria-hidden="true" className="relative h-6 w-12 shrink-0">
      <Sparkline values={values} className="h-6 text-primary" />
      <span
        className="absolute right-0 size-1.5 -translate-y-1/2 translate-x-1/2 rounded-full bg-primary ring-2 ring-background"
        style={{ top: `${y * 100}%` }}
      />
    </div>
  );
}

function Readout({ k }: { k: Kpi }) {
  const sentiment = kpiSentiment(k.delta, k.intent);
  const delta = formatDelta(k);
  const Arrow = !k.delta ? Minus : k.delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <li
      data-kpi={k.id}
      title={k.description}
      className="datum2-cell relative flex min-w-0 flex-col gap-1.5 border-b border-r border-dotted border-muted-foreground/45 px-3 pb-2.5 pt-2 xl:px-2.5"
    >
      <h3 className="text-xs font-medium leading-4 text-foreground">{k.label}</h3>
      <div className="mt-auto flex items-end justify-between gap-2">
        <p className="whitespace-nowrap leading-none text-foreground">
          <span aria-hidden="true" className="text-2xl font-semibold tracking-tight tabular-nums">
            {formatKpi(k, k.value)}
          </span>
          {k.unit && (
            <span aria-hidden="true" className="ml-0.5 text-xs font-medium text-muted-foreground">
              {k.unit}
            </span>
          )}
          <span className="sr-only">
            {formatKpi(k, k.value)}
            {k.unit ? ` ${UNIT_SPEECH[k.unit] ?? k.unit}` : ""}
          </span>
        </p>
        <Trend values={k.trend} />
      </div>
      <p className={cn("flex min-w-0 items-center gap-1 text-2xs leading-4", SENTIMENT_TEXT[sentiment])}>
        {delta ? (
          <>
            <Arrow aria-hidden="true" className="size-3 shrink-0" />
            <span aria-hidden="true" className="shrink-0 font-mono font-medium tabular-nums">
              {delta}
            </span>
            <span aria-hidden="true" className="truncate text-muted-foreground">
              {k.deltaLabel}
            </span>
            <span className="sr-only">{deltaSpeech(k)}</span>
          </>
        ) : (
          <span className="text-muted-foreground">No comparison period</span>
        )}
      </p>
    </li>
  );
}

function Readouts({ className }: { className?: string }) {
  return (
    <section aria-labelledby="datum2-perf" className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="datum2-perf" className={EYEBROW}>
          <span className="text-primary">01</span> — Readouts
        </h2>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
          <span>D&amp;W group only</span>
          <span className="font-mono tabular-nums">As of {DATA_AS_OF}</span>
          <Badge variant="outline" className="font-mono text-2xs uppercase tracking-[0.08em]">
            Sample data
          </Badge>
        </p>
      </div>
      <ul className="mt-2.5 grid grid-cols-2 border-l border-t border-dotted border-muted-foreground/45 md:grid-cols-4 xl:grid-cols-8">
        {KPIS.map((k) => (
          <Readout key={k.id} k={k} />
        ))}
      </ul>
    </section>
  );
}

// ── 02 Your dashboards: pinned and recent ───────────────────────────────────────────────────
type Memory = ReturnType<typeof useDashboardMemory>;

function Chip({ item, pinned, onTogglePin }: { item: RememberedLink; pinned: boolean; onTogglePin: (id: string) => void }) {
  const { link, team } = item;
  const Icon = PLATFORM_ICON[link.platform];
  return (
    <li className="flex min-w-0 items-center rounded-sm border border-border bg-card text-card-foreground">
      <DashboardAnchor
        link={link}
        className="group/chip flex min-h-8 min-w-0 items-center gap-2 rounded-l-sm py-1 pl-2.5 pr-1.5 text-sm font-medium transition-colors duration-fast ease-out hover:bg-primary/5 hover:text-primary"
      >
        <Icon
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground transition-colors duration-fast ease-out group-hover/chip:text-primary"
        />
        <span className="min-w-0 truncate">{link.label}</span>
        <span className="shrink-0 font-mono text-2xs font-normal text-muted-foreground">{team.code}</span>
      </DashboardAnchor>
      <PinToggle link={link} pinned={pinned} onTogglePin={onTogglePin} className={cn(PIN, "mr-1")} />
    </li>
  );
}

function Yours({ memory, className }: { memory: Memory; className?: string }) {
  const { pinned, recent, isPinned, togglePin, clearRecent } = memory;
  const label = "flex w-[4.5rem] shrink-0 items-center gap-1.5 pt-2 font-mono text-2xs font-medium uppercase tracking-[0.12em]";
  const quiet = "pt-1.5 text-xs leading-5 text-muted-foreground";
  return (
    <div className={className}>
      <h2 id="datum2-yours" tabIndex={-1} className={EYEBROW}>
        <span className="text-primary">02</span> — Your dashboards
      </h2>
      <div className="mt-2.5 grid gap-x-10 gap-y-2.5 border-y border-dotted border-muted-foreground/45 py-2.5 lg:grid-cols-2">
        <section aria-label="Pinned dashboards" className="flex min-w-0 items-start gap-2">
          <h3 className={cn(label, "text-foreground")}>
            <Pin aria-hidden="true" className="size-3 text-primary" />
            Pinned
          </h3>
          {pinned.length ? (
            <ul className="flex min-w-0 flex-wrap gap-1.5">
              {pinned.map((item) => (
                <Chip key={item.link.id} item={item} pinned onTogglePin={togglePin} />
              ))}
            </ul>
          ) : (
            <p className={quiet}>Pin a dashboard with the pin icon beside it to keep it here.</p>
          )}
        </section>
        <section aria-label="Recent dashboards" className="flex min-w-0 items-start gap-2">
          <h3 className={cn(label, "text-muted-foreground")}>Recent</h3>
          {recent.length ? (
            <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
              <ul className="flex min-w-0 flex-wrap gap-1.5">
                {recent.map((item) => (
                  <Chip key={item.link.id} item={item} pinned={isPinned(item.link.id)} onTogglePin={togglePin} />
                ))}
              </ul>
              <button
                type="button"
                onClick={clearRecent}
                className="mt-1 inline-flex min-h-6 shrink-0 items-center gap-1 rounded-sm px-1.5 font-mono text-2xs uppercase tracking-[0.1em] text-muted-foreground transition-colors duration-fast ease-out hover:bg-muted hover:text-foreground"
              >
                <X aria-hidden="true" className="size-3" />
                Clear<span className="sr-only"> recent dashboards</span>
              </button>
            </div>
          ) : (
            <p className={quiet}>The dashboards you open from here appear here.</p>
          )}
        </section>
      </div>
    </div>
  );
}

// ── 03 Directory: the eight teams as survey stations, every link hanging from its station ──
function LinkRow({ link, pinned, onTogglePin }: { link: DashboardLink; pinned: boolean; onTogglePin: (id: string) => void }) {
  const Icon = PLATFORM_ICON[link.platform];
  return (
    <li className="flex items-center gap-0.5 border-b border-dotted border-muted-foreground/35">
      <DashboardAnchor
        link={link}
        className="group/link flex min-h-8 min-w-0 flex-1 items-center gap-2.5 rounded-sm px-1 py-1.5 text-sm text-foreground transition-colors duration-fast ease-out hover:bg-primary/5 hover:text-primary"
      >
        <Icon
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground transition-colors duration-fast ease-out group-hover/link:text-primary"
        />
        {/* The platform is the icon (keyed above the directory; DashboardAnchor speaks it). v1's
            dotted leader to a platform label cost the label its width at four columns, and a
            wrapped label is slower to scan than an icon is to learn. */}
        <span className="min-w-0 font-medium leading-5">{link.label}</span>
      </DashboardAnchor>
      <PinToggle link={link} pinned={pinned} onTogglePin={onTogglePin} className={PIN} />
    </li>
  );
}

function Station({
  m,
  selected,
  searching,
  memory,
}: {
  m: TeamMatch;
  selected: boolean;
  searching: boolean;
  memory: Memory;
}) {
  const t = m.team;
  const n = t.links.length;
  return (
    <div
      id={teamId(t)}
      data-datum2-selected={selected}
      className="datum2-station datum2-ruler relative scroll-mt-6 border-l border-t border-l-border border-t-foreground/60 pb-2 pl-3 pr-5 pt-2.5 transition-colors duration-slow ease-out data-[datum2-selected=true]:border-t-primary"
    >
      <p className="flex items-baseline justify-between gap-3 font-mono text-xs">
        <span className="font-medium text-primary">
          {t.code}
          {t.abbr && <span className="font-normal text-muted-foreground"> · {t.abbr}</span>}
        </span>
        <span aria-hidden="true" className="shrink-0 text-2xs tabular-nums text-muted-foreground">
          {searching && !m.teamMatched ? (
            `${m.links.length} of ${n}`
          ) : (
            <>
              {pad2(n)}
              {/* At four narrow columns (1024–1279) the number alone, so the code never wraps. */}
              <span className="lg:max-xl:hidden"> {n === 1 ? "dashboard" : "dashboards"}</span>
            </>
          )}
        </span>
      </p>
      <h3 id={`${teamId(t)}-title`} tabIndex={-1} className="mt-0.5 text-sm font-semibold leading-5 text-foreground">
        {t.shortName}
      </h3>
      <ul className="mt-2 border-t border-dotted border-muted-foreground/35">
        {m.links.map((l) => (
          <LinkRow key={l.id} link={l} pinned={memory.isPinned(l.id)} onTogglePin={memory.togglePin} />
        ))}
      </ul>
    </div>
  );
}

/** Below lg the directory is long: eight buttons jump to a station (buttons, never a hash link). */
function JumpBar({ onJump, className }: { onJump: (t: Team) => void; className?: string }) {
  return (
    <nav aria-label="Jump to a team" className={className}>
      <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
        {TEAMS.map((t) => (
          <li key={t.code}>
            <button
              type="button"
              onClick={() => onJump(t)}
              className="flex min-h-8 w-full items-center rounded-sm border border-border px-2 py-1 text-left font-mono text-xs font-medium text-primary transition-colors duration-fast ease-out hover:bg-primary/5"
            >
              {t.code}
              <span className="sr-only">{`, ${t.shortName}`}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function PlatformKey({ className }: { className?: string }) {
  return (
    <ul aria-label="Platforms" className={cn("flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted-foreground", className)}>
      {PLATFORMS.map((p) => {
        const Icon = PLATFORM_ICON[p];
        return (
          <li key={p} className="flex items-center gap-1.5">
            <Icon aria-hidden="true" className="size-3.5" />
            {PLATFORM_LABEL[p]}
          </li>
        );
      })}
    </ul>
  );
}

function Directory({
  query,
  matches,
  memory,
  selected,
  onClear,
}: {
  query: string;
  matches: TeamMatch[];
  memory: Memory;
  selected: string | null;
  onClear: () => void;
}) {
  const q = query.trim();
  const searching = q.length > 0;
  const found = matches.reduce((n, m) => n + m.links.length, 0);
  const status = !searching
    ? `${DASHBOARD_COUNT} dashboards in ${TEAMS.length} teams · each opens in a new tab`
    : found === 0
      ? `No dashboard matches “${q}”`
      : `${found} of ${DASHBOARD_COUNT} ${found === 1 ? "dashboard matches" : "dashboards match"} “${q}”${found === 1 ? " · Enter opens it" : ""}`;

  // While a query is active the directory keeps the height it has without one. Typing never
  // changes the page's height, so nothing below jumps and the scrollbar holds still — and the
  // footer, with the particle field, never rises into view (and never starts up) mid-search.
  const ref = useRef<HTMLElement>(null);
  const [natural, setNatural] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || searching) return;
    const ro = new ResizeObserver(() => setNatural(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [searching]);

  return (
    <section
      ref={ref}
      id="datum2-directory"
      aria-labelledby="datum2-dash"
      className="scroll-mt-4"
      style={searching && natural ? { minHeight: natural } : undefined}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <h2 id="datum2-dash" tabIndex={-1} className={EYEBROW}>
            <span className="text-primary">03</span> — Directory
          </h2>
          <p role="status" className={cn("text-2xs", searching ? "font-medium text-foreground" : "text-muted-foreground")}>
            {status}
          </p>
          {searching && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex min-h-6 items-center gap-1 rounded-sm px-1.5 font-mono text-2xs uppercase tracking-[0.1em] text-muted-foreground transition-colors duration-fast ease-out hover:bg-muted hover:text-foreground"
            >
              <X aria-hidden="true" className="size-3" />
              Clear search
            </button>
          )}
        </div>
        <PlatformKey className="max-md:hidden" />
      </div>
      {matches.length ? (
        <div className="mt-5 grid grid-cols-1 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {matches.map((m) => (
            <Station key={m.team.code} m={m} selected={selected === m.team.code} searching={searching} memory={memory} />
          ))}
        </div>
      ) : (
        <div className="datum2-ruler mt-5 border-t border-foreground/60 pt-4">
          <p className="text-sm text-foreground">Nothing in the directory matches that.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try a team code (EN71), part of a team’s name (contracts) or a platform (Power BI).
          </p>
        </div>
      )}
    </section>
  );
}

// ── 04 The field: the footer's showpiece ────────────────────────────────────────────────────
interface Figure {
  model: "terrain" | ModelId;
  step: string;
  label: string;
  caption: string;
}

/** Survey → drill → steer → cut → complete: the group's work, as the stage walks it. */
const FIGURES: readonly Figure[] = [
  {
    model: "terrain",
    step: "Survey",
    label: "The field",
    caption: "Stipple terrain · sample rigs and their directional wells, not live positions",
  },
  { model: "rig", step: "Drill", ...MODEL_INFO.rig },
  { model: "earth", step: "Steer", ...MODEL_INFO.earth },
  { model: "bit", step: "Cut", ...MODEL_INFO.bit },
  { model: "wellhead", step: "Complete", ...MODEL_INFO.wellhead },
];

/** Where the models are framed in the stage, as fractions: [left, top, right, bottom]. ≥lg they
 *  stand right of the caption column and left of the rail; below lg, between title and plate. */
const FRAME_LG = [0.37, 0.07, 0.9, 0.95] as const;
const FRAME_SM = [0.05, 0.19, 0.95, 0.79] as const;

/** True once `ref` comes within `margin` of the viewport; never goes back. */
function useNear<T extends Element>(ref: RefObject<T | null>, margin: string) {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin, near]);
  return near;
}

function Plate({ f, i, className }: { f: Figure; i: number; className?: string }) {
  return (
    <div
      className={cn(
        "w-full rounded-sm border border-border border-l-2 border-l-primary px-4 py-3 [grid-area:1/1]",
        SURFACE,
        className,
      )}
    >
      <div className="flex items-center justify-between gap-4 border-b border-dotted border-muted-foreground/40 pb-2 font-mono text-2xs uppercase tracking-[0.1em] text-muted-foreground">
        <span className="whitespace-nowrap">
          <span className="text-primary">Fig. {pad2(i + 1)}</span> / {pad2(FIGURES.length)} · {f.step}
        </span>
        <span className="whitespace-nowrap">Illustrative · NTS</span>
      </div>
      <p className="mt-2 text-sm font-medium text-foreground">{f.label}</p>
      <p className="mt-0.5 font-mono text-2xs leading-relaxed text-muted-foreground">{f.caption}</p>
    </div>
  );
}

/** The reference's thin right-edge rail, as the stage's own key: which step the field is on. */
function Rail({ fig, className }: { fig: number; className?: string }) {
  return (
    <ol data-datum2-quiet="40" className={cn("flex flex-col items-end gap-3", className)}>
      {FIGURES.map((f, i) => (
        <li
          key={f.model}
          data-datum2-on={fig === i}
          className="group/tick flex items-center gap-2.5 font-mono text-2xs uppercase tracking-[0.14em] text-muted-foreground transition-colors duration-slow ease-out data-[datum2-on=true]:text-foreground"
        >
          <span className="tabular-nums">
            {pad2(i + 1)} {f.step}
          </span>
          <span className="h-px w-4 bg-muted-foreground/60 transition-colors duration-slow ease-out group-data-[datum2-on=true]/tick:bg-primary" />
        </li>
      ))}
    </ol>
  );
}

function BackToTop({ onTop, className }: { onTop: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onTop}
      className={cn(
        "-mx-1 inline-flex min-h-6 shrink-0 items-center gap-1.5 rounded-sm px-1 font-mono text-xs uppercase tracking-[0.12em] text-foreground transition-colors duration-fast ease-out hover:text-primary",
        className,
      )}
    >
      <ArrowUp aria-hidden="true" className="size-3.5" />
      Back to top
    </button>
  );
}

/**
 * The floor of the footer stage: the datum line, the group's mark, the sample-data note. It is part
 * of the sticky stage, so it is in view for the whole footer; below lg it is kept to ~220px so the
 * phone's stage keeps most of the screen.
 */
function SignOff({ onTop }: { onTop: () => void }) {
  const [ref, seen] = useInView<HTMLDivElement>("0px");
  return (
    <div className="relative shrink-0 bg-background">
      <div className={FRAME}>
        <div ref={ref} aria-hidden="true" data-datum2-shown={seen} className="datum2-draw datum2-ruler h-px bg-foreground/60" />
        {/* pb-16: the page ends here, and a 64px floor keeps the sign-off clear of anything docked at
            the bottom of the window (the evaluation viewer's bar, today). */}
        <div className="grid gap-3 pb-16 pt-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end lg:gap-14 lg:pt-7">
          <div className="flex items-end justify-between gap-4">
            {/* The group's mark in the headline's dotted type. Decorative: the name is beside it. */}
            <p
              aria-hidden="true"
              className="datum2-dotted text-[clamp(2.75rem,7.5vw,6.5rem)] font-semibold leading-[0.8] tracking-[-0.05em] text-foreground"
            >
              {GROUP.abbr}
            </p>
            <BackToTop onTop={onTop} className="lg:hidden" />
          </div>
          <div className="grid gap-2 lg:gap-3">
            <div className="flex items-start gap-3">
              <LogoTile className="size-8" />
              <div className="leading-snug">
                <p className="text-sm font-medium text-foreground">{GROUP.name}</p>
                <p className="text-xs text-muted-foreground">
                  {GROUP.directorate} · {GROUP.company}
                </p>
              </div>
            </div>
            <div className="flex items-end justify-between gap-4 border-t border-dotted border-muted-foreground/40 pt-2 text-xs leading-relaxed text-muted-foreground lg:pt-3">
              <div>
                <p>
                  Sample data<span className="max-lg:hidden">. Every figure, dashboard name and address on this page is a placeholder</span>.
                </p>
                <p className="mt-0.5 font-mono tabular-nums">Data as of {DATA_AS_OF}</p>
              </div>
              <BackToTop onTop={onTop} className="max-lg:hidden" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The footer is a tall track with a sticky stage: the canvas region above, the sign-off below it.
 * The canvas fills only the region — no link, KPI or field is ever under it — and is mounted only
 * as the footer approaches. While the track scrolls past, the stage holds still and the scroll
 * walks the field from the terrain to the wellhead; at the end of the page the whole stage,
 * sign-off included, is in view.
 */
function Footer({ onTop }: { onTop: () => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<ParticleFieldHandle>(null);
  const near = useNear(trackRef, "0px 0px 20% 0px");
  const [fig, setFig] = useState(0);
  const lg = useMedia("(min-width: 1024px)");
  const sequence = useMemo<FieldKey[]>(
    () => FIGURES.map((f) => (f.model === "terrain" ? { model: "terrain" } : { model: f.model, frame: lg ? FRAME_LG : FRAME_SM })),
    [lg],
  );
  useStageScroll(trackRef, fieldRef, FIGURES.length, setFig, near);

  return (
    <footer className="relative border-t border-border">
      <div ref={trackRef} className="relative h-[340svh]">
        <div className="sticky top-0 flex h-svh flex-col">
          {/* Decorative, like the canvas it frames: the stage's captions describe the drawing. */}
          <div ref={stageRef} aria-hidden="true" className="relative min-h-0 flex-1 overflow-hidden">
            {near && (
              <ParticleField ref={fieldRef} className="absolute inset-0" sequence={sequence} quietRef={stageRef} />
            )}
            <div className={cn(FRAME, "relative flex h-full flex-col justify-between gap-6 py-6 lg:py-12")}>
              <BlurFade inView className="w-fit max-w-sm">
                <div data-datum2-quiet="88">
                  <p className={EYEBROW}>
                    <span className="text-primary">04</span> — The field
                  </p>
                  <p className="mt-2 text-xl font-semibold tracking-tight text-foreground lg:mt-3 lg:text-2xl">
                    From survey to completion
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground max-lg:hidden">
                    The group’s work, drawn in stipple as you scroll: the ground, the rig, the well it steers, the
                    bit that cuts it and the tree that completes it.
                  </p>
                </div>
              </BlurFade>
              <div data-datum2-quiet="64" className="grid w-full max-w-sm">
                {FIGURES.map((f, i) => (
                  <Plate
                    key={f.model}
                    f={f}
                    i={i}
                    className={cn("self-end transition-opacity duration-slow ease-out", fig === i ? "opacity-100" : "opacity-0")}
                  />
                ))}
              </div>
            </div>
            <Rail fig={fig} className="absolute right-6 top-1/2 -translate-y-1/2 max-lg:hidden xl:right-10" />
          </div>
          <SignOff onTop={onTop} />
        </div>
      </div>
    </footer>
  );
}

// ── The page ────────────────────────────────────────────────────────────────────────────────
export default function DirectionD2() {
  const reduced = useReducedMotion();
  const memory = useDashboardMemory();
  const findRef = useRef<HTMLInputElement>(null);
  useFindShortcut(findRef);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const matches = useMemo(() => matchDashboards(query), [query]);
  const searching = query.trim().length > 0;

  const firstResult = () => document.querySelector<HTMLAnchorElement>("#datum2-directory a[href]");
  const next = () => firstResult()?.focus();
  const commit = () => {
    if (!searching) return;
    const count = matches.reduce((n, m) => n + m.links.length, 0);
    if (count === 1) firstResult()?.click(); // the only match: open it (DashboardAnchor records it)
    else next();
  };
  const clear = () => {
    setQuery("");
    findRef.current?.focus();
  };

  const behavior: ScrollBehavior = reduced ? "auto" : "smooth";
  const jump = useCallback(
    (t: Team) => {
      setSelected(t.code);
      document.getElementById(teamId(t))?.scrollIntoView({ behavior, block: "start" });
      document.getElementById(`${teamId(t)}-title`)?.focus({ preventScroll: true });
    },
    [behavior],
  );
  const skip = useCallback(() => {
    const h = document.getElementById("datum2-yours");
    h?.scrollIntoView({ behavior, block: "start" });
    h?.focus({ preventScroll: true });
  }, [behavior]);
  const toTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior });
    findRef.current?.focus({ preventScroll: true });
  }, [behavior]);

  // Below lg, searching lets the title, the readouts and your dashboards step aside, so the
  // matches sit right under the field instead of a phone's height below it. ≥lg nothing moves.
  const aside = searching ? "max-lg:hidden" : undefined;

  return (
    <div className="datum2-page relative isolate min-h-screen overflow-x-clip bg-background text-foreground">
      <SkipLink onSkip={skip} />
      <Header
        find={
          <Find
            inputRef={findRef}
            query={query}
            onQuery={setQuery}
            onCommit={commit}
            onNext={next}
            className="order-last basis-full lg:order-none lg:mx-auto lg:max-w-xl lg:flex-1 lg:basis-auto"
          />
        }
      />
      <main>
        <Title className={aside} />
        {/* Below lg the eight teams stay near the top as eight categories: a jump strip right
            under the title. ≥lg the directory's stations are all in view, so it is not drawn. */}
        <div className={cn(FRAME, "-mt-1 mb-5 lg:hidden", aside)}>
          <JumpBar onJump={jump} />
        </div>
        <div className={cn(FRAME, "pb-20 lg:pb-24", searching && "max-lg:pt-5")}>
          <Readouts className={aside} />
          <Yours memory={memory} className={cn("mt-6", aside)} />
          <div className={cn("mt-8", searching && "max-lg:mt-0")}>
            <Directory
              query={query}
              matches={matches}
              memory={memory}
              selected={selected}
              onClear={clear}
            />
          </div>
        </div>
      </main>
      <Footer onTop={toTop} />
    </div>
  );
}
