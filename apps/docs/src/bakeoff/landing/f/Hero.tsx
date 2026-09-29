/**
 * The hero: a WebGL2 diorama of Kuwait's oil history in four chapters, with
 * today's rig pad — and the eight DWEG teams pinned to it — as the opening.
 *
 * Accessibility model: an APG carousel. The canvas is decoration
 * (`aria-hidden`); everything it shows is also said in text. Chapters change
 * only when asked (no auto-rotation), and the change is announced politely.
 */

import { useCallback, useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ExternalLink, Plus, Minus } from "lucide-react";

import { Button, cn } from "@koc/ui";

import { DASHBOARD_COUNT, GROUP, TEAMS } from "../data";
import { useReducedMotion } from "../shared";
import { CHAPTERS, OPENING } from "./history";
import { Fallback } from "./Fallback";
import type { Engine, EngineState } from "./gl/engine";
import { FOCUS, TEAM_ANCHORS } from "./gl/anchors";
import type { V3 } from "./gl/math";

export function scrollToId(id: string, e?: MouseEvent) {
  e?.preventDefault();
  const el = document.getElementById(id);
  if (!el) return;
  const reduced =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.dataset.forceReducedMotion === "true";
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  el.focus({ preventScroll: true });
}

export function Hero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const hotspotRefs = useRef(new Map<string, HTMLElement>());
  const discoverRef = useRef<HTMLButtonElement>(null);
  const [chapter, setChapter] = useState(OPENING);
  const [discover, setDiscover] = useState(false);
  const [paused, setPaused] = useState(false);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const reduced = useReducedMotion();
  const still = reduced || paused;
  const stillRef = useRef(still);
  stillRef.current = still;
  // A chapter chosen before the engine has loaded is where it starts.
  const chapterRef = useRef(chapter);
  chapterRef.current = chapter;
  const panelId = useId();

  // The area hotspots may occupy: below the top bar, above the chapter index.
  const sectionRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const safe = useRef({ w: 0, top: 0, bottom: 0 });
  useEffect(() => {
    const sec = sectionRef.current, nav = navRef.current;
    if (!sec || !nav) return;
    const measure = () => {
      safe.current = { w: sec.clientWidth, top: 76, bottom: nav.offsetTop - 6 };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(sec);
    return () => ro.disconnect();
  }, []);

  // Per-frame: move the hotspots with the camera. Direct DOM writes — this
  // runs at 60 fps and must never re-render React. Off-screen or outside the
  // safe area, a hotspot is `visibility: hidden`, so it also leaves the tab
  // order: focusing a clipped link would scroll the overflow-hidden hero.
  const onFrame = useCallback((project: (p: V3) => [number, number] | null, s: EngineState) => {
    const pulse = (t: number, k: number) => (stillRef.current ? 0 : Math.sin(t * 2.2 + k) * 0.5 + 0.5);
    const { w, top, bottom } = safe.current;
    const place = (el: HTMLElement, a: V3 | undefined, k: number) => {
      const p = a && project(a);
      const inside = !!p && p[0] > 12 && p[0] < w - 12 && p[1] > top && p[1] < bottom;
      el.style.visibility = inside && s.settle > 0.02 ? "visible" : "hidden";
      if (!p || !inside) return;
      el.style.transform = `translate3d(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px, 0)`;
      el.style.opacity = String(s.settle);
      el.style.setProperty("--pulse", pulse(s.time, k).toFixed(3));
      // Labels flip to the left near the right edge, so none is clipped.
      const flip = p[0] > w - 230 ? "true" : "false";
      if (el.dataset.flip !== flip) el.dataset.flip = flip;
    };
    for (const [code, el] of hotspotRefs.current) place(el, TEAM_ANCHORS[code], code.charCodeAt(3));
    if (discoverRef.current) place(discoverRef.current, FOCUS[s.chapter], 0);
  }, []);

  // Boot the engine once, loaded after first render: the page's text, links
  // and landmarks never wait on the WebGL code. Theme flips re-read tokens.
  useEffect(() => {
    const canvas = canvasRef.current, probe = probeRef.current;
    if (!canvas || !probe) return;
    // `#/landing/f?gl=off` shows the no-WebGL fallback on any machine, so it can be reviewed.
    if (/[?&]gl=off\b/.test(window.location.hash)) {
      setFailed(true);
      return;
    }
    let disposed = false;
    let engine: Engine | undefined;
    let mo: MutationObserver | undefined;
    import("./gl/engine")
      .then(({ Engine }) => {
        if (disposed) return;
        try {
          engine = new Engine({
            canvas,
            probe,
            chapter: chapterRef.current,
            still: stillRef.current,
            onFrame,
            onStats: (fps, dpr) => {
              canvas.dataset.fps = fps.toFixed(0);
              canvas.dataset.dpr = String(dpr);
            },
          });
        } catch {
          setFailed(true);
          return;
        }
        engineRef.current = engine;
        // Dev-only tuning handle (Vite sets env.DEV; the docs tsconfig has no vite/client types).
        if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
          (window as unknown as { __dioramaF?: unknown }).__dioramaF = engine.debug;
        const e = engine;
        mo = new MutationObserver(() => e.refreshPalette());
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      mo?.disconnect();
      engine?.dispose();
      engineRef.current = null;
    };
  }, [onFrame]);

  useEffect(() => engineRef.current?.setStill(still), [still]);

  const go = (i: number) => {
    const n = (i + CHAPTERS.length) % CHAPTERS.length;
    setChapter(n);
    setDiscover(false);
    setMore(false);
    engineRef.current?.setChapter(n);
  };
  const toggleDiscover = () => {
    const on = !discover;
    setDiscover(on);
    engineRef.current?.setDiscover(on);
  };

  const today = chapter === 3;

  return (
    <section
      ref={sectionRef}
      aria-roledescription="carousel"
      aria-label="Kuwait's oil, in four chapters"
      className="relative isolate flex h-[100svh] min-h-[600px] flex-col overflow-hidden bg-background"
    >
      <canvas ref={canvasRef} aria-hidden="true" className={cn("absolute inset-0 -z-10 size-full", failed && "hidden")} />
      {failed && <Fallback />}
      <span ref={probeRef} aria-hidden="true" className="hidden" />

      {/* Top bar — Aramco's Sound becomes Motion; its hamburger becomes the way down to the dashboards. */}
      <div className="flex items-start justify-between gap-4 px-4 pt-4 sm:px-8 sm:pt-7">
        <div className="min-w-0">
          <p className="text-2xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {GROUP.company}
            <span className="hidden md:inline"> · {GROUP.directorate}</span>
          </p>
          <h1 className="mt-1 text-base font-medium tracking-tight text-foreground sm:text-lg">
            {GROUP.name}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {!failed && (
            <button
              type="button"
              onClick={() => setPaused((v) => !v)}
              aria-pressed={!still}
              disabled={reduced}
              className="group inline-flex h-9 items-center gap-2 rounded-full px-3 text-xs font-medium text-foreground transition-colors duration-fast ease-out hover:bg-background/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
            >
              <span className="sr-only sm:not-sr-only">Motion</span>
              <svg viewBox="0 0 32 12" aria-hidden="true" className="h-3 w-8 overflow-visible">
                <path
                  d="M1 6 C 5 -1, 9 -1, 12 6 S 19 13, 22 6 S 28 -1, 31 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  className={cn("transition-opacity duration-base ease-out", still ? "opacity-0" : "opacity-100")}
                />
                <path
                  d="M1 6 L 31 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  className={cn("transition-opacity duration-base ease-out", still ? "opacity-100" : "opacity-0")}
                />
              </svg>
              {reduced && <span className="sr-only"> (reduced by your system setting)</span>}
            </button>
          )}
          <a
            href="#dashboards"
            onClick={(e) => scrollToId("dashboards", e)}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-input bg-background/70 px-3 text-xs font-medium text-foreground backdrop-blur transition-colors duration-fast ease-out hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-4"
          >
            <span>
              {DASHBOARD_COUNT}
              <span className="hidden sm:inline"> dashboards</span>
              <span className="sr-only sm:hidden"> dashboards</span>
            </span>
            <ArrowDown className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>

      {/* The chapter text. Only the current slide is rendered visible. */}
      <div aria-live="polite" className="relative flex flex-1 flex-col px-4 sm:px-8">
        {CHAPTERS.map((ch, i) => (
          <div
            key={ch.numeral}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${CHAPTERS.length}: ${ch.title}`}
            hidden={i !== chapter}
            className={cn(
              "mt-[4vh] max-w-[34rem] sm:mt-[9vh] lg:mt-[14vh]",
              i === chapter && !still && "animate-in fade-in slide-in-from-left-3 duration-slower ease-out",
            )}
          >
            <p className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
              <span className="tabular-nums">{ch.numeral}</span>
              <span aria-hidden="true" className="h-px w-8 bg-current opacity-50" />
              <span>{ch.year}</span>
            </p>
            <h2 className="mt-3 text-4xl font-light leading-[1.02] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
              {ch.title}
            </h2>
            <p className="mt-4 max-w-md text-sm font-light leading-relaxed text-foreground/80 sm:mt-6 sm:text-md">
              {failed && ch.bodyStill ? ch.bodyStill : ch.body}
            </p>
            {i === 3 ? (
              <div className="mt-5 flex flex-wrap items-center gap-2 sm:mt-7">
                <Button
                  size="sm"
                  className="rounded-full px-4"
                  render={<a href="#dashboards" onClick={(e: MouseEvent) => scrollToId("dashboards", e)} />}
                >
                  Go to the {TEAMS.length} teams
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button size="sm" variant="outline" className="rounded-full bg-background/70 px-4 backdrop-blur" onClick={() => go(0)}>
                  <ArrowLeft aria-hidden="true" />
                  How it began
                </Button>
              </div>
            ) : (
              <div className="mt-5 sm:mt-7">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full bg-background/70 px-4 backdrop-blur"
                  aria-expanded={more && i === chapter}
                  aria-controls={`${panelId}-${i}`}
                  onClick={() => setMore((v) => !v)}
                >
                  {more && i === chapter ? <Minus aria-hidden="true" /> : <Plus aria-hidden="true" />}
                  Learn more
                </Button>
                <div
                  id={`${panelId}-${i}`}
                  hidden={!(more && i === chapter)}
                  className="mt-3 max-w-md rounded-lg border bg-background/80 p-4 text-sm text-foreground backdrop-blur"
                >
                  <p className="font-light leading-relaxed">{ch.more}</p>
                  {ch.sources.length > 0 && (
                    <>
                      <p className="mt-3 text-2xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Sources</p>
                      <ul className="mt-1 space-y-1">
                        {ch.sources.map((s) => (
                          <li key={s.href}>
                            <a
                              href={s.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            >
                              {s.label}
                              <ExternalLink className="size-3" aria-hidden="true" />
                              <span className="sr-only"> (opens in a new tab)</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* "Press to discover" — pinned in 3D to the chapter's subject. Each
          hotspot is a zero-size point: the ring centres on it, the label sits
          to its right, or its left near the right edge (data-flip). */}
      {!today && !failed && (
        <button
          ref={discoverRef}
          type="button"
          onClick={toggleDiscover}
          aria-pressed={discover}
          className="group absolute left-0 top-0 z-10 size-0 opacity-0 focus-visible:outline-none"
          style={{ transform: "translate3d(-100px,-100px,0)", visibility: "hidden" }}
        >
          <Ring />
          <span className={cn(LABEL, "px-2.5 uppercase tracking-[0.18em]")}>{discover ? "Step back" : "Press to discover"}</span>
        </button>
      )}

      {/* Today: the eight teams, pinned to the pad. In-page links down to each team. */}
      {today && !failed && (
        <nav aria-label="Teams on the rig pad" className="pointer-events-none absolute inset-0 z-10">
          <ul>
            {TEAMS.map((t) => (
              <li key={t.code}>
                <a
                  ref={(el) => {
                    if (el) hotspotRefs.current.set(t.code, el);
                    else hotspotRefs.current.delete(t.code);
                  }}
                  href={`#team-${t.code.toLowerCase()}`}
                  onClick={(e) => scrollToId(`team-${t.code.toLowerCase()}`, e)}
                  className="group pointer-events-auto absolute left-0 top-0 size-0 opacity-0 focus-visible:outline-none"
                  style={{ transform: "translate3d(-100px,-100px,0)", visibility: "hidden" }}
                >
                  <Ring />
                  <span className={cn(LABEL, "font-semibold tabular-nums tracking-wide")}>
                    {t.code}
                    <span className="hidden font-normal text-muted-foreground md:inline"> · {t.shortName}</span>
                  </span>
                  <span className="sr-only"> — {t.name}, go to its dashboards</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* Chapter index — Aramco's "VI — …" strip, with all four reachable. */}
      <nav ref={navRef} aria-label="Chapters" className="relative z-20 px-4 pb-16 sm:px-8 sm:pb-6">
        <div className="flex items-center justify-between gap-2 border-t border-foreground/15 pt-3">
          <button
            type="button"
            onClick={() => go(chapter - 1)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-xs font-medium text-foreground transition-colors duration-fast ease-out hover:bg-background/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Previous</span>
            <span className="sr-only sm:hidden">Previous chapter</span>
          </button>
          <ol className="flex min-w-0 items-center gap-0.5 sm:gap-2">
            {CHAPTERS.map((ch, i) => (
              <li key={ch.numeral}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={i === chapter ? "step" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-full px-2.5 text-xs transition-colors duration-fast ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-3",
                    i === chapter ? "bg-background/80 font-semibold text-foreground" : "text-muted-foreground hover:bg-background/50 hover:text-foreground",
                  )}
                >
                  <span className="tabular-nums">{ch.numeral}</span>
                  <span className={cn(i === chapter ? "inline" : "hidden lg:inline")}>
                    <span aria-hidden="true" className="mr-2 inline-block h-px w-4 bg-current align-middle opacity-50" />
                    {ch.index}
                  </span>
                  <span className="sr-only">, {ch.year}</span>
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => go(chapter + 1)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-xs font-medium text-foreground transition-colors duration-fast ease-out hover:bg-background/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="hidden sm:inline">Next</span>
            <span className="sr-only sm:hidden">Next chapter</span>
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </nav>
    </section>
  );
}

/** A hotspot's label: beside the point, flipping sides near the right edge. */
const LABEL =
  "pointer-events-auto absolute left-4 top-0 -translate-y-1/2 whitespace-nowrap rounded-full bg-background/75 px-2 py-0.5 text-2xs font-medium text-foreground backdrop-blur transition-colors duration-fast ease-out group-hover:bg-background group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring group-data-[flip=true]:left-auto group-data-[flip=true]:right-4";

/** The hotspot ring, centred on the point. Its pulse is driven from the render loop via --pulse, so it stops with the loop. */
function Ring() {
  return (
    <span aria-hidden="true" className="pointer-events-auto absolute -left-2.5 -top-2.5 grid size-5 place-items-center">
      <span
        className="absolute inset-0 rounded-full border border-primary/70"
        style={{ transform: "scale(calc(1 + var(--pulse, 0) * 0.55))", opacity: "calc(1 - var(--pulse, 0) * 0.8)" }}
      />
      <span className="size-2 rounded-full bg-primary ring-2 ring-background/80" />
    </span>
  );
}
