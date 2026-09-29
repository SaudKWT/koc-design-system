/**
 * Everything below the hero: the company headline figures, the eight teams
 * and their dashboards, the group KPIs. Plain on purpose — the hero is the
 * spectacle, this is the tool people come back to every morning.
 */

import { useId, useState } from "react";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@koc/ui";

import {
  COMPANY_KPIS,
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
  Sparkline,
  deltaSpeech,
  formatDelta,
  kpiSentiment,
  useCountUp,
  useInView,
} from "../shared";

/* ------------------------------------------------------------------------ */

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.2em] text-muted-foreground", className)}>
      <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
      {children}
    </div>
  );
}

function Figure({ k, start }: { k: Kpi; start: boolean }) {
  const v = useCountUp(k.value, start);
  return (
    <>
      <span aria-hidden="true">{formatKpi(k, v)}</span>
      <span className="sr-only">{formatKpi(k, k.value)}</span>
    </>
  );
}

function Delta({ k, className }: { k: Kpi; className?: string }) {
  const d = formatDelta(k);
  if (!d) return <span className={cn("font-mono text-2xs uppercase tracking-wider text-muted-foreground", className)}>No comparison</span>;
  const s = kpiSentiment(k.delta, k.intent);
  return (
    <span className={cn("font-mono text-2xs uppercase tracking-wider", className)}>
      <span aria-hidden="true" className={SENTIMENT_TEXT[s]}>
        {d}
      </span>
      <span aria-hidden="true" className="text-muted-foreground">
        {" "}
        {k.deltaLabel}
      </span>
      <span className="sr-only">{deltaSpeech(k)}</span>
    </span>
  );
}

/* ------------------------------------------------------------------------ */

export function CompanyStrip() {
  const [ref, inView] = useInView<HTMLElement>();
  return (
    <section ref={ref} aria-labelledby="dwe-company" className="border-y border-border bg-card">
      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[16rem_1fr]">
        <div className="border-b border-border px-4 py-6 sm:px-8 lg:border-r lg:border-b-0">
          <Eyebrow>Company · placeholder</Eyebrow>
          <h2 id="dwe-company" className="mt-3 text-xl font-semibold uppercase leading-tight tracking-tight">
            {GROUP.company} today
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">As of {DATA_AS_OF}</p>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {COMPANY_KPIS.map((k, i) => (
            <li
              key={k.id}
              className={cn(
                "flex flex-col gap-3 px-4 py-6 sm:px-8",
                i > 0 && "border-t border-border sm:border-t-0",
                i % 2 === 1 && "sm:border-l",
                i >= 2 && "sm:border-t xl:border-t-0",
                i === 2 && "xl:border-l",
              )}
            >
              <div className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">{k.tag}</div>
              <div className="flex items-baseline gap-2">
                <span className="text-[clamp(2.2rem,3.4vw,3.2rem)] font-semibold leading-none tracking-[-0.04em] tabular-nums">
                  <Figure k={k} start={inView} />
                </span>
                {k.unit && <span className="font-mono text-xs uppercase text-muted-foreground">{k.unit}</span>}
              </div>
              <div className="text-sm font-medium">{k.label}</div>
              <div className="mt-auto flex items-end justify-between gap-4">
                <Delta k={k} />
                <Sparkline values={k.trend} className="h-6 w-24 shrink-0 text-primary" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */

type Filter = Platform | "all";
const FILTERS: Filter[] = ["all", "power-bi", "sharepoint", "web-app"];

export function Teams() {
  const [filter, setFilter] = useState<Filter>("all");
  const count = (f: Filter) =>
    f === "all" ? DASHBOARD_COUNT : TEAMS.reduce((n, t) => n + t.links.filter((l) => l.platform === f).length, 0);

  return (
    <section id="dwe-teams" aria-labelledby="dwe-teams-title" className="scroll-mt-4">
      <div className="mx-auto max-w-[1600px] px-4 pt-16 pb-8 sm:px-8 lg:pt-24">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Eyebrow>
              <span className="dwe-bracket">Dashboards</span>
            </Eyebrow>
            <h2
              id="dwe-teams-title"
              className="mt-4 max-w-3xl text-[clamp(2rem,4.4vw,3.8rem)] font-semibold uppercase leading-[0.92] tracking-[-0.035em]"
            >
              Eight teams. {DASHBOARD_COUNT} dashboards.
            </h2>
            <p className="mt-4 max-w-xl text-muted-foreground">
              Every link opens the dashboard itself in a new tab, so this page stays where you left it.
            </p>
          </div>
          <div role="group" aria-label="Show dashboards on" className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-sm border px-3 font-mono text-2xs uppercase tracking-wider transition-colors duration-fast ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  filter === f
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background text-foreground hover:border-primary hover:text-primary",
                )}
              >
                {f === "all" ? "All" : PLATFORM_LABEL[f]}
                <span className={filter === f ? "opacity-80" : "text-muted-foreground"}>{count(f)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-4 pb-16 sm:px-8 lg:pb-24">
        <ul className="grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
          {TEAMS.map((t) => (
            <li key={t.code} className="flex">
              <TeamCard team={t} filter={filter} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function TeamCard({ team, filter }: { team: Team; filter: Filter }) {
  const id = useId();
  const links = filter === "all" ? team.links : team.links.filter((l) => l.platform === filter);
  return (
    <article aria-labelledby={id} className="flex w-full flex-col bg-background p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 font-mono text-2xs uppercase tracking-wider">
        <span className="dwe-bracket text-foreground">{team.code}</span>
        <span className="text-muted-foreground tabular-nums">
          {String(team.links.length).padStart(2, "0")} {team.links.length === 1 ? "dashboard" : "dashboards"}
        </span>
      </div>
      <h3 id={id} className="mt-6 text-xl font-semibold uppercase leading-tight tracking-tight">
        {team.shortName}
        {team.abbr && <span className="ml-2 align-middle font-mono text-2xs font-medium tracking-wider text-primary">{team.abbr}</span>}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">{team.blurb}</p>
      <p className="sr-only">{team.name}</p>
      {links.length ? (
        <ul className="mt-6 border-b border-border">
          {links.map((l) => {
            const Icon = PLATFORM_ICON[l.platform];
            return (
              <li key={l.id} className="border-t border-border">
                <DashboardAnchor
                  link={l}
                  className="group flex items-center gap-3 rounded-xs py-3 text-sm transition-colors duration-fast ease-out hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
                  <span className="min-w-0 flex-1">{l.label}</span>
                  <span aria-hidden="true" className="hidden font-mono text-2xs uppercase tracking-wider text-muted-foreground sm:inline">
                    {PLATFORM_LABEL[l.platform]}
                  </span>
                  <ArrowUpRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-fast ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary"
                    aria-hidden="true"
                  />
                </DashboardAnchor>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-6 border-y border-border py-3 text-sm text-muted-foreground">
          No {PLATFORM_LABEL[filter as Platform]} dashboards.
        </p>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------------ */

export function GroupKpis() {
  const [ref, inView] = useInView<HTMLElement>();
  return (
    <section ref={ref} id="dwe-kpis" aria-labelledby="dwe-kpis-title" className="scroll-mt-4 border-t border-border bg-card">
      <div className="mx-auto max-w-[1600px] px-4 py-16 sm:px-8 lg:py-24">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Eyebrow>
              <span className="dwe-bracket">{GROUP.abbr}</span>
            </Eyebrow>
            <h2
              id="dwe-kpis-title"
              className="mt-4 text-[clamp(2rem,4.4vw,3.8rem)] font-semibold uppercase leading-[0.92] tracking-[-0.035em]"
            >
              Group performance
            </h2>
          </div>
          <p className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">
            As of {DATA_AS_OF} · placeholder figures
          </p>
        </div>
        <ul className="mt-10 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
          {KPIS.map((k) => (
            <li key={k.id} className="flex flex-col gap-4 bg-background p-5 sm:p-6">
              <div className="flex items-center justify-between font-mono text-2xs uppercase tracking-wider text-muted-foreground">
                <span>{k.label}</span>
                <span className="rounded-xs border border-border px-1.5 py-0.5">{k.tag}</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-5xl font-semibold leading-none tracking-[-0.04em] tabular-nums">
                  <Figure k={k} start={inView} />
                </span>
                {k.unit && <span className="font-mono text-sm text-muted-foreground">{k.unit}</span>}
              </div>
              <Sparkline values={k.trend} className="h-9 text-primary" />
              <div className="mt-auto flex flex-col gap-1.5 border-t border-border pt-3">
                <Delta k={k} />
                <p className="text-xs text-muted-foreground">{k.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-10 text-xs text-muted-foreground sm:px-8 lg:flex-row lg:justify-between">
        <div className="font-mono uppercase tracking-wider">
          <div className="text-foreground">{GROUP.name}</div>
          <div className="mt-1">
            {GROUP.directorate} · {GROUP.company}
          </div>
        </div>
        <p className="max-w-2xl lg:text-right">
          The 3D well is illustrative, not a KOC well; its rig, casing, BHA and bit are modelled to standard
          dimensions. Formation names and order follow GeoExpro, “The Great Burgan field, Kuwait”; depths other
          than Wara’s are illustrative. Dashboard names and every figure on this page are placeholders.
        </p>
      </div>
    </footer>
  );
}
