/**
 * The instrument band: identity and search, the twelve figures, and your own
 * dashboards. Everything someone opening this page every morning needs sits
 * here, in the first screen, with nothing moving.
 *
 * Wellpath's voice carries over from v1 — a dark stage, mono read-outs like
 * the tour's MD / TVD / INC HUD, KOC blue as the only accent — compressed
 * into a band rather than a full-screen hero.
 */

import { type RefObject } from "react";
import { ArrowDown, Search, X } from "lucide-react";

import { cn } from "@koc/ui";

import { COMPANY_KPIS, DASHBOARD_COUNT, DATA_AS_OF, GROUP, KPIS, formatKpi, type Kpi } from "../data";
import {
  DashboardAnchor,
  PLATFORM_ICON,
  PinToggle,
  SENTIMENT_TEXT,
  Sparkline,
  deltaSpeech,
  formatDelta,
  kpiSentiment,
  type RememberedLink,
} from "../shared";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/* ------------------------------------------------------------------------ */

export function Header({
  query,
  onQuery,
  inputRef,
  onSkip,
  onFirstResult,
  onTour,
}: {
  query: string;
  onQuery: (q: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  onSkip: () => void;
  onFirstResult: () => void;
  onTour: () => void;
}) {
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <header className="dark bg-background text-foreground">
      {/* First tab stop. A button, not href="#…": the viewer is hash-routed. */}
      <button
        type="button"
        onClick={onSkip}
        className={cn(
          "sr-only rounded-sm bg-primary px-3 py-2 font-mono text-2xs uppercase tracking-wider text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50",
          FOCUS,
        )}
      >
        Skip to dashboards
      </button>
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 pt-4 pb-3 sm:px-8 lg:flex-row lg:items-center lg:gap-8">
        <div className="flex min-w-0 items-center gap-3 lg:w-[26rem] lg:shrink-0">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary">
            <img src="/koc-logo.svg" alt="" className="size-7" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-mono text-2xs uppercase tracking-[0.18em] text-muted-foreground">
              {GROUP.abbr} · Engineering hub
            </div>
            <h1 className="truncate text-lg font-semibold uppercase leading-tight tracking-[-0.02em]">
              Drilling &amp; Workover Engineering
            </h1>
          </div>
        </div>

        <div role="search" className="relative min-w-0 flex-1">
          <label htmlFor="dwe2-find" className="sr-only">
            Find a dashboard
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            id="dwe2-find"
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onFirstResult();
              }
            }}
            placeholder={`Find a dashboard, team or platform — ${DASHBOARD_COUNT} dashboards`}
            aria-describedby="dwe2-find-hint"
            autoComplete="off"
            spellCheck={false}
            className={cn(
              "h-10 w-full rounded-sm border border-input bg-card pr-24 pl-9 text-sm text-foreground placeholder:text-muted-foreground",
              "[&::-webkit-search-cancel-button]:appearance-none",
              FOCUS,
            )}
          />
          <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1.5">
            {query && (
              <button
                type="button"
                onClick={() => {
                  onQuery("");
                  inputRef.current?.focus();
                }}
                className={cn("inline-flex size-6 items-center justify-center rounded-xs text-muted-foreground hover:text-foreground", FOCUS)}
              >
                <X className="size-3.5" aria-hidden="true" />
                <span className="sr-only">Clear search</span>
              </button>
            )}
            <kbd aria-hidden="true" className="rounded-xs border border-border px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">
              {mac ? "⌘K" : "Ctrl K"}
            </kbd>
          </div>
          <p id="dwe2-find-hint" className="sr-only">
            Results filter the directory below as you type. Press Enter to jump to the first result. Control K returns here
            from anywhere on the page.
          </p>
        </div>

        <button
          type="button"
          onClick={onTour}
          className={cn(
            "hidden h-10 shrink-0 items-center gap-2 rounded-sm border border-foreground/20 px-3 font-mono text-2xs uppercase tracking-wider text-foreground transition-colors duration-fast ease-out hover:border-primary hover:text-primary lg:inline-flex",
            FOCUS,
          )}
        >
          Well tour
          <ArrowDown className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------------ */

function KpiCell({ k }: { k: Kpi }) {
  const d = formatDelta(k);
  const s = kpiSentiment(k.delta, k.intent);
  return (
    <li data-kpi={k.id} className="min-w-0 bg-background px-3 py-2.5">
      <div className="truncate font-mono text-2xs uppercase tracking-wider text-muted-foreground" title={k.label}>
        {k.label}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-semibold leading-none tracking-[-0.03em] tabular-nums">{formatKpi(k, k.value)}</span>
          {k.unit && <span className="font-mono text-2xs text-muted-foreground">{k.unit}</span>}
        </div>
        <Sparkline values={k.trend} strokeWidth={1.25} className="mb-0.5 hidden h-3.5 w-12 shrink-0 text-primary lg:block" />
      </div>
      <div className="mt-1.5 truncate font-mono text-2xs tracking-wide">
        {d ? (
          <>
            <span aria-hidden="true" className={SENTIMENT_TEXT[s]}>
              {d}
            </span>
            <span aria-hidden="true" className="text-muted-foreground">
              {" "}
              {k.deltaLabel}
            </span>
            <span className="sr-only">{deltaSpeech(k)}</span>
          </>
        ) : (
          <span className="text-muted-foreground">No comparison</span>
        )}
      </div>
    </li>
  );
}

function KpiGroup({ label, kpis, className, cols }: { label: string; kpis: Kpi[]; className?: string; cols: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <h3 className="px-3 pb-1.5 font-mono text-2xs uppercase tracking-[0.18em] text-muted-foreground">
        <span className="dwe2-bracket">{label}</span>
      </h3>
      <ul className={cn("grid gap-px border-y border-border bg-border", cols)}>
        {kpis.map((k) => (
          <KpiCell key={k.id} k={k} />
        ))}
      </ul>
    </div>
  );
}

export function KpiBand() {
  return (
    <section aria-labelledby="dwe2-kpis-title" className="mx-auto max-w-[1600px] px-4 pt-3 sm:px-8">
      <div className="flex items-baseline justify-between gap-4 px-3 pb-2">
        <h2 id="dwe2-kpis-title" className="font-mono text-2xs uppercase tracking-[0.18em] text-foreground">
          Key figures
        </h2>
        <p className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">As of {DATA_AS_OF} · placeholder figures</p>
      </div>
      <div className="grid gap-4 md:gap-6 lg:grid-cols-[2fr_4fr]">
        <KpiGroup label={`KOC · ${GROUP.company}`} kpis={COMPANY_KPIS} cols="grid-cols-2 md:grid-cols-4 lg:grid-cols-2" />
        <KpiGroup label={`${GROUP.abbr} · group`} kpis={KPIS} cols="grid-cols-2 md:grid-cols-4" />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */

function Chip({ r, pinned, onTogglePin }: { r: RememberedLink; pinned: boolean; onTogglePin: (id: string) => void }) {
  const Icon = PLATFORM_ICON[r.link.platform];
  return (
    <li className="flex min-w-0 items-center rounded-sm border border-foreground/15 bg-card">
      <DashboardAnchor
        link={r.link}
        className={cn(
          "group flex h-8 min-w-0 items-center gap-2 rounded-l-sm pr-1.5 pl-2.5 text-sm transition-colors duration-fast ease-out hover:text-primary",
          FOCUS,
        )}
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
        <span className="truncate">{r.link.label}</span>
        <span aria-hidden="true" className="font-mono text-2xs text-muted-foreground">
          {r.team.code}
        </span>
      </DashboardAnchor>
      <PinToggle
        link={r.link}
        pinned={pinned}
        onTogglePin={onTogglePin}
        className={cn(
          "mr-1 rounded-xs text-muted-foreground transition-colors duration-fast ease-out hover:text-primary aria-pressed:text-primary",
          FOCUS,
        )}
      />
    </li>
  );
}

export function YourDashboards({
  pinned,
  recent,
  isPinned,
  togglePin,
  clearRecent,
}: {
  pinned: RememberedLink[];
  recent: RememberedLink[];
  isPinned: (id: string) => boolean;
  togglePin: (id: string) => void;
  clearRecent: () => void;
}) {
  const head = "flex h-6 items-center gap-2 font-mono text-2xs uppercase tracking-[0.18em]";
  return (
    <div className="mx-auto grid max-w-[1600px] gap-x-6 gap-y-3 px-4 pt-4 pb-5 sm:px-8 lg:grid-cols-[3fr_2fr]">
      <section aria-label="Pinned dashboards" className="min-w-0 px-3">
        <h2 className={cn(head, "text-foreground")}>
          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          Pinned
        </h2>
        {pinned.length ? (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {pinned.map((r) => (
              <Chip key={r.link.id} r={r} pinned onTogglePin={togglePin} />
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Pin a dashboard with the pin icon to keep it here.</p>
        )}
      </section>
      <section aria-label="Recent dashboards" className="min-w-0 px-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className={cn(head, "text-foreground")}>Recent</h2>
          {recent.length > 0 && (
            <button
              type="button"
              onClick={clearRecent}
              className={cn("rounded-xs font-mono text-2xs uppercase tracking-wider text-muted-foreground hover:text-foreground", FOCUS)}
            >
              Clear
            </button>
          )}
        </div>
        {recent.length ? (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {recent.map((r) => (
              <Chip key={r.link.id} r={r} pinned={isPinned(r.link.id)} onTogglePin={togglePin} />
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Dashboards you open appear here.</p>
        )}
      </section>
    </div>
  );
}

