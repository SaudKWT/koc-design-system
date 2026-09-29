/**
 * Direction H — "Asset view", after Ron Design Lab's Mineralsoft operations
 * dashboard.
 *
 * Mineralsoft's information architecture, re-pointed at a launcher:
 *   asset panel (title, status chips, legend with readouts)  →  hero, left
 *   map with a selected block in a dashed frame + tool strip →  hero, right: a
 *                                                              sectioned 3D block
 *   floating structure card with its clay model              →  the rig card
 *   "Today Mined Oil" tick widget, orange productivity panel →  KPI widgets
 *   "My Units / My Hubs" tiles                               →  jump tiles
 *   "Insight" cards with a dark tab                          →  team cards
 * Its orange becomes KOC primary; its second data class (vibrant blue) becomes
 * chart-2 amber, which also carries the oil column in the section.
 */

import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { cn } from "@koc/ui";

import {
  COMPANY_KPIS,
  DASHBOARD_COUNT,
  DATA_AS_OF,
  GROUP,
  KPIS,
  PLATFORM_LABEL,
  TEAMS,
  VIEWER,
  type Kpi,
  type Platform,
  type Team,
} from "../data";
import { DashboardAnchor, PLATFORM_ICON } from "../shared";
import { FieldScene } from "./FieldScene";
import { RigCard } from "./RigCard";
import { CONTACTS, FORMATIONS, fmtFt } from "./scene/strata";
import { ACTIVE_SURVEY, SURVEYS } from "./scene/surveys";
import { Delta, Eyebrow, HatchBars, KpiFigure, TickHistogram, TwoWeight, useInView } from "./widgets";

const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

// Every well figure on the page is read back from the surveyed path.
const A = ACTIVE_SURVEY;
const BUILDS = A.plan.sections.flatMap((s) => (s.kind === "build" ? [s.rate] : []));
const LANDING_TVD = A.landing ? Math.round(A.landing.tvd / 10) * 10 : 0;
const BURGAN_OWC = CONTACTS.find((c) => c.fromTop === 3400)!.owc;
const COMPLETED = SURVEYS.filter((s) => s.plan.status !== "drilling").length;

const SCENE_CAPTION =
  `Illustrative cutaway of a Burgan-type anticline in Kuwait, drawn at true scale. ` +
  `A land rig on pad A is drilling a horizontal well: vertical to a kick-off point at ${fmtFt(A.kop)}, ` +
  `building at ${BUILDS.join(" then ")} degrees per 100 ft, landing in the Burgan sandstone at about ` +
  `${fmtFt(LANDING_TVD)} true vertical depth and running a ${fmtFt(A.lateral)} lateral above the oil–water contact. ` +
  `${WORDS[COMPLETED]} further wells are shown, one of them a deep exploration well to the Marrat. ` +
  `Formations from surface: ${FORMATIONS.map((f) => f.name).join(", ")}. Depths are illustrative.`;

export default function DirectionH() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main id="top">
        <Hero />
        <CompanyKpis />
        <GroupKpis />
        <Teams />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 max-w-[96rem] items-center gap-4 px-4 sm:px-8">
        <a href="#top" className="flex min-w-0 items-center gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary">
            <img src="/koc-logo.svg" alt="" className="size-7" />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold">{GROUP.abbr} Engineering Hub</span>
            <span className="block truncate text-2xs text-muted-foreground">{GROUP.company}</span>
          </span>
        </a>
        <nav aria-label="Page sections" className="ml-auto hidden items-center text-sm md:flex">
          {[
            ["Overview", "#top"],
            ["Indicators", "#kpis"],
            ["Teams", "#teams"],
          ].map(([label, href], i) => (
            <span key={href} className="flex items-center">
              {i > 0 && <span aria-hidden="true" className="px-1 text-muted-foreground/60">|</span>}
              <a
                href={href}
                className="rounded-sm px-2 py-1 text-muted-foreground transition-colors duration-fast ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                {label}
              </a>
            </span>
          ))}
        </nav>
        <a
          href="#teams"
          className="ml-auto inline-flex h-9 shrink-0 items-center gap-2 rounded-sm bg-foreground px-3 text-sm font-medium text-background transition-colors duration-fast ease-out hover:bg-foreground/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:ml-4"
        >
          {DASHBOARD_COUNT} dashboards
          <ArrowDownRight className="size-4" aria-hidden="true" />
        </a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section aria-labelledby="hero-title" className="border-b">
      <div className="mx-auto grid max-w-[96rem] lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[minmax(22rem,5fr)_minmax(0,9fr)]">
        {/* Asset panel */}
        <div className="flex flex-col gap-7 px-4 pt-8 pb-8 sm:px-8 lg:py-10">
          <p className="text-xs text-muted-foreground">
            {GROUP.company} <span aria-hidden="true">/</span> {GROUP.directorate}
          </p>
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              <span className="text-sm text-muted-foreground">{GROUP.abbr}</span>
              <span className="rounded-sm bg-primary px-1.5 py-0.5 text-2xs font-medium text-primary-foreground">
                {TEAMS.length} teams
              </span>
              <span className="rounded-sm bg-foreground px-1.5 py-0.5 text-2xs font-medium text-background">
                {DASHBOARD_COUNT} dashboards
              </span>
            </div>
            <TwoWeight
              as="h1"
              id="hero-title"
              light="Drilling & Workover"
              strong="Engineering Group"
              className="text-4xl leading-[1.05] sm:text-5xl lg:text-4xl xl:text-5xl 2xl:text-6xl"
            />
          </div>
          <p className="max-w-md text-base leading-relaxed text-muted-foreground">
            {greeting()}, {VIEWER.firstName}.{" "}
            <span className="text-foreground">Every dashboard the group runs, in one place</span> — eight teams,
            from contracts to well intervention, one click from the field they serve.
          </p>

          {/* Mineralsoft's legend: coloured square, name, readout on the right. */}
          <dl className="max-w-md divide-y border-y text-sm">
            <LegendRow swatch="bg-primary" term="Active well">
              KOP {fmtFt(A.kop)} · {BUILDS.join("→")}°/100 ft
            </LegendRow>
            <LegendRow swatch="bg-primary/40" term="Landing, lateral">
              {fmtFt(LANDING_TVD)} TVD · {fmtFt(A.lateral)}
            </LegendRow>
            <LegendRow swatch="bg-foreground" term="Completed wells">
              {COMPLETED} · 1 to the Marrat
            </LegendRow>
            <LegendRow swatch="bg-chart-2" term="Oil column">
              OWC {fmtFt(BURGAN_OWC)}
            </LegendRow>
          </dl>

          {/* "My Units / My Hubs" tiles → jumps into the page. */}
          <div className="mt-auto grid max-w-md grid-cols-3 gap-1.5">
            <JumpTile href="#teams" count={String(TEAMS.length).padStart(2, "0")} label="Teams" tone="primary" />
            <JumpTile href="#teams" count={String(DASHBOARD_COUNT)} label="Dashboards" tone="ink" />
            <JumpTile
              href="#kpis"
              count={String(KPIS.length + COMPANY_KPIS.length).padStart(2, "0")}
              label="Indicators"
              tone="ghost"
            />
          </div>
        </div>

        {/* Map → section view. One rig card: floating over the view on wide
            screens (Mineralsoft's placement), in flow beneath it otherwise. */}
        <div className="relative flex flex-col border-t lg:border-t-0 lg:border-l">
          <div className="relative h-[34rem] sm:h-[40rem] lg:h-auto lg:min-h-[40rem] lg:flex-1">
            <FieldScene caption={SCENE_CAPTION} />
          </div>
          <RigCard className="mx-4 mb-8 sm:mx-8 sm:max-w-sm xl:absolute xl:bottom-6 xl:left-6 xl:m-0 xl:w-60" />
        </div>
      </div>
    </section>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function LegendRow({ swatch, term, children }: { swatch: string; term: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="flex shrink-0 items-center gap-2 text-foreground">
        <span aria-hidden="true" className={cn("size-2 shrink-0", swatch)} />
        {term}
      </dt>
      <dd className="text-right font-mono text-xs text-muted-foreground">{children}</dd>
    </div>
  );
}

function JumpTile({ href, count, label, tone }: { href: string; count: string; label: string; tone: "primary" | "ink" | "ghost" }) {
  return (
    <a
      href={href}
      className={cn(
        "group relative flex aspect-[5/4] flex-col justify-between overflow-hidden rounded-sm p-3 transition-colors duration-fast ease-out",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        tone === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
        tone === "ink" && "bg-foreground text-background hover:bg-foreground/85",
        tone === "ghost" && "border bg-card text-foreground hover:bg-muted",
      )}
    >
      <span className="text-xs tabular-nums opacity-80">{count}</span>
      {/* The stacked-sheets glyph from Mineralsoft's tiles, in CSS. */}
      <span aria-hidden="true" className="absolute top-3 right-3 h-6 w-9">
        <span className="absolute inset-0 translate-x-1.5 -translate-y-1 rotate-6 rounded-[2px] bg-current opacity-20" />
        <span className="absolute inset-0 translate-x-0.5 -rotate-3 rounded-[2px] bg-current opacity-35" />
        <span className="absolute inset-0 -translate-x-1 translate-y-1 rounded-[2px] bg-current opacity-60 transition-transform duration-base ease-out group-hover:-translate-y-0.5" />
      </span>
      <span className="text-sm font-medium">{label}</span>
    </a>
  );
}

// ── KPIs ────────────────────────────────────────────────────────────────────

function CompanyKpis() {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <section id="kpis" aria-labelledby="company-title" className="border-b">
      <div className="mx-auto max-w-[96rem] px-4 py-14 sm:px-8 lg:py-20">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
          <TwoWeight id="company-title" light="Kuwait Oil Company," strong="at a glance." className="text-3xl sm:text-4xl" />
          <div className="max-w-md lg:justify-self-end">
            <Eyebrow>Company headline · placeholder</Eyebrow>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Four figures above the group&apos;s own.{" "}
              <span className="text-foreground">None is a published KOC number</span> — magnitudes are plausible so
              the type can be judged; as of {DATA_AS_OF}.
            </p>
          </div>
        </div>
        <div ref={ref} className="mt-10 grid grid-cols-1 border-t sm:grid-cols-2 xl:grid-cols-4">
          {COMPANY_KPIS.map((k) => (
            <article
              key={k.id}
              className="flex flex-col gap-3 border-b py-6 sm:px-6 sm:[&:nth-child(odd)]:pl-0 xl:border-b-0 xl:border-l xl:first:border-l-0 xl:first:pl-0 sm:[&:nth-child(even)]:border-l"
            >
              <Eyebrow tone="ink" className="text-2xs tracking-wide uppercase">
                {k.tag.toLowerCase()}
              </Eyebrow>
              <KpiFigure k={k} start={inView} className="text-5xl leading-none font-light tracking-tight" />
              <div>
                <h3 className="text-sm font-medium">{k.label}</h3>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{k.description}</p>
              </div>
              <div className="mt-auto flex items-end justify-between gap-4 pt-2">
                <Delta k={k} />
                <TickHistogram values={k.trend} className="w-28" lead={0} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function GroupKpis() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [lead, ...rest] = [KPIS.find((k) => k.id === "wells")!, ...KPIS.filter((k) => k.id !== "wells")];
  return (
    <section aria-labelledby="group-title" className="border-b bg-muted/40">
      <div className="mx-auto max-w-[96rem] px-4 py-14 sm:px-8 lg:py-20">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
          <TwoWeight id="group-title" light="Drilling & Workover," strong="this period." className="text-3xl sm:text-4xl" />
          <div className="max-w-md lg:justify-self-end">
            <Eyebrow>{GROUP.abbr} · {KPIS.length} indicators · placeholder</Eyebrow>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Green and red come from what each figure is <span className="text-foreground">for</span>, never from
              which way it moved: fewer days per well is good, more NPT is not, and a rig count is neither.
            </p>
          </div>
        </div>
        <div ref={ref} className="mt-10 grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
          <LeadPanel k={lead} start={inView} />
          {rest.map((k) => (
            <KpiWidget key={k.id} k={k} start={inView} />
          ))}
          <article className="flex flex-col justify-between gap-4 rounded-sm border border-dashed p-5">
            <Eyebrow tone="ink">Source</Eyebrow>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Daily drilling reports, synced overnight. <span className="text-foreground">Every figure here is a placeholder</span> until
              the feeds are connected.
            </p>
            <p className="font-mono text-2xs text-muted-foreground">As of {DATA_AS_OF}</p>
          </article>
        </div>
      </div>
    </section>
  );
}

/** The orange "Spar Platform Productivity" panel, in KOC primary. */
function LeadPanel({ k, start }: { k: Kpi; start: boolean }) {
  return (
    <article className="flex flex-col gap-4 rounded-sm bg-primary p-5 text-primary-foreground sm:col-span-2 xl:row-span-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-2xs tracking-wide text-primary-foreground/75 uppercase">{k.tag}</p>
          <h3 className="mt-1 text-xl leading-tight font-light">
            {k.label.split(" ")[0]}
            <br />
            <span className="font-medium">{k.label.split(" ").slice(1).join(" ")}</span>
          </h3>
        </div>
        <Delta k={k} onFill className="text-right" />
      </div>
      <KpiFigure k={k} start={start} className="text-6xl leading-none font-light tracking-tight" unitClassName="text-primary-foreground/75" />
      <p className="max-w-sm text-xs leading-relaxed text-primary-foreground/80">{k.description}</p>
      <HatchBars values={k.trend} className="mt-auto h-32 text-primary-foreground" />
    </article>
  );
}

/** "Today Mined Oil ····· 13,642 barrels", with its tick histogram. */
function KpiWidget({ k, start }: { k: Kpi; start: boolean }) {
  return (
    <article className="flex flex-col gap-3 rounded-sm border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm leading-snug font-medium">{k.label}</h3>
        <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">{k.tag}</span>
      </div>
      <KpiFigure k={k} start={start} className="self-end text-4xl leading-none font-light tracking-tight" />
      <TickHistogram values={k.trend} />
      <div className="flex items-center justify-between gap-2">
        <Delta k={k} />
      </div>
      <p className="sr-only">{k.description}</p>
    </article>
  );
}

// ── Teams ───────────────────────────────────────────────────────────────────

function Teams() {
  return (
    <section id="teams" aria-labelledby="teams-title">
      <div className="mx-auto max-w-[96rem] px-4 py-14 sm:px-8 lg:py-20">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
          <TwoWeight id="teams-title" light="Eight teams," strong={`${DASHBOARD_COUNT} dashboards.`} className="text-3xl sm:text-4xl" />
          <div className="max-w-md lg:justify-self-end">
            <Eyebrow>Directory</Eyebrow>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Power BI reports, SharePoint registers and the group&apos;s own web apps.{" "}
              <span className="text-foreground">Each opens in a new tab</span>, so this page stays where you left it.
            </p>
          </div>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-1.5 md:grid-cols-2 xl:grid-cols-4">
          {TEAMS.map((t) => (
            <TeamCard key={t.code} team={t} />
          ))}
        </div>
      </div>
    </section>
  );
}

function TeamCard({ team }: { team: Team }) {
  const id = `team-${team.code}`;
  const n = team.links.length;
  const split = (Object.keys(PLATFORM_LABEL) as Platform[])
    .map((p) => ({ p, count: team.links.filter((l) => l.platform === p).length }))
    .filter((x) => x.count > 0);
  return (
    <article aria-labelledby={id} className="flex flex-col rounded-sm border bg-card">
      {/* Mineralsoft's dark tab: "Insight 1 / The Fragmentation Issue". */}
      <h3 id={id} className="self-start rounded-tl-sm rounded-br-sm bg-foreground px-3 py-1.5 text-xs text-background">
        <span className="font-mono text-background/65">{team.code}</span>
        <span aria-hidden="true" className="px-1.5 text-background/45">/</span>
        <span className="font-medium">{team.shortName}</span>
      </h3>
      <div className="px-4 pt-3 pb-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {team.abbr && <span className="mr-1.5 font-medium text-foreground">{team.abbr}.</span>}
          {team.blurb}
        </p>
        <p className="sr-only">{team.name}</p>
      </div>
      <ul className="border-t">
        {team.links.map((l) => {
          const Icon = PLATFORM_ICON[l.platform];
          return (
            <li key={l.id} className="border-b">
              <DashboardAnchor
                link={l}
                className={cn(
                  "group flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-fast ease-out hover:bg-muted",
                  "focus-visible:relative focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                )}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1">{l.label}</span>
                <span aria-hidden="true" className="shrink-0 text-2xs text-muted-foreground">
                  {PLATFORM_LABEL[l.platform]}
                </span>
                <ArrowUpRight
                  className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-fast ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary"
                  aria-hidden="true"
                />
              </DashboardAnchor>
            </li>
          );
        })}
      </ul>
      {/* The insight card's foot: a big light count and a split bar. */}
      <div className="mt-auto flex items-end justify-between gap-4 px-4 pt-6 pb-4">
        <p className="flex items-baseline gap-1.5">
          <span className="text-4xl leading-none font-light tabular-nums">{String(n).padStart(2, "0")}</span>
          <span className="text-xs text-muted-foreground">{n === 1 ? "dashboard" : "dashboards"}</span>
        </p>
        <div className="w-24" aria-hidden="true">
          <div className="flex h-1.5 gap-px">
            {split.map(({ p, count }) => (
              <span
                key={p}
                className={cn(
                  "h-full",
                  p === "power-bi" && "bg-primary",
                  p === "sharepoint" && "bg-foreground",
                  p === "web-app" && "bg-chart-2",
                )}
                style={{ flexGrow: count }}
              />
            ))}
          </div>
          <p className="mt-1.5 text-right text-2xs text-muted-foreground">
            {split.map(({ p, count }) => `${count} ${SHORT_PLATFORM[p]}`).join(" · ")}
          </p>
        </div>
      </div>
    </article>
  );
}

const SHORT_PLATFORM: Record<Platform, string> = { "power-bi": "BI", sharepoint: "SP", "web-app": "App" };

function SiteFooter() {
  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto flex max-w-[96rem] flex-col gap-3 px-4 py-8 text-xs text-muted-foreground sm:px-8 md:flex-row md:items-center md:justify-between">
        <p>
          {GROUP.name} · {GROUP.directorate} · {GROUP.company}
        </p>
        <p className="max-w-xl md:text-right">
          Dashboard names, links and figures are placeholders. The cutaway is illustrative: formation names and order
          follow published Kuwait stratigraphy; depths are not any well&apos;s tops.
        </p>
      </div>
    </footer>
  );
}
