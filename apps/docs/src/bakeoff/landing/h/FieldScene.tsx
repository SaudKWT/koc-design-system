/**
 * The hero's asset view: the sectioned block in Mineralsoft's dashed selection
 * frame, with its dark tool strip in the frame's corner, formation call-outs
 * down the right, and pad markers on the surface.
 *
 * WebGL draws the model; everything that is TEXT is HTML/SVG positioned over it
 * from the renderer's own projection each frame, so it stays crisp, themable
 * and selectable. The canvas and the overlay are `aria-hidden`; the figure's
 * caption says in words what the picture shows.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BoxSelect, Layers, Pause, Play, ScanEye } from "lucide-react";

import { cn } from "@koc/ui";

import { useReducedMotion } from "../shared";
import { BlockRenderer, YAW_BASE, YAW_SWING, type Frame } from "./scene/BlockRenderer";
import { SectionFallback } from "./scene/Fallback";
import { fitCanvas } from "./scene/gl";
import type { Vec3 } from "./scene/math";
import { BLOCK, FORMATIONS, topDepthAt } from "./scene/strata";
import { ACTIVE_SURVEY, DEEP_SURVEY } from "./scene/surveys";
import { PADS } from "./scene/wells";
import { onThemeChange, readPalette } from "./scene/tokens";

interface Anchor {
  key: string;
  name: string;
  depth: number;
  world: Vec3;
}

/** Where each labelled formation's call-out points: the section's right-hand edge. */
function labelAnchors(): Anchor[] {
  const out: Anchor[] = [];
  const { x1, notchZ, z1, cutDepth, depth } = BLOCK;
  FORMATIONS.forEach((f, i) => {
    if (!f.labelled) return;
    const next = FORMATIONS[i + 1];
    const topHere = topDepthAt(f.top, x1, notchZ);
    const botHere = next ? topDepthAt(next.top, x1, notchZ) : depth;
    const mid = (topHere + Math.min(botHere, depth)) / 2;
    if (mid >= depth) return;
    const z = mid < cutDepth - 60 ? notchZ : z1;
    const top = topDepthAt(f.top, x1, z);
    out.push({ key: f.name, name: f.label, depth: top, world: [x1, -mid, z] });
  });
  // The Jurassic target the deep well runs out of the block to reach.
  const marrat = FORMATIONS.find((f) => f.name === "Marrat")!;
  const [sx, sz] = DEEP_SURVEY.plan.surface;
  const d = topDepthAt(marrat.top, sx, sz);
  out.push({ key: "Marrat", name: "Marrat", depth: d, world: [sx, -d - 150, sz] });
  return out;
}

const ANCHORS = labelAnchors();
const ACTIVE_TD = ACTIVE_SURVEY.tdMd;
const LABEL_GAP = 17;
const LABEL_COL = 176;

interface Layout {
  rect: Frame;
  compact: boolean;
  width: number;
  height: number;
}

export function FieldScene({ caption }: { caption: ReactNode }) {
  const reduced = useReducedMotion();
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The overlay moves every frame, so every moving piece is an HTML element
  // positioned by `transform` alone: compositor work, no repaint. (It began as
  // one full-size SVG; repainting that each frame cost ~4× the main-thread time
  // of the WebGL itself.)
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const leaderRefs = useRef<(HTMLDivElement | null)[]>([]);
  const markerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const labelsLayer = useRef<HTMLDivElement>(null);
  const bitRef = useRef<HTMLDivElement>(null);
  const bitRing = useRef<HTMLSpanElement>(null);
  const bitText = useRef<HTMLSpanElement>(null);

  const [failed, setFailed] = useState(false);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [paused, setPaused] = useState(false);
  const [cutOpen, setCutOpen] = useState(true);
  const [xray, setXray] = useState(true);
  const [labels, setLabels] = useState(true);

  // Everything the loop reads lives in one ref, so toggles never rebuild the GL.
  const ctl = useRef({
    reduced,
    paused,
    xray,
    labels,
    cutTarget: 1,
    cutP: reduced ? 1 : 0,
    intro: reduced ? 0 : 0.6,
    t: 0,
    visible: true,
    compact: false,
    kick: () => {},
  });

  useEffect(() => {
    Object.assign(ctl.current, { reduced, paused, xray, labels, cutTarget: cutOpen ? 1 : 0 });
    if (reduced) ctl.current.cutP = cutOpen ? 1 : 0;
    ctl.current.kick();
  }, [reduced, paused, xray, labels, cutOpen]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const box = boxRef.current!;
    let renderer: BlockRenderer | null = null;
    let raf = 0;
    let last = performance.now();
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    const frameTimes: number[] = [];
    let cooldown = 0;
    let lost = false;
    let rect: Frame = { x: 0, y: 0, w: 1, h: 1 };
    let cssW = 1, cssH = 1;
    const c = ctl.current;

    const create = () => {
      try {
        renderer = new BlockRenderer(canvas);
        renderer.setPalette(readPalette(box));
        return true;
      } catch {
        renderer = null;
        setFailed(true);
        return false;
      }
    };

    const doLayout = () => {
      if (!renderer) return;
      cssW = box.clientWidth;
      cssH = box.clientHeight;
      fitCanvas(canvas, dpr);
      const compact = cssW < 640;
      c.compact = compact;
      // At xl the rig card floats bottom-left over the view (see index.tsx);
      // nudge the block right so the card covers flank, not the section.
      const cardFloats = window.matchMedia("(min-width: 80rem)").matches;
      const left = cardFloats ? 96 : 40;
      const frame: Frame = compact
        ? { x: 16, y: 58, w: cssW - 32, h: cssH - 58 - 64 }
        : { x: left, y: 72, w: cssW - left - LABEL_COL - 40, h: cssH - 72 - 80 };
      renderer.layout(cssW, cssH, frame);
      const r = renderer.frameRect;
      const m = compact ? 10 : 18;
      rect = { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m };
      setLayout({ rect, compact, width: cssW, height: cssH });
    };

    const state = () => {
      const t = c.t;
      const still = c.reduced;
      const e = c.cutP * c.cutP * (3 - 2 * c.cutP);
      return {
        yaw: still ? YAW_BASE - 0.03 : YAW_BASE + YAW_SWING * Math.sin((t * Math.PI * 2) / 34),
        cut: e,
        // Drill from 20% to TD over a minute, hold at TD, go again. The plan
        // ahead of the bit stays drawn dashed, so the restart reads as a new run.
        drilled: still ? 0.74 : Math.min(1, 0.2 + ((t % 72) / 62) * 0.8),
        xray: c.xray,
      };
    };

    const overlay = (st: ReturnType<typeof state>) => {
      if (!renderer) return;
      const r = renderer;
      const px = (x: number, y: number) => `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      // Formation call-outs, stacked down a column with collisions pushed apart.
      const showLabels = c.labels && !c.compact;
      if (labelsLayer.current) labelsLayer.current.style.opacity = showLabels ? "1" : "0";
      if (showLabels) {
        const colX = rect.x + rect.w + 14;
        const items = ANCHORS.map((a, i) => ({ i, p: r.project(a.world) })).sort((a, b) => a.p[1] - b.p[1]);
        let prev = -Infinity;
        const ys = items.map((it) => {
          const y = Math.max(it.p[1], prev + LABEL_GAP);
          prev = y;
          return y;
        });
        const floorY = cssH - 12;
        if (ys.length && ys[ys.length - 1] > floorY) {
          for (let k = ys.length - 1, floor = floorY; k >= 0; k--) {
            ys[k] = Math.min(ys[k], floor);
            floor = ys[k] - LABEL_GAP;
          }
        }
        items.forEach((it, k) => {
          const el = labelRefs.current[it.i];
          const ld = leaderRefs.current[it.i];
          if (!el || !ld) return;
          el.style.transform = px(colX - 10, ys[k] - 8);
          // The leader: a 1 px rule from the anchor to the label, rotated and
          // stretched into place.
          const [ax, ay] = it.p;
          const dx = colX - 12 - ax;
          const dy = ys[k] - ay;
          ld.style.transform = `${px(ax, ay)} rotate(${Math.atan2(dy, dx).toFixed(4)}rad) scaleX(${Math.hypot(dx, dy).toFixed(1)})`;
        });
      }
      // Pad markers.
      PADS.forEach((p, k) => {
        const el = markerRefs.current[k];
        if (!el) return;
        const [x, y] = r.project([(p.x0 + p.x1) / 2, 0, (p.z0 + p.z1) / 2]);
        el.style.transform = px(x, y);
      });
      // The bit, with its live measured depth.
      const [bx, by] = r.project(r.bitPosition(st.drilled));
      if (bitRef.current) bitRef.current.style.transform = px(bx, by);
      if (bitRing.current) {
        const k = c.reduced || c.paused ? 0.5 : (c.t * 0.9) % 1;
        bitRing.current.style.transform = `translate(-50%, -50%) scale(${(0.6 + k * 1.6).toFixed(3)})`;
        bitRing.current.style.opacity = (0.9 * (1 - k)).toFixed(3);
      }
      if (bitText.current) {
        const md = Math.round((st.drilled * ACTIVE_TD) / 10) * 10;
        const txt = `MD ${md.toLocaleString("en-GB")} ft`;
        if (bitText.current.textContent !== txt) bitText.current.textContent = txt;
      }
    };

    const frame = () => {
      if (!renderer || lost) return;
      const st = state();
      renderer.render(st);
      overlay(st);
    };

    const tick = (now: number) => {
      raf = 0;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const hidden = document.hidden || !c.visible;
      const ambient = !c.reduced && !c.paused && !hidden;
      if (ambient) {
        c.t += dt;
        // Adaptive resolution: if frames run long, shed pixels before smoothness.
        frameTimes.push(dt);
        if (frameTimes.length > 45) frameTimes.shift();
        cooldown -= dt;
        const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        if (frameTimes.length === 45 && avg > 0.026 && dpr > 1 && cooldown <= 0) {
          dpr = Math.max(1, dpr - 0.25);
          frameTimes.length = 0;
          cooldown = 3;
          doLayout();
        }
      }
      let moving = false;
      if (!c.reduced && !hidden) {
        if (c.intro > 0) {
          c.intro -= dt;
          moving = true;
        } else if (Math.abs(c.cutP - c.cutTarget) > 1e-4) {
          const step = dt / 1.8;
          c.cutP = c.cutP < c.cutTarget ? Math.min(c.cutTarget, c.cutP + step) : Math.max(c.cutTarget, c.cutP - step);
          moving = true;
        }
      }
      frame();
      if (ambient || moving) raf = requestAnimationFrame(tick);
    };

    const kick = () => {
      if (raf || lost) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    c.kick = kick;

    if (!create()) return;
    doLayout();
    kick();

    const ro = new ResizeObserver(() => {
      doLayout();
      frame();
    });
    ro.observe(box);
    const io = new IntersectionObserver(([entry]) => {
      c.visible = entry.isIntersecting;
      if (c.visible) kick();
    });
    io.observe(box);
    const onVis = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener("visibilitychange", onVis);
    const offTheme = onThemeChange(() => {
      renderer?.setPalette(readPalette(box));
      frame();
    });
    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onRestored = () => {
      lost = false;
      if (create()) {
        doLayout();
        frame();
        kick();
      }
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);

    return () => {
      cancelAnimationFrame(raf);
      c.kick = () => {};
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      offTheme();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      renderer?.dispose();
    };
  }, []);

  const rect = layout?.rect;

  return (
    <figure className="relative m-0 h-full w-full">
      <div
        ref={boxRef}
        className="relative h-full w-full overflow-hidden"
        style={{
          // A drawing sheet's dot grid, in the border token.
          backgroundImage: "radial-gradient(var(--border) 1px, transparent 1.2px)",
          backgroundSize: "24px 24px",
        }}
      >
        {failed ? (
          <div className="flex h-full flex-col gap-4 p-4 sm:p-10">
            <FrameCaption note="1:1 scale · flat section, no 3D on this device · depths illustrative" />
            <div className="min-h-0 flex-1 border border-dashed border-muted-foreground/60 p-3 sm:p-5">
              <SectionFallback />
            </div>
          </div>
        ) : (
          <>
            <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 size-full" />
            {/* Static: the dashed selection frame. Drawn once per layout. */}
            <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full">
              {rect && (
                <rect
                  x={rect.x}
                  y={rect.y}
                  width={rect.w}
                  height={rect.h}
                  className="fill-none stroke-muted-foreground/70"
                  strokeDasharray="1.5 4"
                  strokeLinecap="round"
                />
              )}
            </svg>

            {/* Moving: transforms only, set by the loop. */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
              <div ref={labelsLayer} className="transition-opacity duration-base ease-out">
                {ANCHORS.map((a, i) => (
                  <div
                    key={`leader-${a.key}`}
                    ref={(el) => {
                      leaderRefs.current[i] = el;
                    }}
                    className="absolute top-0 left-0 h-px w-px origin-left bg-muted-foreground/55 will-change-transform"
                  />
                ))}
                {ANCHORS.map((a, i) => (
                  <div
                    key={a.key}
                    ref={(el) => {
                      labelRefs.current[i] = el;
                    }}
                    className="absolute top-0 left-0 flex items-baseline gap-2 whitespace-nowrap will-change-transform"
                  >
                    <span className="h-px w-2 self-center bg-muted-foreground/55" />
                    <span className="text-xs font-medium text-foreground">{a.name}</span>
                    <span className="font-mono text-2xs text-muted-foreground">
                      {a.depth < 1 ? "surface" : `${(Math.round(a.depth / 10) * 10).toLocaleString("en-GB")} ft`}
                    </span>
                  </div>
                ))}
              </div>

              {PADS.map((p, k) => (
                <div
                  key={p.id}
                  ref={(el) => {
                    markerRefs.current[k] = el;
                  }}
                  className="absolute top-0 left-0 will-change-transform"
                >
                  <span
                    className={cn(
                      "absolute -top-[5px] -left-[5px] size-2.5 ring-[1.5px] ring-background",
                      p.rig ? "bg-primary" : "bg-foreground",
                    )}
                  />
                  <span
                    className={cn(
                      "absolute -top-5 font-mono text-2xs whitespace-nowrap [text-shadow:0_0_3px_var(--background),0_0_3px_var(--background)]",
                      p.label === "left" ? "right-2" : "left-2",
                      p.rig ? "font-semibold text-primary" : "text-foreground",
                    )}
                  >
                    {`Pad ${p.id}`}
                  </span>
                </div>
              ))}

              <div ref={bitRef} className="absolute top-0 left-0 will-change-transform">
                <span
                  ref={bitRing}
                  className="absolute top-0 left-0 size-6 rounded-full border-[1.5px] border-primary will-change-transform"
                />
                <span className="absolute -top-[4px] -left-[4px] size-2 rounded-full bg-primary ring-[1.5px] ring-background" />
                <span
                  ref={bitText}
                  className="absolute top-2 left-2.5 font-mono text-2xs font-semibold whitespace-nowrap text-primary [text-shadow:0_0_3px_var(--background),0_0_3px_var(--background)]"
                />
              </div>
            </div>

            {rect && (
              <div className="absolute" style={{ left: rect.x, top: rect.y - (layout!.compact ? 40 : 46) }}>
                <FrameCaption note="1:1 scale · bores drawn wide · formation depths illustrative" />
              </div>
            )}

            {rect && (
              <div
                role="toolbar"
                aria-label="Cutaway view"
                className="absolute flex rounded-sm shadow-md"
                style={{ right: layout!.width - (rect.x + rect.w), top: rect.y + rect.h - 18 }}
              >
                {!reduced && (
                  <ToolButton label="Pause animation" pressed={paused} onClick={() => setPaused((v) => !v)}>
                    {paused ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
                  </ToolButton>
                )}
                <ToolButton label="Section cut" pressed={cutOpen} onClick={() => setCutOpen((v) => !v)}>
                  <BoxSelect className="size-4" aria-hidden="true" />
                </ToolButton>
                <ToolButton label="Wells inside the block" pressed={xray} onClick={() => setXray((v) => !v)}>
                  <ScanEye className="size-4" aria-hidden="true" />
                </ToolButton>
                {!layout!.compact && (
                  <ToolButton label="Formation labels" pressed={labels} onClick={() => setLabels((v) => !v)}>
                    <Layers className="size-4" aria-hidden="true" />
                  </ToolButton>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}

function FrameCaption({ note }: { note: string }) {
  return (
    <div className="flex items-start gap-2">
      <span aria-hidden="true" className="mt-1 size-1.5 shrink-0 bg-primary" />
      <div className="leading-tight">
        <p className="text-xs font-medium text-foreground">Section A–A′ · Burgan-type anticline</p>
        <p className="text-2xs text-muted-foreground">{note}</p>
      </div>
    </div>
  );
}

/**
 * Mineralsoft's tool strip: dark squares, the active one in the hot accent.
 * Here the accent is KOC primary, and "active" is `aria-pressed`.
 */
function ToolButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex size-9 items-center justify-center transition-colors duration-fast ease-out first:rounded-l-sm last:rounded-r-sm",
        "focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        pressed
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "bg-foreground text-background hover:bg-foreground/85",
      )}
    >
      {children}
    </button>
  );
}
