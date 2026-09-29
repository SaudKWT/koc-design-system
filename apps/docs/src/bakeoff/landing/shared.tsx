/**
 * Behaviour every landing direction shares, so directions differ in design and
 * never in correctness.
 *
 * A comparison where one direction announces "opens in a new tab" and another
 * forgets is a comparison of diligence, not of design. Anything a11y- or
 * motion-critical lives here once.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";
import { AppWindow, ChartColumnBig, FileStack, Pin, type LucideIcon } from "lucide-react";

import { toast, cn, type StatIntent } from "@koc/ui";

import { PLATFORM_LABEL, TEAMS, type DashboardLink, type Kpi, type Platform, type Team } from "./data";

export const PLATFORM_ICON: Record<Platform, LucideIcon> = {
  "power-bi": ChartColumnBig,
  sharepoint: FileStack,
  "web-app": AppWindow,
};

interface DashboardAnchorProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  link: DashboardLink;
  children: ReactNode;
}

/**
 * The only way a direction may render a dashboard link.
 *
 * - Opens in a new tab: this page is a launcher, and losing it on every click
 *   defeats the point of consolidating.
 * - Says so to a screen reader, and names the platform. A sighted user sees the
 *   ↗ and the badge; without this, NVDA says only the label.
 * - `.invalid` placeholder hrefs are intercepted with a toast rather than
 *   opening a tab onto a DNS error.
 * - Every open is recorded for "Recent dashboards" (v2), including a
 *   middle-click, which fires `auxclick` rather than `click`.
 */
export function DashboardAnchor({ link, children, className, onClick, ...props }: DashboardAnchorProps) {
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onAuxClick={(e) => {
        if (e.button === 1) recordDashboardOpen(link.id);
      }}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        recordDashboardOpen(link.id);
        if (new URL(link.href).hostname.endsWith(".invalid")) {
          e.preventDefault();
          toast(`Placeholder link — ${link.label}`, {
            description: `The real ${PLATFORM_LABEL[link.platform]} address goes here.`,
          });
        }
      }}
      {...props}
    >
      {children}
      <span className="sr-only">
        {` (${PLATFORM_LABEL[link.platform]}, opens in a new tab)`}
      </span>
    </a>
  );
}

/** `prefers-reduced-motion: reduce`, live. The standalone viewer can force it on. */
export function useReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const read = () =>
    typeof window !== "undefined" &&
    (window.matchMedia(query).matches ||
      document.documentElement.dataset.forceReducedMotion === "true");
  const [reduced, setReduced] = useState(read);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setReduced(read());
    mql.addEventListener("change", update);
    // The viewer's "reduce motion" toggle flips a data attribute; watch it too.
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-force-reduced-motion"] });
    return () => {
      mql.removeEventListener("change", update);
      obs.disconnect();
    };
  }, []);
  return reduced;
}

/** True once the element has scrolled into view (fires once). */
export function useInView<T extends Element>(rootMargin = "0px 0px -10% 0px") {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootMargin]);
  return [ref, inView] as const;
}

/**
 * Count from 0 to `target` once `start` is true. Returns the target immediately
 * under reduced motion. Ease-out cubic.
 *
 * The number is decorative motion over a real value, so the DOM a screen reader
 * reads must hold the FINAL value: render the animated figure `aria-hidden` and
 * put `formatKpi(k, k.value)` in an sr-only sibling.
 */
export function useCountUp(target: number, start: boolean, durationMs = 900): number {
  const reduced = useReducedMotion();
  const [v, setV] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced) {
      setV(target);
      return;
    }
    if (!start) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / durationMs);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, start, durationMs, reduced]);
  return v;
}

/**
 * Good / bad / flat for a KPI delta. Mirrors StatCard's private `sentimentOf`
 * exactly — direction is arithmetic, sentiment is declared by `intent`.
 */
export function kpiSentiment(delta: number | undefined, intent: StatIntent): "good" | "bad" | "flat" {
  if (delta === undefined || delta === 0 || intent === "neutral") return "flat";
  const rising = delta > 0;
  if (intent === "higher-is-better") return rising ? "good" : "bad";
  return rising ? "bad" : "good";
}

export const SENTIMENT_TEXT: Record<"good" | "bad" | "flat", string> = {
  good: "text-success",
  bad: "text-destructive",
  flat: "text-muted-foreground",
};

/** "+8.3%" / "−1.2" — with a real minus sign. */
export function formatDelta(k: Pick<Kpi, "delta" | "deltaFormat">): string | null {
  if (k.delta === undefined) return null;
  const sign = k.delta > 0 ? "+" : k.delta < 0 ? "−" : "";
  const abs = Math.abs(k.delta);
  return k.deltaFormat === "absolute"
    ? `${sign}${abs.toLocaleString("en-GB")}`
    : `${sign}${abs.toFixed(1)}%`;
}

/** What a screen reader hears for a delta — direction in words, not in an arrow. */
export function deltaSpeech(k: Kpi): string {
  if (k.delta === undefined) return "";
  const s = kpiSentiment(k.delta, k.intent);
  const dir = k.delta === 0 ? "no change" : k.delta > 0 ? "increase" : "decrease";
  const mood = s === "flat" ? "" : s === "good" ? ", favourable" : ", unfavourable";
  return `${formatDelta(k)} ${dir}${mood}${k.deltaLabel ? ` ${k.deltaLabel}` : ""}`;
}

/** A tiny inline SVG sparkline in `currentColor`. Shared so trends read the same everywhere. */
export function Sparkline({
  values,
  className,
  strokeWidth = 1.5,
}: {
  values: number[];
  className?: string;
  strokeWidth?: number;
}) {
  const w = 100;
  const h = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / span) * (h - 4) - 2}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn("h-7 w-full overflow-visible", className)}
    >
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * v2: DAILY USE
 *
 * v1 optimised for first impression. v2 optimises for the hundredth visit:
 * someone who opens this page every morning should reach their dashboard with
 * no hunting. The three helpers below are shared so every v2 direction behaves
 * identically. What differs between directions is design, never whether pins
 * survive a reload or whether Ctrl+K works on an Arabic layout.
 * ──────────────────────────────────────────────────────────────────────────── */

const MEMORY_KEY = "dweg-landing:dashboards";
const MEMORY_EVENT = "dweg-landing:dashboards-changed";
const RECENT_MAX = 6;

interface DashboardMemory {
  /** Link ids, in the order the person pinned them. */
  pinned: string[];
  /** Link ids, most recently opened first. */
  recent: string[];
}

/**
 * Per-browser only (localStorage), which is the right scope for "my shortcuts"
 * and needs no server. Storage can be blocked or throw (private windows, locked
 * down profiles), so every access is guarded and the page works without it.
 */
function readMemory(): DashboardMemory {
  try {
    const raw = window.localStorage.getItem(MEMORY_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<DashboardMemory>) : {};
    const known = new Set(TEAMS.flatMap((t) => t.links.map((l) => l.id)));
    // Drop ids that no longer exist, so a renamed dashboard cannot leave a ghost pin.
    return {
      pinned: (parsed.pinned ?? []).filter((id) => known.has(id)),
      recent: (parsed.recent ?? []).filter((id) => known.has(id)),
    };
  } catch {
    return { pinned: [], recent: [] };
  }
}

function writeMemory(m: DashboardMemory) {
  try {
    window.localStorage.setItem(MEMORY_KEY, JSON.stringify(m));
  } catch {
    /* storage unavailable: the in-page state still updates via the event */
  }
  window.dispatchEvent(new CustomEvent(MEMORY_EVENT));
}

/** Called by DashboardAnchor on every open. Directions never need to call it. */
export function recordDashboardOpen(id: string) {
  const m = readMemory();
  writeMemory({ ...m, recent: [id, ...m.recent.filter((x) => x !== id)].slice(0, RECENT_MAX) });
}

export interface RememberedLink {
  link: DashboardLink;
  team: Team;
}

const LINK_INDEX = new Map<string, RememberedLink>(
  TEAMS.flatMap((team) => team.links.map((link) => [link.id, { link, team }] as const)),
);

/**
 * Pinned and recently opened dashboards, live across components and tabs.
 *
 * `recent` excludes anything already pinned, so the two lists never repeat a
 * link side by side.
 */
export function useDashboardMemory() {
  // Read synchronously on first render, so a returning reader never sees a one-frame
  // "nothing pinned" state before their pins appear. The page is client-only, so
  // there is no server render to mismatch.
  const [memory, setMemory] = useState<DashboardMemory>(readMemory);
  useEffect(() => {
    const sync = () => setMemory(readMemory());
    sync();
    window.addEventListener(MEMORY_EVENT, sync);
    // Another tab pinned something: follow it.
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MEMORY_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const pinned = useMemo(
    () => memory.pinned.map((id) => LINK_INDEX.get(id)).filter((x): x is RememberedLink => !!x),
    [memory.pinned],
  );
  const recent = useMemo(
    () =>
      memory.recent
        .filter((id) => !memory.pinned.includes(id))
        .map((id) => LINK_INDEX.get(id))
        .filter((x): x is RememberedLink => !!x),
    [memory.pinned, memory.recent],
  );
  const isPinned = useCallback((id: string) => memory.pinned.includes(id), [memory.pinned]);
  const togglePin = useCallback((id: string) => {
    const m = readMemory();
    writeMemory({
      ...m,
      pinned: m.pinned.includes(id) ? m.pinned.filter((x) => x !== id) : [...m.pinned, id],
    });
  }, []);
  const clearRecent = useCallback(() => writeMemory({ ...readMemory(), recent: [] }), []);

  return { pinned, recent, isPinned, togglePin, clearRecent };
}

interface PinToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children"> {
  link: DashboardLink;
  pinned: boolean;
  onTogglePin: (id: string) => void;
}

/**
 * The only way a direction may render a pin control, so every direction names
 * it identically: "Pin Contract register" / "Unpin Contract register", with
 * `aria-pressed`. Style it through `className`; keep it at least 24px square.
 *
 * It must sit BESIDE the DashboardAnchor, never inside it: a button nested in
 * a link is invalid HTML and unreachable by keyboard in some browsers.
 */
export function PinToggle({ link, pinned, onTogglePin, className, ...props }: PinToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={pinned}
      aria-label={`${pinned ? "Unpin" : "Pin"} ${link.label}`}
      title={pinned ? "Unpin" : "Pin to your dashboards"}
      onClick={() => onTogglePin(link.id)}
      className={cn("inline-flex size-6 shrink-0 items-center justify-center", className)}
      {...props}
    >
      {/* Filled when pinned, outline when not. A crossed-out PinOff read as
          "not pinned" at a glance, the opposite of the state it marked. */}
      <Pin className="size-3.5" fill={pinned ? "currentColor" : "none"} aria-hidden="true" />
    </button>
  );
}

/**
 * Ctrl+K (⌘K on a Mac) focuses the given field.
 *
 * Matches on `event.code === "KeyK"` as well as `key`, because with an Arabic
 * layout active, which is common in Kuwait, `key` is "ن" and a key-only match
 * silently never fires.
 */
export function useFindShortcut(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.code !== "KeyK" && e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      ref.current?.focus();
      if (ref.current instanceof HTMLInputElement) ref.current.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ref]);
}

export interface TeamMatch {
  team: Team;
  links: DashboardLink[];
  /** True when the team itself matched (code, name, abbreviation), so all its links show. */
  teamMatched: boolean;
}

/**
 * The one search every direction uses. Case-insensitive; every word must match
 * somewhere in the link label, its platform, or its team's code, name or
 * abbreviation. So "rig sch" finds both rig schedules, "en71" finds all of
 * Contracts Support, and "power bi hse" finds the HSE Power BI reports.
 * An empty query returns every team with every link.
 */
export function matchDashboards(query: string): TeamMatch[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return TEAMS.map((team) => ({ team, links: team.links, teamMatched: false }));
  return TEAMS.map((team) => {
    const teamText = `${team.code} ${team.name} ${team.shortName} ${team.abbr ?? ""}`.toLowerCase();
    const teamMatched = words.every((w) => teamText.includes(w));
    const links = teamMatched
      ? team.links
      : team.links.filter((l) => {
          const text = `${l.label} ${PLATFORM_LABEL[l.platform]} ${teamText}`.toLowerCase();
          return words.every((w) => text.includes(w));
        });
    return { team, links, teamMatched };
  }).filter((m) => m.links.length > 0);
}
