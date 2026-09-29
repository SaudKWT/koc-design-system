/**
 * The diorama's runtime: camera choreography, the render loop, and everything
 * a well-behaved canvas owes the page it sits on.
 *
 * - Stops entirely under reduced motion (or the page's own pause toggle) and
 *   renders one composed still per state change instead.
 * - Pauses when offscreen and when the tab is hidden.
 * - Survives `webglcontextlost`: stops, waits for restore, rebuilds from the
 *   CPU-side geometry it kept.
 * - Adapts resolution: starts at DPR ≤ 2, steps down if frames run long.
 * - Builds the opening chapter first, the rest one per idle slot.
 */

import { easeInOutCubic, lerp, v3, type V3 } from "./math";
import { Renderer, type DrawItem, type Frame } from "./renderer";
import { animModel } from "./anims";
import { BUILD_ORDER, BUILDERS, CENTERS, DISCOVER, FOCUS, POSES, type Pose } from "./scene";
import { readPalette } from "./tokens";

interface Cam {
  eye: V3;
  target: V3;
  fovY: number;
}

interface Flight {
  from: Cam;
  to: () => Cam;
  fromCenter: V3;
  toCenter: V3;
  t0: number;
  dur: number;
  lift: number;
  fog: number;
}

export interface EngineState {
  chapter: number;
  discover: boolean;
  /** 0 during a flight's middle, 1 at rest — hotspots fade with it. */
  settle: number;
  time: number;
}

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  probe: HTMLElement;
  chapter: number;
  still: boolean;
  onFrame: (project: (p: V3) => [number, number] | null, s: EngineState) => void;
  onStats?: (fps: number, dpr: number) => void;
}

const DEG = Math.PI / 180;

export class Engine {
  private r: Renderer;
  private items: DrawItem[] = [];
  private built = new Set<number>();
  private raf = 0;
  private visible = true;
  private pageVisible = !document.hidden;
  private still: boolean;
  private chapter: number;
  private discover = false;
  private flight: Flight | null = null;
  private cam: Cam;
  private pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  private start = performance.now();
  private lastT = 0;
  private frameTimes: number[] = [];
  private dpr = Math.min(2, window.devicePixelRatio || 1);
  private lost = false;
  private disposed = false;
  private cleanups: (() => void)[] = [];
  private buildTimer = 0;

  private worker: Worker | null = null;
  private awaitingOpening = true;
  /** Set when the watchdog gives up on live rendering; still mode is then permanent. */
  lowPower = false;

  constructor(private o: EngineOptions) {
    this.still = o.still;
    this.chapter = o.chapter;
    // Start empty: fog and the streak paint at once, the pad arrives from the
    // build worker, and the establishing shot descends onto it. Throws if
    // WebGL2 is absent — the caller shows the fallback.
    this.r = new Renderer(o.canvas, []);
    this.r.setPalette(readPalette(o.probe));
    this.measure();
    const rest = this.framed(POSES[o.chapter]);
    this.cam = this.still
      ? rest
      : { eye: v3.add(rest.eye, [30, 70, 90]), target: v3.add(rest.target, [0, 30, 0]), fovY: rest.fovY * 1.1 };
    this.bind();
    this.startBuilds();
    this.kick();
  }

  // ── Public API ───────────────────────────────────────────────────────────

  setChapter(i: number) {
    if (i === this.chapter && !this.discover) return;
    const from = this.chapter;
    this.chapter = i;
    this.discover = false;
    this.awaitingOpening = false;
    this.fly(POSES[i], CENTERS[from], CENTERS[i], from === i ? 1600 : 2700, from === i ? 0 : 70, from === i ? 0 : 3.2);
  }

  setDiscover(on: boolean) {
    if (on === this.discover) return;
    this.discover = on;
    this.fly(on ? DISCOVER[this.chapter] : POSES[this.chapter], CENTERS[this.chapter], CENTERS[this.chapter], 1700, 0, 0.3);
  }

  setStill(still: boolean) {
    this.still = still || this.lowPower;
    if (still && this.flight) {
      this.cam = this.flight.to();
      this.flight = null;
    }
    this.kick();
  }

  refreshPalette() {
    if (this.lost) return;
    this.r.setPalette(readPalette(this.o.probe));
    this.kick();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.buildTimer);
    this.worker?.terminate();
    for (const c of this.cleanups) c();
    this.r.dispose();
  }

  /** Dev-only handle for tuning (fog, poses) from the console. */
  get debug() {
    return { r: this.r, engine: this, kick: () => this.kick() };
  }

  get triangles() {
    return this.r.triangleCount;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private fly(pose: Pose, fromCenter: V3, toCenter: V3, dur: number, lift: number, fog: number) {
    if (this.still) {
      this.flight = null;
      this.cam = this.framed(pose);
      this.kick();
      return;
    }
    this.flight = {
      from: { ...this.cam },
      to: () => this.framed(pose),
      fromCenter,
      toCenter,
      t0: performance.now(),
      dur,
      lift,
      fog,
    };
    this.kick();
  }

  /** Pose → camera, adapted to the viewport: text sits left on wide screens, above on tall ones. */
  private framed(p: Pose): Cam {
    const aspect = this.r.width / this.r.height;
    const ref = 1.6;
    let fovY = p.fov * DEG;
    if (aspect < ref) {
      const hf = 2 * Math.atan(Math.tan(fovY / 2) * ref);
      fovY = Math.min(68 * DEG, 2 * Math.atan(Math.tan(hf / 2) / aspect));
    }
    let eye = p.eye, target = p.target;
    const fwd = v3.norm(v3.sub(target, eye));
    const right = v3.norm(v3.cross(fwd, [0, 1, 0]));
    const dist = v3.len(v3.sub(target, eye));
    const halfH = Math.tan(fovY / 2) * dist;
    if (aspect > 1.15 && !this.discover) {
      const shift = halfH * aspect * 0.3;
      eye = v3.sub(eye, v3.scale(right, shift));
      target = v3.sub(target, v3.scale(right, shift));
    } else if (aspect < 0.95) {
      const up = halfH * 0.32;
      eye = v3.add(eye, [0, up, 0]);
      target = v3.add(target, [0, up, 0]);
    }
    return { eye, target, fovY };
  }

  /** Milliseconds from request to arrival, per chapter (dev insight). */
  buildMs: Record<number, number> = {};
  private requested = performance.now();

  private startBuilds() {
    try {
      const w = new Worker(new URL("./build.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<{ chapter: number; items: DrawItem[] }>) => this.receive(e.data.chapter, e.data.items);
      w.onerror = () => {
        w.terminate();
        this.worker = null;
        this.buildOnMainThread();
      };
      for (const i of BUILD_ORDER) w.postMessage({ chapter: i });
      this.worker = w;
    } catch {
      this.buildOnMainThread();
    }
  }

  /** No worker: build here, one chapter per task, so the page stays responsive between them. */
  private buildOnMainThread() {
    const next = BUILD_ORDER.find((i) => !this.built.has(i));
    if (next === undefined || this.disposed) return;
    this.buildTimer = window.setTimeout(() => {
      if (this.disposed) return;
      this.receive(next, BUILDERS[next]());
      this.buildOnMainThread();
    }, 30);
  }

  private receive(i: number, items: DrawItem[]) {
    if (this.disposed || this.built.has(i)) return;
    for (const it of items) if (it.anim) it.model = animModel(it.anim);
    this.built.add(i);
    this.items.push(...items);
    this.r.add(items);
    this.buildMs[i] = Math.round(performance.now() - this.requested);
    this.frameTimes = [];
    this.lastT = 0;
    if (i === this.o.chapter && this.awaitingOpening) {
      this.awaitingOpening = false;
      if (!this.still) {
        this.flight = {
          from: { ...this.cam },
          to: () => this.framed(POSES[this.chapter]),
          fromCenter: CENTERS[i],
          toCenter: CENTERS[i],
          t0: performance.now(),
          dur: 3400,
          lift: 0,
          fog: 2.2,
        };
      }
    }
    this.kick();
  }

  private measure() {
    const c = this.o.canvas;
    const rect = c.getBoundingClientRect();
    this.r.resize(rect.width || 1, rect.height || 1, this.dpr);
  }

  private bind() {
    const c = this.o.canvas;
    const ro = new ResizeObserver(() => {
      this.measure();
      if (!this.flight) this.cam = this.framed(this.discover ? DISCOVER[this.chapter] : POSES[this.chapter]);
      this.kick();
    });
    ro.observe(c);
    const io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      this.kick();
    });
    io.observe(c);
    const vis = () => {
      this.pageVisible = !document.hidden;
      this.kick();
    };
    document.addEventListener("visibilitychange", vis);
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      this.pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", move, { passive: true });
    const onLost = (e: Event) => {
      e.preventDefault();
      this.lost = true;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    };
    const onRestored = () => {
      this.lost = false;
      this.r = new Renderer(c, this.items);
      this.r.setPalette(readPalette(this.o.probe));
      this.measure();
      this.kick();
    };
    c.addEventListener("webglcontextlost", onLost);
    c.addEventListener("webglcontextrestored", onRestored);
    this.cleanups.push(
      () => ro.disconnect(),
      () => io.disconnect(),
      () => document.removeEventListener("visibilitychange", vis),
      () => window.removeEventListener("pointermove", move),
      () => c.removeEventListener("webglcontextlost", onLost),
      () => c.removeEventListener("webglcontextrestored", onRestored),
    );
  }

  /** Ask for a frame. In still mode that is one frame; otherwise the loop runs while visible. */
  private kick() {
    if (this.raf || this.disposed || this.lost) return;
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  private tick(now: number) {
    this.raf = 0;
    if (this.disposed || this.lost) return;
    const running = !this.still && this.visible && this.pageVisible;
    const t = (now - this.start) / 1000;

    // Adaptive resolution: step DPR down if the last 45 frames averaged > 24 ms.
    if (running && this.lastT) {
      this.frameTimes.push(now - this.lastT);
      if (this.frameTimes.length > 45) this.frameTimes.shift();
      if (this.frameTimes.length === 45) {
        // Median, not mean: a one-off hitch (a chapter building) must not cost resolution.
        const avg = [...this.frameTimes].sort((a, b) => a - b)[22];
        if (avg > 24 && this.dpr > 1) {
          this.dpr = Math.max(1, this.dpr - 0.25);
          this.frameTimes = [];
          this.measure();
        } else if (avg > 50) {
          // Already at DPR 1 and still under 20 fps: this machine cannot run
          // the scene live. Hold a still frame rather than drag the page.
          this.lowPower = true;
          this.setStill(true);
        }
        this.o.onStats?.(1000 / avg, this.dpr);
      }
    }
    this.lastT = running ? now : 0;

    let fog = 0, streak = 1, settle = 1;
    let center = CENTERS[this.chapter];
    let cam = this.cam;
    if (this.flight) {
      const f = this.flight;
      const p = Math.min(1, (now - f.t0) / f.dur);
      const e = easeInOutCubic(p);
      const to = f.to();
      const arc = Math.sin(Math.PI * p);
      cam = {
        eye: v3.add(v3.lerp(f.from.eye, to.eye, e), [0, f.lift * arc, 0]),
        target: v3.add(v3.lerp(f.from.target, to.target, e), [0, f.lift * 0.6 * arc, 0]),
        fovY: lerp(f.from.fovY, to.fovY, e),
      };
      fog = f.fog * (f.lift > 0 ? arc * arc : 1 - e);
      streak = 1 - 0.7 * arc * (f.lift > 0 ? 1 : 0);
      // Hotspots come in over the last quarter of a chapter flight or the establishing shot.
      settle = f.lift > 0 || f.fog > 1 ? Math.max(0, (p - 0.75) / 0.25) : 1;
      center = v3.lerp(f.fromCenter, f.toCenter, e);
      if (p >= 1) {
        this.flight = null;
        this.cam = to;
        cam = to;
      } else this.cam = cam;
    }

    // Ambient drift and pointer parallax — never in still mode.
    let eye = cam.eye;
    if (!this.still) {
      const pt = this.pointer;
      pt.x += (pt.tx - pt.x) * 0.04;
      pt.y += (pt.ty - pt.y) * 0.04;
      const fwd = v3.norm(v3.sub(cam.target, cam.eye));
      const right = v3.norm(v3.cross(fwd, [0, 1, 0]));
      eye = v3.add(eye, v3.scale(right, Math.sin(t * 0.09) * 2.6 + pt.x * 3.5));
      eye = v3.add(eye, [0, Math.sin(t * 0.063) * 1.1 - pt.y * 1.8, 0]);
    }

    if (this.awaitingOpening && !this.still) fog = 2.2;

    const frame: Frame = {
      eye,
      target: cam.target,
      fovY: cam.fovY,
      time: this.still ? 12 : t,
      shadowCenter: center,
      fogStart: Math.max(40, v3.len(v3.sub(cam.target, cam.eye)) * 0.7),
      fogBoost: fog,
      streakAnchor: this.focusFor(this.flight ? null : this.chapter, center),
      streakIntensity: streak,
    };
    this.r.render(frame);
    this.o.onFrame((p) => this.r.project(p), {
      chapter: this.chapter,
      discover: this.discover,
      settle: this.awaitingOpening ? 0 : this.flight ? settle : 1,
      time: this.still ? 0 : t,
    });

    if (running && (this.flight || !this.still)) this.kick();
  }

  private focusFor(ch: number | null, center: V3): V3 {
    if (ch === null) return [center[0], 5, center[2]];
    return FOCUS[ch];
  }
}
