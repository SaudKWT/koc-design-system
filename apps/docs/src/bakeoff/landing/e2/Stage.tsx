/**
 * The showpiece, moved to where it costs nothing: a large footer.
 *
 * v1's hero — a live tour down one illustrative horizontal well, rig floor to
 * PDC bit — now closes the page instead of opening it. It mounts only when
 * the footer comes within reach (IntersectionObserver), pauses off screen and
 * in hidden tabs, stops under reduced motion, and no dashboard link, figure
 * or the search field ever sits over or under it.
 */

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

import { cn } from "@koc/ui";

import { useReducedMotion } from "../shared";
import { CHAPTERS } from "./gl/chapters";
import { WellScene } from "./gl/scene";
import { CASING, FORMATIONS, OPEN_HOLE, TD, station } from "./gl/well";

export function WellStage({ id }: { id: string }) {
  const reduced = useReducedMotion();
  const stageRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const mdRef = useRef<HTMLSpanElement>(null);
  const tvdRef = useRef<HTMLSpanElement>(null);
  const incRef = useRef<HTMLSpanElement>(null);
  const sceneRef = useRef<WellScene | null>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const [chapter, setChapter] = useState(0);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);

  // Lazy-mount: nothing is built until the footer is within ~a screen.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setArmed(true);
          io.disconnect();
        }
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!armed) return;
    let scene: WellScene;
    try {
      scene = new WellScene({
        canvas: canvasRef.current!,
        tokenRoot: stageRef.current!,
        labelLayer: labelsRef.current!,
        hud: { md: mdRef.current, tvd: tvdRef.current, inc: incRef.current },
        onChapter: setChapter,
        shift: () => (window.innerWidth >= 1024 ? 0.3 : 0),
        avoid: () => [copyRef, captionRef].map((r) => r.current?.getBoundingClientRect()),
        frame: () => bandRef.current?.getBoundingClientRect(),
        onDegrade: () => setPaused(true),
      });
    } catch {
      // No WebGL2, or a software rasteriser: show the flat well plan instead.
      setFailed(true);
      setChapter(1);
      return;
    }
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [armed]);

  useEffect(() => sceneRef.current?.setReduced(reduced), [reduced, failed, armed]);
  useEffect(() => sceneRef.current?.setPaused(paused), [paused, failed, armed]);

  // Drag nudges the view. Pointer-only enhancement; the tour needs none of it.
  const drag = useRef<{ x: number; y: number } | null>(null);

  const c = CHAPTERS[chapter];
  const motion = !reduced;

  return (
    <section
      ref={stageRef}
      id={id}
      aria-labelledby="dwe2-stage-title"
      // Always dark, as in v1: machined steel reads on a dark field.
      className="dwe2-stage dark relative isolate flex min-h-[max(40rem,84svh)] scroll-mt-0 flex-col overflow-hidden text-foreground"
    >
      {failed ? (
        <WellProfileFallback />
      ) : armed ? (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="absolute inset-0 z-0 size-full cursor-grab touch-pan-y active:cursor-grabbing"
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, y: e.clientY };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            sceneRef.current?.nudge(e.clientX - drag.current.x, e.clientY - drag.current.y);
            drag.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        />
      ) : null}
      <div aria-hidden="true" className="dwe2-sidescrim pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-[52%] lg:block" />
      <div ref={labelsRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 overflow-hidden" />

      <div ref={copyRef} className="dwe2-scrim relative z-20 px-4 pt-12 pb-4 sm:px-8 lg:max-w-[34rem] lg:pt-16">
        <div className="flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.2em] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          Wellpath · the well behind the dashboards
        </div>
        <h2
          id="dwe2-stage-title"
          className="mt-4 text-[clamp(2rem,4.2vw,3.6rem)] font-semibold uppercase leading-[0.92] tracking-[-0.035em]"
        >
          From rig floor to bit
        </h2>
        <p className="mt-4 max-w-[28rem] text-sm leading-relaxed text-muted-foreground sm:text-base">
          A tour down one illustrative horizontal well — a 2,000 hp land rig, a build–hold–build profile landing in the
          Burgan Third Sand, 20″, 13⅜″ and 9⅝″ casing, and a rotary-steerable BHA ending in an 8½″ PDC bit. Every part
          is modelled from standard dimensions.
        </p>
      </div>

      {/* On narrow screens the scene gets its own band instead of sitting behind the copy. */}
      <div ref={bandRef} aria-hidden="true" className="pointer-events-none h-[52svh] min-h-72 lg:hidden" />

      <div className="relative z-20 flex flex-col gap-4 px-4 pb-8 sm:px-8 lg:mt-auto lg:flex-row lg:items-end lg:justify-between">
        <div
          key={c.id}
          ref={captionRef}
          className={cn(
            "max-w-md rounded-sm border border-foreground/15 bg-background/75 p-4 backdrop-blur-md lg:w-[27rem]",
            motion && "animate-in fade-in-0 slide-in-from-bottom-2 duration-slower ease-out",
          )}
        >
          <div className="flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-primary">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
            {c.eyebrow}
          </div>
          <p className="mt-2 text-lg font-semibold uppercase leading-tight tracking-tight text-foreground">{c.title}</p>
          <p className="mt-1.5 text-sm leading-snug text-muted-foreground">{c.detail}</p>
          <p className="mt-3 border-t border-foreground/10 pt-2 font-mono text-2xs uppercase tracking-wider text-muted-foreground">
            Illustrative well — not a KOC well
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          <div aria-hidden="true" className={cn("hidden gap-6 font-mono text-2xs uppercase tracking-wider text-muted-foreground", !failed && "sm:flex")}>
            <Readout label="MD" unit="ft" valueRef={mdRef} />
            <Readout label="TVD" unit="ft" valueRef={tvdRef} />
            <Readout label="Inc" unit="°" valueRef={incRef} />
          </div>
          <nav aria-label="Well tour" hidden={failed} className="flex flex-wrap items-center gap-1.5">
            {CHAPTERS.map((ch, i) => (
              <button
                key={ch.id}
                type="button"
                aria-current={i === chapter ? "step" : undefined}
                onClick={() => sceneRef.current?.goTo(i)}
                disabled={failed}
                className={cn(
                  "group flex h-9 items-center gap-2 rounded-sm border px-2.5 font-mono text-2xs uppercase tracking-wider backdrop-blur transition-colors duration-fast ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50",
                  i === chapter
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-foreground/15 bg-background/70 text-foreground hover:border-primary hover:text-primary",
                )}
              >
                <span className={i === chapter ? "opacity-80" : "text-muted-foreground group-hover:text-primary"}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                {ch.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-pressed={paused}
              disabled={failed || reduced}
              className="inline-flex size-9 items-center justify-center rounded-sm border border-foreground/15 bg-background/70 text-foreground backdrop-blur transition-colors duration-fast ease-out hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
            >
              {paused || reduced ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
              <span className="sr-only">Pause the well tour</span>
            </button>
          </nav>
        </div>
      </div>
    </section>
  );
}

function Readout({ label, unit, valueRef }: { label: string; unit: string; valueRef: React.RefObject<HTMLSpanElement | null> }) {
  return (
    <div className="min-w-[5rem]">
      <div>{label}</div>
      <div className="mt-1 text-base tabular-nums tracking-tight text-foreground">
        <span ref={valueRef}>0</span>
        <span className="ml-1 text-2xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

/** Without WebGL2 (or on a software rasteriser): the same well as a flat engineering section. */
function WellProfileFallback() {
  const pts = Array.from({ length: 160 }, (_, i) => station((TD * i) / 159));
  const maxX = 4700;
  const maxY = 4950;
  const x = (d: number) => 60 + (d / maxX) * 880;
  const y = (t: number) => 40 + (t / maxY) * 560;
  const bottoms = [...FORMATIONS.slice(1).map((f) => f.top), 4900];
  const mark = (md: number, text: string, dy = -10, end = false) => {
    const s = station(md);
    return (
      <g key={text}>
        <circle cx={x(s.disp)} cy={y(s.tvd)} r={4.5} className="fill-primary" />
        <text
          x={x(s.disp) + (end ? -10 : 10)}
          y={y(s.tvd) + dy}
          textAnchor={end ? "end" : "start"}
          fontSize={11}
          fill="currentColor"
          fontFamily="var(--font-mono)"
          className="text-foreground"
        >
          {text.toUpperCase()}
        </text>
      </g>
    );
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1000 640"
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-x-0 top-[40%] z-0 h-[45%] w-full text-muted-foreground lg:inset-y-[12%] lg:left-auto lg:right-[2%] lg:h-auto lg:w-[55%]"
    >
      {FORMATIONS.map((f, i) => (
        <g key={f.name}>
          <rect x={20} width={960} y={y(f.top)} height={y(bottoms[i]) - y(f.top)} className="fill-primary" fillOpacity={i % 2 ? 0.05 : 0.1} />
          <line x1={20} x2={980} y1={y(f.top)} y2={y(f.top)} stroke="currentColor" strokeOpacity={0.35} />
          <text x={976} y={(y(f.top) + y(bottoms[i])) / 2 + 3.5} fontSize={9.5} textAnchor="end" fill="currentColor" fontFamily="var(--font-mono)">
            {f.name.toUpperCase()}
          </text>
        </g>
      ))}
      <line x1={20} x2={980} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity={0.5} />
      <polyline
        points={pts.map((s) => `${x(s.disp)},${y(s.tvd)}`).join(" ")}
        fill="none"
        className="text-primary"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinejoin="round"
      />
      {mark(CASING[1].shoe, "13⅜″ shoe · 1,600 ft")}
      {mark(3000, "KOP · 3,000 ft")}
      {mark(OPEN_HOLE.top, "Lands · 9⅝″ shoe", 20)}
      {mark(TD, "TD · 8,150 ft MD", 20, true)}
    </svg>
  );
}
