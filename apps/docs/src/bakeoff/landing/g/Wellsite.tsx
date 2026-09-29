/**
 * The hero figure: the wellsite as a live technical drawing.
 *
 * Owns the WebGL2 lifecycle — context, loss and restore, resize, theme, the
 * drilling-cycle clock — and the HTML annotation layer pinned to the model.
 * Everything that moves stops under reduced motion and renders one composed
 * still; the loop also stops offscreen and in a hidden tab.
 */

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, RotateCw, Scan } from "lucide-react";

import { cn } from "@koc/ui";

import { KPIS, formatKpi } from "../data";
import { useReducedMotion } from "../shared";
import { drawFallback } from "./gl/fallback";
import { member, type Vec3 } from "./gl/math";
import { readPalette, type Palette } from "./gl/palette";
import { fitCamera, project, Renderer, type CameraSpec, type Frame } from "./gl/renderer";
import { buildModel, FIT_POINTS, FLOOR, hoseCurve, PART_TEAMS, rigState, STILL_T, type Model, type RigState } from "./gl/rig";
import { INST_STRIDE, MAT, PART, ROLE, SEG_STRIDE, writeInstance, writeSeg } from "./gl/scene";

/** 58°: far enough round that the top drive shows between the two racked groups. */
const BASE_YAW = 1.01;
const PITCH = 0.54;
const SWAY = 0.09;
const SWAY_PERIOD = 40;

/** Where each part's name tag pins, and what its thumbnail frames. */
const PART_ANCHOR: Record<number, string> = {
  [PART.office]: "office",
  [PART.rig]: "rig",
  [PART.logistics]: "logistics",
  [PART.wellControl]: "wellControl",
  [PART.well]: "well",
  [PART.materials]: "materials",
  [PART.producer]: "producer",
};
/**
 * Thumbnail framing where a part's own bounds would not read at card size: the
 * rig is cropped to floor and lower mast; the well is drawn as well schematics
 * are, diameters exaggerated (here 7×) so the telescoping strings show.
 */
const THUMB: Partial<Record<number, { bounds: [Vec3, Vec3]; radial?: number; pitch?: number }>> = {
  [PART.rig]: { bounds: [[-24, 0, -26], [32, 96, 26]] },
  [PART.well]: { bounds: [[-9, -110, -9], [9, -4, 9]], radial: 7, pitch: 0.42 },
};

interface CalloutSpec {
  id: string;
  anchor: string;
  title: string;
  detail?: string;
  side: 1 | -1;
  /** Hide below this canvas width (px). */
  minW?: number;
  kind?: "tag" | "dim";
}

const CALLOUTS: CalloutSpec[] = [
  { id: "crown", anchor: "crown", title: "Crown block", detail: "7 × 60 in sheaves", side: 1, minW: 560 },
  { id: "rack", anchor: "rackingBoard", title: "Racking board", detail: "93 ft triples of 5 in pipe", side: 1, minW: 560 },
  { id: "td", anchor: "td", title: "Top drive", detail: "", side: 1, minW: 420 },
  { id: "bop", anchor: "bop", title: "BOP stack", detail: "13⅝ in, 15 ft across the rams", side: 1, minW: 700 },
  { id: "well", anchor: "well", title: "Casing, schematic", detail: "30 · 18⅝ · 13⅜ · 9⅝ in", side: 1, minW: 560 },
  { id: "dimMast", anchor: "dimMast", title: "142 ft", side: 1, kind: "dim" },
  { id: "dimFloor", anchor: "dimFloor", title: "30 ft", side: 1, kind: "dim" },
];

export interface TeamTag {
  code: string;
  name: string;
  part: number;
}

interface Props {
  tag: TeamTag | null;
  /** Called with a data URL per part id whenever thumbnails are (re)drawn. */
  onThumbnails?: (thumbs: Record<number, string>) => void;
  className?: string;
  /** Sizes the drawing stage (the card sits beside it on wide screens, below on narrow). */
  stageClassName?: string;
}

const RIGS = KPIS.find((k) => k.id === "rigs");

/**
 * Is WebGL2 here a software rasteriser? SwiftShader (headless Chrome, GPU
 * blocklisted machines), llvmpipe, and WARP / "Microsoft Basic Render Driver"
 * (Windows VMs and virtual desktops — plausible at KOC) all draw on the CPU, where
 * one frame of this model costs about a second. On those the drawing is a still.
 * Probed on a throwaway canvas so the real one can be created without MSAA.
 */
function softwareGl(): boolean {
  try {
    const g = document.createElement("canvas").getContext("webgl2");
    if (!g) return false;
    const dbg = g.getExtension("WEBGL_debug_renderer_info");
    const name = String(g.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : g.RENDERER));
    g.getExtension("WEBGL_lose_context")?.loseContext();
    return /swiftshader|llvmpipe|softpipe|software|basic render|\bwarp\b/i.test(name);
  } catch {
    return false;
  }
}

/** Evaluation switch: `#/landing/g?renderer=2d` or `?renderer=static` shows a fallback on purpose. */
function forcedRenderer(): "2d" | "static" | null {
  const m = /[?&]renderer=(2d|static)\b/.exec(window.location.hash);
  return m ? (m[1] as "2d" | "static") : null;
}


export function Wellsite({ tag, onThumbnails, className, stageClassName }: Props) {
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(true);
  const [mode, setMode] = useState<"webgl" | "2d" | "none">("webgl");
  /** "still" when the renderer cannot afford a loop (software GL, 2D fallback). */
  const [still_, setStill] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tagRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lineRefs = useRef<Record<string, SVGPolylineElement | null>>({});
  const phaseRef = useRef<HTMLSpanElement>(null);
  const blockRef = useRef<HTMLSpanElement>(null);
  const tdRef = useRef<HTMLSpanElement>(null);
  const thumbsCb = useRef(onThumbnails);
  thumbsCb.current = onThumbnails;

  /** Everything the loop reads, mutated from React without re-running the GL effect. */
  const ctl = useRef({
    reduced,
    playing: true,
    tagPart: -1,
    kick: () => {},
    invalidate: () => {},
    rotate: (_d: number) => {},
    reset: () => {},
  });
  ctl.current.reduced = reduced;
  ctl.current.playing = playing;
  ctl.current.tagPart = tag ? tag.part : -1;

  useEffect(() => {
    ctl.current.invalidate();
    ctl.current.kick();
  }, [reduced, playing, tag]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const host = box.current!;
    const model: Model = buildModel();
    const forced = forcedRenderer();
    // A still frame, drawn on demand only, when the GPU is really a CPU.
    const stillOnly = forced === "static" || (forced !== "2d" && softwareGl());
    let gl: WebGL2RenderingContext | null = null;
    if (forced !== "2d") {
      try {
        gl = canvas.getContext("webgl2", {
          antialias: !stillOnly,
          alpha: true,
          premultipliedAlpha: true,
          // A still frame (reduced motion, software GL) must survive being
          // re-composited, screenshotted or printed without a redraw.
          preserveDrawingBuffer: true,
          powerPreference: "high-performance",
        });
      } catch {
        gl = null;
      }
    }
    let renderer: Renderer | null = null;
    let ctx2d: CanvasRenderingContext2D | null = null;
    let palette: Palette = readPalette();
    let lost = false;

    const init = () => {
      if (!gl) return;
      try {
        renderer = new Renderer(gl, model);
        renderer.setPalette(palette);
      } catch (err) {
        console.error("[landing g] WebGL2 init failed, falling back to 2D", err);
        renderer = null;
        gl = null;
      }
    };
    init();
    if (!gl) {
      ctx2d = canvas.getContext("2d");
      setMode(ctx2d ? "2d" : "none");
    }
    const frozen = stillOnly || !gl;
    if (frozen) setStill(true);
    host.dataset.renderer = !gl ? "2d" : stillOnly ? "webgl-still" : "webgl";

    // clocks and view state
    let t = STILL_T;
    let swayT = 0;
    let yaw = BASE_YAW, yawTarget = BASE_YAW;
    let hiPart = -1, hiAmt = 0;
    let raf = 0, last = 0;
    let inView = true, visible = document.visibilityState === "visible";
    let cssW = 1, cssH = 1, dpr = 1;
    let fit: CameraSpec | null = null;
    let fitYaw = NaN;
    let fps = 0, frames = 0, fpsT = 0;
    // Resolution governor: KOC desktops are often integrated GPUs. It watches the
    // MEDIAN frame interval per second, not the frame count — a long task on the
    // main thread (an audit, a heavy scroll) drops frames without the GPU being
    // slow, and must not cost the drawing its resolution. Three consecutive
    // seconds with a median over 24 ms (under ~42 fps) step the pixel ratio down.
    const DPR_STEPS = [2, 1.5, 1.25, 1];
    let dprCap = frozen ? 1 : 2, slowSeconds = 0;
    const intervals: number[] = [];
    let lastText = 0;

    const dynSegs = new Float32Array(1100 * SEG_STRIDE);
    const dynStands = new Float32Array(2 * INST_STRIDE);
    const hoseDist0 = model.anchors.hoseDist0?.[0] ?? 0;

    const animating = () => !frozen && !ctl.current.reduced && ctl.current.playing && inView && visible && !lost;
    /** No tweens either when motion is reduced or every frame is expensive. */
    const instant = () => ctl.current.reduced || frozen;

    const refit = () => {
      const yaws = [yawTarget - SWAY, yawTarget, yawTarget + SWAY];
      // From lg the asset card floats top-left, in the sky beside the mast; the
      // fit is height-limited there anyway, so the gutter costs the drawing little.
      const wide = window.matchMedia("(min-width: 1024px)").matches;
      const inset = wide ? { l: 150, r: 16, t: 16, b: 0 } : { l: 8, r: 8, t: 12, b: 0 };
      fit = fitCamera(FIT_POINTS, yaws, PITCH, cssW, cssH, inset);
      fitYaw = yawTarget;
    };

    const resize = () => {
      sizes = new WeakMap();
      const r = host.getBoundingClientRect();
      cssW = Math.max(1, r.width);
      cssH = Math.max(1, r.height);
      dpr = Math.min(dprCap, window.devicePixelRatio || 1);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      if (renderer) renderer.dpr = dpr;
      refit();
    };

    const stateNow = (): RigState => rigState(ctl.current.reduced ? STILL_T : t);

    const buildFrame = (s: RigState, cam: CameraSpec, pxPerUnit: number): Frame => {
      // dynamic stands: the one on the elevator, the one in the slips
      let n = 0;
      for (const st of [s.attached, s.stump]) {
        if (!st) continue;
        writeInstance(dynStands, n, member(st[0], st[1], 1, 1), PART.rig, MAT.fine, 0);
        n++;
      }
      // rotary hose (catenary) and the mud in it
      const hose = hoseCurve(s.quill, 512);
      const hoseW = Math.max(1.3, Math.min(5, (0.52 * pxPerUnit) / dpr));
      let k = 0, d = hoseDist0;
      for (let i = 0; i < hose.length - 1; i++) {
        writeSeg(dynSegs, k++, hose[i], hose[i + 1], { role: ROLE.ink, alpha: 0.85, width: hoseW, part: PART.rig });
      }
      for (let i = 0; i < hose.length - 1; i++) {
        writeSeg(dynSegs, k++, hose[i], hose[i + 1], { role: ROLE.primary, alpha: 0.95, width: 2, dash: 9, flow: 24, part: PART.site, lift: 0.3 }, d);
        d += Math.hypot(hose[i + 1][0] - hose[i][0], hose[i + 1][1] - hose[i][1], hose[i + 1][2] - hose[i][2]);
      }
      const hiA = hiPart >= 0 ? hiAmt : 0;
      // The casing is always x-rayed faintly in ink — the drawing admits the well
      // goes on below grade — and in primary when its teams are named.
      const wellHi = hiPart === PART.well;
      const xray: Frame["xray"] = [
        { part: PART.well, alpha: wellHi ? 0.25 + 0.65 * hiA : 0.25 * (1 - hiA) + 0.1, tint: wellHi ? 1 : 0 },
      ];
      if (hiPart >= 0 && !wellHi) xray.push({ part: hiPart, alpha: 0.85 * hiA, tint: 1 });
      return {
        cam,
        quill: s.quill,
        time: ctl.current.reduced ? 0 : t,
        flowAmt: s.pumping,
        highlight: hiPart,
        hiAmt: hiA,
        xray,
        isolate: -1,
        dynSegs,
        dynSegCount: k,
        dynStands,
        dynStandCount: n,
      };
    };

    const overlay = (cam: CameraSpec, s: RigState, now: number) => {
      const tp = ctl.current.tagPart;
      for (const c of CALLOUTS) {
        const el = tagRefs.current[c.id];
        const ln = lineRefs.current[c.id];
        if (!el) continue;
        const show = !c.minW || cssW >= c.minW;
        el.style.visibility = show ? "visible" : "hidden";
        if (ln) ln.style.visibility = show ? "visible" : "hidden";
        if (!show) continue;
        const p: Vec3 | undefined = c.anchor === "td" ? [1.9, s.quill + 8, 1.6] : model.anchors[c.anchor];
        if (!p) continue;
        const [x, y] = project(cam, cssW, cssH, p);
        if (c.kind === "dim") {
          el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
          continue;
        }
        placeTag(el, ln, x, y, c.side);
      }
      const el = tagRefs.current.team;
      const ln = lineRefs.current.team;
      if (el && tp >= 0) {
        const p = model.anchors[PART_ANCHOR[tp]];
        if (p) {
          const [x, y] = project(cam, cssW, cssH, p);
          placeTag(el, ln, x, y, x > cssW * 0.62 ? -1 : 1);
        }
      }
      if (now - lastText > 140) {
        lastText = now;
        const block = Math.round(s.quill + 25.7 - FLOOR);
        if (blockRef.current) blockRef.current.textContent = `${block} ft`;
        if (tdRef.current) tdRef.current.textContent = `Block ${block} ft above floor`;
        const chip = phaseRef.current;
        if (chip) {
          const text = chip.querySelector("[data-phase-text]");
          if (text) text.textContent = s.phase === "drilling" ? "Drilling · pumps on" : `Connection · ${s.phase}`;
          chip.dataset.pump = s.phase === "drilling" ? "on" : "off";
        }
      }
    };

    // Tag sizes are measured once per resize or text change, never per frame —
    // reading offsetWidth after writing a transform forces a layout each time.
    let sizes = new WeakMap<HTMLElement, [number, number]>();
    const sizeOf = (el: HTMLElement) => {
      let sz = sizes.get(el);
      if (!sz) sizes.set(el, (sz = [el.offsetWidth, el.offsetHeight]));
      return sz;
    };
    const placeTag = (el: HTMLDivElement, ln: SVGPolylineElement | null | undefined, x: number, y: number, side: 1 | -1) => {
      const [w, h] = sizeOf(el);
      let lx = x + side * 36;
      let ly = y - 22;
      lx = side > 0 ? Math.min(lx, cssW - w - 8) : Math.max(lx, w + 8);
      ly = Math.max(8, Math.min(cssH - h - 8, ly - h / 2));
      el.style.transform = `translate3d(${(side > 0 ? lx : lx - w).toFixed(1)}px, ${ly.toFixed(1)}px, 0)`;
      if (ln) {
        const ex = lx, ey = ly + h / 2;
        ln.setAttribute("points", `${x.toFixed(1)},${y.toFixed(1)} ${(x + side * 12).toFixed(1)},${ey.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`);
      }
    };

    let drawCount = 0;
    const draw = (now: number) => {
      if (!fit) return;
      drawCount++;
      const s = stateNow();
      const sway = instant() ? 0 : Math.sin((swayT / SWAY_PERIOD) * Math.PI * 2) * SWAY;
      const cam: CameraSpec = { ...fit, yaw: yaw + sway };
      const pxPerUnit = (cssH * dpr) / (2 * cam.halfH);
      if (renderer && gl && !lost) {
        renderer.render(buildFrame(s, cam, pxPerUnit));
      } else if (ctx2d) {
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawFallback(ctx2d, model, cam, cssW, cssH, s.quill, palette);
      }
      overlay(cam, s, now);
    };

    const tick = (now: number) => {
      raf = 0;
      const gap = last ? now - last : 0;
      const dt = Math.min(0.05, gap / 1000);
      last = now;
      if (gap) intervals.push(gap);
      const anim = animating();
      if (anim) {
        t += dt;
        swayT += dt;
      }
      // view tween and highlight fade; instant under reduced motion
      const rm = instant();
      yaw = rm ? yawTarget : yaw + (yawTarget - yaw) * Math.min(1, dt * 7);
      if (Math.abs(yawTarget - fitYaw) > 1e-6) refit();
      const want = ctl.current.tagPart;
      if (want >= 0 && want !== hiPart) {
        if (hiPart < 0 || hiAmt <= 0.001 || rm) hiPart = want;
        else hiAmt = Math.max(0, hiAmt - dt / 0.12);
      }
      const goal = want >= 0 && want === hiPart ? 1 : 0;
      hiAmt = rm ? goal : hiAmt + Math.sign(goal - hiAmt) * Math.min(Math.abs(goal - hiAmt), dt / 0.2);
      if (goal === 0 && hiAmt === 0 && want < 0) hiPart = -1;
      draw(now);
      frames++;
      if (now - fpsT > 1000) {
        fps = Math.round((frames * 1000) / (now - fpsT));
        frames = 0;
        fpsT = now;
        host.dataset.fps = String(fps);
        const sorted = intervals.splice(0).sort((a, b) => a - b);
        const median = sorted.length >= 10 ? sorted[sorted.length >> 1] : 0;
        slowSeconds = anim && median > 24 ? slowSeconds + 1 : 0;
        const next = DPR_STEPS.find((d) => d < dprCap);
        if (slowSeconds >= 3 && next) {
          dprCap = next;
          slowSeconds = 0;
          resize();
          host.dataset.dpr = String(dprCap);
        }
      }
      const settling = Math.abs(yaw - yawTarget) > 1e-4 || (hiAmt !== goal) || (want >= 0 && want !== hiPart);
      if ((anim || settling) && visible && !lost) raf = requestAnimationFrame(tick);
      else {
        last = 0;
        intervals.length = 0;
      }
    };

    const kick = () => {
      if (raf || lost) return;
      raf = requestAnimationFrame(tick);
    };
    ctl.current.kick = kick;
    ctl.current.invalidate = () => {
      sizes = new WeakMap();
    };
    ctl.current.rotate = (d: number) => {
      yawTarget += d;
      kick();
    };
    ctl.current.reset = () => {
      yawTarget = BASE_YAW;
      swayT = 0;
      kick();
    };

    // drag to orbit
    let drag: { x: number; id: number } | null = null;
    const onDown = (e: PointerEvent) => {
      drag = { x: e.clientX, id: e.pointerId };
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      drag.x = e.clientX;
      yawTarget -= dx * 0.006;
      if (instant()) yaw = yawTarget;
      kick();
    };
    const onUp = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id) drag = null;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    // Thumbnails for the team list, drawn from the same model — one part per
    // task, so a slow GPU never blocks input for the whole batch.
    let thumbRun = 0;
    let thumbTimer = 0;
    const thumbs = () => {
      if (!renderer || !gl || lost || !thumbsCb.current) return;
      const run = ++thumbRun;
      const out: Record<number, string> = {};
      const parts = [...new Set(Object.values(PART_TEAMS))];
      const W = frozen ? 320 : 480, H = frozen ? 224 : 336;
      const cvs = document.createElement("canvas");
      cvs.width = W;
      cvs.height = H;
      const c2 = cvs.getContext("2d");
      if (!c2) return;
      const s = rigState(STILL_T);
      const one = (part: number) => {
        if (!renderer) return;
        const spec = THUMB[part];
        const b = spec?.bounds ?? [model.partMin.get(part)!, model.partMax.get(part)!];
        if (!b[0]) return;
        const pts: Vec3[] = [];
        for (let c = 0; c < 8; c++) pts.push([c & 1 ? b[1][0] : b[0][0], c & 2 ? b[1][1] : b[0][1], c & 4 ? b[1][2] : b[0][2]]);
        const cam = fitCamera(pts, [BASE_YAW], spec?.pitch ?? PITCH, W, H, { l: 18, r: 18, t: 18, b: 18 });
        const f = buildFrame(s, cam, H / (2 * cam.halfH));
        const img = renderer.snapshot(
          {
            ...f,
            isolate: part,
            radial: spec?.radial ?? 1,
            highlight: -1,
            hiAmt: 0,
            xray: [],
            dynStandCount: part === PART.rig ? f.dynStandCount : 0,
          },
          W,
          H,
        );
        if (!img) return;
        c2.clearRect(0, 0, W, H);
        c2.putImageData(img, 0, 0);
        out[part] = cvs.toDataURL("image/png");
      };
      // An offscreen blit still marks the canvas changed, and with
      // preserveDrawingBuffer off the browser then presents a cleared buffer —
      // harmless while the loop runs, fatal to a still frame. So every snapshot
      // is followed by a redraw of the main view (once, at the end, where each
      // redraw costs the CPU a second).
      const step = (i: number) => {
        if (run !== thumbRun || lost) return;
        if (i >= parts.length) {
          thumbsCb.current?.(out);
          kick();
          return;
        }
        one(parts[i]);
        if (!frozen) kick();
        thumbTimer = window.setTimeout(() => step(i + 1), frozen ? 30 : 0);
      };
      thumbTimer = window.setTimeout(() => step(0), frozen ? 400 : 0);
    };

    const onTheme = () => {
      palette = readPalette();
      renderer?.setPalette(palette);
      thumbs();
      kick();
    };
    const themeObs = new MutationObserver(onTheme);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const ro = new ResizeObserver(() => {
      resize();
      kick();
    });
    ro.observe(host);
    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      if (inView) kick();
    });
    io.observe(host);
    const onVis = () => {
      visible = document.visibilityState === "visible";
      if (visible) kick();
    };
    document.addEventListener("visibilitychange", onVis);

    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      renderer = null;
    };
    const onRestored = () => {
      lost = false;
      init();
      renderer && (renderer.dpr = dpr);
      thumbs();
      kick();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);

    resize();
    thumbs();
    kick();

    if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
      // Inspection hook for development only: a full-resolution still of the
      // current view, since screenshots of the page are downscaled.
      (window as unknown as Record<string, unknown>).__wellsite = {
        still: (scale = 2) => {
          if (!renderer || !fit) return null;
          const s = stateNow();
          const cam: CameraSpec = { ...fit, yaw };
          const W = Math.round(cssW * scale), H = Math.round(cssH * scale);
          const d0 = renderer.dpr;
          renderer.dpr = scale;
          const img = renderer.snapshot(buildFrame(s, cam, H / (2 * cam.halfH)), W, H);
          renderer.dpr = d0;
          kick();
          if (!img) return null;
          const c = document.createElement("canvas");
          c.width = W;
          c.height = H;
          c.getContext("2d")!.putImageData(img, 0, 0);
          return c.toDataURL("image/png");
        },
        fps: () => host.dataset.fps,
        state: () => ({ drawCount, lost, raf, visible, inView, cssW, cssH, dpr, canvas: [canvas.width, canvas.height], hasRenderer: !!renderer, err: gl?.getError() }),
        renderer: () => renderer,
        /** Split timings: CPU frame build, command submission, and the wait for the GPU. */
        split: (n = 30) => {
          if (!renderer || !gl || !fit) return null;
          const px = new Uint8Array(4);
          const cam: CameraSpec = { ...fit, yaw };
          let build = 0, submit = 0, wait = 0;
          for (let i = 0; i < n; i++) {
            const a = performance.now();
            const f = buildFrame(rigState(STILL_T + i * 0.1), cam, (cssH * dpr) / (2 * cam.halfH));
            const b = performance.now();
            renderer.render(f);
            const c = performance.now();
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            const d = performance.now();
            build += b - a;
            submit += c - b;
            wait += d - c;
          }
          return { build: build / n, submit: submit / n, wait: wait / n };
        },
        /** ms per full frame at the current size, GPU included (a 1px readback forces completion). */
        bench: (n = 30, highlight = -1) => {
          if (!renderer || !gl || !fit) return null;
          const px = new Uint8Array(4);
          const cam: CameraSpec = { ...fit, yaw };
          const t0 = performance.now();
          for (let i = 0; i < n; i++) {
            const s = rigState(STILL_T + i * 0.1);
            const f = buildFrame(s, cam, (cssH * dpr) / (2 * cam.halfH));
            renderer.render({ ...f, highlight, hiAmt: highlight >= 0 ? 1 : 0 });
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          }
          return (performance.now() - t0) / n;
        },
      };
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      thumbRun++;
      clearTimeout(thumbTimer);
      themeObs.disconnect();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      // Free the context now rather than whenever GC gets to it — the viewer
      // switches directions by remounting, and browsers cap live contexts. But
      // only once the canvas has really gone: StrictMode re-runs this effect on
      // the same canvas, and a lost context cannot be had back from getContext.
      const ctxToFree = gl;
      setTimeout(() => {
        if (!canvas.isConnected) ctxToFree?.getExtension("WEBGL_lose_context")?.loseContext();
      }, 0);
    };
  }, []);

  const still = rigState(STILL_T);
  const stillBlock = Math.round(still.quill + 25.7 - FLOOR);
  const toolBtn =
    "inline-flex size-9 items-center justify-center rounded-sm text-background/80 transition-colors duration-fast ease-out hover:bg-background/15 hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-foreground disabled:opacity-40";

  return (
    <figure className={cn("relative m-0", className)} aria-labelledby="g-figure-caption">
      <div ref={box} className={cn("relative w-full overflow-hidden", stageClassName)} data-fps="">
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="absolute inset-0 size-full cursor-grab touch-pan-y active:cursor-grabbing"
        />
        {mode === "none" && (
          <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground">
            This browser cannot draw the wellsite model.
          </p>
        )}
        {/* Annotation layer — duplicates of what the page says in text, so hidden from AT. */}
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full overflow-visible">
          {CALLOUTS.filter((c) => c.kind !== "dim").map((c) => (
            <polyline
              key={c.id}
              ref={(el) => {
                lineRefs.current[c.id] = el;
              }}
              fill="none"
              className={cn(
                "stroke-muted-foreground transition-opacity duration-base ease-out",
                tag ? "opacity-0" : "opacity-70",
              )}
              strokeWidth={1}
            />
          ))}
          <polyline
            ref={(el) => {
              lineRefs.current.team = el;
            }}
            fill="none"
            className={cn("stroke-primary transition-opacity duration-base ease-out", tag ? "opacity-100" : "opacity-0")}
            strokeWidth={1.25}
          />
        </svg>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {CALLOUTS.map((c) =>
            c.kind === "dim" ? (
              <div
                key={c.id}
                ref={(el) => {
                  tagRefs.current[c.id] = el;
                }}
                className="absolute left-0 top-0 bg-background px-1 font-mono text-2xs font-medium text-primary tabular-nums"
              >
                {c.title}
              </div>
            ) : (
              <div
                key={c.id}
                ref={(el) => {
                  tagRefs.current[c.id] = el;
                }}
                className={cn(
                  "absolute left-0 top-0 flex items-start gap-1.5 rounded-sm border border-border bg-card/95 px-2 py-1 shadow-xs transition-opacity duration-base ease-out",
                  // a named team owns the drawing: default tags step aside rather than ghost over it
                  tag ? "opacity-0" : "opacity-100",
                )}
              >
                <span className="mt-1 size-1.5 shrink-0 bg-foreground" />
                <span className="leading-tight">
                  <span className="block whitespace-nowrap text-2xs font-semibold text-foreground">{c.title}</span>
                  <span
                    ref={c.id === "td" ? tdRef : undefined}
                    className="block whitespace-nowrap font-mono text-2xs text-muted-foreground tabular-nums"
                  >
                    {c.id === "td" ? `Block ${stillBlock} ft above floor` : c.detail}
                  </span>
                </span>
              </div>
            ),
          )}
          <div
            ref={(el) => {
              tagRefs.current.team = el;
            }}
            className={cn(
              "absolute left-0 top-0 flex items-start gap-1.5 rounded-sm bg-primary px-2 py-1 text-primary-foreground shadow-md transition-opacity duration-base ease-out",
              tag ? "opacity-100" : "opacity-0",
            )}
          >
            <span className="mt-1 size-1.5 shrink-0 bg-primary-foreground" />
            <span className="leading-tight">
              <span className="block whitespace-nowrap font-mono text-2xs font-semibold">{tag?.code ?? " "}</span>
              <span className="block whitespace-nowrap text-2xs">{tag?.name ?? " "}</span>
            </span>
          </div>
        </div>
      </div>

      {/* The asset card — Petronex's floating detail card, reading the model. */}
      <div className="relative z-10 mt-4 w-full max-w-xs lg:absolute lg:left-0 lg:top-2 lg:mt-0 lg:w-64">
        <div className="border border-border bg-card text-card-foreground shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">
              Wellsite model · 1 unit = 1 ft
            </span>
          </div>
          <div className="px-4 pb-4 pt-3">
            <div className="text-2xl leading-tight tracking-tight">
              <span className="block font-semibold">2,000 HP</span>
              <span className="block font-light">land rig</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span
                ref={phaseRef}
                data-pump="on"
                className="group inline-flex items-center gap-1.5 rounded-sm bg-secondary px-1.5 py-0.5 text-2xs text-secondary-foreground"
              >
                <span aria-hidden="true" data-phase-text="">
                  {still.phase === "drilling" ? "Drilling · pumps on" : `Connection · ${still.phase}`}
                </span>
                <span className="sr-only">Animated drilling cycle, not a live feed</span>
                <span aria-hidden="true" className="size-1.5 bg-success group-data-[pump=off]:bg-warning" />
              </span>
              {RIGS && (
                <span className="inline-flex items-center gap-1.5 rounded-sm bg-secondary px-1.5 py-0.5 text-2xs text-secondary-foreground">
                  One of {formatKpi(RIGS, RIGS.value)} active rigs
                  <span aria-hidden="true" className="size-1.5 bg-primary" />
                </span>
              )}
            </div>
          </div>
          <dl className="grid grid-cols-2 border-t border-border text-2xs">
            {[
              ["Mast", "142 ft"],
              ["Floor", "30 ft"],
              ["Stand", "93 ft"],
              ["Drill pipe", "5 in"],
            ].map(([k, v], i) => (
              <div key={k} className={cn("px-4 py-2", i % 2 === 1 && "border-l border-border", i > 1 && "border-t border-border")}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 font-mono text-xs font-medium text-foreground tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex items-baseline justify-between border-t border-border px-4 py-2 text-2xs">
            <span className="text-muted-foreground">Block height</span>
            <span ref={blockRef} aria-hidden="true" className="font-mono text-xs font-medium tabular-nums">
              {stillBlock} ft
            </span>
          </div>
        </div>
        {/* Petronex's dark action bar, docked under the card. */}
        <div
          role="toolbar"
          aria-label="Wellsite view"
          className="ml-auto flex w-max items-center gap-0.5 bg-foreground p-1 text-background"
        >
          <button
            type="button"
            className={toolBtn}
            onClick={() => setPlaying((p) => !p)}
            disabled={reduced || still_}
            aria-label={
              still_
                ? "Animation off: this display draws in software"
                : reduced
                  ? "Animation off: reduced motion"
                  : playing
                    ? "Pause animation"
                    : "Play animation"
            }
          >
            {playing && !reduced && !still_ ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </button>
          <button type="button" className={toolBtn} onClick={() => ctl.current.rotate(-Math.PI / 6)} aria-label="Rotate view left">
            <RotateCcw aria-hidden="true" />
          </button>
          <button type="button" className={toolBtn} onClick={() => ctl.current.rotate(Math.PI / 6)} aria-label="Rotate view right">
            <RotateCw aria-hidden="true" />
          </button>
          <button type="button" className={toolBtn} onClick={() => ctl.current.reset()} aria-label="Reset view">
            <Scan aria-hidden="true" />
          </button>
        </div>
      </div>

      <figcaption id="g-figure-caption" className="sr-only">
        Isometric drawing of a 2,000 horsepower land drilling rig and its wellsite, to scale above grade: a
        142 foot mast on a 30 foot substructure, the rig floor, mud system, power, storage tanks, a site
        office, a producing well, and a schematic of the casing below ground.
        {tag ? ` Highlighted: ${tag.code}, ${tag.name}.` : ""}
      </figcaption>
    </figure>
  );
}
