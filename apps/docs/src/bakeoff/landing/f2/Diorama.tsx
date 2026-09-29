/**
 * v2's showpiece: v1's WebGL2 diorama, moved out of the way of daily use and
 * into the footer, where it has the full width to itself and nothing
 * functional sits on or under it.
 *
 * - Lazy: the WebGL code is not even downloaded until the footer is within
 *   600px of the viewport. The engine then pauses itself offscreen and in a
 *   hidden tab, and renders one still frame under reduced motion.
 * - Told in order here (Bahra 1936 → today), because in a footer it is read,
 *   not landed on. Chapter IV's team markers jump back up to the directory.
 * - An APG carousel, as in v1: the canvas is decoration (`aria-hidden`), the
 *   words carry everything, chapters change only when asked.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, ExternalLink, Minus, Plus } from "lucide-react";

import { Button, cn } from "@koc/ui";

import { TEAMS } from "../data";
import { useReducedMotion } from "../shared";
import { CHAPTERS, OPENING } from "./history";
import { Fallback } from "./Fallback";
import type { Engine, EngineState } from "./gl/engine";
import { FOCUS, TEAM_ANCHORS } from "./gl/anchors";
import type { V3 } from "./gl/math";

/** Scroll to an in-page target and move focus there. Buttons, never `href="#…"`: the viewer is hash-routed. */
export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduced =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.dataset.forceReducedMotion === "true";
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  el.focus({ preventScroll: true });
}

export function Diorama() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const hotspotRefs = useRef(new Map<string, HTMLElement>());
  const discoverRef = useRef<HTMLButtonElement>(null);
  const [near, setNear] = useState(false);
  const [chapter, setChapter] = useState(OPENING);
  const [discover, setDiscover] = useState(false);
  const [paused, setPaused] = useState(false);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const reduced = useReducedMotion();
  const still = reduced || paused;
  const stillRef = useRef(still);
  stillRef.current = still;
  const chapterRef = useRef(chapter);
  chapterRef.current = chapter;
  const panelId = useId();

  // Hotspots may only occupy the area between the chapter text's top bar and the chapter index.
  const sectionRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const safe = useRef({ w: 0, top: 0, bottom: 0 });
  useEffect(() => {
    const sec = sectionRef.current, nav = navRef.current;
    if (!sec || !nav) return;
    const measure = () => {
      safe.current = { w: sec.clientWidth, top: 64, bottom: nav.offsetTop - 6 };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(sec);
    return () => ro.disconnect();
  }, []);

  // Lazy-mount: nothing WebGL is fetched until the footer approaches.
  useEffect(() => {
    const sec = sectionRef.current;
    if (!sec || near) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(sec);
    return () => io.disconnect();
  }, [near]);

  // Per frame: move the hotspots with the camera, by direct DOM writes (60 fps
  // must never re-render React). Outside the safe area a hotspot is
  // `visibility: hidden`, which also takes it out of the tab order.
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
      el.style.setProperty("--f2-pulse", pulse(s.time, k).toFixed(3));
      const flip = p[0] > w - 230 ? "true" : "false";
      if (el.dataset.f2Flip !== flip) el.dataset.f2Flip = flip;
    };
    for (const [code, el] of hotspotRefs.current) place(el, TEAM_ANCHORS[code], code.charCodeAt(3));
    if (discoverRef.current) place(discoverRef.current, FOCUS[s.chapter], 0);
  }, []);

  useEffect(() => {
    if (!near) return;
    const canvas = canvasRef.current, probe = probeRef.current;
    if (!canvas || !probe) return;
    // `#/landing/f2?gl=off` shows the no-WebGL fallback on any machine, for review.
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
          (window as unknown as { __dioramaF2?: unknown }).__dioramaF2 = engine.debug;
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
  }, [near, onFrame]);

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
      aria-labelledby="f2-story-h"
      className="relative isolate flex h-[640px] flex-col overflow-hidden"
    >
      <canvas ref={canvasRef} aria-hidden="true" className={cn("absolute inset-0 -z-10 size-full", failed && "hidden")} />
      {failed && <Fallback />}
      <span ref={probeRef} aria-hidden="true" className="hidden" />

      <div className="flex items-start justify-between gap-4 px-4 pt-5 sm:px-8 sm:pt-7">
        <h2 id="f2-story-h" className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
          Burgan
          <span aria-hidden="true" className="h-px w-8 bg-current opacity-50" />
          <span>Kuwait's oil, in four chapters</span>
        </h2>
        {!failed && (
          <button
            type="button"
            onClick={() => setPaused((v) => !v)}
            aria-pressed={!still}
            disabled={reduced}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3 text-xs font-medium text-foreground transition-colors duration-fast ease-out hover:bg-background/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
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
      </div>

      <div aria-live="polite" className="relative flex flex-1 flex-col px-4 sm:px-8">
        {CHAPTERS.map((ch, i) => (
          <div
            key={ch.numeral}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${CHAPTERS.length}: ${ch.title}`}
            hidden={i !== chapter}
            className={cn(
              "mt-6 max-w-[30rem] sm:mt-10",
              i === chapter && !still && "animate-in fade-in slide-in-from-left-3 duration-slower ease-out",
            )}
          >
            <p className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
              <span className="tabular-nums">{ch.numeral}</span>
              <span aria-hidden="true" className="h-px w-8 bg-current opacity-50" />
              <span>{ch.year}</span>
            </p>
            <h3 className="mt-3 text-4xl font-light leading-[1.02] tracking-tight text-foreground sm:text-6xl">{ch.title}</h3>
            <p className="mt-4 max-w-md text-sm font-light leading-relaxed text-foreground/80 sm:text-md">
              {failed && ch.bodyStill ? ch.bodyStill : ch.body}
            </p>
            {i === 3 ? (
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Button size="sm" className="rounded-full px-4" onClick={() => scrollToId("f2-directory")}>
                  Back to the dashboards
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button size="sm" variant="outline" className="rounded-full bg-background/70 px-4 backdrop-blur" onClick={() => go(0)}>
                  <ArrowLeft aria-hidden="true" />
                  From the beginning
                </Button>
              </div>
            ) : (
              <div className="mt-5">
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
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Hotspots are zero-size points: the ring centres on the point, the
          label sits to its right, or its left near the right edge. */}
      {!today && !failed && near && (
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

      {today && !failed && near && (
        <ul aria-label="Teams on the rig pad" className="pointer-events-none absolute inset-0 z-10">
          {TEAMS.map((t) => (
            <li key={t.code}>
              <button
                ref={(el) => {
                  if (el) hotspotRefs.current.set(t.code, el);
                  else hotspotRefs.current.delete(t.code);
                }}
                type="button"
                onClick={() => scrollToId(`f2-team-${t.code.toLowerCase()}`)}
                className="group pointer-events-auto absolute left-0 top-0 size-0 opacity-0 focus-visible:outline-none"
                style={{ transform: "translate3d(-100px,-100px,0)", visibility: "hidden" }}
              >
                <Ring />
                <span className={cn(LABEL, "font-semibold tabular-nums tracking-wide")}>
                  {t.code}
                  <span className="hidden font-normal text-muted-foreground md:inline"> · {t.shortName}</span>
                </span>
                <span className="sr-only"> — {t.name}: go to its dashboards</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <nav ref={navRef} aria-label="Chapters" className="relative z-20 px-4 pb-5 sm:px-8">
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
  "pointer-events-auto absolute left-4 top-0 -translate-y-1/2 whitespace-nowrap rounded-full bg-background/75 px-2 py-0.5 text-2xs font-medium text-foreground backdrop-blur transition-colors duration-fast ease-out group-hover:bg-background group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring group-data-[f2-flip=true]:left-auto group-data-[f2-flip=true]:right-4";

/** The hotspot ring, centred on the point. Its pulse comes from the render loop via --f2-pulse, so it stops with the loop. */
function Ring() {
  return (
    <span aria-hidden="true" className="pointer-events-auto absolute -left-2.5 -top-2.5 grid size-5 place-items-center">
      <span
        className="absolute inset-0 rounded-full border border-primary/70"
        style={{ transform: "scale(calc(1 + var(--f2-pulse, 0) * 0.55))", opacity: "calc(1 - var(--f2-pulse, 0) * 0.8)" }}
      />
      <span className="size-2 rounded-full bg-primary ring-2 ring-background/80" />
    </span>
  );
}
