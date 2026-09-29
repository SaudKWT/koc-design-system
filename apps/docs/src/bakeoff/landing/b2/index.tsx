/**
 * Direction B v2 — "Wireline", the daily-use round.
 *
 * Find, don't browse — now for the hundredth visit rather than the first. The page is one
 * ruled sheet, read top to bottom in the order a morning uses it:
 *   1. the finding line: one giant ruled input in light Inter, Ctrl K from anywhere;
 *   2. the group figures: the v1 ledger laid on its side, eight compact cells in one strip;
 *   3. your dashboards: Pinned and Recent, two ruled rows — or, while you type, the matches;
 *   4. the index: all eight teams as a vertical ruled list, every one of the 28 links
 *      directly visible beside its team, filtered in place as you type;
 *   5. the footer: the full five-track well log, recorded once when it comes into view.
 * Nothing sits between the reader and a link: v1's hero team list and ledger became the
 * sticky code bar and the strip, and the log strip that closed v1's fold moved to the foot
 * of the page, where it no longer pushes the index down.
 *
 * Blue is the finding layer and nothing else: the <mark> highlight, the count and code of a
 * team with matches, the jump-bar indicator, the landed-section rule, the focused input rule,
 * the two marker tops on the log, and focus rings.
 *
 * ── MOTION INVENTORY ───────────────────────────────────────────────────────────────────────
 *  1. Recorder wipe (CSS keyframes, wireline.css, AMBIENT) — the footer log's tracks and
 *     marker tops are revealed left → right the first time the log is 40% in view
 *     (IntersectionObserver, once per page load): clip-path inset(0 100% 0 0) → the base
 *     (fully drawn), 780ms ease-out after a 120ms beat (done by 900ms). Never loops. A 1px
 *     --primary recording head rides the leading edge and is hidden when the wipe ends. It
 *     runs only in the footer, over no link, figure or field. Reduced (OS query AND
 *     html[data-force-reduced-motion]): never armed, animation none, head display:none —
 *     the log is simply there.
 *  2. Jump-bar indicator (CSS transition) — a 2px --primary underline glides to the team in
 *     view (scroll-spy), the focused code and the hovered code: transform at duration-slow
 *     ease-out (B glides; it never springs). Its first placement is instant. Reduced: jumps.
 *  3. <mark> highlight (CSS keyframe) — its background fades in at duration-fast ease-out
 *     when a match appears. Reduced: none; the mark is simply there.
 *  4. Row hover / focus (CSS transition) — bg-accent, transition-colors duration-fast
 *     ease-out; pins, ↗ glyphs and the copy-link reveal (opacity) at the same timing.
 *     Reduced: instant under BOTH switches — the OS query through the base layer, which
 *     zeroes transition durations, and the viewer's html[data-force-reduced-motion] through
 *     wireline.css, which mirrors that rule for .wl2-root.
 *  5. Field rule, facets, jump-bar codes, text buttons (CSS transition) — colour,
 *     transition-colors duration-fast ease-out. Reduced: instant, as 4.
 *  6. Team jump (JS) — scrollIntoView smooth under no-preference, instant under reduced
 *     motion. Same for Enter → first match, "more in the index" and Back to search.
 *  Nothing else moves. No entrance, no count-up, no loop, no reveal, no draw-on, no spring.
 *  Figures never move. Matches, pins and recents swap in and out instantly; facet counts,
 *  team counts and the "n of 28" readout change instantly; no content waits on motion.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ComponentProps,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, Check, Link2, Pin, Search, X } from "lucide-react";

import { cn } from "@koc/ui";

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
  deltaSpeech,
  formatDelta,
  kpiSentiment,
  matchDashboards,
  useDashboardMemory,
  useFindShortcut,
  useReducedMotion,
  type RememberedLink,
} from "../shared";
import { LANE_H, LOG_W, SCALES, buildLog } from "./log";
import "./wireline.css";

/* ── Page constants ─────────────────────────────────────────────────────────────────────── */

/** Paper: card-white in light, the page background in dark. Scrims use the same pair. */
const GROUND = "bg-card dark:bg-background";
/** One content width for every band, so the field, the strip, the rows and the footer share edges. */
const WRAP = "mx-auto w-full max-w-[1536px] px-4 sm:px-6 lg:px-8 xl:px-12";
/** The ledger every band below the figures shares — your dashboards, the matches and each
    team: a label column, then the rows. One grid, so the whole sheet reads as one index. */
const LEDGER = "grid gap-x-6 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)]";
/** The rows beside a label: three to a line from 1280, two from 640, one on a phone. */
const CELLS = "grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3";

const PLATFORMS = Object.keys(PLATFORM_LABEL) as Platform[];
type Facet = "all" | Platform;

const sectionId = (code: string) => `team-${code.toLowerCase()}`;
/** Everything above the index: while it is in the spy band, the reader is above the index. */
const HERO_ID = "wl2-hero";
const INDEX_TITLE_ID = "wl2-index";
const PINNED_TITLE_ID = "wl2-pinned";
const MATCHES_TITLE_ID = "wl2-matches";
/** How many matches the band lists before deferring to the index: two lines of three. */
const HERO_MATCHES = 6;
const dashboards = (n: number) => `${n} ${n === 1 ? "dashboard" : "dashboards"}`;

/** Spoken units, so a screen reader never says "eighteen point four d". */
const UNIT_SPEECH: Record<string, string> = { d: "days", h: "hours", "%": "percent" };

/**
 * A URL fragment on this page. In the evaluation viewer the page itself lives at a hash route
 * (`#/landing/b2`), so a place on it rides on that route as `#/landing/b2/team-en11`, which
 * the viewer still routes here. On a real deployment it is plain `#team-en11`.
 */
function pageHash(place: string): string {
  const route = typeof window === "undefined" ? null : window.location.hash.match(/^#\/landing\/[a-z0-9]+/);
  return route ? `${route[0]}/${place}` : `#${place}`;
}

/**
 * The field's placeholder, longest first. It shows the longest form that fits the field at
 * its current size. That is measured, not guessed from a breakpoint: the display size scales
 * with the viewport, so a breakpoint that fits at one width clips mid-word at the next.
 */
const PLACEHOLDERS = [
  `Search ${DASHBOARD_COUNT} dashboards by name, team or platform`,
  `Search ${DASHBOARD_COUNT} dashboards by name or team`,
  `Search ${DASHBOARD_COUNT} dashboards`,
  "Search",
] as const;
/** Room left over after the text, so a hinted glyph or a rounding pixel never clips it. */
const FIT_SLACK = 8;

function useFittingPlaceholder(ref: RefObject<HTMLInputElement | null>, forms: readonly string[]) {
  const [text, setText] = useState<string>(forms[forms.length - 2] ?? forms[0]);
  // Layout effect: the first fit lands before the first paint, so no clipped frame is seen.
  useLayoutEffect(() => {
    const el = ref.current;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!el || !ctx) return;
    let alive = true;
    const fit = () => {
      if (!alive) return;
      const cs = getComputedStyle(el);
      // The placeholder's weight is set in wireline.css as --wl2-ph-weight (it is not the
      // input's own 300), so the measurement reads the same variable the style does.
      const weight = cs.getPropertyValue("--wl2-ph-weight").trim() || cs.fontWeight;
      ctx.font = `${weight} ${cs.fontSize} ${cs.fontFamily}`;
      ctx.letterSpacing = cs.letterSpacing;
      const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - FIT_SLACK;
      setText(forms.find((f) => ctx.measureText(f).width <= room) ?? forms[forms.length - 1]);
    };
    fit();
    // Width (the viewport) and font size (the clamp, the short-screen rule) both change the
    // field's box, so one observer covers both. It runs after layout: no forced reflow.
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    // Inter may arrive after the first measurement; measure again with the real metrics.
    const fonts = document.fonts;
    void fonts?.ready.then(fit);
    fonts?.addEventListener("loadingdone", fit);
    return () => {
      alive = false;
      ro.disconnect();
      fonts?.removeEventListener("loadingdone", fit);
    };
  }, [ref, forms]);
  return text;
}

/* ── Filtering ──────────────────────────────────────────────────────────────────────────── */

interface TeamResult {
  team: Team;
  /** Links that pass both the query and the platform facet, in data order. */
  links: DashboardLink[];
  /** The query matched the team itself (code, name or abbreviation), so all its links show. */
  teamHit: boolean;
}

interface Hit {
  team: Team;
  link: DashboardLink;
}

const wordsOf = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);

/**
 * The shared `matchDashboards` decides WHAT matches (every word, across the link label, its
 * platform and its team), so this page finds exactly what every other direction finds. On top
 * of it, Wireline's own two things:
 *   - the platform facet, ANDed on (its counts are the query's matches per platform);
 *   - all eight teams are kept: a team with no match stays in the list, dimmed, because the
 *     eight categories are always all there.
 * `hits` is the same set flattened for the matches band: links whose own label holds every
 * word come first (you typed their name), then those with some, then those matched through
 * their team or platform, each group in data order. Nothing is special-cased, so this holds
 * at 200 links as at 28.
 */
function filterTeams(query: string, facet: Facet) {
  const words = wordsOf(query);
  const matched = new Map(matchDashboards(query).map((m) => [m.team.code, m]));
  const facetCounts: Record<Facet, number> = { all: 0, "power-bi": 0, sharepoint: 0, "web-app": 0 };
  const scored: (Hit & { score: number; order: number })[] = [];
  const results: TeamResult[] = TEAMS.map((team) => {
    const m = matched.get(team.code);
    const queryHits = m?.links ?? [];
    for (const l of queryHits) {
      facetCounts.all++;
      facetCounts[l.platform]++;
    }
    const links = queryHits.filter((l) => facet === "all" || l.platform === facet);
    for (const link of links) {
      const label = link.label.toLowerCase();
      const inLabel = words.filter((w) => label.includes(w)).length;
      const score = inLabel === words.length ? 2 : inLabel > 0 ? 1 : 0;
      scored.push({ team, link, score, order: scored.length });
    }
    return { team, links, teamHit: words.length > 0 && !!m?.teamMatched };
  });
  const hits = scored.sort((a, b) => b.score - a.score || a.order - b.order).map(({ team, link }) => ({ team, link }));
  return { results, facetCounts, visible: scored.length, hits, words };
}

/** Wraps every occurrence of every word in a <mark>. Words are already lower-cased. */
function Highlight({ text, words }: { text?: string; words: string[] }) {
  if (!text) return null;
  if (words.length === 0) return <>{text}</>;
  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];
  for (const w of words) {
    for (let at = lower.indexOf(w); at !== -1; at = lower.indexOf(w, at + w.length)) ranges.push([at, at + w.length]);
  }
  if (ranges.length === 0) return <>{text}</>;
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  const out: ReactNode[] = [];
  let from = 0;
  for (const [start, end] of merged) {
    if (start > from) out.push(text.slice(from, start));
    out.push(
      // /30, not the brief's /15: measured, /15 sits at CIEDE2000 ΔE 8.7 (light) and 8.4
      // (dark) from the paper — under the ~15 the repo uses for "reads as a different
      // colour". /30 is ΔE 16.2 / 15.9, with foreground on it still 11.05:1 / 9.42:1.
      <mark key={start} className="wl2-mark duration-fast rounded-sm bg-primary/30 text-foreground">
        {text.slice(start, end)}
      </mark>,
    );
    from = end;
  }
  if (from < text.length) out.push(text.slice(from));
  return <>{out}</>;
}

/** A key cap. @koc/ui has no Kbd, so this is the one place the page draws one (mono is
    reserved for codes and key caps). */
function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-sm border border-border px-1.5 font-mono text-2xs font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function LogoTile({ className }: { className?: string }) {
  return (
    // `wl2-logo` deepens the tile in dark mode (see wireline.css): the glyph is white-only.
    <span className={cn("wl2-logo grid size-8 shrink-0 place-items-center rounded-sm bg-primary", className)}>
      <img src="/koc-logo.svg" alt="" className="size-5" />
    </span>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────────────────────── */

export default function DirectionB2() {
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const scrollBehavior = (): ScrollBehavior => (reducedRef.current ? "auto" : "smooth");

  const [query, setQuery] = useState("");
  const [facet, setFacet] = useState<Facet>("all");
  const q = query.trim();
  const filtering = q !== "" || facet !== "all";
  const { results, facetCounts, visible, hits, words } = useMemo(() => filterTeams(q, facet), [q, facet]);

  const memory = useDashboardMemory();
  /* The memory hook reads storage in an effect, so for its first frame it reports nothing.
     Hold the band's contents for that frame (its rows keep their height), so a returning
     reader never sees "Pin a dashboard…" flash over the pins they have. */
  const [memoryReady, setMemoryReady] = useState(false);
  useEffect(() => setMemoryReady(true), []);

  const inputRef = useRef<HTMLInputElement>(null);
  const indexRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);

  /* Ctrl K / ⌘K focuses the field, on any keyboard layout. No single-letter shortcuts: they
     fight NVDA's quick-nav. */
  useFindShortcut(inputRef);

  /* Polite announcements: the match count (debounced, the visible readout's twin) and copy. */
  const [status, setStatus] = useState("");
  const [copyNote, setCopyNote] = useState("");
  const lastKey = useRef(`|all`);
  useEffect(() => {
    const key = `${q.toLowerCase()}|${facet}`;
    if (key === lastKey.current) return; // first mount (and StrictMode's re-mount) stay silent
    lastKey.current = key;
    const id = window.setTimeout(() => {
      setStatus(
        filtering
          ? `${visible} of ${DASHBOARD_COUNT} dashboards match`
          : `Filter cleared. All ${DASHBOARD_COUNT} dashboards shown`,
      );
    }, 500);
    return () => window.clearTimeout(id);
  }, [q, facet, visible, filtering]);

  const focusField = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "center", behavior: scrollBehavior() });
  }, []);

  /* ── Scroll-spy, and the jump that pins it ──────────────────────────────────────────────
     IntersectionObserver only, no scroll listener. A band just under the sticky bar decides
     the team in view:
       - the first team section in the band wins;
       - else, while the hero is in the band, the reader is above the index → NO team is in
         view: no indicator, no aria-current;
       - else (between sections) the last answer stands.
     A jump PINS the spy to its target, so a smooth scroll does not sweep the indicator
     through every team it passes — and at the foot of the index, where the last sections
     cannot reach the top, the team you asked for is still the one named. The pin holds
     until the reader acts (wheel, touch, key, pointer), or until the band changes AFTER
     the jump's own scroll has ended. Nothing is timed. */
  const [spy, setSpy] = useState<string | null>(null);
  /** The section a jump landed on. It carries a static --primary rule beside its heading
      until the reader moves to another team, because after a mouse click the programmatic
      focus on the heading shows no ring (:focus-visible does not match). */
  const [landed, setLanded] = useState<string | null>(null);
  const pinRef = useRef<string | null>(null);
  /** The pinned jump's scroll has ended; the band's next change is someone else's scroll. */
  const settledRef = useRef(false);
  /** Where the jump's scroll will stop, so a `scrollend` left over from an EARLIER scroll is
      not mistaken for the jump's own. */
  const targetYRef = useRef(0);

  const jumpTo = useCallback((code: string, behavior?: ScrollBehavior) => {
    const id = sectionId(code);
    const section = document.getElementById(id);
    if (!section) return;
    // Read once, on the click — never in a scroll handler.
    const margin = parseFloat(getComputedStyle(section).scrollMarginTop) || 0;
    const maxY = document.documentElement.scrollHeight - window.innerHeight;
    targetYRef.current = Math.min(maxY, Math.max(0, window.scrollY + section.getBoundingClientRect().top - margin));
    pinRef.current = code;
    settledRef.current = false;
    setSpy(code);
    setLanded(code);
    document.getElementById(`${id}-title`)?.focus({ preventScroll: true });
    section.scrollIntoView({ block: "start", behavior: behavior ?? scrollBehavior() });
  }, []);

  useEffect(() => {
    const inBand = new Set<string>();
    let heroInBand = true;
    const decide = () => {
      const first = TEAMS.find((t) => inBand.has(t.code))?.code;
      if (!first && !heroInBand) return;
      setSpy(first ?? null);
      // The landed rule stays while you read that section and goes once you move on.
      setLanded((l) => (first && l === first ? l : null));
    };
    const band = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const el = e.target as HTMLElement;
          if (el.id === HERO_ID) {
            heroInBand = e.isIntersecting;
            continue;
          }
          const code = el.dataset.wl2Code;
          if (!code) continue;
          if (e.isIntersecting) inBand.add(code);
          else inBand.delete(code);
        }
        const pinned = pinRef.current;
        if (pinned) {
          // Entries from the jump's own scroll: the pin already names the answer.
          if (!settledRef.current) return;
          pinRef.current = null;
          // A late batch can still describe the scroll's last frames. While the target is
          // in the band, the jump's answer stands; the band's next change decides.
          if (inBand.has(pinned)) return;
        }
        decide();
      },
      // Starts below where a jumped-to section lands (scroll-mt-12, 48px), so the section
      // above it is already out of the band when the scroll stops.
      { rootMargin: "-80px 0px -58% 0px" },
    );
    const hero = document.getElementById(HERO_ID);
    if (hero) band.observe(hero);
    for (const t of TEAMS) {
      const el = document.getElementById(sectionId(t.code));
      if (el) band.observe(el);
    }

    // The reader took over: from here the band decides, on its next change.
    const release = () => {
      pinRef.current = null;
    };
    // The jump's own scroll has ended (reading scrollY forces no layout). The pin stays, but
    // the band's NEXT change now releases it.
    const settle = () => {
      if (pinRef.current && Math.abs(window.scrollY - targetYRef.current) <= 2) settledRef.current = true;
    };
    const inputs = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    for (const t of inputs) window.addEventListener(t, release, { passive: true });
    window.addEventListener("scrollend", settle);
    return () => {
      band.disconnect();
      for (const t of inputs) window.removeEventListener(t, release);
      window.removeEventListener("scrollend", settle);
    };
  }, []);

  /* A copied link (…#/landing/b2/team-en11 here, #team-en11 in production) lands on its team. */
  useEffect(() => {
    const land = () => {
      const m = window.location.hash.match(/team-en\d+/i);
      if (m) jumpTo(m[0].slice(5).toUpperCase(), "auto");
    };
    // After the viewer's own scroll-to-top on mount.
    const raf = requestAnimationFrame(land);
    window.addEventListener("hashchange", land);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("hashchange", land);
    };
  }, [jumpTo]);

  /* Enter (or ↓) in the field: the first match, where you typed it (the matches band) — or,
     for a facet with an empty field, the first row of the index. Never opens a tab. */
  const focusFirstMatch = () => {
    const hero = bandRef.current?.querySelector<HTMLAnchorElement>("a[data-wl2-match]");
    const first = hero ?? indexRef.current?.querySelector<HTMLAnchorElement>("a[data-wl2-dash]");
    if (!first) return;
    first.focus({ preventScroll: true });
    first.scrollIntoView({ block: hero ? "nearest" : "center", behavior: scrollBehavior() });
  };

  const toIndex = () => {
    const title = document.getElementById(INDEX_TITLE_ID);
    if (!title) return;
    title.focus({ preventScroll: true });
    title.scrollIntoView({ block: "start", behavior: scrollBehavior() });
  };

  /* The skip link: past the field and the facets, to your dashboards (or the matches, while
     a query is typed), which the index follows. `nearest`: on a laptop screen the band is
     already in view, so focus moves and the page does not. */
  const skipToDashboards = (e: ReactMouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const title = document.getElementById(MATCHES_TITLE_ID) ?? document.getElementById(PINNED_TITLE_ID);
    if (!title) return;
    title.focus({ preventScroll: true });
    title.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
  };

  const clearAll = () => {
    setQuery("");
    setFacet("all");
    inputRef.current?.focus();
  };

  /* Emptied, then re-set a beat later, so a second copy of the same message is announced
     again. The beat is tracked, so an unmount (or StrictMode's rehearsal one) cancels it. */
  const copyTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);
  const announceCopy = (msg: string) => {
    setCopyNote("");
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopyNote(msg), 60);
  };

  const pins = { isPinned: memory.isPinned, onTogglePin: memory.togglePin };

  return (
    <div className={cn(GROUND, "wl2-root min-h-screen text-foreground")}>
      <Masthead onSkip={skipToDashboards} />

      <main>
        {/* A column, so that on a phone the matches can come up above the figures while a
            query is typed (the figures hold nothing focusable, so Tab order is unchanged). */}
        <div id={HERO_ID} className="flex flex-col">
          <FindingLine
            inputRef={inputRef}
            query={query}
            setQuery={setQuery}
            facet={facet}
            setFacet={setFacet}
            facetCounts={facetCounts}
            visible={visible}
            onSubmit={focusFirstMatch}
          />

          <Figures className={q ? "max-lg:order-last" : undefined} />

          {/* One band, two states. At rest: your pinned and recent dashboards. While a query
              is typed: the matches, where you typed — first in the DOM after the field and
              the figures, so Tab and a screen reader meet the answer next. */}
          <div ref={bandRef} className={cn(WRAP, "wl2-band mt-6")}>
            {q ? (
              <HeroMatches
                hits={hits}
                visible={visible}
                words={words}
                query={query}
                facet={facet}
                pins={pins}
                onClear={clearAll}
                onMore={toIndex}
              />
            ) : (
              <YourDashboards
                pinned={memory.pinned}
                recent={memory.recent}
                ready={memoryReady}
                pins={pins}
                onClearRecent={memory.clearRecent}
              />
            )}
          </div>
        </div>

        <Index
          indexRef={indexRef}
          results={results}
          words={words}
          query={query}
          facet={facet}
          filtering={filtering}
          visible={visible}
          spy={spy}
          landed={landed}
          pins={pins}
          onJump={jumpTo}
          onSearch={focusField}
          onClear={clearAll}
          onCopied={announceCopy}
        />

        <p role="status" className="sr-only">
          {status}
        </p>
        <p role="status" className="sr-only">
          {copyNote}
        </p>
      </main>

      <Footer />
    </div>
  );
}

/* ── Masthead ───────────────────────────────────────────────────────────────────────────── */

function Masthead({ onSkip }: { onSkip: (e: ReactMouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <header className="border-b border-border">
      {/* The first tab stop. Its href rides on the viewer's route (see pageHash), so even
          unhandled it would stay on this page; handled, it moves focus and nothing else. */}
      <a
        href={pageHash("dashboards")}
        onClick={onSkip}
        className="sr-only rounded-sm focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-30 focus:bg-primary focus:px-3 focus:py-1.5 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to dashboards
      </a>
      <div className={cn(WRAP, "flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:h-14 sm:flex-nowrap sm:py-0")}>
        <LogoTile />
        <span className="text-sm font-semibold tracking-tight">{GROUP.abbr}</span>
        <span aria-hidden="true" className="hidden h-4 w-px bg-border sm:block" />
        {/* The h1 is deliberately small, and sits in the bar: the field below is the page's
            display element, and every pixel above it is a pixel the index starts lower. */}
        <h1 className="order-last basis-full text-lg font-medium tracking-tight sm:order-none sm:basis-auto sm:truncate sm:text-md">
          {GROUP.name}
        </h1>
        <span className="hidden truncate text-sm text-muted-foreground xl:block">
          {GROUP.directorate} · {GROUP.company}
        </span>
        <p className="ml-auto shrink-0 text-sm text-muted-foreground">Good morning, {VIEWER.firstName}</p>
      </div>
    </header>
  );
}

/* ── The finding line: the hero's display element ───────────────────────────────────────── */

function FindingLine({
  inputRef,
  query,
  setQuery,
  facet,
  setFacet,
  facetCounts,
  visible,
  onSubmit,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  setQuery: (v: string) => void;
  facet: Facet;
  setFacet: (f: Facet) => void;
  facetCounts: Record<Facet, number>;
  visible: number;
  onSubmit: () => void;
}) {
  const placeholder = useFittingPlaceholder(inputRef, PLACEHOLDERS);
  const hasText = query.length > 0;

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && hasText) {
      e.preventDefault();
      setQuery("");
    } else if (e.key === "ArrowDown" && hasText) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className={cn(WRAP, "wl2-field-block pt-5 lg:pt-6")}>
      <form
        role="search"
        aria-label="Dashboards"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <label htmlFor="wl2-find" className="text-sm font-medium">
          Find a dashboard
        </label>
        {/* The rule is the only cue the control exists, so it is --input (3:1+), never
            --border. Focus: it turns --primary and thickens to 2px (a 1px shadow under the
            1px border, so nothing shifts). The input spans the whole ruled row — the glyph
            and the trailing control sit over its padding — so its own focus outline, which
            stays, wraps the entire field. */}
        <div
          className={cn(
            "relative mt-1 border-b border-input transition-colors duration-fast ease-out",
            "focus-within:border-primary focus-within:shadow-[0_1px_0_0_var(--primary)]",
          )}
        >
          <Search
            aria-hidden="true"
            strokeWidth={1.25}
            className="pointer-events-none absolute left-0 top-1/2 size-7 -translate-y-1/2 text-foreground sm:size-9"
          />
          <input
            ref={inputRef}
            id="wl2-find"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
            aria-describedby="wl2-find-hint"
            aria-keyshortcuts="Control+K Meta+K"
            // Display size beyond the scale (allowed in this bake-off): 2rem floor, 3rem
            // cap, 3.4vw between — the field is the hero, so it scales with the page (a
            // notch under v1's 3.25rem cap: the index below it starts that much higher).
            // Below 640 it sits at 1.75rem. The placeholder is whichever form fits (above).
            // (Size before leading: tailwind-merge drops a leading-* that precedes a text-*.)
            className={cn(
              "text-[1.75rem] sm:text-[clamp(2rem,3.4vw,3rem)]",
              "wl2-find block w-full rounded bg-transparent py-1.5 pl-10 pr-11 font-light leading-[1.12] tracking-[-0.025em] text-foreground sm:pl-14 sm:pr-24",
            )}
          />
          <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center">
            {hasText ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                className="inline-flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors duration-fast ease-out hover:bg-accent hover:text-foreground"
              >
                <X aria-hidden="true" className="size-5" />
                <span className="sr-only">Clear search</span>
              </button>
            ) : (
              <span aria-hidden="true" className="pointer-events-none hidden items-center gap-1 sm:flex">
                <Kbd>Ctrl</Kbd>
                <Kbd>K</Kbd>
              </span>
            )}
          </div>
        </div>
        <p id="wl2-find-hint" className="sr-only">
          Filters the page as you type: the best matches are listed after the group figures,
          and the full index below. Enter or Down arrow moves to the first match, Escape
          clears. Control K returns here from anywhere on the page.
        </p>
      </form>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-6 gap-y-1">
        <div role="group" aria-label="Platform" className="flex flex-wrap items-center gap-x-4 gap-y-0 sm:gap-x-5">
          {(["all", ...PLATFORMS] as Facet[]).map((f) => {
            const on = facet === f;
            const Icon = f === "all" ? null : PLATFORM_ICON[f];
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                onClick={() => setFacet(f)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 text-sm transition-colors duration-fast ease-out lg:h-7",
                  on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {/* The facets double as the platform legend: the index shows each link's
                    platform by this glyph. */}
                {Icon && <Icon aria-hidden="true" className="hidden size-3.5 sm:block" />}
                <span className={cn("decoration-[1.5px] underline-offset-[7px]", on && "underline")}>
                  {f === "all" ? "All" : PLATFORM_LABEL[f]} <span className="tabular-nums">{facetCounts[f]}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="ml-auto flex items-center gap-3 text-sm">
          {hasText && visible > 0 && (
            <span aria-hidden="true" className="hidden items-center gap-1.5 text-muted-foreground md:inline-flex">
              <Kbd>Enter</Kbd> first match
            </span>
          )}
          <span className="tabular-nums">
            {visible} <span className="text-muted-foreground">of {DASHBOARD_COUNT} dashboards</span>
          </span>
        </p>
      </div>
    </div>
  );
}

/* ── Group figures: the ledger, laid on its side ────────────────────────────────────────── */

/**
 * v1's self-explaining ledger, compacted to one strip of eight cells so every figure is in
 * the first screen at 1280×630. Each cell is Stats05's anatomy (label, value, change) in a
 * valid <dl>: one div per figure holding one dt and its dds. The one-line definitions v1
 * printed under each label are the cell's tooltip now (a daily reader knows what NPT is).
 * Cells share rows by subgrid, so a label that wraps never knocks a figure off its
 * neighbours' line. Static text on purpose — there is no KPI → dashboard mapping in the data
 * to link them with.
 */
function Figures({ className }: { className?: string }) {
  return (
    <section aria-labelledby="wl2-figures" className={cn(WRAP, "wl2-figures mt-7", className)}>
      <div className="flex min-h-7 flex-wrap items-baseline justify-between gap-x-4 pb-1">
        <h2 id="wl2-figures" className="text-sm font-medium">
          Group figures
        </h2>
        <p className="text-xs text-muted-foreground">Sample data · as of {DATA_AS_OF} · source: DDR</p>
      </div>
      <dl className="grid grid-cols-2 overflow-hidden border-y border-border sm:grid-cols-4 xl:grid-cols-8">
        {KPIS.map((k) => (
          <Figure key={k.id} k={k} />
        ))}
      </dl>
    </section>
  );
}

function Figure({ k }: { k: Kpi }) {
  const delta = formatDelta(k);
  const sentiment = kpiSentiment(k.delta, k.intent);
  return (
    <div
      data-kpi={k.id}
      title={k.description}
      className="wl2-kpi row-span-3 grid min-w-0 grid-rows-subgrid gap-y-1 border-l border-t border-border"
    >
      <dt className="text-xs font-medium leading-4">{k.label}</dt>
      <dd className="wl2-kpi-value self-end text-3xl font-light leading-none tracking-tight tabular-nums">
        {formatKpi(k, k.value)}
        {k.unit && (
          <>
            <span aria-hidden="true" className={cn("text-sm font-normal text-muted-foreground", k.unit !== "%" && "ml-0.5")}>
              {k.unit}
            </span>
            <span className="sr-only"> {UNIT_SPEECH[k.unit] ?? k.unit}</span>
          </>
        )}
      </dd>
      {/* The change belongs to the figure, so it is a second dd of the same dt. */}
      <dd className={cn("truncate text-2xs leading-3.5", SENTIMENT_TEXT[sentiment])}>
        {delta ? (
          <>
            <span aria-hidden="true">
              {delta} {k.deltaLabel}
            </span>
            <span className="sr-only">{deltaSpeech(k)}</span>
          </>
        ) : (
          <span className="text-muted-foreground">Year to date</span>
        )}
      </dd>
    </div>
  );
}

/* ── Rows: one dashboard, with its pin beside it ────────────────────────────────────────── */

interface Pins {
  isPinned: (id: string) => boolean;
  onTogglePin: (id: string) => void;
}

/**
 * The one row every list on the page draws: platform glyph, label, ↗, (team code), and the
 * pin — a sibling of the anchor, never inside it. The row takes the hover and focus-within
 * wash, so pointing at the pin still shows which dashboard it belongs to.
 */
function LinkRow({
  link,
  team,
  words,
  pins,
  hook,
}: {
  link: DashboardLink;
  /** Shown as a code when the row sits outside its team (pinned, recent, matches). */
  team?: Team;
  words: string[];
  pins: Pins;
  /** What Enter in the field looks for: the band's matches first, then the index. */
  hook?: "match" | "dash";
}) {
  const Icon = PLATFORM_ICON[link.platform];
  const pinned = pins.isPinned(link.id);
  return (
    <li className="group/row -mx-2 flex h-9 min-w-0 items-center rounded-sm pl-2 transition-colors duration-fast ease-out hover:bg-accent focus-within:bg-accent">
      <DashboardAnchor
        link={link}
        data-wl2-match={hook === "match" ? "" : undefined}
        data-wl2-dash={hook === "dash" ? "" : undefined}
        className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-sm text-base"
      >
        <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate">
          <Highlight text={link.label} words={words} />
        </span>
        <ArrowUpRight
          aria-hidden="true"
          className="-ml-1 size-3.5 shrink-0 text-muted-foreground transition-colors duration-fast ease-out group-hover/row:text-foreground"
        />
        {team && (
          <>
            <span aria-hidden="true" className="ml-auto shrink-0 pl-2 font-mono text-xs text-muted-foreground">
              <Highlight text={team.code} words={words} />
            </span>
            <span className="sr-only">{`, ${team.code} ${team.shortName}`}</span>
          </>
        )}
      </DashboardAnchor>
      <PinToggle
        link={link}
        pinned={pinned}
        onTogglePin={pins.onTogglePin}
        className={cn(
          "ml-1 size-8 rounded-sm transition-colors duration-fast ease-out hover:text-foreground [&_svg]:stroke-[1.75]",
          pinned ? "text-foreground" : "text-muted-foreground",
        )}
      />
    </li>
  );
}

/* ── Your dashboards: pinned and recent ─────────────────────────────────────────────────── */

function YourDashboards({
  pinned,
  recent,
  ready,
  pins,
  onClearRecent,
}: {
  pinned: RememberedLink[];
  recent: RememberedLink[];
  ready: boolean;
  pins: Pins;
  onClearRecent: () => void;
}) {
  const quiet = "flex min-h-9 items-center gap-1.5 text-sm text-muted-foreground";
  return (
    <div className="divide-y divide-border border-y border-border">
      <section aria-label="Pinned dashboards" className={cn(LEDGER, "py-1")}>
        <div className="flex h-9 items-center">
          <h2 id={PINNED_TITLE_ID} tabIndex={-1} className="rounded-sm text-sm font-medium">
            Pinned
            {ready && pinned.length > 0 && (
              <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">({pinned.length})</span>
            )}
          </h2>
        </div>
        {!ready ? (
          <div className="h-9" />
        ) : pinned.length > 0 ? (
          <ul className={CELLS}>
            {pinned.map(({ link, team }) => (
              <LinkRow key={link.id} link={link} team={team} words={[]} pins={pins} />
            ))}
          </ul>
        ) : (
          <p className={quiet}>
            Pin a dashboard with the
            <Pin aria-label="pin" role="img" className="size-3.5 text-foreground" strokeWidth={1.75} />
            icon to keep it here.
          </p>
        )}
      </section>
      <section aria-label="Recent dashboards" className={cn(LEDGER, "py-1")}>
        <div className="flex h-9 items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Recent</h2>
          {ready && recent.length > 0 && (
            <button
              type="button"
              onClick={onClearRecent}
              className="-mr-1 inline-flex h-7 items-center rounded-sm px-1 text-xs text-muted-foreground transition-colors duration-fast ease-out hover:bg-accent hover:text-foreground"
            >
              Clear<span className="sr-only"> recent dashboards</span>
            </button>
          )}
        </div>
        {!ready ? (
          <div className="h-9" />
        ) : recent.length > 0 ? (
          <ul className={CELLS}>
            {recent.map(({ link, team }) => (
              <LinkRow key={link.id} link={link} team={team} words={[]} pins={pins} />
            ))}
          </ul>
        ) : (
          <p className={quiet}>Dashboards you open from this page appear here.</p>
        )}
      </section>
    </div>
  );
}

/* ── Matches: the answer, where you typed ───────────────────────────────────────────────── */

function HeroMatches({
  hits,
  visible,
  words,
  query,
  facet,
  pins,
  onClear,
  onMore,
}: {
  hits: Hit[];
  visible: number;
  words: string[];
  query: string;
  facet: Facet;
  pins: Pins;
  onClear: () => void;
  onMore: () => void;
}) {
  const shown = hits.slice(0, HERO_MATCHES);
  const more = visible - shown.length;
  const scope = [`“${query.trim()}”`, facet !== "all" ? PLATFORM_LABEL[facet] : null].filter(Boolean).join(" in ");

  return (
    <section aria-labelledby={MATCHES_TITLE_ID} className={cn(LEDGER, "border-y border-border py-1")}>
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 lg:flex-col lg:items-start lg:justify-start">
        <h2 id={MATCHES_TITLE_ID} tabIndex={-1} className="flex h-9 items-center rounded-sm text-sm font-medium">
          Matches
          <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">({visible})</span>
        </h2>
        {more > 0 && (
          <button
            type="button"
            onClick={onMore}
            className="-ml-1 inline-flex h-7 items-center gap-1 rounded-sm px-1 text-xs text-muted-foreground transition-colors duration-fast ease-out hover:bg-accent hover:text-foreground"
          >
            <span className="tabular-nums">{more}</span> more in the index
            <ArrowDown aria-hidden="true" className="size-3.5" />
          </button>
        )}
      </div>
      {visible === 0 ? (
        <div className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-1 py-1">
          <p className="text-lg font-light">No dashboards match {scope}.</p>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-8 items-center rounded-sm px-1 text-sm font-medium underline decoration-1 underline-offset-4 transition-colors duration-fast ease-out hover:bg-accent"
          >
            Clear filter
          </button>
        </div>
      ) : (
        <ul className={CELLS}>
          {shown.map(({ team, link }) => (
            <LinkRow key={link.id} link={link} team={team} words={words} pins={pins} hook="match" />
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── The index: every dashboard, filtered in place ──────────────────────────────────────── */

function Index({
  indexRef,
  results,
  words,
  query,
  facet,
  filtering,
  visible,
  spy,
  landed,
  pins,
  onJump,
  onSearch,
  onClear,
  onCopied,
}: {
  indexRef: RefObject<HTMLDivElement | null>;
  results: TeamResult[];
  words: string[];
  query: string;
  facet: Facet;
  filtering: boolean;
  visible: number;
  spy: string | null;
  landed: string | null;
  pins: Pins;
  onJump: (code: string) => void;
  onSearch: () => void;
  onClear: () => void;
  onCopied: (msg: string) => void;
}) {
  const filterWords = [query.trim() ? `“${query.trim()}”` : null, facet !== "all" ? PLATFORM_LABEL[facet] : null].filter(
    Boolean,
  );
  const empty = filtering && visible === 0;

  return (
    <section aria-labelledby={INDEX_TITLE_ID} className="mt-8 lg:mt-9">
      <div className={cn(WRAP, "flex min-h-8 flex-wrap items-baseline justify-between gap-x-6 gap-y-1 pb-1.5")}>
        <h2 id={INDEX_TITLE_ID} tabIndex={-1} className="rounded-sm text-sm font-medium">
          All dashboards{" "}
          <span className="font-normal tabular-nums text-muted-foreground">
            ({filtering ? `${visible} of ${DASHBOARD_COUNT}` : DASHBOARD_COUNT})
          </span>
        </h2>
        {filtering && (
          <p className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>Filtered by {filterWords.join(" and ")}</span>
            <button
              type="button"
              onClick={onClear}
              className="inline-flex h-7 items-center rounded-sm px-1 text-foreground underline decoration-1 underline-offset-4 transition-colors duration-fast ease-out hover:bg-accent"
            >
              Clear filter
            </button>
          </p>
        )}
      </div>

      <JumpBar results={results} spy={spy} filtering={filtering} onJump={onJump} onSearch={onSearch} query={query} />

      <div ref={indexRef} className={WRAP}>
        {empty && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-6">
            <p className="text-xl font-light">No dashboards match {filterWords.join(" in ")}.</p>
            <button
              type="button"
              onClick={onClear}
              className="inline-flex h-8 items-center rounded-sm px-1 text-sm font-medium underline decoration-1 underline-offset-4 transition-colors duration-fast ease-out hover:bg-accent"
            >
              Clear filter
            </button>
          </div>
        )}
        {results.map((r, i) => (
          <TeamSection
            key={r.team.code}
            result={r}
            words={words}
            filtering={filtering}
            ruled={i > 0 || empty}
            landed={landed === r.team.code}
            pins={pins}
            onCopied={onCopied}
          />
        ))}
        <IndexEnd filtering={filtering} visible={visible} onSearch={onSearch} />
      </div>
    </section>
  );
}

/** Where the index stops: an ink rule (not a hairline — this one ends the sheet), what the
    index held, and the way back to the field. */
function IndexEnd({ filtering, visible, onSearch }: { filtering: boolean; visible: number; onSearch: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-foreground py-3 text-sm">
      <p className="text-muted-foreground">
        <span className="text-foreground">End of index</span>
        {" · "}
        <span className="tabular-nums">
          {filtering
            ? `${visible} of ${DASHBOARD_COUNT} dashboards shown`
            : `${dashboards(DASHBOARD_COUNT)} from ${TEAMS.length} teams`}
        </span>
      </p>
      <button
        type="button"
        onClick={onSearch}
        className="-mx-1 inline-flex h-8 items-center gap-1.5 rounded-sm px-1 text-muted-foreground transition-colors duration-fast ease-out hover:bg-accent hover:text-foreground"
      >
        <ArrowUp aria-hidden="true" className="size-4" />
        Back to search
      </button>
    </div>
  );
}

function JumpBar({
  results,
  spy,
  filtering,
  onJump,
  onSearch,
  query,
}: {
  results: TeamResult[];
  spy: string | null;
  filtering: boolean;
  onJump: (code: string) => void;
  onSearch: () => void;
  query: string;
}) {
  const reduced = useReducedMotion();
  const barRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const shown = hovered ?? focused ?? spy;
  const scope = query.trim();

  /* Animated Background, ported: one highlight element positioned from the target's box.
     Measured only when the target (or the layout) changes, in a rAF — never per frame. */
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  const [placed, setPlaced] = useState(false);
  const [layout, setLayout] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const ro = new ResizeObserver(() => setLayout((n) => n + 1));
    ro.observe(track);
    track.querySelectorAll("button").forEach((b) => ro.observe(b));
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      // Nothing in view (the reader is above the index): no indicator. When it returns it is
      // a fresh element, so it appears in place rather than gliding in from the last team.
      const el = shown && trackRef.current?.querySelector<HTMLElement>(`[data-wl2-code="${shown}"]`);
      setBox(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
    });
    return () => cancelAnimationFrame(raf);
  }, [shown, layout]);

  // The first placement is instant; only later moves glide.
  useEffect(() => {
    if (!box || placed) return;
    const raf = requestAnimationFrame(() => setPlaced(true));
    return () => cancelAnimationFrame(raf);
  }, [box, placed]);

  // On a bar too narrow for all eight codes, keep the team in view inside the bar.
  useEffect(() => {
    const bar = barRef.current;
    const el = spy && trackRef.current?.querySelector<HTMLElement>(`[data-wl2-code="${spy}"]`);
    if (!bar || !el || bar.scrollWidth <= bar.clientWidth) return;
    bar.scrollTo({ left: el.offsetLeft - (bar.clientWidth - el.offsetWidth) / 2, behavior: reduced ? "auto" : "smooth" });
  }, [spy, reduced]);

  return (
    <div className={cn(GROUND, "sticky top-0 z-20 border-y border-border")}>
      <div className={cn(WRAP, "flex h-12 items-stretch gap-3")}>
        <nav aria-label="Jump to team" ref={barRef} className="wl2-jumpbar -ml-2 min-w-0 flex-1 overflow-x-auto">
          {/* The indicator is the list's sibling, not its child (a <ul> holds only <li>s);
              this wrapper is what both are measured and positioned against. */}
          <div ref={trackRef} className="relative flex h-full w-max min-w-full">
            <ul
              className="flex h-full items-stretch"
              onPointerLeave={() => setHovered(null)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(null);
              }}
            >
              {results.map(({ team, links }) => {
                const none = filtering && links.length === 0;
                // Cerebrium's treatment at rest: the code in view is full-strength, the rest
                // tinted. While filtering, every team WITH matches takes the finding layer's
                // --primary, the empty ones stay tinted, and the underline still says which
                // one you are reading.
                const tone = filtering
                  ? none
                    ? "text-muted-foreground hover:text-foreground"
                    : "text-primary"
                  : team.code === shown
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground";
                return (
                  <li key={team.code} className="flex shrink-0 snap-start">
                    {/* Buttons, not hash links: the viewer is hash-routed, so a "#team-…"
                        href would navigate away. The copy-link control is the shareable URL. */}
                    <button
                      type="button"
                      data-wl2-code={team.code}
                      aria-current={team.code === spy ? "location" : undefined}
                      onClick={() => onJump(team.code)}
                      onPointerEnter={() => setHovered(team.code)}
                      onFocus={() => setFocused(team.code)}
                      className={cn(
                        "flex items-center gap-1.5 whitespace-nowrap px-2 text-xs transition-colors duration-fast ease-out",
                        tone,
                      )}
                    >
                      <span className="font-mono font-medium">{team.code}</span>
                      {/* Measured: the eight short names fit beside the search control from
                          1280. Below that the bar is codes only; the name stays in the
                          accessible name either way. */}
                      <span className="sr-only xl:not-sr-only xl:whitespace-nowrap">{team.abbr ?? team.shortName}</span>
                      {none && <span className="sr-only">, no matches</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            {box && (
              <span
                aria-hidden="true"
                className={cn(
                  "wl2-indicator pointer-events-none absolute bottom-0 left-0 h-0.5 w-px origin-left bg-primary",
                  placed && "transition-transform duration-slow ease-out",
                )}
                style={{ transform: `translateX(${box.x}px) scaleX(${box.w})` }}
              />
            )}
          </div>
        </nav>
        {/* Back to the field from anywhere in the index. While a filter is on, it shows the
            query, so the sticky bar says what the index below is scoped to. */}
        <button
          type="button"
          onClick={onSearch}
          aria-keyshortcuts="Control+K Meta+K"
          className="my-2 inline-flex shrink-0 items-center gap-2 rounded-sm px-2 text-sm text-muted-foreground transition-colors duration-fast ease-out hover:bg-accent hover:text-foreground"
        >
          <Search aria-hidden="true" className="size-4" />
          <span className="sr-only">Back to search{scope ? ", filtered by " : ""}</span>
          {scope ? (
            <span className="sr-only lg:not-sr-only lg:inline-block lg:max-w-24 lg:truncate lg:align-bottom xl:sr-only min-[1440px]:not-sr-only min-[1440px]:max-w-32">
              “{scope}”
            </span>
          ) : (
            <span aria-hidden="true" className="hidden lg:inline xl:hidden min-[1440px]:inline">
              Search
            </span>
          )}
          <Kbd className="hidden lg:inline-flex" aria-hidden>
            Ctrl K
          </Kbd>
        </button>
      </div>
    </div>
  );
}

function TeamSection({
  result: { team, links, teamHit },
  words,
  filtering,
  ruled,
  landed,
  pins,
  onCopied,
}: {
  result: TeamResult;
  words: string[];
  filtering: boolean;
  /** A top rule. Not on the first section, whose top edge is the sticky bar's own rule. */
  ruled: boolean;
  landed: boolean;
  pins: Pins;
  onCopied: (msg: string) => void;
}) {
  const id = sectionId(team.code);
  const total = team.links.length;
  const collapsed = filtering && links.length === 0;
  const found = filtering && !collapsed;
  // The team's own words are marked only when the query named the team; a word that merely
  // appears in a name ("support") is not the reason its rows are shown.
  const tw = teamHit ? words : [];
  // While filtering, the abbreviation gives way to the count — unless it is where the query
  // hit (hiding it would hide the one <mark> that says why the team is shown).
  const abbrHit = tw.some((w) => team.abbr?.toLowerCase().includes(w));

  return (
    <section
      id={id}
      data-wl2-code={team.code}
      aria-labelledby={`${id}-title`}
      className={cn(
        // scroll-mt-12: a jump lands the section's own top rule just under the 49px sticky
        // bar, so the bar's rule is the only one you see above the heading.
        LEDGER,
        "group/team scroll-mt-12 border-border",
        ruled && "border-t",
        collapsed ? "py-0.5" : "py-2",
      )}
    >
      <div className="relative flex h-9 items-center gap-2 self-start">
        {/* Where the jump landed: a static --primary rule beside the heading, in the finding
            layer's colour. Focus moved here too, but after a mouse click it shows no ring. */}
        {landed && (
          <span aria-hidden="true" data-wl2-landed="" className="absolute inset-y-2 -left-2 w-0.5 bg-primary" />
        )}
        {/* One line, v1's teams-list row: code, name, abbreviation … count. The abbreviation
            is the row's least important word, so it truncates before the name does. */}
        <h3
          id={`${id}-title`}
          tabIndex={-1}
          className={cn(
            "flex min-w-0 flex-1 items-baseline gap-2 rounded-sm text-base xl:text-md",
            collapsed && "text-muted-foreground",
          )}
        >
          <span className={cn("w-9 shrink-0 font-mono text-xs font-medium", !collapsed && "text-muted-foreground")}>
            <Highlight text={team.code} words={tw} />
          </span>
          {/* One truncating line, name then abbreviation, so an ellipsis always eats the
              abbreviation before it reaches the name. */}
          <span className="min-w-0 truncate">
            <span className="font-medium">
              <Highlight text={team.shortName} words={tw} />
            </span>
            {team.abbr && (!filtering || abbrHit) && (
              <span className="ml-2 text-sm text-muted-foreground">
                <Highlight text={team.abbr} words={tw} />
              </span>
            )}
          </span>
          <span className="sr-only">
            {filtering ? `, ${links.length} of ${dashboards(total)} match` : `, ${dashboards(total)}`}
          </span>
        </h3>
        {/* A team with no match says so in its rows ("No match"), so it drops its count and
            the name keeps the room. */}
        <span aria-hidden="true" className={cn("shrink-0 text-sm tabular-nums text-muted-foreground", collapsed && "hidden")}>
          {filtering ? (
            <>
              <span className={found ? "font-medium text-primary" : ""}>{links.length}</span> / {total}
            </>
          ) : (
            total
          )}
        </span>
        {!collapsed && <CopyLink team={team} onCopied={onCopied} />}
      </div>

      {collapsed ? (
        <p className="flex h-9 items-center text-sm text-muted-foreground">No match</p>
      ) : (
        <ul className={CELLS}>
          {links.map((l) => (
            <LinkRow key={l.id} link={l} words={words} pins={pins} hook="dash" />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Shopify Editions' section anchor: copy a link that lands on this team. On a wide screen it
    sits in the page margin beside the code, like a heading anchor, and shows on the team's
    hover and focus, so twenty-eight pins are the only glyphs at rest. On a phone it is simply
    there, at the end of the team's line. */
function CopyLink({ team, onCopied }: { team: Team; onCopied: (msg: string) => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    const url = `${window.location.href.split("#")[0]}${pageHash(sectionId(team.code))}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      onCopied(`Link copied`);
    } catch {
      onCopied(`Could not copy. The link is ${url}`);
    }
  };

  const Icon = copied ? Check : Link2;
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Copied" : "Copy link to this team"}
      className={cn(
        "-mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-[color,opacity] duration-fast ease-out hover:bg-accent hover:text-foreground",
        "lg:absolute lg:-left-8 lg:top-1.5 lg:mr-0 lg:size-6",
        !copied && "lg:opacity-0 lg:focus-visible:opacity-100 lg:group-hover/team:opacity-100 lg:group-focus-within/team:opacity-100",
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      <span className="sr-only">
        {copied ? "Copied link" : "Copy link"} to {team.code} {team.shortName}
      </span>
    </button>
  );
}

/* ── Footer: the full well log ──────────────────────────────────────────────────────────── */

function Footer() {
  return (
    <footer className="mt-12 border-t border-border lg:mt-14">
      <div className={cn(WRAP, "flex flex-col gap-6 pb-10 pt-8 sm:flex-row sm:items-start sm:justify-between")}>
        <div className="flex items-start gap-3">
          <LogoTile />
          <div className="text-sm">
            <p className="font-medium">{GROUP.name}</p>
            <p className="text-muted-foreground">
              {GROUP.directorate} · {GROUP.company}
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground sm:text-right">
          Figures as of {DATA_AS_OF} · Sample data
          <br />
          Dashboard names and links are placeholders
        </p>
      </div>

      <WellLog />

      <div className={cn(WRAP, "flex flex-col gap-x-8 gap-y-1 pb-24 pt-3 text-xs text-muted-foreground sm:flex-row sm:justify-between")}>
        <p>A sample log, generated from a seed: not a real well, and the tops are not real formations.</p>
        <p>GR gamma ray · CAL caliper · RES resistivity · N–D neutron–density · ROP rate of penetration</p>
      </div>
    </footer>
  );
}

/** A scale end as a log header prints it: 0.3, 10, 300 — no trailing zeros. */
const scaleNum = (v: number) => v.toLocaleString("en-GB", { maximumFractionDigits: 2 });
const LANES = (["gr", "cal", "res", "nd", "rop"] as const).map((id) => ({
  id,
  name: id === "nd" ? "N–D" : id.toUpperCase(),
  scale: `${scaleNum(SCALES[id].lo)}–${scaleNum(SCALES[id].hi)} ${SCALES[id].unit}`,
}));

type Recording = "idle" | "armed" | "on";

/**
 * The full log: five tracks laid on their side, depth running left → right the way a
 * horizontal well's log is shown along its lateral. v1's strip closed the first screen and
 * pushed everything below it down; here it has the footer to itself, at twice the height,
 * with the caliper and neutron–density tracks a composite log carries.
 *
 * Generated once from a seeded PRNG (log.ts) into static SVG paths: no rAF, no runtime
 * noise, no pointer tracking, identical on every reload. The only motion is the recorder
 * wipe, armed below the fold and run once when the log is 40% in view (see wireline.css).
 */
function WellLog() {
  const reduced = useReducedMotion();
  const log = useMemo(() => buildLog(), []);
  const ref = useRef<HTMLDivElement>(null);
  const [rec, setRec] = useState<Recording>("idle");
  /** Once recorded, never again this page load — not even when reduced motion is toggled. */
  const recordedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || recordedRef.current) return;
    // Already on screen when the page opens (a short window, a copied link to the foot):
    // it is simply drawn. The wipe is for arriving at the footer, not for loading it.
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) {
      recordedRef.current = true;
      return;
    }
    setRec("armed");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        recordedRef.current = true;
        setRec("on");
        io.disconnect();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  const svg = (children: ReactNode) => (
    <svg
      viewBox={`0 0 ${LOG_W} ${LANE_H}`}
      preserveAspectRatio="none"
      className="wl2-trace absolute inset-0 size-full overflow-visible"
      fill="none"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
  const lane = (id: string, children: ReactNode) => (
    <div key={id} className="wl2-lane relative">
      {children}
    </div>
  );
  const rule = (key: string) => <div key={key} className="h-px bg-border" />;
  const thin = { strokeWidth: 1, vectorEffect: "non-scaling-stroke" } as const;
  const main = { strokeWidth: 1.25, vectorEffect: "non-scaling-stroke" } as const;

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-wl2-log=""
      data-wl2-rec={rec === "idle" || reduced ? undefined : rec}
      className="relative overflow-hidden"
    >
      {/* The drawing: stretched edge to edge on a wide screen; on a phone, a centred 760px
          window onto the same log, so the curves keep their grain and both tops stay in. */}
      <div className="relative left-1/2 w-full min-w-[760px] -translate-x-1/2">
        {/* The annotation row: the marker tops are labelled above the tracks, as on a
            printed log, so no label ever sits on a curve. */}
        <div className="h-5" />
        {rule("r0")}
        {lane(
          "gr",
          svg(
            <>
              <path d={log.grFill} className="wl2-gr-fill" stroke="none" />
              <line x1={0} x2={LOG_W} y1={log.grBase} y2={log.grBase} className="wl2-gr-base" {...thin} />
              <path d={log.grLine} className="wl2-gr-line" {...main} />
            </>,
          ),
        )}
        {rule("r1")}
        {lane(
          "cal",
          svg(
            <>
              <path d={log.calFill} className="wl2-cal-fill" stroke="none" />
              <line x1={0} x2={LOG_W} y1={log.bitSize} y2={log.bitSize} className="wl2-bit" {...thin} />
              <path d={log.cal} className="wl2-cal" {...main} />
            </>,
          ),
        )}
        {rule("r2")}
        {lane(
          "res",
          svg(
            <>
              <path d={log.resShallow} className="wl2-res-shallow" {...thin} />
              <path d={log.resDeep} className="wl2-res-deep" {...main} />
            </>,
          ),
        )}
        {rule("r3")}
        {lane(
          "nd",
          svg(
            <>
              <path d={log.xover} className="wl2-xover" stroke="none" />
              <path d={log.nphi} className="wl2-nphi" {...thin} />
              <path d={log.rhob} className="wl2-rhob" {...main} />
            </>,
          ),
        )}
        {rule("r4")}
        {lane("rop", svg(<path d={log.rop} className="wl2-rop" {...main} />))}
        {rule("r5")}

        {/* Marker tops: the only blue in the log. In Wireline, blue means "found". Each top
            carries a 2px cap in the annotation row beside its label, so at 1× (a KOC laptop
            at 100%) the 1px line through the tracks still reads as blue, not black. */}
        <div className="wl2-trace absolute inset-0">
          {log.tops.map((t) => (
            <div
              key={t.label}
              className="wl2-top absolute bottom-0 top-1 w-px bg-primary"
              style={{ "--wl2-at": `${t.at * 100}%` } as CSSProperties}
            >
              <span className="absolute left-0 top-0 h-3.5 w-0.5 bg-primary" />
              <span className="absolute left-2 top-0 whitespace-nowrap text-2xs font-medium leading-3.5 text-primary">
                {t.label}
              </span>
            </div>
          ))}
        </div>

        {/* The recording head rides the wipe's leading edge, then disappears. */}
        <div className="wl2-head pointer-events-none absolute inset-0">
          <span className="absolute inset-y-0 left-0 w-px bg-primary" />
        </div>
      </div>

      {/* The track header, set at the deep end like a log's repeat header: each track's name
          and scale, right-aligned to the content edge behind a vertical track rule, on solid
          paper that runs on to the page edge, so the traces END here. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 top-5">
        <div className={cn(WRAP, "flex h-full justify-end")}>
          <div className="flex w-12 shrink-0 flex-col gap-px border-l border-border py-px sm:w-36">
            {LANES.map((l) => (
              <div
                key={l.id}
                className="wl2-lane wl2-track-head relative flex items-center justify-between gap-3 pl-2.5 text-2xs leading-none text-muted-foreground"
              >
                <span className="font-medium uppercase tracking-wide">{l.name}</span>
                <span className="hidden tabular-nums sm:inline">{l.scale}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
