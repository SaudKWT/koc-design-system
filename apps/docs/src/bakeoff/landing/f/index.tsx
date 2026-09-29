/**
 * Direction F — "Burgan": after Aramco's "The birth of oil".
 *
 * Aramco tells its founding as a fog-soft diorama in chapters. This tells
 * Kuwait's — Bahra 1936, Burgan 1938, the first cargo 1946 — and ends on a
 * rig pad today, where the group's eight teams are pinned as hotspots that
 * lead down to their dashboards. The page opens on today: it is a launcher
 * first and a history second.
 *
 * Ported, not copied: the craft (fog, matte monochrome models, one horizon
 * light-streak, chapter index, press-to-discover) — none of Aramco's words or
 * art. Evaluation-only, like everything in bakeoff/landing.
 */

import { ArrowUpRight, TrendingDown, TrendingUp, Minus } from "lucide-react";

import { cn } from "@koc/ui";

import { COMPANY_KPIS, DASHBOARD_COUNT, DATA_AS_OF, GROUP, KPIS, PLATFORM_LABEL, TEAMS, formatKpi, type Kpi } from "../data";
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
} from "../shared";
import { Hero } from "./Hero";
import { CHAPTERS } from "./history";

const FOG_BG = {
  background:
    "radial-gradient(70% 40% at 0% 0%, color-mix(in oklab, var(--primary) 7%, transparent), transparent 70%), radial-gradient(60% 50% at 100% 40%, color-mix(in oklab, var(--success) 6%, transparent), transparent 70%)",
};

export default function DirectionF() {
  return (
    <div className="bg-background text-foreground">
      <main>
        <Hero />
        <div style={FOG_BG}>
          <Figures />
          <Teams />
        </div>
      </main>
      <PageFooter />
    </div>
  );
}

// ── Figures ────────────────────────────────────────────────────────────────

function DeltaLine({ k }: { k: Kpi }) {
  const d = formatDelta(k);
  if (!d) return <p className="text-xs text-muted-foreground">No comparison</p>;
  const s = kpiSentiment(k.delta, k.intent);
  const Icon = k.delta! > 0 ? TrendingUp : k.delta! < 0 ? TrendingDown : Minus;
  return (
    <p className={cn("flex items-center gap-1.5 text-xs", SENTIMENT_TEXT[s])}>
      <Icon className="size-3.5" aria-hidden="true" />
      <span aria-hidden="true" className="font-medium tabular-nums">
        {d}
        {k.deltaFormat === "absolute" && k.unit ? ` ${k.unit}` : ""}
      </span>
      <span aria-hidden="true" className="text-muted-foreground">{k.deltaLabel}</span>
      <span className="sr-only">{deltaSpeech(k)}</span>
    </p>
  );
}

function Value({ k, start, className }: { k: Kpi; start: boolean; className?: string }) {
  const v = useCountUp(k.value, start, 1100);
  return (
    <p className={cn("flex items-baseline gap-1.5", className)}>
      <span aria-hidden="true" className="font-light tabular-nums tracking-tight">{formatKpi(k, v)}</span>
      {k.unit && <span aria-hidden="true" className="text-sm font-normal text-muted-foreground">{k.unit}</span>}
      <span className="sr-only">
        {formatKpi(k, k.value)}
        {k.unit ? ` ${k.unit}` : ""}
      </span>
    </p>
  );
}

function Figures() {
  const [ref, inView] = useInView<HTMLElement>();
  return (
    <section ref={ref} aria-labelledby="figures-h" className="mx-auto max-w-7xl px-4 pb-10 pt-16 sm:px-8 sm:pt-24">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">Figures</p>
          <h2 id="figures-h" className="mt-2 text-3xl font-light tracking-tight sm:text-5xl">
            {GROUP.company}
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          As of {DATA_AS_OF} · <span className="font-medium text-foreground">placeholder figures</span>
        </p>
      </div>

      <ul className="mt-8 grid grid-cols-2 gap-x-5 gap-y-8 sm:gap-x-8 lg:grid-cols-4">
        {COMPANY_KPIS.map((k) => (
          <li key={k.id} className="border-t border-foreground/20 pt-4">
            <p className="text-2xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{k.tag}</p>
            <h3 className="mt-1 text-sm font-medium leading-snug">{k.label}</h3>
            <Value k={k} start={inView} className="mt-3 flex-wrap text-3xl sm:text-5xl" />
            <div className="mt-2">
              <DeltaLine k={k} />
            </div>
            <Sparkline values={k.trend} className="mt-3 h-8 text-primary/70" />
            <p className="sr-only">{k.description}</p>
          </li>
        ))}
      </ul>

      <div className="mt-16 flex flex-wrap items-end justify-between gap-2">
        <h3 className="text-xl font-light tracking-tight sm:text-2xl">
          {GROUP.name} <span className="text-muted-foreground">· {GROUP.abbr}</span>
        </h3>
      </div>
      <ul className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KPIS.map((k) => (
          <li key={k.id} className="rounded-xl border bg-card/70 p-4 backdrop-blur">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-medium leading-snug">{k.label}</h4>
              <span className="text-2xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{k.tag}</span>
            </div>
            <Value k={k} start={inView} className="mt-2 text-3xl" />
            <div className="mt-1">
              <DeltaLine k={k} />
            </div>
            <Sparkline values={k.trend} className="mt-2 h-6 text-primary/60" />
            <p className="sr-only">{k.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Teams ──────────────────────────────────────────────────────────────────

function Teams() {
  return (
    <section id="dashboards" tabIndex={-1} aria-labelledby="teams-h" className="mx-auto max-w-7xl scroll-mt-4 px-4 pb-24 pt-14 outline-none sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">Dashboards</p>
          <h2 id="teams-h" className="mt-2 text-3xl font-light tracking-tight sm:text-5xl">
            Eight teams, {DASHBOARD_COUNT} dashboards
          </h2>
        </div>
        <p className="max-w-sm text-xs text-muted-foreground">
          Every link opens in a new tab. Power BI, SharePoint and web apps are marked so you know where you are going.
        </p>
      </div>
      {/* Columns, not a grid: teams run 1 to 7 links, and a grid row is as tall as its tallest. */}
      <ol className="mt-10 gap-x-10 lg:columns-2">
        {TEAMS.map((t) => (
          <li
            key={t.code}
            id={`team-${t.code.toLowerCase()}`}
            tabIndex={-1}
            aria-labelledby={`team-${t.code.toLowerCase()}-h`}
            className="scroll-mt-6 break-inside-avoid border-t border-foreground/15 py-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <article className="grid grid-cols-[4.5rem_1fr] gap-x-4 sm:grid-cols-[6rem_1fr]">
              <p aria-hidden="true" className="text-4xl font-extralight tabular-nums leading-none text-primary sm:text-5xl">
                {t.index}
              </p>
              <div className="min-w-0">
                <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t.code}</p>
                <h3 id={`team-${t.code.toLowerCase()}-h`} className="mt-1 text-lg font-medium leading-snug">
                  <span className="sr-only">{t.code} — </span>
                  {t.shortName}
                  {t.abbr && <span className="font-normal text-muted-foreground"> · {t.abbr}</span>}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{t.name}</p>
                <p className="mt-2 text-sm font-light">{t.blurb}</p>
                <ul className="mt-4 divide-y divide-border rounded-xl border bg-card/70 backdrop-blur">
                  {t.links.map((l) => {
                    const Icon = PLATFORM_ICON[l.platform];
                    return (
                      <li key={l.id}>
                        <DashboardAnchor
                          link={l}
                          className="group flex items-center gap-3 px-4 py-3 text-sm transition-colors duration-fast ease-out first:rounded-t-xl last:rounded-b-xl hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                        >
                          <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate font-medium">{l.label}</span>
                          <span aria-hidden="true" className="hidden text-2xs uppercase tracking-[0.14em] text-muted-foreground sm:inline">
                            {PLATFORM_LABEL[l.platform]}
                          </span>
                          <ArrowUpRight
                            className="size-4 shrink-0 text-muted-foreground transition-transform duration-fast ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                            aria-hidden="true"
                          />
                        </DashboardAnchor>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── Footer: provenance ─────────────────────────────────────────────────────

function PageFooter() {
  // One line per source, listing every chapter that leans on it.
  const byHref = new Map<string, { label: string; href: string; chapters: string[] }>();
  for (const c of CHAPTERS)
    for (const s of c.sources) {
      const hit = byHref.get(s.href);
      if (hit) hit.chapters.push(c.numeral);
      else byHref.set(s.href, { ...s, chapters: [c.numeral] });
    }
  const sources = [...byHref.values()];
  return (
    <footer className="border-t bg-background px-4 pb-20 pt-10 text-xs text-muted-foreground sm:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-2">
        <div>
          <p className="font-medium text-foreground">{GROUP.company} · {GROUP.name}</p>
          <p className="mt-2 max-w-md">
            Evaluation build. Every dashboard name, link and figure on this page is a placeholder. The diorama is modelled in
            code to period proportions; it is an illustration, not a record of any specific site layout.
          </p>
        </div>
        {sources.length > 0 && (
          <div>
            <p className="font-medium text-foreground">History, sourced</p>
            <ul className="mt-2 space-y-1">
              {sources.map((s) => (
                <li key={s.href}>
                  <span className="tabular-nums">{s.chapters.join(", ")}</span> ·{" "}
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {s.label}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </footer>
  );
}
