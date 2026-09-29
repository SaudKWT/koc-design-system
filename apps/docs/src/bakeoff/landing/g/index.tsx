/**
 * Direction G — "Wellsite drawing", after Petronex (Behance, Rondesign).
 *
 * Petronex frames oil & gas assets as monochrome isometric line drawings on
 * white cards — a pumpjack whose well carries on below grade, a wellhead, a
 * lattice derrick — tags them with tiny colour squares, and sets its data in
 * hairline-ruled tiles with one loud accent. This page ports that craft onto
 * KOC tokens: the drawing is a live WebGL2 model of a 2,000 HP land rig and its
 * pad, to scale above grade; KOC blue takes Petronex's Super Orange role; each
 * of the eight teams has a home on the wellsite, and naming one lights its
 * equipment and x-rays whatever the rest of the site hides.
 */

import { useEffect, useState, type MouseEvent } from "react";
import { ArrowDown, ArrowUpRight } from "lucide-react";

import { Button, StatCard, cn } from "@koc/ui";

import {
  COMPANY_KPIS,
  DASHBOARD_COUNT,
  DATA_AS_OF,
  GROUP,
  KPIS,
  PLATFORM_LABEL,
  TEAMS,
  VIEWER,
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
  useCountUp,
  useInView,
  useReducedMotion,
} from "../shared";
import { PART_TEAMS } from "./gl/rig";
import { PART } from "./gl/scene";
import { MicroFor, Ticks } from "./micro";
import { Wellsite, type TeamTag } from "./Wellsite";

const BASE = "#/landing/g";
const SECTIONS = 4;

/** What each team's part of the wellsite is called, for the thumbnail caption. */
const PART_NAME: Record<number, string> = {
  [PART.office]: "Site office",
  [PART.rig]: "Mast, substructure and rig floor",
  [PART.logistics]: "Water, fuel and the water truck",
  [PART.wellControl]: "BOP stack, accumulator, choke manifold",
  [PART.well]: "The well: casing programme",
  [PART.materials]: "Pipe racks and catwalk",
  [PART.producer]: "Producing well and its tree",
};

/** Platform marker colours — Petronex's legend squares, in semantic tokens. */
const PLATFORM_SQUARE: Record<Platform, string> = {
  "power-bi": "bg-chart-2",
  sharepoint: "bg-info",
  "web-app": "bg-primary",
};

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function teamTag(t: Team): TeamTag {
  return { code: t.code, name: t.shortName, part: PART_TEAMS[t.code] };
}

/**
 * In-page links keep the viewer's hash route (`#/landing/g/<id>`) so they never
 * drop out of the direction, and scroll + focus the target themselves.
 */
function useSectionLinks() {
  const reduced = useReducedMotion();
  const go = (id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    history.replaceState(null, "", `${BASE}/${id.replace(/^g-/, "")}`);
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    const target = el.matches("[tabindex]") ? el : el.querySelector<HTMLElement>("[tabindex='-1']");
    target?.focus({ preventScroll: true });
  };
  return go;
}

// ── small parts ─────────────────────────────────────────────────────────────

/** Petronex's section index: a label, a three-digit count, a ruled progress line. */
function SectionLabel({ label, index }: { label: string; index: number }) {
  return (
    <div className="w-44" aria-hidden="true">
      <div className="flex items-baseline justify-between text-2xs">
        <span className="text-foreground">{label}</span>
        <span className="font-mono text-muted-foreground tabular-nums">{String(index).padStart(3, "0")}</span>
      </div>
      <div className="relative mt-1.5 h-px bg-border">
        <span className="absolute -top-1 left-0 h-2 w-px bg-foreground" />
        <span className="absolute inset-y-0 left-0 bg-foreground" style={{ width: `${(index / SECTIONS) * 100}%` }} />
        <span className="absolute -top-1 h-2 w-px bg-foreground" style={{ left: `${(index / SECTIONS) * 100}%` }} />
      </div>
    </div>
  );
}

function Square({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-1.5 shrink-0", className)} />;
}

// ── header ──────────────────────────────────────────────────────────────────

function Header() {
  const go = useSectionLinks();
  const links = [
    ["g-hero", "Wellsite"],
    ["g-company", "Company"],
    ["g-group", "Group KPIs"],
    ["g-teams", "Teams"],
  ] as const;
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-[90rem] items-center gap-4 px-4 py-3 sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center bg-primary">
            <img src="/koc-logo.svg" alt="" className="size-7" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-2xs text-muted-foreground">{GROUP.company}</div>
            <div className="truncate text-sm font-semibold">
              {GROUP.abbr} <span className="font-light text-muted-foreground">Engineering hub</span>
            </div>
          </div>
        </div>
        <nav aria-label="Sections" className="ml-auto hidden md:block">
          <ul className="flex items-center gap-1">
            {links.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`${BASE}/${id.slice(2)}`}
                  onClick={go(id)}
                  className={cn(
                    "rounded-sm px-2.5 py-1.5 text-sm text-muted-foreground transition-colors duration-fast ease-out hover:text-foreground",
                    focusRing,
                  )}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto hidden items-center gap-2 text-2xs text-muted-foreground sm:flex md:ml-4">
          <span className="font-mono tabular-nums">As of {DATA_AS_OF}</span>
          <span className="inline-flex items-center gap-1.5 bg-secondary px-1.5 py-0.5 text-secondary-foreground">
            Placeholder data
            <Square className="bg-warning" />
          </span>
        </div>
      </div>
    </header>
  );
}

// ── hero ────────────────────────────────────────────────────────────────────

function TeamIndex({ active, onTag }: { active: string | null; onTag: (t: Team | null) => void }) {
  const go = useSectionLinks();
  return (
    <nav aria-label="Teams on the wellsite" className="mt-10">
      <div className="flex items-baseline justify-between border-b border-foreground pb-2 text-2xs text-muted-foreground">
        <span>Find your team on the wellsite</span>
        <span className="font-mono">Code</span>
      </div>
      <ol>
        {TEAMS.map((t) => {
          const on = active === t.code;
          return (
            <li key={t.code}>
              <a
                href={`${BASE}/team-${t.code.toLowerCase()}`}
                onClick={go(`g-team-${t.code.toLowerCase()}`)}
                onMouseEnter={() => onTag(t)}
                onMouseLeave={() => onTag(null)}
                onFocus={() => onTag(t)}
                onBlur={() => onTag(null)}
                aria-describedby="g-index-hint"
                className={cn(
                  "grid grid-cols-[2rem_1fr_auto] items-baseline gap-2 border-b border-border py-2 text-sm transition-colors duration-fast ease-out",
                  on ? "text-primary" : "text-foreground hover:text-primary",
                  focusRing,
                )}
              >
                <span className="font-mono text-2xs text-muted-foreground tabular-nums">{t.index}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{t.shortName}</span>
                  <Square className={cn("transition-opacity duration-fast ease-out", on ? "bg-primary opacity-100" : "opacity-0")} />
                </span>
                <span className="font-mono text-2xs text-muted-foreground">{t.code}</span>
              </a>
            </li>
          );
        })}
      </ol>
      <p id="g-index-hint" className="mt-2 text-2xs text-muted-foreground">
        Hover or focus a team to find its part of the site; select it to jump to its dashboards.
      </p>
    </nav>
  );
}

function Hero({ onThumbs }: { onThumbs: (t: Record<number, string>) => void }) {
  const [tagged, setTagged] = useState<Team | null>(null);
  const go = useSectionLinks();
  return (
    <section id="g-hero" aria-labelledby="g-title" className="relative">
      {/* DOM order is intro → drawing → team index: on a phone the drawing comes
          straight after the headline instead of eight rows later, and focus
          order follows it. From lg the grid puts the index back under the intro. */}
      <div className="mx-auto grid max-w-[90rem] gap-x-6 px-4 pb-12 pt-8 sm:px-6 lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:px-10 lg:pt-10">
        <div className="flex flex-col lg:col-span-4 lg:col-start-1 lg:row-start-1">
          <SectionLabel label="Engineering hub" index={1} />
          <p className="mt-8 text-sm text-muted-foreground">Welcome back, {VIEWER.firstName}</p>
          <h1 id="g-title" tabIndex={-1} className="mt-2 text-4xl leading-none tracking-tight outline-none sm:text-5xl">
            <span className="block font-semibold">Drilling &amp; Workover</span>
            <span className="mt-1 block font-light">Engineering Group</span>
          </h1>
          <p className="mt-5 max-w-md text-md text-muted-foreground">
            Every {GROUP.abbr} dashboard in one place — {DASHBOARD_COUNT} links across {TEAMS.length} teams. The
            drawing is the wellsite they serve, to scale above grade.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button render={<a href={`${BASE}/teams`} onClick={go("g-teams")} />}>
              Browse {DASHBOARD_COUNT} dashboards
              <ArrowDown aria-hidden="true" />
            </Button>
            <Button variant="outline" render={<a href={`${BASE}/group`} onClick={go("g-group")} />}>
              Group KPIs
            </Button>
          </div>
        </div>
        <div className="mt-8 lg:col-span-8 lg:col-start-5 lg:row-span-2 lg:row-start-1 lg:mt-0">
          <Wellsite
            tag={tagged ? teamTag(tagged) : null}
            onThumbnails={onThumbs}
            stageClassName="h-[30rem] sm:h-[38rem] lg:h-[min(54rem,calc(100vh-8rem))] lg:min-h-[40rem]"
          />
        </div>
        <div className="lg:col-span-4 lg:col-start-1 lg:row-start-2">
          <TeamIndex active={tagged?.code ?? null} onTag={setTagged} />
        </div>
      </div>
    </section>
  );
}

// ── KPIs ────────────────────────────────────────────────────────────────────

function CompanyTile({ k, start }: { k: Kpi; start: boolean }) {
  const v = useCountUp(k.value, start, 1100);
  const s = kpiSentiment(k.delta, k.intent);
  return (
    <div className="flex min-h-48 flex-col bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs text-muted-foreground">{k.label}</span>
        <span aria-hidden="true" className="inline-flex items-center gap-1.5 bg-secondary px-1.5 py-0.5 font-mono text-2xs text-secondary-foreground">
          {k.tag}
          <Square className="bg-primary" />
        </span>
      </div>
      <Ticks values={k.trend} relative className="mt-5" />
      <div className="mt-auto flex items-baseline gap-2 pt-5">
        <span aria-hidden="true" data-slot="kpi-value" className="text-4xl font-light leading-none tracking-tight tabular-nums">
          {formatKpi(k, v)}
        </span>
        <span className="sr-only">{formatKpi(k, k.value)}</span>
        {k.unit && <span className="text-sm text-muted-foreground">{k.unit}</span>}
      </div>
      {k.delta !== undefined && (
        <div className="mt-2 text-xs">
          <span aria-hidden="true">
            <span className={cn("font-medium tabular-nums", SENTIMENT_TEXT[s])}>{formatDelta(k)}</span>{" "}
            <span className="text-muted-foreground">{k.deltaLabel}</span>
          </span>
          <span className="sr-only">{deltaSpeech(k)}</span>
        </div>
      )}
    </div>
  );
}

function CompanyKpis() {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <section id="g-company" aria-labelledby="g-company-title" className="border-t border-border">
      <div className="mx-auto grid max-w-[90rem] gap-8 px-4 py-14 sm:px-6 lg:grid-cols-12 lg:px-10">
        <div className="lg:col-span-4">
          <SectionLabel label="Company" index={2} />
          <h2 id="g-company-title" tabIndex={-1} className="mt-8 text-3xl leading-tight tracking-tight outline-none">
            <span className="block font-semibold">{GROUP.company}</span>
            <span className="block font-light">headline figures</span>
          </h2>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            The company-wide row above the group’s own. As of {DATA_AS_OF}; every value is a placeholder.
          </p>
        </div>
        <div ref={ref} className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 lg:col-span-8">
          {COMPANY_KPIS.map((k) => (
            <CompanyTile key={k.id} k={k} start={inView} />
          ))}
        </div>
      </div>
    </section>
  );
}

function GroupKpis() {
  return (
    <section id="g-group" aria-labelledby="g-group-title" className="border-t border-border">
      <div className="mx-auto max-w-[90rem] px-4 py-14 sm:px-6 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionLabel label="Group" index={3} />
          </div>
          <div className="lg:col-span-8">
            <h2 id="g-group-title" tabIndex={-1} className="text-3xl leading-tight tracking-tight outline-none">
              <span className="font-semibold">{GROUP.abbr} performance.</span>{" "}
              <span className="font-light">Eight figures the group watches.</span>
            </h2>
          </div>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
          {KPIS.map((k) => (
            <div key={k.id} className="flex flex-col bg-card">
              <StatCard
                label={k.label}
                value={formatKpi(k, k.value)}
                unit={k.unit}
                delta={k.delta}
                deltaFormat={k.deltaFormat}
                deltaLabel={k.deltaLabel}
                intent={k.intent}
                title={k.description}
                className="rounded-none border-0 bg-transparent shadow-none"
              />
              <div className="mt-auto flex items-end justify-between gap-4 px-5 pb-5">
                <MicroFor k={k} className="max-w-40" />
                <span aria-hidden="true" className="shrink-0 bg-secondary px-1.5 py-0.5 font-mono text-2xs text-secondary-foreground">
                  {k.tag}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── teams ───────────────────────────────────────────────────────────────────

function TeamRow({ team, thumb }: { team: Team; thumb?: string }) {
  const part = PART_TEAMS[team.code];
  const id = `g-team-${team.code.toLowerCase()}`;
  return (
    <li id={id} className="grid scroll-mt-6 gap-6 border-b border-border py-8 lg:grid-cols-12">
      <div className="flex gap-5 lg:col-span-4">
        <span aria-hidden="true" className="w-12 shrink-0 font-mono text-3xl font-light leading-none text-muted-foreground tabular-nums">
          {team.index}
        </span>
        <div className="min-w-0 flex-1">
          <h3 tabIndex={-1} className="text-xl leading-tight tracking-tight outline-none">
            <span className="font-semibold">{team.shortName}</span>
            {team.abbr && <span className="font-light text-muted-foreground"> {team.abbr}</span>}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-2xs">
            <span className="border border-input px-1.5 py-0.5 font-mono text-foreground">{team.code}</span>
            <span className="text-muted-foreground">{team.name}</span>
          </div>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">{team.blurb}</p>
        </div>
      </div>
      <div className="lg:col-span-5">
        <div className="flex items-baseline justify-between border-b border-foreground pb-2 text-2xs text-muted-foreground">
          <span>Dashboards</span>
          <span className="font-mono tabular-nums">{String(team.links.length).padStart(2, "0")}</span>
        </div>
        <ol>
          {team.links.map((l, i) => {
            const Icon = PLATFORM_ICON[l.platform];
            return (
              <li key={l.id}>
                <DashboardAnchor
                  link={l}
                  className={cn(
                    "group grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 border-b border-border py-3 text-sm transition-colors duration-fast ease-out hover:bg-accent sm:grid-cols-[2.5rem_1fr_auto_auto]",
                    focusRing,
                  )}
                >
                  <span aria-hidden="true" className="pl-1 font-mono text-2xs text-muted-foreground tabular-nums">
                    {String(i + 1).padStart(3, "0")}
                  </span>
                  <span className="min-w-0 font-medium group-hover:text-primary">{l.label}</span>
                  <span aria-hidden="true" className="hidden items-center gap-1.5 bg-secondary px-1.5 py-0.5 text-2xs text-secondary-foreground sm:inline-flex">
                    <Icon className="size-3" />
                    {PLATFORM_LABEL[l.platform]}
                    <Square className={PLATFORM_SQUARE[l.platform]} />
                  </span>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="mr-1 size-4 text-muted-foreground transition-transform duration-fast ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
                  />
                </DashboardAnchor>
              </li>
            );
          })}
        </ol>
      </div>
      {/* Petronex's asset card: the team's corner of the wellsite, drawn by the hero's renderer. */}
      <div aria-hidden="true" className="w-full max-w-72 self-start border border-border bg-card lg:col-span-3 lg:max-w-none">
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5 font-mono text-2xs text-muted-foreground">
          <span>On the wellsite</span>
          <Square className="bg-primary" />
        </div>
        {thumb ? (
          <img src={thumb} alt="" className="block aspect-[10/7] w-full" />
        ) : (
          <div className="aspect-[10/7] w-full bg-muted/40" />
        )}
        <div className="border-t border-border px-3 py-1.5 text-2xs">{PART_NAME[part]}</div>
      </div>
    </li>
  );
}

function Teams({ thumbs }: { thumbs: Record<number, string> }) {
  return (
    <section id="g-teams" aria-labelledby="g-teams-title" className="border-t border-border">
      <div className="mx-auto max-w-[90rem] px-4 py-14 sm:px-6 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionLabel label="Teams" index={4} />
          </div>
          <div className="lg:col-span-8">
            <h2 id="g-teams-title" tabIndex={-1} className="text-4xl leading-tight tracking-tight outline-none sm:text-5xl">
              <span className="font-semibold">Eight teams.</span>{" "}
              <span className="font-light">Twenty-eight dashboards.</span>
            </h2>
            <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-muted-foreground">
              {(Object.keys(PLATFORM_LABEL) as Platform[]).map((p) => (
                <span key={p} className="inline-flex items-center gap-1.5">
                  <Square className={PLATFORM_SQUARE[p]} />
                  {PLATFORM_LABEL[p]}
                </span>
              ))}
              <span>Every link opens in a new tab.</span>
            </p>
          </div>
        </div>
        <ol className="mt-10 border-t border-foreground">
          {TEAMS.map((t) => (
            <TeamRow key={t.code} team={t} thumb={thumbs[PART_TEAMS[t.code]]} />
          ))}
        </ol>
      </div>
    </section>
  );
}

// ── page ────────────────────────────────────────────────────────────────────

export default function DirectionG() {
  const [thumbs, setThumbs] = useState<Record<number, string>>({});

  // A deep link like #/landing/g/teams lands on its section.
  useEffect(() => {
    const sub = window.location.hash.slice(BASE.length + 1);
    if (!sub) return;
    const el = document.getElementById(`g-${sub}`);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main>
        <Hero onThumbs={setThumbs} />
        <CompanyKpis />
        <GroupKpis />
        <Teams thumbs={thumbs} />
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[90rem] flex-wrap justify-between gap-4 px-4 pb-20 pt-8 text-2xs text-muted-foreground sm:px-6 lg:px-10">
          <p>
            {GROUP.company} · {GROUP.name} · {GROUP.directorate}
          </p>
          <p>Every dashboard name, link and figure on this page is a placeholder. Data as of {DATA_AS_OF}.</p>
        </div>
      </footer>
    </div>
  );
}
