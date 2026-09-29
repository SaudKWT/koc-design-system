/**
 * Direction D — "Datum".
 *
 * One field of stipple specks, drawn from code, that the page walks through as you scroll. At the
 * top it is a landscape the camera flies over, with rigs and their directional wells; the eight
 * teams stand as survey stations on one ruled baseline — the datum every depth is measured from —
 * at the foot of the hero. Scrolling into the group's readouts, the ground gathers into a land
 * rig and then a cut-away of the reservoir with its horizontal well, drawn beside the figures
 * (never under them). At the directory the field comes to rest on a calm surface: links first.
 * The page signs off with a wellhead and tree — drilling at the top, workover at the foot.
 *
 * ── MOTION INVENTORY ─────────────────────────────────────────────────────────────────────────
 *  Particle field (JS, rAF, WebGL2) . one fixed canvas of 160k / 90k / 50k stipple specks (tier
 *                                     by viewport area, then by timing the first ~45 frames;
 *                                     software GL pinned at 50k). Reduced motion (OS or viewer
 *                                     flag, live): no flight, swarm, sway or spin — each state is
 *                                     one composed still and the state switches without a tween:
 *                                     rig ↔ block at the midpoint between them; the rig and the
 *                                     wellhead only once their own section holds the viewport, so
 *                                     no still model ever sits beside the stations or the
 *                                     directory. The loop stops in a hidden tab, while the
 *                                     directory is in view (ink 0), and under reduced motion.
 *  · Terrain flyover ................ endless, ~1.1 world units/s, drawn at 30 fps (60 while the
 *                                     pointer or a station is interacting). Only while the field
 *                                     is settled on the terrain; frozen otherwise.
 *  · Scroll morph ................... terrain → rig → earth block → (directory: fades to nothing)
 *                                     → wellhead. Follows scroll (eased, τ 0.14 s) and stops when
 *                                     scrolling stops; curl-noise swarm peaks mid-transition
 *                                     (sin πt) with a per-particle stagger. 60 fps while moving.
 *  · Model idle ..................... the rig, block and wellhead sway ±6–8° over ~40 s, drawn at
 *                                     30 fps. Reduced: still.
 *  Pointer swell + parallax (JS) .... eased, τ 0.18–0.9 s, over the terrain only. Reduced: none.
 *  Station survey (JS) .............. hovering/focusing a team station lifts a swell on the
 *                                     ground above it and gently brightens every rig; τ 0.45 s.
 *                                     Reduced motion: rigs brighten in one frame, no swell.
 *  Rig hover label (CSS) ............ opacity, transition-opacity duration-slower ease-out.
 *  Figure plates (CSS) ............. each model's caption plate is sticky at the foot of the
 *                                     stage (layout, moving only with the scroll). The rig's and
 *                                     the block's share one slot and swap at the morph's midpoint
 *                                     with transition-opacity duration-slow ease-out. Reduced: the
 *                                     base layer makes the swap instant.
 *  Section rail (CSS) ............... the current section's tick grows and turns primary:
 *                                     transition-transform / transition-colors duration-slow
 *                                     ease-out. Reduced: the base layer makes it instant.
 *  Hero entrance — Blur Fade (CSS) .. eyebrow, h1, lede, stations: blur 6px→0 + 6px rise, 560ms
 *                                     each, staggered 0–520ms, once. Reduced: none.
 *  Datum line draw (CSS) ............ scaleX 0→1, 900ms after 240ms, once. Reduced: none.
 *  Section reveals — Blur Fade (CSS)  readouts, team blocks; 560ms once when scrolled into view,
 *                                     staggered ≤180ms. Reduced: none, shown at once.
 *  KPI count-up (JS, useCountUp) .... 0 → value over 1100ms once in view; the animated figure is
 *                                     aria-hidden, the final value is in sr-only text.
 *                                     Reduced: final value immediately.
 *  Station hover (CSS) .............. stake colour (transition-colors duration-fast ease-out),
 *                                     datum segment scaleX (transition-transform duration-slow
 *                                     ease-out), arrow opacity (duration-fast).
 *  Link rows (CSS) .................. background/colour (duration-fast ease-out), arrow nudge 2px
 *                                     (transition duration-fast ease-out).
 *  Team block selected (CSS) ........ rule + code colour, transition-colors duration-slow.
 *  Station / rail → section (JS) .... smooth scrollIntoView; `auto` under reduced motion.
 *  Static, never moving: the dotted headline and sign-off (a CSS mask), the "Scroll" cue.
 * Nothing loops except the terrain flight and a settled model's slow sway, and no number moves
 * once it has settled.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight, Minus } from "lucide-react";

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
  SENTIMENT_TEXT,
  Sparkline,
  deltaSpeech,
  formatDelta,
  kpiSentiment,
  useCountUp,
  useInView,
  useReducedMotion,
} from "../shared";
import { BlurFade } from "./BlurFade";
import { MODEL_INFO, ParticleField, type FieldKey, type ParticleFieldHandle } from "./ParticleField";
import { useFieldScroll } from "./useFieldScroll";
import "./datum.css";

const pad2 = (n: number) => String(n).padStart(2, "0");
const plural = (n: number, one: string, many: string) => `${pad2(n)} ${n === 1 ? one : many}`;
const teamId = (t: Team) => `team-${t.code.toLowerCase()}`;
const UNIT_SPEECH: Record<string, string> = { "%": "percent", d: "days", h: "hours" };
const PLATFORMS = Object.keys(PLATFORM_LABEL) as Platform[];

/** The page gutter and measure, shared by every band so the columns line up down the page. */
const FRAME = "mx-auto w-full max-w-[90rem] px-5 sm:px-8 lg:px-12 xl:px-16";
/**
 * A solid surface over the field. 98%, not 100%: a fully opaque layer over the WebGL canvas makes
 * Chromium's software compositor (SwiftShader — what Edge and Chrome fall back to on a VM or a
 * remote desktop without a GPU) cull a vertically MIRRORED rectangle of the canvas, which then
 * shows as a blank band at the other edge of the screen. Found on this page's datum band and the
 * directory; at 98% the layer is never treated as an occluder, and the 2% is invisible (the field
 * has no ink while the directory holds the viewport anyway).
 */
const SURFACE = "bg-background/98";
/** ≥lg, the readouts and the sign-off share one two-column grid: copy left, the stage right. */
const STAGE_GRID = "lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]";

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Jump to an in-page section: smooth unless reduced, then hand focus to its heading. */
function useGoTo() {
  const reduced = useReducedMotion();
  return useCallback(
    (targetId: string, focusId: string) => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      document.getElementById(focusId)?.focus({ preventScroll: true });
    },
    [reduced],
  );
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

// ── Header ─────────────────────────────────────────────────────────────────────────────────
function Header() {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className={cn(FRAME, "flex items-center justify-between gap-6 py-5")}>
        <div data-terrain-quiet="56" className="flex items-center gap-3">
          <LogoTile className="size-10" />
          <p className="leading-tight">
            <span className="block font-mono text-sm font-semibold tracking-[0.08em] text-foreground">{GROUP.abbr}</span>
            <span className="block text-xs text-muted-foreground">{GROUP.name}</span>
          </p>
        </div>
        <p data-terrain-quiet="56" className="hidden text-right leading-tight sm:block">
          <span className="block text-sm font-medium text-foreground">
            {greeting()}, {VIEWER.firstName}
          </span>
          <span className="block font-mono text-2xs uppercase tracking-[0.12em] text-muted-foreground">
            {GROUP.company}
          </span>
        </p>
      </div>
    </header>
  );
}

// ── Section rail: the reference's right-edge scroll rail, as real labelled links ────────────
const SECTIONS = [
  { id: "datum-top", focus: "datum-teams", label: "Teams" },
  { id: "datum-readouts", focus: "datum-perf", label: "Readouts" },
  { id: "datum-directory", focus: "datum-dash", label: "Directory" },
] as const;

/**
 * Fixed to the right edge, inside the page gutter (so it never overlaps content), from sm up.
 * Below sm the gutter is 20px — narrower than a 24px target — so the rail is not drawn; the
 * stations at the top and "Back to teams" at the foot do its job on a phone. The rail sits on
 * its own solid capsule because the field runs under it and its labels are small.
 */
function SectionRail() {
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  const goTo = useGoTo();
  useEffect(() => {
    // The section under the middle of the viewport is the current one. No scroll handler.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  return (
    <nav
      aria-label="Sections"
      className="fixed right-1 top-1/2 z-30 -translate-y-1/2 max-sm:hidden lg:right-3 xl:right-5"
    >
      <ol className={cn(SURFACE, "flex flex-col items-center rounded-full border border-border/70 py-1.5")}>
        {SECTIONS.map((s) => {
          const current = active === s.id;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={current ? "location" : undefined}
                onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                  // The app routes on the hash: jump by script, never by changing the hash.
                  e.preventDefault();
                  goTo(s.id, s.focus);
                }}
                className="group flex w-6 flex-col items-center gap-2 rounded-full py-2 font-mono text-2xs uppercase tracking-[0.16em] text-muted-foreground transition-colors duration-fast ease-out hover:text-foreground aria-[current=location]:text-foreground"
              >
                <span
                  aria-hidden="true"
                  className="h-7 w-px origin-top scale-y-50 bg-muted-foreground/60 transition duration-slow ease-out group-hover:scale-y-75 group-aria-[current=location]:scale-y-100 group-aria-[current=location]:bg-primary"
                />
                <span className="rotate-180 [writing-mode:vertical-rl]">{s.label}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ── Field legend: the drawing explained, like the key on a survey sheet ────────────────────
/** Decorative (the field is), so aria-hidden; it also says plainly that no rig here is real. */
function FieldLegend() {
  const item = "flex items-center gap-1.5";
  return (
    <BlurFade delay={420} className="max-lg:hidden">
      <div
        aria-hidden="true"
        data-terrain-quiet="48"
        className="mt-0.5 font-mono text-2xs uppercase tracking-[0.12em] text-muted-foreground"
      >
        <p className="text-right">Field key · illustrative</p>
        <div className="mt-2.5 flex items-center justify-end gap-4 text-primary">
          <span className={item}>
            <svg viewBox="0 0 12 14" className="h-3.5 w-3" fill="none" stroke="currentColor" strokeWidth="1">
              <path
                vectorEffect="non-scaling-stroke"
                d="M2.5 13.5 5.3 1h1.4l2.8 12.5M.5 13.5h11M3.4 9.4h5.2M4.3 5.3h3.4M3.4 9.4l4.3-4.1M8.6 9.4 4.3 5.3"
              />
            </svg>
            <span className="text-muted-foreground">Rig</span>
          </span>
          <span className={item}>
            <svg viewBox="0 0 16 4" className="h-1 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 2h14" strokeDasharray="0.1 2.6" />
            </svg>
            <span className="text-muted-foreground">Drilled</span>
          </span>
          <span className={item}>
            <svg viewBox="0 0 16 4" className="h-1 w-4 opacity-50" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 2h14" strokeDasharray="0.1 4" />
            </svg>
            <span className="text-muted-foreground">Planned</span>
          </span>
          <span className={item}>
            <span className="size-1.5 rounded-full bg-primary" />
            <span className="text-muted-foreground">Bit</span>
          </span>
        </div>
        <p className="mt-2.5 text-right normal-case tracking-normal">Sample wells, not live rig positions</p>
      </div>
    </BlurFade>
  );
}

// ── Hero: the field, the headline, and the eight stations on the datum ─────────────────────
function Hero({
  onJump,
  onSurvey,
}: {
  onJump: (t: Team) => void;
  /** 0–1 across the field: the station being hovered or focused; null when none. */
  onSurvey: (x: number | null) => void;
}) {
  const heroRef = useRef<HTMLElement>(null);

  const survey = useCallback(
    (e: PointerEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>) => {
      const hero = heroRef.current?.getBoundingClientRect();
      if (!hero) return;
      const b = e.currentTarget.getBoundingClientRect();
      onSurvey((b.left + b.width / 2 - hero.left) / hero.width);
    },
    [onSurvey],
  );
  const unsurvey = useCallback(() => onSurvey(null), [onSurvey]);

  return (
    <section
      ref={heroRef}
      id="datum-top"
      data-field-key="0"
      aria-labelledby="datum-title"
      className="relative flex min-h-svh flex-col"
    >
      {/* The field region: from the top of the page down to the datum. */}
      <div className="relative flex flex-1 flex-col">
        <div className={cn(FRAME, "flex items-start justify-between gap-10 pt-24 sm:pt-32 lg:pt-28 xl:pt-36")}>
          {/* w-fit: the quiet zone hugs the copy instead of the whole measure. */}
          <div data-terrain-quiet="96" className="w-fit max-w-full">
            <BlurFade>
              <p className="font-mono text-2xs uppercase tracking-[0.16em] text-muted-foreground sm:text-xs">
                <span className="max-sm:hidden">
                  {GROUP.company} <span aria-hidden="true">·</span>{" "}
                </span>
                {GROUP.directorate}
              </p>
            </BlurFade>
            <BlurFade delay={90}>
              {/* Display size beyond the text-5xl step: text-[clamp()] is allowed for the hero.
                  datum-dotted is a halftone mask over real, selectable text (datum.css). */}
              <h1
                id="datum-title"
                className="datum-dotted mt-5 text-[clamp(2.75rem,6vw,5.75rem)] font-semibold leading-[1] tracking-[-0.04em] text-foreground"
              >
                Drilling &amp; Workover <br className="max-sm:hidden" />
                Engineering
              </h1>
            </BlurFade>
            <BlurFade delay={180}>
              <p className="mt-6 max-w-[40rem] text-base leading-relaxed text-muted-foreground sm:text-lg">
                Every engineering dashboard in the group, from one page — {DASHBOARD_COUNT} across {TEAMS.length}{" "}
                teams. Choose a team to go straight to its links.
              </p>
            </BlurFade>
          </div>
          <FieldLegend />
        </div>

        {/* The window onto the field. */}
        <div aria-hidden="true" className="min-h-16 flex-1 sm:min-h-28 xl:min-h-40" />
      </div>

      {/* The datum band. The field fades out above it (the quiet zone's feather), and the band
          itself is a solid surface, so nothing in the field — a settled model under reduced
          motion, or the swarm mid-morph — can ever sit under a team name. SOLID, not opaque:
          see SURFACE. */}
      <div className={cn("relative", SURFACE)}>
        <nav aria-labelledby="datum-teams" data-terrain-quiet="72" className={cn(FRAME, "pb-12 sm:pb-20")}>
          <BlurFade delay={300}>
            <div className="mb-4 flex items-baseline justify-between gap-4 font-mono text-2xs uppercase tracking-[0.14em] text-muted-foreground">
              <h2 id="datum-teams" tabIndex={-1} className="font-medium">
                <span className="text-primary">01</span> — Teams
              </h2>
              <p className="tabular-nums">
                {TEAMS.length} teams · {DASHBOARD_COUNT} dashboards
              </p>
            </div>
          </BlurFade>
          <div className="relative">
            <span aria-hidden="true" className="datum-draw absolute inset-x-0 top-0 h-px bg-foreground/70" />
            <ol className="datum-ruler grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8">
              {TEAMS.map((t, i) => (
                <li
                  key={t.code}
                  className={cn("border-border", i >= 2 && "max-sm:border-t", i >= 4 && "sm:max-xl:border-t")}
                >
                  <BlurFade delay={340 + i * 30} className="h-full">
                    <button
                      type="button"
                      onClick={() => onJump(t)}
                      onPointerEnter={survey}
                      onPointerLeave={unsurvey}
                      onFocus={survey}
                      onBlur={unsurvey}
                      className="group relative flex h-full min-h-16 w-full flex-col items-start gap-0.5 py-2.5 pl-3 pr-2 text-left transition-colors duration-fast ease-out hover:bg-primary/5 sm:min-h-20 sm:gap-1 sm:py-4"
                    >
                      {/* The station's stake, and its segment of the datum. */}
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-0 h-full w-px bg-border transition-colors duration-fast ease-out group-hover:bg-primary group-focus-visible:bg-primary"
                      />
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 -top-px h-0.5 origin-left scale-x-0 bg-primary transition-transform duration-slow ease-out group-hover:scale-x-100 group-focus-visible:scale-x-100"
                      />
                      <ArrowDown
                        aria-hidden="true"
                        className="absolute right-2 top-3 size-3.5 text-primary opacity-0 transition-opacity duration-fast ease-out group-hover:opacity-100 group-focus-visible:opacity-100 sm:top-4.5"
                      />
                      <span className="font-mono text-xs font-medium text-primary">
                        {t.code}
                        {t.abbr && <span className="text-muted-foreground"> · {t.abbr}</span>}
                      </span>
                      <span className="text-sm font-medium leading-snug text-foreground">{t.shortName}</span>
                      <span
                        aria-hidden="true"
                        className="mt-auto pt-1 font-mono text-2xs tabular-nums text-muted-foreground max-sm:hidden"
                      >
                        {plural(t.links.length, "dashboard", "dashboards")}
                      </span>
                      <span className="sr-only">
                        {`, ${t.links.length} ${t.links.length === 1 ? "dashboard" : "dashboards"} — go to them`}
                      </span>
                    </button>
                  </BlurFade>
                </li>
              ))}
            </ol>
          </div>
        </nav>
        {/* A static cue, nothing more: the reference's "Scroll down", without the custom cursor. */}
        <div
          aria-hidden="true"
          className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 font-mono text-2xs uppercase tracking-[0.2em] text-muted-foreground max-sm:hidden"
        >
          <span>Scroll</span>
          <span className="h-5 w-px bg-muted-foreground/60" />
        </div>
      </div>
    </section>
  );
}

// ── Section heading, shared by the bands below the hero ────────────────────────────────────
function SectionHead({
  index,
  eyebrow,
  id,
  title,
  stack = false,
  children,
}: {
  index: string;
  eyebrow: string;
  id: string;
  title: string;
  /** Meta under the title rather than beside it (a narrow column). */
  stack?: boolean;
  children?: ReactNode;
}) {
  return (
    <BlurFade inView className={cn("grid gap-6", !stack && "lg:grid-cols-[1fr_auto] lg:items-end", stack && "gap-5")}>
      <div>
        <p className="font-mono text-2xs uppercase tracking-[0.14em] text-muted-foreground">
          <span className="text-primary">{index}</span> — {eyebrow}
        </p>
        <h2 id={id} tabIndex={-1} className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h2>
      </div>
      {children}
    </BlurFade>
  );
}

// ── Figure plates: the title block of each drawing the field makes ─────────────────────────
type PlateModel = "rig" | "earth" | "wellhead";
const PLATE_ORDER: readonly PlateModel[] = ["rig", "earth", "wellhead"];

/**
 * A drawing's title block: figure number, what it is, its real proportions. Solid, so the field
 * never runs under its text. Decorative, like the canvas it captions.
 */
function Plate({ model, className }: { model: PlateModel; className?: string }) {
  const info = MODEL_INFO[model];
  return (
    <div
      aria-hidden="true"
      className={cn(
        "w-full max-w-sm rounded-sm border border-border border-l-2 border-l-primary px-4 py-3",
        SURFACE,
        className,
      )}
    >
      <div className="flex items-center justify-between gap-4 border-b border-dotted border-muted-foreground/40 pb-2 font-mono text-2xs uppercase tracking-[0.14em] text-muted-foreground">
        <span>
          <span className="text-primary">Fig. {pad2(PLATE_ORDER.indexOf(model) + 1)}</span> / {pad2(PLATE_ORDER.length)}
        </span>
        <span>Illustrative · NTS</span>
      </div>
      <p className="mt-2 text-sm font-medium text-foreground">{info.label}</p>
      <p className="mt-0.5 font-mono text-2xs leading-relaxed text-muted-foreground">{info.caption}</p>
    </div>
  );
}

// ── Readouts: the eight group figures as instruments ───────────────────────────────────────
function Trend({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const last = values[values.length - 1];
  // Mirrors Sparkline's own mapping (viewBox 100×28, 2px inset) so the end mark sits on the line.
  const y = (28 - ((last - min) / span) * 24 - 2) / 28;
  return (
    <div aria-hidden="true" className="w-[46%] max-w-44">
      <div className="relative h-9">
        <Sparkline values={values} className="h-9 text-primary" />
        <span
          className="absolute right-0 size-1.5 -translate-y-1/2 translate-x-1/2 rounded-full bg-primary ring-2 ring-background"
          style={{ top: `${y * 100}%` }}
        />
      </div>
      {/* One graduation per period; every third is a quarter mark. */}
      <div className="mt-1.5 flex items-start justify-between">
        {values.map((_, i) => (
          <span key={i} className={cn("w-px bg-muted-foreground/45", i % 3 === 0 ? "h-1.5" : "h-1")} />
        ))}
      </div>
    </div>
  );
}

function Readout({ k, i, start }: { k: Kpi; i: number; start: boolean }) {
  const v = useCountUp(k.value, start, 1100);
  const sentiment = kpiSentiment(k.delta, k.intent);
  const delta = formatDelta(k);
  const Arrow = !k.delta ? Minus : k.delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <li className="datum-cell relative border-b border-r border-dotted border-muted-foreground/45">
      <BlurFade inView delay={(i % 4) * 60} className="flex h-full flex-col p-5 sm:p-6">
        <div className="flex items-center justify-between font-mono text-2xs uppercase tracking-[0.12em] text-muted-foreground">
          <span>{k.tag}</span>
          <span className="tabular-nums" aria-hidden="true">
            {pad2(i + 1)}/{pad2(KPIS.length)}
          </span>
        </div>
        <h3 className="mt-3 text-sm font-medium text-foreground">{k.label}</h3>
        <div className="mt-5 flex items-end justify-between gap-5">
          <p className="shrink-0 leading-none text-foreground">
            <span aria-hidden="true" className="text-4xl font-semibold tracking-tight tabular-nums xl:text-5xl">
              {formatKpi(k, v)}
            </span>
            {k.unit && (
              <span aria-hidden="true" className="ml-1 text-base font-medium text-muted-foreground">
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
        <p className={cn("mt-5 flex flex-wrap items-center gap-x-1.5 text-xs", SENTIMENT_TEXT[sentiment])}>
          {delta ? (
            <>
              <Arrow aria-hidden="true" className="size-3.5 shrink-0" />
              <span aria-hidden="true" className="font-mono font-medium tabular-nums">
                {delta}
              </span>
              <span aria-hidden="true" className="text-muted-foreground">
                {k.deltaLabel}
              </span>
              <span className="sr-only">{deltaSpeech(k)}</span>
            </>
          ) : (
            <span className="text-muted-foreground">No comparison period</span>
          )}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{k.description}</p>
      </BlurFade>
    </li>
  );
}

/**
 * Below lg: a transparent window onto the fixed field, where a model forms between blocks.
 * Decorative. `k` is its key in the field's sequence. The plate is sticky at 68% of the viewport
 * — just under STAGE_SM's frame — so it holds still under the model for as long as the model
 * holds, then leaves with the band.
 */
function StageBand({ k, model, className }: { k: number; model: PlateModel; className?: string }) {
  return (
    <div aria-hidden="true" data-field-key={k} className={cn("h-[80svh]", className)}>
      <div className={cn(FRAME, "sticky top-[68svh] flex justify-end")}>
        <Plate model={model} />
      </div>
    </div>
  );
}

/**
 * ≥lg: the stage column. Its two halves are the field's anchors: the rig holds for the first half
 * of the section, the earth block for the second. One plate slot is sticky to the foot of the
 * viewport for the whole section; which plate shows follows the field's own progress, swapping
 * (a short cross-fade) at the morph's midpoint, while the specks are in the air.
 */
function Stage({ plate }: { plate: PlateModel }) {
  return (
    <div aria-hidden="true" className="relative flex flex-col items-end justify-end max-lg:hidden">
      <div data-field-key="1" className="absolute inset-x-0 top-0 h-1/2" />
      <div data-field-key="2" className="absolute inset-x-0 bottom-0 h-1/2" />
      <div className="sticky bottom-10 grid w-full max-w-sm">
        {(["rig", "earth"] as const).map((m) => (
          <Plate
            key={m}
            model={m}
            className={cn(
              "self-end transition-opacity duration-slow ease-out [grid-area:1/1]",
              plate === m ? "opacity-100" : "opacity-0",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function Readouts({ plate }: { plate: PlateModel }) {
  const [ref, inView] = useInView<HTMLOListElement>();
  return (
    <section id="datum-readouts" aria-labelledby="datum-perf" className="relative border-t border-border">
      <StageBand k={1} model="rig" className="lg:hidden" />
      <div className={cn(FRAME, "grid", STAGE_GRID)}>
        {/* The figures' column is a quiet zone: the field is suppressed under it, so the swarm can
            cross without ever sitting under a figure. */}
        <div data-terrain-quiet="80" className="py-16 lg:py-28 lg:pr-12">
          <SectionHead index="02" eyebrow="Readouts" id="datum-perf" title="Group performance" stack>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <span>D&amp;W group only, not company-wide</span>
              <span className="font-mono tabular-nums">As of {DATA_AS_OF}</span>
              <Badge variant="outline" className="font-mono uppercase tracking-[0.08em]">
                Sample data
              </Badge>
            </div>
          </SectionHead>
          <ol ref={ref} className="mt-10 grid border-l border-t border-dotted border-muted-foreground/45 sm:grid-cols-2">
            {KPIS.map((k, i) => (
              <Readout key={k.id} k={k} i={i} start={inView} />
            ))}
          </ol>
        </div>
        <Stage plate={plate} />
      </div>
      <StageBand k={2} model="earth" className="lg:hidden" />
    </section>
  );
}

// ── Directory: all 28 dashboards, by team ───────────────────────────────────────────────────
/** The hover surface bleeds into the gutter only ≥lg: below that the gutter is the rail's. */
function LinkRow({ link }: { link: DashboardLink }) {
  const Icon = PLATFORM_ICON[link.platform];
  return (
    <DashboardAnchor
      link={link}
      className="group/link flex min-h-11 items-center gap-3 rounded-sm px-2 py-2.5 text-sm lg:-mx-2 text-foreground transition-colors duration-fast ease-out hover:bg-primary/5 hover:text-primary"
    >
      <Icon
        aria-hidden="true"
        className="size-4 shrink-0 self-start text-muted-foreground transition-colors duration-fast ease-out group-hover/link:text-primary max-xl:mt-0.5 xl:mt-px"
      />
      {/* One line with a dotted leader where the column is wide; at four columns the platform
          drops under the name so the name never has to wrap around it. */}
      <span className="flex min-w-0 flex-1 items-baseline gap-3 xl:flex-col xl:items-start xl:gap-0.5">
        <span className="min-w-0 font-medium leading-snug">{link.label}</span>
        <span
          aria-hidden="true"
          className="min-w-3 flex-1 self-end border-b border-dotted border-muted-foreground/40 max-xl:mb-1 xl:hidden"
        />
        <span aria-hidden="true" className="shrink-0 font-mono text-2xs uppercase tracking-[0.08em] text-muted-foreground">
          {PLATFORM_LABEL[link.platform]}
        </span>
      </span>
      <ArrowUpRight
        aria-hidden="true"
        className="size-3.5 shrink-0 text-muted-foreground transition duration-fast ease-out group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5 group-hover/link:text-primary"
      />
    </DashboardAnchor>
  );
}

function TeamBlock({ t, i, selected }: { t: Team; i: number; selected: boolean }) {
  return (
    <BlurFade inView delay={(i % 4) * 60} id={teamId(t)} className="scroll-mt-10">
      <div data-selected={selected} className="group/team">
        <div className="flex items-center justify-between gap-3 border-t-2 border-foreground pt-3 transition-colors duration-slow ease-out group-data-[selected=true]/team:border-primary">
          <span className="font-mono text-xs font-medium">
            <span className="-ml-1.5 rounded-sm px-1.5 py-0.5 text-primary transition-colors duration-slow ease-out group-data-[selected=true]/team:bg-primary group-data-[selected=true]/team:text-primary-foreground">
              {t.code}
            </span>
            {t.abbr && <span className="text-muted-foreground"> · {t.abbr}</span>}
          </span>
          <span className="font-mono text-2xs tabular-nums text-muted-foreground">
            {plural(t.links.length, "dashboard", "dashboards")}
          </span>
        </div>
        <h3 id={`${teamId(t)}-title`} tabIndex={-1} className="mt-4 text-lg font-semibold tracking-tight text-foreground">
          {t.shortName}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{t.name}</p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t.blurb}</p>
        <ul className="mt-5 border-t border-dotted border-muted-foreground/40">
          {t.links.map((l) => (
            <li key={l.id} className="border-b border-dotted border-muted-foreground/40">
              <LinkRow link={l} />
            </li>
          ))}
        </ul>
      </div>
    </BlurFade>
  );
}

/** A solid, calm surface: the field comes to rest under it (ink 0 — the loop stops). */
function Directory({ selected }: { selected: string | null }) {
  return (
    <section
      id="datum-directory"
      aria-labelledby="datum-dash"
      data-field-key="3"
      className={cn("relative border-t border-border", SURFACE)}
    >
      <div className={cn(FRAME, "py-20 lg:py-24")}>
        <SectionHead index="03" eyebrow="Directory" id="datum-dash" title="Dashboards">
          <div className="flex flex-col gap-2 text-xs text-muted-foreground lg:items-end">
            <ul aria-label="Platforms" className="flex flex-wrap gap-x-4 gap-y-1">
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
            <p>{DASHBOARD_COUNT} dashboards · each opens in a new tab</p>
          </div>
        </SectionHead>
        <div className="mt-12 grid gap-x-10 gap-y-14 md:grid-cols-2 xl:grid-cols-4">
          {TEAMS.map((t, i) => (
            <TeamBlock key={t.code} t={t} i={i} selected={selected === t.code} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Footer: the sign-off. The field re-forms as a wellhead and tree beside it. ─────────────
function Footer() {
  const goTo = useGoTo();
  return (
    <footer data-field-key="4" className="relative flex min-h-svh flex-col border-t border-border">
      <div className={cn(FRAME, "grid flex-1", STAGE_GRID)}>
        {/* Below lg the model stands in the upper part of the footer; the copy sits under it. */}
        <div
          data-terrain-quiet="64"
          className="flex flex-col justify-end gap-8 pb-24 pt-6 max-lg:order-2 lg:gap-10 lg:py-24"
        >
          {/* The group's mark in the headline's dotted type. Decorative: the name is below. */}
          <p
            aria-hidden="true"
            className="datum-dotted text-[clamp(4.5rem,13vw,10.5rem)] font-semibold leading-[0.85] tracking-[-0.05em] text-foreground"
          >
            {GROUP.abbr}
          </p>
          <div className="flex items-start gap-3">
            <LogoTile className="size-8" />
            <div className="leading-snug">
              <p className="text-sm font-medium text-foreground">{GROUP.name}</p>
              <p className="text-xs text-muted-foreground">
                {GROUP.directorate} · {GROUP.company}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-4 border-t border-dotted border-muted-foreground/40 pt-4 text-xs leading-relaxed text-muted-foreground sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p>Sample data. Every figure, dashboard name and address on this page is a placeholder.</p>
              <p className="mt-1 font-mono tabular-nums">Data as of {DATA_AS_OF}</p>
            </div>
            <a
              href="#datum-top"
              onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                e.preventDefault(); // the app routes on the hash
                goTo("datum-top", "datum-teams");
              }}
              className="-mx-1 inline-flex min-h-6 shrink-0 items-center gap-1.5 self-start rounded-sm px-1 font-mono uppercase tracking-[0.12em] text-foreground transition-colors duration-fast ease-out hover:text-primary"
            >
              <ArrowUp aria-hidden="true" className="size-3.5" />
              Back to teams
            </a>
          </div>
        </div>
        <div aria-hidden="true" className="flex min-h-[46svh] items-end justify-end pb-2 max-lg:order-1 lg:pb-10">
          <Plate model="wellhead" />
        </div>
      </div>
    </footer>
  );
}

// ── The field's sequence: one key per scroll anchor ([data-field-key]). ────────────────────
/** Where models are framed, as fractions of the viewport: [left, top, right, bottom]. Each keeps
 *  clear of its plate (≥lg bottom-right; below lg under the model) and of the copy column. */
const STAGE_LG = [0.575, 0.2, 0.95, 0.84] as const;
const STAGE_SM = [0.06, 0.1, 0.94, 0.64] as const;
const SIGN_OFF_LG = [0.575, 0.08, 0.95, 0.82] as const;
const SIGN_OFF_SM = [0.08, 0.035, 0.92, 0.315] as const;

/** Reduced motion: the terrain → rig (0 → 1) and directory → wellhead (3 → 4) steps land at the
 *  end of their scroll windows rather than the middle. See the relay in DirectionD. */
function arriveLate(p: number) {
  for (const from of [0, 3]) if (p > from && p < from + 1) return p >= from + 0.99 ? from + 1 : from;
  return p;
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

function useFieldSequence(): FieldKey[] {
  const lg = useMedia("(min-width: 1024px)");
  return useMemo(() => {
    const stage = lg ? STAGE_LG : STAGE_SM;
    return [
      { model: "terrain" },
      { model: "rig", frame: stage },
      { model: "earth", frame: stage },
      { model: "earth", frame: stage, ink: 0 }, // the directory: links first, the field rests
      { model: "wellhead", frame: lg ? SIGN_OFF_LG : SIGN_OFF_SM },
    ];
  }, [lg]);
}

export default function DirectionD() {
  const rootRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<ParticleFieldHandle>(null);
  const reduced = useReducedMotion();
  const [selected, setSelected] = useState<string | null>(null);
  const [focusX, setFocusX] = useState<number | null>(null);
  const sequence = useFieldSequence();
  // Scroll drives the field through a relay that also tells the stage which plate to show: the
  // rig's until the rig → earth morph is half done (key 1.5), then the earth block's.
  //
  // Reduced motion: the field snaps to the nearer key, i.e. at the middle of each morph window.
  // Between two models on the same stage that is right. But the rig would then appear while the
  // stations are still on screen, and the wellhead while the directory still covers most of it;
  // so those two arrive only once their own section holds the viewport (the window's end).
  const [plate, setPlate] = useState<PlateModel>("rig");
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const lastP = useRef(0);
  const relay = useMemo(() => {
    const handle: ParticleFieldHandle = {
      setProgress(p) {
        lastP.current = p;
        fieldRef.current?.setProgress(reducedRef.current ? arriveLate(p) : p);
        setPlate(p < 1.5 ? "rig" : "earth");
      },
    };
    return { current: handle };
  }, []);
  useFieldScroll(relay, rootRef);
  // The flag can flip live (the viewer's toggle): re-send where the reader is. Runs after the
  // field's own effect has switched its mode; skipped on mount, where the scroll hook sends it.
  const wasReduced = useRef(reduced);
  useEffect(() => {
    if (wasReduced.current === reduced) return;
    wasReduced.current = reduced;
    fieldRef.current?.setProgress(reduced ? arriveLate(lastP.current) : lastP.current);
  }, [reduced]);

  const jump = useCallback(
    (t: Team) => {
      setSelected(t.code);
      document.getElementById(teamId(t))?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      document.getElementById(`${teamId(t)}-title`)?.focus({ preventScroll: true });
    },
    [reduced],
  );

  return (
    <div ref={rootRef} className="datum-page relative isolate min-h-screen overflow-x-clip bg-background text-foreground">
      <ParticleField ref={fieldRef} className="fixed inset-0 -z-10" sequence={sequence} quietRef={rootRef} focus={focusX} />
      <Header />
      <SectionRail />
      <main>
        <Hero onJump={jump} onSurvey={setFocusX} />
        <Readouts plate={plate} />
        <Directory selected={selected} />
      </main>
      <Footer />
    </div>
  );
}
