/**
 * Direction B — "Wireline".
 *
 * Find, don't browse. The people who open this page every day already know which dashboard
 * they want, so the hero IS the search: one giant ruled input line in light Inter on white
 * paper. Beneath it sit two ruled lists: the eight teams (the hero's categories, each with a
 * live match count) and the eight group figures (a ledger that explains itself). While a
 * query is typed, the figures yield their place to the best matches, so the answer appears
 * where you typed. A wireline log strip, laid on its side, closes the fold. Below it, every
 * dashboard in one index that filters in place as you type.
 *
 * Blue is the finding layer and nothing else: the <mark> highlight, the tick and count on a
 * team with matches (and its code in the jump bar), the jump-bar indicator, the landed-section
 * rule, the focused input rule, the two marker tops on the log, and focus rings.
 *
 * ── MOTION INVENTORY ───────────────────────────────────────────────────────────────────────
 *  1. Recorder wipe (CSS keyframes, wireline.css, AMBIENT) — the log's tracks and marker
 *     tops are revealed left → right: clip-path inset(0 100% 0 0) → the base (fully drawn),
 *     780ms ease-out after a 120ms delay (done by 900ms), once, on load. Never loops.
 *     A 1px --primary recording head rides the leading edge (translateX, same timing) and is
 *     hidden when the wipe ends. Only `from` is keyframed, so if it never runs nothing is
 *     ever hidden. Reduced (OS query AND html[data-force-reduced-motion]): animation none,
 *     head display:none — the log is simply there.
 *  2. Jump-bar indicator (CSS transition) — a 2px --primary underline glides to the team in
 *     view (scroll-spy), the focused code and the hovered code: transform at duration-slow
 *     ease-out (B glides; it never springs). Its first placement is instant. Reduced: jumps.
 *  3. <mark> highlight (CSS keyframe) — its background fades in at duration-fast ease-out
 *     when a match appears. Reduced: none; the mark is simply there.
 *  4. Row hover / focus (CSS transition) — bg-accent, transition-colors duration-fast
 *     ease-out; the team row's ↓ affordance fades by opacity at the same timing. Reduced:
 *     instant under BOTH switches — the OS query through the base layer, which zeroes
 *     transition durations, and the viewer's html[data-force-reduced-motion] through
 *     wireline.css, which mirrors that rule for .wl-root (the base layer never sees it).
 *  5. Field rule, facets, jump-bar codes, text links (CSS transition) — colour,
 *     transition-colors duration-fast ease-out. Reduced: instant, as 4.
 *  6. Team jump (JS) — scrollIntoView smooth under no-preference, instant under reduced
 *     motion. Same for Enter → first match, "more in the index" and Ctrl K → field.
 *  Nothing else moves. No entrance, no count-up, no loop, no reveal, no draw-on, no spring.
 *  The hero's matches list (and its "Also in" neighbours) swaps in and out with the query
 *  instantly; the landed-section rule and the teams' match ticks appear and go without a
 *  transition; the placeholder's form changes with the field's width, instantly; facet
 *  counts, team counts and the "n of 28" readout change instantly, and no content waits on
 *  motion to appear.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type CSSProperties,
  type ComponentProps,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, Check, Link2, Search, X } from "lucide-react";

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
  SENTIMENT_TEXT,
  deltaSpeech,
  formatDelta,
  kpiSentiment,
  useReducedMotion,
} from "../shared";
import { LANE_H, LOG_W, SCALES, buildLog } from "./log";
import "./wireline.css";

/* ── Page constants ─────────────────────────────────────────────────────────────────────── */

/** Paper: card-white in light, the page background in dark. Scrims use the same pair. */
const GROUND = "bg-card dark:bg-background";
/** One content width for every band, so the ruled lists, the index and the footer share edges. */
const WRAP = "mx-auto w-full max-w-[1536px] px-4 sm:px-6 lg:px-8 xl:px-12";

const PLATFORMS = Object.keys(PLATFORM_LABEL) as Platform[];
type Facet = "all" | Platform;

const sectionId = (code: string) => `team-${code.toLowerCase()}`;
/** Everything above the index: while it is in the spy band, the reader is above the index. */
const HERO_ID = "wl-hero";
const INDEX_TITLE_ID = "wl-index";
/** How many matches the hero lists under the field before deferring to the index. Eight fit
    in the ledger's footprint, so the page below never moves while you type. */
const HERO_MATCHES = 8;
const dashboards = (n: number) => `${n} ${n === 1 ? "dashboard" : "dashboards"}`;

/** Spoken units, so a screen reader never says "eighteen point four d". */
const UNIT_SPEECH: Record<string, string> = { d: "days", h: "hours", "%": "percent" };

/**
 * The URL fragment for a team's section. In the evaluation viewer the page itself lives at a
 * hash route (`#/landing/b`), so the section rides on it as `#/landing/b/team-en11`, which the
 * viewer still routes to this page. On a real deployment it is plain `#team-en11`.
 */
function teamHash(code: string): string {
  const route = typeof window === "undefined" ? null : window.location.hash.match(/^#\/landing\/[a-z]+/);
  return route ? `${route[0]}/${sectionId(code)}` : `#${sectionId(code)}`;
}

/**
 * The field's placeholder, longest first. It shows the longest form that fits the field at
 * its current size. That is measured, not guessed from a breakpoint: the display size scales
 * with the viewport, so a breakpoint that fits at one width clips mid-word at the next (the
 * long form needs 640px of text at the clamp's 2rem floor, which a 640–879px window — a
 * Windows half-screen snap on a KOC laptop — does not have).
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
      // The placeholder's weight is set in wireline.css as --wl-ph-weight (it is not the
      // input's own 300), so the measurement reads the same variable the style does.
      const weight = cs.getPropertyValue("--wl-ph-weight").trim() || cs.fontWeight;
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
  /** The query matched the team itself (code, name, short name or abbreviation). */
  teamHit: boolean;
}

interface Hit {
  team: Team;
  link: DashboardLink;
}

/**
 * Case-insensitive substring over the link label, the platform label, and the team's code,
 * name, short name and abbreviation. A query that names a team shows all of that team's rows.
 * The facet is ANDed on top. Nothing is special-cased, so this holds at 200 links as at 28.
 *
 * `hits` is the same set flattened for the hero: links whose own label matched come first
 * (you typed their name), then those matched through their team or platform, each group in
 * data order.
 */
function filterTeams(q: string, facet: Facet) {
  const has = (s?: string) => !!s && s.toLowerCase().includes(q);
  const teamMatches = (t: Team) =>
    q === "" || has(t.code) || has(t.name) || has(t.shortName) || has(t.abbr);
  const linkMatches = (t: Team, l: DashboardLink) =>
    teamMatches(t) || has(l.label) || has(PLATFORM_LABEL[l.platform]);

  const facetCounts: Record<Facet, number> = { all: 0, "power-bi": 0, sharepoint: 0, "web-app": 0 };
  const labelHits: Hit[] = [];
  const otherHits: Hit[] = [];
  const results: TeamResult[] = TEAMS.map((team) => {
    const queryHits = team.links.filter((l) => linkMatches(team, l));
    for (const l of queryHits) {
      facetCounts.all++;
      facetCounts[l.platform]++;
    }
    const links = queryHits.filter((l) => facet === "all" || l.platform === facet);
    for (const link of links) (q && has(link.label) ? labelHits : otherHits).push({ team, link });
    return { team, links, teamHit: q !== "" && teamMatches(team) };
  });
  const visible = results.reduce((n, r) => n + r.links.length, 0);
  return { results, facetCounts, visible, hits: [...labelHits, ...otherHits] };
}

/** Wraps every occurrence of `q` in a <mark>. `q` is already trimmed and lower-cased. */
function Highlight({ text, q }: { text?: string; q: string }) {
  if (!text) return null;
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const out: ReactNode[] = [];
  let from = 0;
  for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, from)) {
    if (at > from) out.push(text.slice(from, at));
    out.push(
      // /30, not the brief's /15: measured, /15 sits at CIEDE2000 ΔE 8.7 (light) and 8.4
      // (dark) from the paper — under the ~15 the repo uses for "reads as a different
      // colour". /30 is ΔE 16.2 / 15.9, with foreground on it still 11.05:1 / 9.42:1.
      <mark key={at} className="wl-mark duration-fast rounded-sm bg-primary/30 text-foreground">
        {text.slice(at, at + q.length)}
      </mark>,
    );
    from = at + q.length;
  }
  if (from === 0) return <>{text}</>;
  out.push(text.slice(from));
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
    // `wl-logo` deepens the tile in dark mode (see wireline.css): the glyph is white-only.
    <span className={cn("wl-logo grid size-8 shrink-0 place-items-center rounded-sm bg-primary", className)}>
      <img src="/koc-logo.svg" alt="" className="size-5" />
    </span>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────────────────────── */

export default function DirectionB() {
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const scrollBehavior = (): ScrollBehavior => (reducedRef.current ? "auto" : "smooth");

  const [query, setQuery] = useState("");
  const [facet, setFacet] = useState<Facet>("all");
  const q = query.trim().toLowerCase();
  const filtering = q !== "" || facet !== "all";
  const { results, facetCounts, visible, hits } = useMemo(() => filterTeams(q, facet), [q, facet]);

  const inputRef = useRef<HTMLInputElement>(null);
  const indexRef = useRef<HTMLDivElement>(null);
  const matchesRef = useRef<HTMLElement>(null);

  /* Polite announcements: the match count (debounced, the visible readout's twin) and copy. */
  const [status, setStatus] = useState("");
  const [copyNote, setCopyNote] = useState("");
  const lastKey = useRef(`|all`);
  useEffect(() => {
    const key = `${q}|${facet}`;
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

  /* Ctrl K / ⌘K focuses the field. No single-letter shortcuts: they fight NVDA's quick-nav. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        focusField();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusField]);

  /* ── Scroll-spy, and the jump that pins it ──────────────────────────────────────────────
     IntersectionObserver only, no scroll listener. A band just under the sticky bar decides
     the team in view:
       - the first team section in the band wins;
       - else, while the hero is in the band, the reader is above the index → NO team is in
         view: no indicator, no aria-current (not "the first team" — under a filter that
         named a team with no matches);
       - else (between sections) the last answer stands.
     Every section can reach the band: the last one is at least a screen tall, less the
     footer (see Index), so no "at the bottom, pick the last team" guess is needed —
     that guess named the wrong team whenever a filter made the page short.
     A jump PINS the spy to its target, so a smooth scroll does not sweep the indicator
     through every team it passes. The pin holds until the reader acts (wheel, touch, key,
     pointer), or until the band changes AFTER the jump's own scroll has ended — which only
     a later scroll (a scrollbar drag, find-in-page, a script) can cause. Nothing is timed:
     observer entries may arrive before or after `scrollend`, and neither order matters. */
  const [spy, setSpy] = useState<string | null>(null);
  /** The section a jump landed on. It carries a static --primary rule beside its heading
      until the reader moves to another team, because after a mouse click the programmatic
      focus on the heading shows no ring (:focus-visible does not match). */
  const [landed, setLanded] = useState<string | null>(null);
  const pinRef = useRef<string | null>(null);
  /** The pinned jump's scroll has ended; the band's next change is someone else's scroll. */
  const settledRef = useRef(false);
  /** Where the jump's scroll will stop, so a `scrollend` left over from an EARLIER scroll (a
      wheel still coasting when the link was clicked) is not mistaken for the jump's own. */
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
          const code = el.dataset.code;
          if (!code) continue;
          if (e.isIntersecting) inBand.add(code);
          else inBand.delete(code);
        }
        const pinned = pinRef.current;
        if (pinned) {
          // Entries from the jump's own scroll: the pin already names the answer.
          if (!settledRef.current) return;
          pinRef.current = null;
          // A late batch can still describe the scroll's last frames, with the section
          // above the target not yet out of the band. While the target is in the band, the
          // jump's answer stands; the band's next change decides.
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
    // The jump's own scroll has ended (the page stopped where the jump was going; reading
    // scrollY forces no layout). The pin stays — with the last section tall enough to land,
    // the band agrees with it — but the band's NEXT change now releases it.
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

  /* A copied link (…#/landing/b/team-en11 here, #team-en11 in production) lands on its team. */
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

  const onTeamLink = useCallback(
    (e: ReactMouseEvent<HTMLAnchorElement>, code: string) => {
      // Let modified clicks open the section in a new tab the ordinary way.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      window.history.replaceState(window.history.state, "", teamHash(code));
      jumpTo(code);
    },
    [jumpTo],
  );

  /* Enter in the field: the first match, where you typed it (the hero's list) — or, for a
     facet with an empty field, the first row of the index. Never opens a tab. */
  const focusFirstMatch = () => {
    const hero = matchesRef.current?.querySelector<HTMLAnchorElement>("a[data-match]");
    const first = hero ?? indexRef.current?.querySelector<HTMLAnchorElement>("a[data-dash]");
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

  return (
    <div className={cn(GROUND, "wl-root min-h-screen text-foreground")}>
      <Masthead />

      <main>
        <div id={HERO_ID}>
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

          {/* One grid, three children. At rest: teams (cols 1–6) and figures (8–12). While a
              query is typed, the matches take the figures' cell — same row, same columns, so
              the teams list and the log below never move. They come first in the DOM, so a
              screen reader and the Tab key meet the answer straight after the field; on a
              phone they sit right under the field for the same reason. */}
          <div className={cn(WRAP, "wl-lists mt-6 grid grid-cols-1 gap-y-12 lg:mt-5 lg:grid-cols-12 lg:gap-x-6")}>
            {q && (
              <HeroMatches
                rootRef={matchesRef}
                hits={hits}
                visible={visible}
                q={q}
                query={query}
                facet={facet}
                onClear={clearAll}
                onMore={toIndex}
              />
            )}
            <TeamList results={results} q={q} filtering={filtering} onTeamLink={onTeamLink} />
            <Ledger yielded={!!q} />
          </div>

          <LogStrip />
        </div>

        <Index
          indexRef={indexRef}
          results={results}
          q={q}
          query={query}
          facet={facet}
          filtering={filtering}
          visible={visible}
          spy={spy}
          landed={landed}
          onTeamLink={onTeamLink}
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

function Masthead() {
  return (
    <header>
      <div className="border-b border-border">
        <div className={cn(WRAP, "flex h-14 items-center gap-3")}>
          <LogoTile />
          <span className="text-sm font-semibold tracking-tight">{GROUP.abbr}</span>
          <span aria-hidden="true" className="hidden h-4 w-px bg-border sm:block" />
          <span className="hidden truncate text-sm text-muted-foreground sm:block">
            {GROUP.directorate} · {GROUP.company}
          </span>
          <p className="ml-auto shrink-0 text-sm text-muted-foreground">
            Good morning, {VIEWER.firstName}
          </p>
        </div>
      </div>
      <div className={cn(WRAP, "wl-hero-title grid gap-y-1.5 pt-6 lg:grid-cols-12 lg:items-baseline lg:gap-x-6 lg:pt-4")}>
        {/* The h1 is deliberately small: the field below is the display element. */}
        <h1 className="text-2xl font-medium tracking-tight lg:col-span-6 xl:col-span-7">{GROUP.name}</h1>
        {/* Starts on the ledger's column, so the two right-hand blocks share an edge. */}
        <p className="text-sm text-muted-foreground lg:col-span-6 lg:col-start-7 xl:col-span-5 xl:col-start-8">
          {DASHBOARD_COUNT} engineering dashboards from {TEAMS.length} teams, in one index.
        </p>
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
    }
  };

  return (
    <div className={cn(WRAP, "mt-6 lg:mt-5")}>
      <form
        role="search"
        aria-label="Dashboards"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <label htmlFor="wl-find" className="text-sm font-medium">
          Find a dashboard
        </label>
        {/* The rule is the only cue the control exists, so it is --input (3:1+), never
            --border. Focus: it turns --primary and thickens to 2px (a 1px shadow under the
            1px border, so nothing shifts). The input spans the whole ruled row — the glyph
            and the trailing control sit over its padding — so its own focus outline, which
            stays, wraps the entire field rather than a box that starts after the glyph. */}
        <div
          className={cn(
            "relative mt-1 border-b border-input transition-colors duration-fast ease-out",
            "focus-within:border-primary focus-within:shadow-[0_1px_0_0_var(--primary)]",
          )}
        >
          <Search
            aria-hidden="true"
            strokeWidth={1.25}
            className="pointer-events-none absolute left-0 top-1/2 size-7 -translate-y-1/2 text-foreground sm:size-10"
          />
          <input
            ref={inputRef}
            id="wl-find"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
            aria-describedby="wl-find-hint"
            aria-keyshortcuts="Control+K Meta+K"
            // Display size beyond the scale (allowed in this bake-off): 2rem floor, 3.25rem
            // cap, 3.6vw between — the field is the hero, so it scales with the page.
            // Below 640 it sits at 1.75rem. The placeholder is whichever form fits (above).
            // (Size before leading: tailwind-merge drops a leading-* that precedes a text-*.)
            className={cn(
              "text-[1.75rem] sm:text-[clamp(2rem,3.6vw,3.25rem)]",
              "wl-find block w-full rounded bg-transparent py-1.5 pl-10 pr-11 font-light leading-[1.12] tracking-[-0.025em] text-foreground sm:pl-16 sm:pr-24",
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
        <p id="wl-find-hint" className="sr-only">
          Filters the page as you type: the best matches are listed straight after the search
          field, and the full index below. Enter moves to the first match, Escape clears.
          Control K returns here from anywhere on the page.
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
          <span data-readout="" className="tabular-nums">
            {visible} <span className="text-muted-foreground">of {DASHBOARD_COUNT} dashboards</span>
          </span>
        </p>
      </div>
    </div>
  );
}

/* ── Matches: the answer, where you typed ───────────────────────────────────────────────── */

/** The same cell as the ledger on a wide screen (it takes the figures' place while a query is
    typed); straight under the field on a phone. */
const RIGHT_CELL = "lg:col-span-6 lg:col-start-7 lg:row-start-1 xl:col-span-5 xl:col-start-8";

/* A short answer leaves most of the cell as blank paper, which reads as a half-built hero on
   the commonest query of all: one exact dashboard. So, while at most NEARBY_MAX match, the
   rest of each matched team's dashboards follow the answer, muted and headed "Also in …":
   found one, the ones it sits with are a glance away. They are not matches (no <mark>, not
   what Enter goes to, not in the filtered index), and they stay inside the ledger's
   footprint, so nothing below moves. Heights mirror the rows' classes (h-11 / h-9 plus a
   1px rule; the group heading's h-8 plus its mt-2). Whole groups only, in match order,
   until the next one would not fit. Wide screens only: on a phone the answer sits above
   the teams list, and anything more would push the eight categories down. */
const NEARBY_MAX = 3;
const MATCH_ROW_H = 45;
const NEAR_HEAD_H = 40;
const NEAR_ROW_H = 37;
const NEAR_BUDGET = HERO_MATCHES * MATCH_ROW_H;

function neighbours(hits: Hit[]): { team: Team; links: DashboardLink[] }[] {
  if (hits.length === 0 || hits.length > NEARBY_MAX) return [];
  const shown = new Set(hits.map((h) => h.link.id));
  let room = NEAR_BUDGET - hits.length * MATCH_ROW_H;
  const groups: { team: Team; links: DashboardLink[] }[] = [];
  for (const team of new Set(hits.map((h) => h.team))) {
    const links = team.links.filter((l) => !shown.has(l.id));
    if (links.length === 0) continue;
    const need = NEAR_HEAD_H + links.length * NEAR_ROW_H;
    if (need > room) break;
    groups.push({ team, links });
    room -= need;
  }
  return groups;
}

function HeroMatches({
  rootRef,
  hits,
  visible,
  q,
  query,
  facet,
  onClear,
  onMore,
}: {
  rootRef: RefObject<HTMLElement | null>;
  hits: Hit[];
  visible: number;
  q: string;
  query: string;
  facet: Facet;
  onClear: () => void;
  onMore: () => void;
}) {
  const shown = hits.slice(0, HERO_MATCHES);
  const more = visible - shown.length;
  const near = useMemo(() => neighbours(hits), [hits]);
  const scope = [`“${query.trim()}”`, facet !== "all" ? PLATFORM_LABEL[facet] : null]
    .filter(Boolean)
    .join(" in ");

  return (
    <section ref={rootRef} aria-labelledby="wl-matches" className={cn(RIGHT_CELL, "lg:self-start")}>
      <div className="flex h-8 items-baseline justify-between gap-x-4">
        <h2 id="wl-matches" className="text-sm font-medium">
          Matches <span className="font-normal tabular-nums text-muted-foreground">({visible})</span>
        </h2>
        {more > 0 && (
          <button
            type="button"
            onClick={onMore}
            // 24px target (16px line + py-1), with -my-1 so it never pushes the heading off
            // the Teams heading's baseline.
            className="-mr-1 -my-1 inline-flex items-center gap-1 rounded-sm px-1 py-1 text-xs text-muted-foreground transition-colors duration-fast ease-out hover:bg-accent hover:text-foreground"
          >
            <span className="tabular-nums">{more}</span> more in the index
            <ArrowDown aria-hidden="true" className="size-3.5" />
          </button>
        )}
      </div>
      {visible === 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-border py-4">
          <p className="text-xl font-light">No dashboards match {scope}.</p>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-8 items-center rounded-sm px-1 text-sm font-medium underline decoration-1 underline-offset-4 transition-colors duration-fast ease-out hover:bg-accent"
          >
            Clear filter
          </button>
        </div>
      ) : (
        <ul className="border-b border-border">
          {shown.map(({ team, link }) => (
            <li key={link.id} className="border-t border-border">
              <MatchRow team={team} link={link} q={q} />
            </li>
          ))}
        </ul>
      )}
      {near.map(({ team, links }) => (
        <div key={team.code} data-nearby="" className="hidden lg:block">
          <h3 className="mt-2 flex h-8 items-end pb-1.5 text-xs text-muted-foreground">
            Also in&nbsp;<span className="font-mono">{team.code}</span>&nbsp;{team.shortName}
          </h3>
          <ul className="divide-y divide-border border-y border-border">
            {links.map((l) => (
              <li key={l.id}>
                <NearbyRow link={l} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** A matched team's other dashboard: the same row as a match, a step quieter. */
function NearbyRow({ link }: { link: DashboardLink }) {
  const Icon = PLATFORM_ICON[link.platform];
  return (
    <DashboardAnchor
      link={link}
      className="group -mx-2 flex h-9 items-center gap-3 px-2 text-sm text-muted-foreground transition-colors duration-fast ease-out hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground"
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{link.label}</span>
      <ArrowUpRight aria-hidden="true" className="-ml-1.5 size-3 shrink-0" />
      <span aria-hidden="true" className="ml-auto shrink-0 pl-3">
        {PLATFORM_LABEL[link.platform]}
      </span>
    </DashboardAnchor>
  );
}

function MatchRow({ team, link, q }: { team: Team; link: DashboardLink; q: string }) {
  const Icon = PLATFORM_ICON[link.platform];
  return (
    <DashboardAnchor
      link={link}
      data-match=""
      className="wl-match-row group -mx-2 flex h-11 items-center gap-3 px-2 transition-colors duration-fast ease-out hover:bg-accent focus-visible:bg-accent"
    >
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate text-md">
        <Highlight text={link.label} q={q} />
      </span>
      <ArrowUpRight
        aria-hidden="true"
        className="-ml-1.5 size-3.5 shrink-0 text-muted-foreground transition-colors duration-fast ease-out group-hover:text-foreground"
      />
      <span aria-hidden="true" className="ml-auto flex shrink-0 items-baseline gap-2.5 pl-3 text-sm text-muted-foreground">
        <span className="font-mono text-xs">
          <Highlight text={team.code} q={q} />
        </span>
        <span className="hidden sm:inline">
          <Highlight text={PLATFORM_LABEL[link.platform]} q={q} />
        </span>
      </span>
      <span className="sr-only">{`, ${team.code} ${team.shortName}`}</span>
    </DashboardAnchor>
  );
}

/* ── Teams: the hero's eight categories, a vertical ruled list ──────────────────────────── */

function TeamList({
  results,
  q,
  filtering,
  onTeamLink,
}: {
  results: TeamResult[];
  q: string;
  filtering: boolean;
  onTeamLink: (e: ReactMouseEvent<HTMLAnchorElement>, code: string) => void;
}) {
  return (
    <nav aria-label="Teams" className="lg:col-span-5 lg:col-start-1 lg:row-start-1 xl:col-span-6">
      <div className="flex h-8 items-baseline justify-between">
        <h2 className="text-sm font-medium">Teams</h2>
        {/* Right edge of the count column: the row's ↓ slot (16px glyph + 16px gap) from 640. */}
        <span aria-hidden="true" className="text-xs text-muted-foreground sm:pr-8">
          Dashboards
        </span>
      </div>
      <ul className="border-b border-border">
        {results.map(({ team, links }) => {
          const total = team.links.length;
          const found = filtering && links.length > 0;
          const none = filtering && !found;
          // The abbreviation is the row's least important word. While filtering, the count
          // grows from "4" to "0 / 4", and at 1024–1279 that costs the full name its last
          // letters — so the abbreviation gives way there, unless it is the only place the
          // query hit on the row (hiding it would hide the one <mark>). When it stays, it
          // truncates before the name does.
          const has = (s?: string) => !!q && !!s?.toLowerCase().includes(q);
          const abbrOnly = has(team.abbr) && !has(team.shortName) && !has(team.code);
          return (
            <li key={team.code} className="border-t border-border">
              <a
                href={teamHash(team.code)}
                onClick={(e) => onTeamLink(e, team.code)}
                className={cn(
                  "wl-team-row group relative -mx-2 flex h-12 items-center gap-4 px-2 transition-colors duration-fast ease-out hover:bg-accent focus-visible:bg-accent",
                  none && "text-muted-foreground",
                )}
              >
                {/* The finding layer: a team with matches carries a static --primary tick in
                    the margin and a --primary count, so where the matches are reads in one
                    glance down the list — not only by foreground against muted. */}
                {found && (
                  <span
                    aria-hidden="true"
                    data-found=""
                    className="absolute inset-y-3.5 left-0 w-0.5 bg-primary"
                  />
                )}
                <span className={cn("w-10 shrink-0 font-mono text-sm", none ? "" : "text-muted-foreground")}>
                  <Highlight text={team.code} q={q} />
                </span>
                {/* One truncating line, name then abbreviation, so an ellipsis always eats
                    the abbreviation before it reaches the name. */}
                <span className="min-w-0 truncate">
                  <span className="text-md font-medium">
                    <Highlight text={team.shortName} q={q} />
                  </span>
                  {team.abbr && (
                    <span
                      className={cn(
                        "ml-4 hidden text-sm text-muted-foreground sm:inline",
                        filtering && !abbrOnly && "lg:hidden xl:inline",
                      )}
                    >
                      <Highlight text={team.abbr} q={q} />
                    </span>
                  )}
                </span>
                <span aria-hidden="true" className="ml-auto shrink-0 text-md tabular-nums">
                  {filtering ? (
                    <>
                      <span className={found ? "font-medium text-primary" : ""}>{links.length}</span>
                      <span className="text-muted-foreground"> / {total}</span>
                    </>
                  ) : (
                    total
                  )}
                </span>
                <span className="sr-only">
                  {filtering ? `, ${links.length} of ${dashboards(total)} match` : `, ${dashboards(total)}`}
                </span>
                <ArrowDown
                  aria-hidden="true"
                  className="hidden size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-fast ease-out group-hover:opacity-100 group-focus-visible:opacity-100 sm:block"
                />
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ── Group figures: a ledger that explains itself ───────────────────────────────────────── */

/** `yielded`: a query is typed, and the matches hold this cell. The ledger keeps its height
    (so nothing below moves) but is hidden from sight and from assistive tech. On a phone the
    matches sit under the field instead, so the ledger stays. */
function Ledger({ yielded }: { yielded: boolean }) {
  return (
    <section aria-labelledby="wl-figures" className={cn(RIGHT_CELL, yielded && "lg:invisible")}>
      <div className="flex min-h-8 flex-wrap items-baseline justify-between gap-x-4 pb-2 lg:pb-0">
        <h2 id="wl-figures" className="text-sm font-medium">
          Group figures
        </h2>
        <p className="text-xs text-muted-foreground">
          Sample data · as of {DATA_AS_OF} · source: DDR
        </p>
      </div>
      {/* Stats05's anatomy (label, value, change, footer) fixed into a valid <dl>: every row
          is a div holding exactly one dt and one dd. Rows are static text on purpose — there
          is no KPI → dashboard mapping in the data to link them with. */}
      <dl className="border-b border-border">
        {KPIS.map((k) => (
          <LedgerRow key={k.id} k={k} />
        ))}
      </dl>
    </section>
  );
}

function LedgerRow({ k }: { k: Kpi }) {
  const delta = formatDelta(k);
  const sentiment = kpiSentiment(k.delta, k.intent);
  return (
    <div className="wl-ledger-row grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-t border-border py-2.5 sm:gap-x-6 lg:py-1.5">
      <dt className="min-w-0">
        <span className="block text-sm font-medium leading-[1.3]">{k.label}</span>
        <span className="block text-xs leading-4 text-muted-foreground">{k.description}</span>
      </dt>
      <dd className="text-right">
        <span className="wl-ledger-value block text-3xl font-light leading-none tracking-tight tabular-nums">
          {formatKpi(k, k.value)}
          {k.unit && (
            <>
              <span aria-hidden="true" className={cn("text-base font-normal text-muted-foreground", k.unit !== "%" && "ml-1")}>
                {k.unit}
              </span>
              <span className="sr-only"> {UNIT_SPEECH[k.unit] ?? k.unit}</span>
            </>
          )}
        </span>
        {delta && (
          <span className={cn("mt-0.5 block text-2xs leading-3", SENTIMENT_TEXT[sentiment])}>
            <span aria-hidden="true">
              {delta} {k.deltaLabel}
            </span>
            <span className="sr-only">{deltaSpeech(k)}</span>
          </span>
        )}
      </dd>
    </div>
  );
}

/* ── The wireline log strip: closes the fold ────────────────────────────────────────────── */

/** A scale end as a log header prints it: 0.3, 10, 300 — no trailing zeros. */
const scaleNum = (v: number) => v.toLocaleString("en-GB", { maximumFractionDigits: 1 });
const LANES = (["gr", "res", "rop"] as const).map((id) => ({
  id,
  name: id.toUpperCase(),
  scale: `${scaleNum(SCALES[id].lo)}–${scaleNum(SCALES[id].hi)} ${SCALES[id].unit}`,
}));

function LogStrip() {
  const log = useMemo(() => buildLog(), []);
  const svg = (children: ReactNode) => (
    <svg
      viewBox={`0 0 ${LOG_W} ${LANE_H}`}
      preserveAspectRatio="none"
      className="wl-trace absolute inset-0 size-full overflow-visible"
      fill="none"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
  const lane = (id: string, children: ReactNode) => (
    <div key={id} className="relative" style={{ height: LANE_H }}>
      {children}
    </div>
  );
  const rule = <div className="h-px bg-border" />;

  return (
    <div aria-hidden="true" data-log="" className="relative mt-8 overflow-hidden lg:mt-6">
      {/* The drawing: stretched edge to edge on a wide screen; on a phone, a centred 760px
          window onto the same log, so the curves keep their grain and both tops stay in.
          The lane rules run full-bleed; the traces enter from the left edge of the page. */}
      <div className="relative left-1/2 w-full min-w-[760px] -translate-x-1/2">
        {/* The annotation row: the marker tops are labelled above the tracks, as on a
            printed log, so no label ever sits on a curve. */}
        <div className="h-4" />
        {rule}
        {lane(
          "gr",
          svg(
            <>
              <path d={log.grFill} className="wl-gr-fill" stroke="none" />
              <line x1={0} x2={LOG_W} y1={log.grBase} y2={log.grBase} className="wl-gr-base" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <path d={log.grLine} className="wl-gr-line" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
            </>,
          ),
        )}
        {rule}
        {lane(
          "res",
          svg(
            <>
              <path d={log.resShallow} className="wl-res-shallow" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <path d={log.resDeep} className="wl-res-deep" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
            </>,
          ),
        )}
        {rule}
        {lane("rop", svg(<path d={log.rop} className="wl-rop" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />))}
        {rule}

        {/* Marker tops: the only blue in the strip. In B, blue means "found". A 1px line of
            --primary through the lanes reads as a black hairline at 1× (KOC's Windows
            laptops at 100%), so each top carries a 2px cap in the annotation row, beside its
            label: enough blue area to be seen as blue, and the line below reads as its
            continuation. */}
        <div className="wl-trace absolute inset-0">
          {log.tops.map((t) => (
            <div
              key={t.label}
              className="wl-top absolute bottom-0 top-0.5 w-px bg-primary"
              style={{ "--at": `${t.at * 100}%` } as CSSProperties}
            >
              <span data-cap="" className="absolute left-0 top-0 h-3.5 w-0.5 bg-primary" />
              <span className="absolute left-2 top-0 whitespace-nowrap text-[0.625rem] font-medium leading-3 text-primary">
                {t.label}
              </span>
            </div>
          ))}
        </div>

        {/* The recording head rides the wipe's leading edge, then disappears (it passes
            under the track header at the end, as the recording runs into it). */}
        <div className="wl-head pointer-events-none absolute inset-0">
          <span className="absolute inset-y-0 left-0 w-px bg-primary" />
        </div>
      </div>

      {/* The track header, set at the deep end like a log's repeat header: each lane's name
          and scale, right-aligned to the content edge behind a vertical track rule. It sits
          on solid paper that runs on to the page edge, so the traces END here instead of
          leaking past the labels; the lane rules alone continue to the edge. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 top-4">
        <div className={cn(WRAP, "flex h-full justify-end")}>
          <div className="flex w-11 shrink-0 flex-col gap-px border-l border-border py-px sm:w-32">
            {LANES.map((l) => (
              <div
                key={l.id}
                className="wl-track-head relative flex items-center justify-between gap-3 pl-2.5 text-[0.625rem] leading-none text-muted-foreground"
                style={{ height: LANE_H }}
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

/* ── The index: every dashboard, filtered in place ──────────────────────────────────────── */

function Index({
  indexRef,
  results,
  q,
  query,
  facet,
  filtering,
  visible,
  spy,
  landed,
  onTeamLink,
  onSearch,
  onClear,
  onCopied,
}: {
  indexRef: RefObject<HTMLDivElement | null>;
  results: TeamResult[];
  q: string;
  query: string;
  facet: Facet;
  filtering: boolean;
  visible: number;
  spy: string | null;
  landed: string | null;
  onTeamLink: (e: ReactMouseEvent<HTMLAnchorElement>, code: string) => void;
  onSearch: () => void;
  onClear: () => void;
  onCopied: (msg: string) => void;
}) {
  const filterWords = [
    q ? `“${query.trim()}”` : null,
    facet !== "all" ? PLATFORM_LABEL[facet] : null,
  ].filter(Boolean);
  const empty = filtering && visible === 0;
  const last = results.at(-1);

  return (
    <section aria-labelledby={INDEX_TITLE_ID} className="mt-20 lg:mt-24">
      <div className={cn(WRAP, "flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 pb-4")}>
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

      <JumpBar
        results={results}
        spy={spy}
        filtering={filtering}
        onTeamLink={onTeamLink}
        onSearch={onSearch}
        query={query}
      />

      <div ref={indexRef} className={WRAP}>
        {empty && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-8">
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
        {results.slice(0, -1).map((r, i) => (
          <TeamSection
            key={r.team.code}
            result={r}
            q={q}
            filtering={filtering}
            ruled={i > 0 || empty}
            landed={landed === r.team.code}
            onCopied={onCopied}
          />
        ))}
        {/* The last section and the index's end line share a wrapper that is at least a
            screen tall, less the landing offset (3rem) and a little under the footer's
            height (14rem ≤ its ~15.5rem). So EVERY section — however short a filter makes
            the page — can scroll up to the landing line: a jump always lands its heading at
            the top, and the scroll-spy band always meets the section a jump went to. The
            end line comes straight after the last rows, so the paper below it reads as the
            end of the sheet, not as a gap before something missing. */}
        <div className="min-h-[calc(100svh-17rem)]">
          {last && (
            <TeamSection
              key={last.team.code}
              result={last}
              q={q}
              filtering={filtering}
              ruled={results.length > 1 || empty}
              landed={landed === last.team.code}
              onCopied={onCopied}
            />
          )}
          <IndexEnd filtering={filtering} visible={visible} onSearch={onSearch} />
        </div>
      </div>
    </section>
  );
}

/** Where the index stops: an ink rule (not a hairline — this one ends the sheet), what the
    index held, and the way back to the field. */
function IndexEnd({
  filtering,
  visible,
  onSearch,
}: {
  filtering: boolean;
  visible: number;
  onSearch: () => void;
}) {
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
  onTeamLink,
  onSearch,
  query,
}: {
  results: TeamResult[];
  spy: string | null;
  filtering: boolean;
  onTeamLink: (e: ReactMouseEvent<HTMLAnchorElement>, code: string) => void;
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
    track.querySelectorAll("a").forEach((a) => ro.observe(a));
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      // Nothing in view (the reader is above the index): no indicator. When it returns it is
      // a fresh element, so it appears in place rather than gliding in from the last team.
      const el = shown && trackRef.current?.querySelector<HTMLElement>(`[data-code="${shown}"]`);
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
    const el = spy && trackRef.current?.querySelector<HTMLElement>(`[data-code="${spy}"]`);
    if (!bar || !el || bar.scrollWidth <= bar.clientWidth) return;
    bar.scrollTo({ left: el.offsetLeft - (bar.clientWidth - el.offsetWidth) / 2, behavior: reduced ? "auto" : "smooth" });
  }, [spy, reduced]);

  return (
    <div className={cn(GROUND, "sticky top-0 z-20 border-y border-border")}>
      <div className={cn(WRAP, "flex h-12 items-stretch gap-3")}>
        <nav aria-label="Jump to team" ref={barRef} className="wl-jumpbar -ml-2 min-w-0 flex-1 overflow-x-auto">
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
                // tinted. While filtering, the hero's Teams list is mirrored: every team WITH
                // matches takes the finding layer's --primary, the empty ones stay tinted, and
                // the underline still says which one you are reading.
                const tone = filtering
                  ? none
                    ? "text-muted-foreground hover:text-foreground"
                    : "text-primary"
                  : team.code === shown
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground";
                return (
                  <li key={team.code} className="flex shrink-0 snap-start">
                    <a
                      href={teamHash(team.code)}
                      data-code={team.code}
                      aria-current={team.code === spy ? "location" : undefined}
                      onClick={(e) => onTeamLink(e, team.code)}
                      onPointerEnter={() => setHovered(team.code)}
                      onFocus={() => setFocused(team.code)}
                      className={cn(
                        "flex items-center gap-1.5 whitespace-nowrap px-2 text-xs transition-colors duration-fast ease-out",
                        tone,
                      )}
                    >
                      <span className="font-mono font-medium">{team.code}</span>
                      {/* Measured: the eight short names fit beside the search control from
                          1280 (the common KOC laptop). Below that the bar is codes only; the
                          name stays in the accessible name either way. */}
                      <span className="sr-only xl:not-sr-only xl:whitespace-nowrap">
                        {team.abbr ?? team.shortName}
                      </span>
                      {none && <span className="sr-only">, no matches</span>}
                    </a>
                  </li>
                );
              })}
            </ul>
            {box && (
              <span
                aria-hidden="true"
                className={cn(
                  "wl-indicator pointer-events-none absolute bottom-0 left-0 h-0.5 w-px origin-left bg-primary",
                  placed && "transition-transform duration-slow ease-out",
                )}
                style={{ transform: `translateX(${box.x}px) scaleX(${box.w})` }}
              />
            )}
          </div>
        </nav>
        {/* Back to the field from anywhere in the index. While a filter is on, it shows the
            query, so the sticky bar says what the index below is scoped to. At 1280–1439 its
            text (label or query) gives way to the eight team names — measured, the two do not
            fit together there — and stays in the accessible name; the key cap stays. */}
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
  q,
  filtering,
  ruled,
  landed,
  onCopied,
}: {
  result: TeamResult;
  q: string;
  filtering: boolean;
  /** A top rule. Not on the first section, whose top edge is the sticky bar's own rule. */
  ruled: boolean;
  landed: boolean;
  onCopied: (msg: string) => void;
}) {
  const id = sectionId(team.code);
  const total = team.links.length;
  const collapsed = filtering && links.length === 0;
  const hq = teamHit ? q : "";

  return (
    <section
      id={id}
      data-code={team.code}
      aria-labelledby={`${id}-title`}
      className={cn(
        // scroll-mt-12: a jump lands the section's own top rule just under the 50px sticky
        // bar, so the bar's rule is the only one you see above the heading.
        "grid scroll-mt-12 content-start gap-y-3 border-border lg:grid-cols-12 lg:gap-x-6",
        ruled && "border-t",
        collapsed ? "py-4" : "py-7",
      )}
    >
      <div className="relative lg:sticky lg:top-16 lg:col-span-4 lg:self-start">
        <div className="relative">
          {/* Where the jump landed: a static --primary rule beside the heading, in the finding
              layer's colour. Focus moved here too, but after a mouse click it shows no ring. */}
          {landed && (
            <span
              aria-hidden="true"
              data-landed=""
              className="absolute inset-y-1 -left-3 w-0.5 bg-primary sm:-left-4"
            />
          )}
          {/* Stripe's count-in-the-title: "(7)", or "(2 of 7)" while filtering. */}
          {/* Inline text, not flex: a long name wraps inside itself, and a no-break space
              glues the count to its last word so "(4)" is never orphaned on a line. */}
          <h3
            id={`${id}-title`}
            tabIndex={-1}
            className="rounded-sm text-2xl font-light leading-tight tracking-tight"
          >
            <span className="mr-3 font-mono text-sm font-medium text-muted-foreground">
              <Highlight text={team.code} q={hq} />
            </span>
            <Highlight text={team.shortName} q={hq} />
            {" "}
            <span className="ml-1.5 text-base font-normal tabular-nums text-muted-foreground">
              ({filtering ? `${links.length} of ${total}` : total})
            </span>
          </h3>
        </div>
        {!collapsed && (
          <>
            <p className="mt-2 max-w-[42ch] text-sm text-muted-foreground">{team.blurb}</p>
            <p className="mt-1 max-w-[46ch] text-xs text-muted-foreground">
              {team.abbr && (
                <>
                  <span className="font-medium text-foreground">
                    <Highlight text={team.abbr} q={hq} />
                  </span>
                  {" · "}
                </>
              )}
              <Highlight text={team.name} q={hq} />
            </p>
            <CopyLink team={team} onCopied={onCopied} />
          </>
        )}
      </div>

      <div className="lg:col-span-8">
        {collapsed ? (
          <p className="flex h-8 items-center text-sm text-muted-foreground">No match</p>
        ) : (
          /* Rules only between rows: the section's own full-width rule is the list's top
             edge on a wide screen, where the first row sits on the heading's line. On a
             phone the list follows the blurb, so it takes a top rule of its own. */
          <ul className="divide-y divide-border border-t border-border lg:-mt-2 lg:border-t-0">
            {links.map((l) => (
              <LinkRow key={l.id} link={l} q={q} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function LinkRow({ link, q }: { link: DashboardLink; q: string }) {
  const Icon = PLATFORM_ICON[link.platform];
  return (
    <li>
      <DashboardAnchor
        link={link}
        data-dash=""
        className="group -mx-2 flex min-h-11 items-center gap-3 px-2 py-2 transition-colors duration-fast ease-out hover:bg-accent focus-visible:bg-accent"
      >
        <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 text-base">
          <Highlight text={link.label} q={q} />
          <ArrowUpRight
            aria-hidden="true"
            className="ml-1 inline size-3.5 align-[-2px] text-muted-foreground transition-colors duration-fast ease-out group-hover:text-foreground"
          />
        </span>
        <span aria-hidden="true" className="shrink-0 text-sm text-muted-foreground">
          <Highlight text={PLATFORM_LABEL[link.platform]} q={q} />
        </span>
      </DashboardAnchor>
    </li>
  );
}

/** Shopify Editions' section anchor: copy a link that lands on this team. */
function CopyLink({ team, onCopied }: { team: Team; onCopied: (msg: string) => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    const url = `${window.location.href.split("#")[0]}${teamHash(team.code)}`;
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
      className="-ml-1.5 mt-3 inline-flex h-7 items-center gap-1.5 rounded-sm px-1.5 text-xs text-muted-foreground transition-colors duration-fast ease-out hover:bg-accent hover:text-foreground"
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {copied ? "Copied" : "Copy link"}
      <span className="sr-only">
        {" "}
        to {team.code} {team.shortName}
      </span>
    </button>
  );
}

/* ── Footer ─────────────────────────────────────────────────────────────────────────────── */

function Footer() {
  return (
    <footer className="mt-20 border-t border-border">
      <div className={cn(WRAP, "flex flex-col gap-6 pb-24 pt-8 sm:flex-row sm:items-start sm:justify-between")}>
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
    </footer>
  );
}
