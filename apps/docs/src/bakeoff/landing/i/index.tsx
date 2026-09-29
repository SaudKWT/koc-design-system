/**
 * Direction I — "Exploded View", after INFRA Technology Group (Redis Agency).
 *
 * INFRA's craft, ported rather than copied: clay-white technical models on a
 * pale field with a faint blueprint panel grid on every surface; one part in
 * the brand colour; italic serif callouts on hairline leaders; a huge,
 * staggered uppercase headline set over the model; and an inner page of
 * white sheets with a small label column, numbered rows and giant numerals.
 *
 * The model is ours: an 8½ in PDC bit, exploded along its axis (gl/bit.ts).
 * The teams are its parts list.
 */

import { useEffect, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Pause, Play } from "lucide-react";

import { Button, cn } from "@koc/ui";

import {
  COMPANY_KPIS,
  DASHBOARD_COUNT,
  DATA_AS_OF,
  GROUP,
  KPIS,
  PLATFORM_LABEL,
  TEAMS,
  formatKpi,
  type DashboardLink,
  type Kpi,
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
import { Plate } from "./Plate";

const pad = (n: number) => String(n).padStart(2, "0");

export default function DirectionI() {
  const reduced = useReducedMotion();
  const [exploded, setExploded] = useState<boolean | null>(null);
  const [paused, setPaused] = useState(false);
  const [drawing, setDrawing] = useState(false);

  return (
    <main className="min-h-screen bg-background pb-3 text-foreground">
      <Hero
        reduced={reduced}
        exploded={exploded}
        setExploded={setExploded}
        paused={paused}
        setPaused={setPaused}
        drawing={drawing}
        onFallback={() => setDrawing(true)}
      />
      <div className="space-y-3 px-2 pt-3 md:px-3">
        <PartsList />
        <CompanyFigures />
        <GroupFigures />
        <Colophon />
      </div>
    </main>
  );
}

// ── Hero ────────────────────────────────────────────────────────────────────

const HEADLINE = [
  { text: "Drilling &", indent: "" },
  { text: "Workover", indent: "md:pl-[1.55em]" },
  { text: "Engineering", indent: "" },
  { text: "Group", indent: "md:pl-[2.3em]", dash: true },
];

function jumpTo(id: string, reduced: boolean) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  // Move focus with the view, so the next Tab continues from the section.
  document.getElementById(`${id}-h`)?.focus({ preventScroll: true });
}

function Hero({
  reduced,
  exploded,
  setExploded,
  paused,
  setPaused,
  drawing,
  onFallback,
}: {
  reduced: boolean;
  exploded: boolean | null;
  setExploded: (v: boolean) => void;
  paused: boolean;
  setPaused: (v: boolean) => void;
  /** The plate fell back to its line drawing — no model to explode or pause. */
  drawing: boolean;
  onFallback: () => void;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(r);
  }, []);

  return (
    <section
      aria-labelledby="i-title"
      className={cn(
        "relative isolate m-2 overflow-hidden rounded-2xl border md:m-3",
        "bg-[radial-gradient(120%_95%_at_68%_42%,color-mix(in_oklab,var(--primary)_10%,var(--background))_0%,var(--background)_72%)]",
      )}
    >
      <div className="relative flex flex-col px-4 md:px-8 lg:min-h-[calc(100svh-1.5rem)]">
        {/* Meta row — INFRA's small print above the headline. */}
        <div className="relative z-10 flex flex-col gap-1 pt-4 text-xs text-muted-foreground sm:flex-row sm:items-start sm:justify-between sm:gap-4 md:pt-6">
          <p>
            <span className="font-semibold text-primary">{GROUP.abbr}</span>
            <span className="mx-2 text-border" aria-hidden="true">
              /
            </span>
            {GROUP.company}
            <span className="hidden sm:inline"> · {GROUP.directorate}</span>
          </p>
          <p className="shrink-0 sm:text-right">
            <span className="hidden font-serif italic md:inline">Plate I · </span>
            Data as of {DATA_AS_OF}
          </p>
        </div>

        {/* Headline block, set over the model as INFRA sets it over the plant. */}
        <div className="pointer-events-none relative z-10 mt-10 lg:mt-[9vh]">
          <h1
            id="i-title"
            className="text-[clamp(2.75rem,5.9vw,6.9rem)] font-medium uppercase leading-[0.86] tracking-[-0.04em] text-primary"
          >
            {HEADLINE.map((l, i) => (
              <span key={l.text} className={cn("block overflow-hidden pb-[0.04em]", l.indent)}>
                <span
                  className={cn(
                    "block",
                    !reduced && "transition-transform duration-slower ease-out",
                    !reduced && !ready && "translate-y-[105%]",
                  )}
                  style={reduced ? undefined : { transitionDelay: `${i * 70}ms` }}
                >
                  {l.dash && <span aria-hidden="true">— </span>}
                  {l.text}
                </span>
              </span>
            ))}
          </h1>
          <p className="pointer-events-auto mt-6 max-w-[26rem] text-md leading-relaxed text-muted-foreground md:mt-8">
            Every dashboard the group runs, in one place:{" "}
            <span className="text-foreground">eight teams, {DASHBOARD_COUNT} links</span> across Power BI,
            SharePoint and the group’s own web apps.
          </p>
          <div className="pointer-events-auto mt-6 flex flex-wrap gap-2">
            <Button onClick={() => jumpTo("i-teams", reduced)}>
              Browse the {DASHBOARD_COUNT} dashboards
              <ArrowRight aria-hidden="true" />
            </Button>
            <Button variant="outline" onClick={() => jumpTo("i-company", reduced)}>
              Key figures
            </Button>
          </div>
        </div>

        {/* The plate. On desktop it fills the hero behind the type. */}
        <figure className="relative -mx-4 mt-6 h-[min(122vw,44rem)] md:-mx-8 lg:absolute lg:inset-0 lg:m-0 lg:h-auto">
          {/* On desktop the canvas covers only the right two-thirds, where the
              plate is: pixels under the headline would be pure fill-rate. */}
          <Plate
            exploded={exploded}
            paused={paused}
            reduced={reduced}
            onFallback={onFallback}
            className="lg:absolute lg:inset-y-0 lg:left-[34%] lg:right-0 lg:w-auto"
          />
          <figcaption className="absolute bottom-3 right-4 max-w-[17rem] text-right font-serif text-xs italic leading-snug text-muted-foreground md:right-8 lg:bottom-24 lg:left-8 lg:right-auto lg:text-left">
            {drawing
              ? "Fig. 1 — An 8½ in PDC drill bit in elevation: 16 mm cutters on the profile, API 4½ in REG pin. Drawn flat because this device has no hardware 3D."
              : "Fig. 1 — An 8½ in PDC drill bit: six blades, 16 mm cutters, API 4½ in REG pin. Modelled in code and exploded along its axis."}
          </figcaption>
        </figure>

        {/* INFRA's bottom bar, carrying this page's navigation and the plate's controls. */}
        {/* Nav centred, controls right; the left third stays empty because the
            evaluation viewer parks its own bar bottom-left. */}
        <div className="relative z-10 mb-3 mt-auto flex flex-col gap-3 rounded-xl border bg-card/90 px-3 py-2.5 backdrop-blur-sm md:mb-4 md:flex-row md:items-center md:justify-between md:px-4 lg:grid lg:grid-cols-[1fr_auto_1fr]">
          <span className="hidden lg:block" />
          <nav aria-label="On this page" className="flex flex-wrap gap-1">
            {(
              [
                ["i-teams", "Teams & dashboards"],
                ["i-company", "Company"],
                ["i-group", "Group figures"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => jumpTo(id, reduced)}
                className="rounded px-2.5 py-1.5 text-sm font-medium text-primary transition-colors duration-fast ease-out hover:bg-accent"
              >
                {label}
              </button>
            ))}
          </nav>
          <div
            role="group"
            aria-label="Plate controls"
            className="flex items-center gap-1 lg:justify-self-end"
            hidden={drawing}
          >
            {(
              [
                [false, "Assembled"],
                [true, "Exploded"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={exploded === v}
                onClick={() => setExploded(v)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-fast ease-out",
                  exploded === v
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-accent",
                )}
              >
                {label}
              </button>
            ))}
            {!reduced && (
              <button
                type="button"
                aria-pressed={paused}
                aria-label="Pause the animation"
                onClick={() => setPaused(!paused)}
                className="ml-1 inline-flex size-7 items-center justify-center rounded-full border border-input bg-background transition-colors duration-fast ease-out hover:bg-accent"
              >
                {paused ? <Play className="size-3.5" aria-hidden="true" /> : <Pause className="size-3.5" aria-hidden="true" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Sheets ──────────────────────────────────────────────────────────────────

function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn(
        className,
        !reduced && "transition-[opacity,transform] duration-slower ease-out",
        !reduced && !inView && "translate-y-4 opacity-0",
      )}
    >
      {children}
    </div>
  );
}

function Sheet({
  id,
  index,
  overline,
  title,
  note,
  children,
}: {
  id: string;
  index: string;
  overline: string;
  title: string;
  note: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-3 rounded-2xl border bg-card text-card-foreground">
      <Reveal className="grid gap-6 p-5 md:p-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
        <header className="lg:sticky lg:top-8 lg:self-start">
          <p className="font-mono text-xs text-muted-foreground">
            {index} <span aria-hidden="true">—</span> {overline}
          </p>
          <h2 id={`${id}-h`} tabIndex={-1} className="mt-3 text-2xl font-medium tracking-tight outline-none">
            {title}
          </h2>
          <p className="mt-2 font-serif text-sm italic leading-snug text-muted-foreground">{note}</p>
        </header>
        <div className="min-w-0">{children}</div>
      </Reveal>
    </section>
  );
}

// ── Parts list: the eight teams ─────────────────────────────────────────────

function PartsList() {
  return (
    <Sheet
      id="i-teams"
      index="01"
      overline="Parts list"
      title="Teams & dashboards"
      note={`Eight teams, ${DASHBOARD_COUNT} dashboards. Each opens in a new tab.`}
    >
      <ol className="border-t">
        {TEAMS.map((t) => (
          <TeamRow key={t.code} team={t} />
        ))}
      </ol>
    </Sheet>
  );
}

function TeamRow({ team: t }: { team: Team }) {
  return (
    <li className="grid gap-x-8 gap-y-4 border-b py-6 md:grid-cols-[5rem_minmax(0,1fr)] xl:grid-cols-[5rem_minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <div className="flex items-baseline gap-3 md:block">
        <span aria-hidden="true" className="text-5xl font-normal leading-none tracking-[-0.05em] text-primary tabular-nums">
          {t.index}
        </span>
        <span className="font-mono text-xs text-muted-foreground md:mt-2 md:block">{t.code}</span>
      </div>
      <div className="min-w-0">
        <h3 className="text-lg font-medium leading-snug">
          {t.shortName}
          {t.abbr && (
            <span className="ml-2 align-middle font-mono text-2xs font-normal tracking-wider text-muted-foreground">
              {t.abbr}
            </span>
          )}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{t.name}</p>
        <p className="mt-3 font-serif text-sm italic text-muted-foreground">{t.blurb}</p>
        <p className="mt-3 font-mono text-2xs uppercase tracking-wider text-muted-foreground">
          <span aria-hidden="true">Qty {pad(t.links.length)}</span>
          <span className="sr-only">{`${t.links.length} ${t.links.length === 1 ? "dashboard" : "dashboards"}`}</span>
        </p>
      </div>
      <ul className="md:col-start-2 xl:col-start-auto">
        {t.links.map((l) => (
          <li key={l.id}>
            <LinkRow link={l} />
          </li>
        ))}
      </ul>
    </li>
  );
}

function LinkRow({ link: l }: { link: DashboardLink }) {
  const Icon = PLATFORM_ICON[l.platform];
  return (
    <DashboardAnchor
      link={l}
      className="group/link flex min-h-11 items-center gap-3 rounded-sm border-b border-border py-2 text-sm transition-colors duration-fast ease-out hover:text-primary"
    >
      <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 font-medium">{l.label}</span>
      <span aria-hidden="true" className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
        {PLATFORM_LABEL[l.platform]}
      </span>
      <ArrowUpRight
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground transition-transform duration-fast ease-out group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5 group-hover/link:text-primary"
      />
    </DashboardAnchor>
  );
}

// ── Figures ─────────────────────────────────────────────────────────────────

function Delta({ k }: { k: Kpi }) {
  const d = formatDelta(k);
  // No comparison published: hold the line so the rows stay aligned.
  if (!d) return <p className="text-xs">{"\u00a0"}</p>;
  const s = kpiSentiment(k.delta, k.intent);
  const Arrow = (k.delta ?? 0) < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <p className="flex items-center gap-1 text-xs">
      <span aria-hidden="true" className={cn("inline-flex items-center gap-0.5 font-medium tabular-nums", SENTIMENT_TEXT[s])}>
        {k.delta !== 0 && <Arrow className="size-3.5" />}
        {d}
      </span>
      <span aria-hidden="true" className="text-muted-foreground">
        {k.deltaLabel}
      </span>
      <span className="sr-only">{deltaSpeech(k)}</span>
    </p>
  );
}

function Figure({ k, index, size }: { k: Kpi; index: number; size: "hero" | "cell" }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const v = useCountUp(k.value, inView);
  const hero = size === "hero";
  return (
    <div ref={ref} className={cn("flex h-full flex-col bg-card", hero ? "p-5 md:p-6" : "p-4 md:p-5")}>
      <div className="flex items-baseline justify-between font-mono text-2xs tracking-wider text-muted-foreground">
        <span>{pad(index + 1)}</span>
        <span>{k.tag}</span>
      </div>
      <p className={cn("text-sm font-medium", hero ? "mt-6" : "mt-4")}>{k.label}</p>
      <p className={cn("text-primary", hero ? "mt-2" : "mt-1.5")}>
        <span
          aria-hidden="true"
          className={cn(
            "font-normal leading-none tabular-nums",
            hero ? "text-[clamp(2.75rem,4.2vw,4.25rem)] tracking-[-0.045em]" : "text-4xl tracking-[-0.03em]",
          )}
        >
          {formatKpi(k, v)}
        </span>
        {k.unit && (
          <span aria-hidden="true" className={cn("ml-1 align-top font-medium", hero ? "text-sm" : "text-xs")}>
            {k.unit}
          </span>
        )}
        <span className="sr-only">{`${formatKpi(k, k.value)}${k.unit ? ` ${k.unit}` : ""}`}</span>
      </p>
      <div className="mt-3">
        <Delta k={k} />
      </div>
      <Sparkline values={k.trend} className={cn("mt-auto text-primary/55", hero ? "pt-6" : "pt-4")} />
      {hero && <p className="mt-3 text-xs leading-snug text-muted-foreground">{k.description}</p>}
    </div>
  );
}

function CompanyFigures() {
  return (
    <Sheet
      id="i-company"
      index="02"
      overline="Company headline"
      title="Kuwait Oil Company"
      note="Four company-wide figures. Placeholder values — none is a published KOC number."
    >
      <ul className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {COMPANY_KPIS.map((k, i) => (
          <li key={k.id}>
            <Figure k={k} index={i} size="hero" />
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function GroupFigures() {
  return (
    <Sheet
      id="i-group"
      index="03"
      overline="Group figures"
      title="Drilling & Workover"
      note={`The ${GROUP.abbr} operating strip. Placeholder values, as of ${DATA_AS_OF}.`}
    >
      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border xl:grid-cols-4">
        {KPIS.map((k, i) => (
          <li key={k.id}>
            <Figure k={k} index={i} size="cell" />
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function Colophon() {
  return (
    <footer className="flex flex-col gap-2 rounded-2xl border bg-card px-5 py-4 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
      <p>
        <span className="font-semibold text-primary">{GROUP.abbr}</span> · {GROUP.name} · {GROUP.directorate}
      </p>
      <p className="font-serif italic">Dashboard names, links and every figure on this page are placeholders.</p>
    </footer>
  );
}
