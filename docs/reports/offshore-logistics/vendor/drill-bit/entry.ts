/**
 * The fi3 drill bit for the report's footer: fi3's Plate.tsx without React.
 *
 * The meshes, the renderer and the token reader are dweg-landing's own files
 * (src/landing/fi3/gl/), bundled unchanged. Only the lifecycle is rewritten:
 *   - nothing is built until the footer is within 600px of the viewport
 *   - meshes build in a Blob worker; if the frame refuses one (a sandboxed
 *     null-origin SharePoint preview may), they build here instead
 *   - no hardware WebGL2, a lost context, or any throw -> the line drawing
 *     already in the markup stays, which is also what prints
 *   - rendering stops offscreen and in a hidden tab; reduced motion shows one
 *     composed frame, exploded, and no loop
 *   - no localStorage, sessionStorage, cookies or history: all four throw in
 *     the null origin SharePoint previews an uploaded file in
 */
import { buildBit, type BitModel } from "@fi3gl/bit";
import { PlateRenderer, hardwareContext, type Layout, type Projection } from "@fi3gl/renderer";
import { readPalette } from "@fi3gl/tokens";

declare const WORKER_SRC: string;

const CYCLE = { hold0: 2.2, move: 2.8, hold1: 6.0, hold2: 2.2 };
const PERIOD = CYCLE.hold0 + CYCLE.move + CYCLE.hold1 + CYCLE.move + CYCLE.hold2;
function autoExplode(t: number): number {
  let u = t % PERIOD;
  if ((u -= CYCLE.hold0) < 0) return 0;
  if (u < CYCLE.move) return u / CYCLE.move;
  if ((u -= CYCLE.move + CYCLE.hold1) < 0) return 1;
  if (u < CYCLE.move) return 1 - u / CYCLE.move;
  return 0;
}
const AZ0 = (22 * Math.PI) / 180;
const EL0 = (27 * Math.PI) / 180;
// Wide: the bit stands left in its plate, with fi3's callout column to its
// right. Narrow: the bit owns the box and the callouts are not drawn.
const WIDE = 560;
const layoutFor = (w: number): Layout =>
  w >= WIDE ? { shiftX: -0.26, shiftY: 0.04, availW: 0.5, availH: 0.9 }
            : { shiftX: 0, shiftY: 0.02, availW: 0.9, availH: 0.9 };

function loadModel(): Promise<BitModel> {
  return new Promise((resolve) => {
    const here = () => setTimeout(() => resolve(buildBit()), 0);
    let worker: Worker;
    let url = "";
    try {
      url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
      worker = new Worker(url);
    } catch {
      if (url) URL.revokeObjectURL(url);
      return here();
    }
    const done = () => { worker.terminate(); URL.revokeObjectURL(url); };
    worker.onmessage = (e: MessageEvent<BitModel>) => { done(); resolve(e.data); };
    worker.onerror = (e) => { e.preventDefault(); done(); here(); };
    worker.postMessage("build");
  });
}

function mount(wrap: HTMLElement) {
  const canvas = wrap.querySelector("canvas");
  const probe = wrap.querySelector<HTMLElement>(".bit-probe");
  if (!canvas || !probe) return;
  if (!hardwareContext(canvas)) return; // the line drawing stays
  const reducedQ = window.matchMedia("(prefers-reduced-motion: reduce)");

  const start = (model: BitModel) => {
    const renderer = new PlateRenderer(canvas);
    if (!renderer.init(model)) return;
    renderer.setPalette(readPalette(probe));
    let wide = false;
    // fi3's callouts, from its CALLOUTS list, as markup the page already has:
    // each .bit-callout carries data-id, and one <line>/<circle> pair per id.
    const labels = Array.from(wrap.querySelectorAll<HTMLElement>(".bit-callout"));
    const place = (p: Projection | null) => {
      if (!p) return;
      const w = wrap.clientWidth;
      const rows = labels
        .map((label) => ({ label, id: label.dataset.id as keyof Projection["anchors"] }))
        .map((r) => ({ ...r, a: p.anchors[r.id] }))
        .filter((r) => r.a)
        .sort((x, y) => x.a.y - y.a.y);
      const colX = Math.min(w - 190, Math.max(p.right + 28, 0));
      let prevY = -Infinity;
      for (const { label, id, a } of rows) {
        const line = wrap.querySelector<SVGLineElement>(`line[data-id="${id}"]`);
        const dot = wrap.querySelector<SVGCircleElement>(`circle[data-id="${id}"]`);
        let y = Math.max(a.y - 14, prevY + 46);
        y = Math.min(y, wrap.clientHeight - 60);
        prevY = y;
        label.style.transform = `translate(${colX}px, ${y}px)`;
        label.style.opacity = wide ? "1" : "0";
        if (line) {
          line.setAttribute("x1", String(a.x)); line.setAttribute("y1", String(a.y));
          line.setAttribute("x2", String(colX - 6)); line.setAttribute("y2", String(y + 9));
        }
        if (dot) { dot.setAttribute("cx", String(a.x)); dot.setAttribute("cy", String(a.y)); }
      }
    };
    let raf = 0, lost = false, onScreen = true, clock = 0, last = performance.now();
    let explode = 0, az = AZ0, el = EL0;
    const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
    let frames = 0, fpsT = last, slow = 0, degraded = false;
    let dpr = Math.min(2, window.devicePixelRatio || 1);

    const draw = () => { if (!lost) place(renderer.render({ explode, azimuth: az, elevation: el })); };
    const shouldRun = () => !lost && !degraded && onScreen && !document.hidden && !reducedQ.matches;
    const tick = (now: number) => {
      raf = 0;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      clock += dt;
      explode = autoExplode(clock);
      pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 3);
      pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 3);
      az = AZ0 + 0.17 * Math.sin((clock / 26) * Math.PI * 2) + pointer.sx * 0.07;
      el = EL0 + 0.03 * Math.sin((clock / 19) * Math.PI * 2) - pointer.sy * 0.04;
      draw();
      frames++;
      if (now - fpsT > 1000) {
        const fps = Math.round((frames * 1000) / (now - fpsT));
        frames = 0; fpsT = now;
        // fi3's frame governor: a GPU that cannot hold ~25 fps loses DPR 2,
        // then the motion. The bit stays; only the movement goes.
        slow = fps < 25 ? slow + 1 : 0;
        if (slow >= 2) { slow = 0; if (dpr > 1) { dpr = 1; resize(); } else degraded = true; }
      }
      if (shouldRun()) raf = requestAnimationFrame(tick);
    };
    const ensure = () => {
      if (shouldRun()) {
        if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
        return;
      }
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (reducedQ.matches) { explode = 1; az = AZ0; el = EL0; }
      draw();
    };
    const resize = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      const budget = Math.sqrt(3.2e6 / Math.max(1, w * h));
      wide = w >= WIDE;
      wrap.toggleAttribute("data-wide", wide);
      renderer.resize(w, h, Math.min(dpr, budget));
      renderer.setLayout(layoutFor(w));
      draw();
    };
    new ResizeObserver(resize).observe(wrap);
    resize();
    new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; ensure(); }).observe(wrap);
    document.addEventListener("visibilitychange", ensure);
    reducedQ.addEventListener?.("change", ensure);
    wrap.addEventListener("pointermove", (e) => {
      const r = wrap.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    });
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault(); lost = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0; wrap.removeAttribute("data-live");
    });
    canvas.addEventListener("webglcontextrestored", () => {
      if (!renderer.init(model)) return;
      lost = false; renderer.setPalette(readPalette(probe));
      resize(); ensure(); wrap.setAttribute("data-live", "");
    });
    ensure();
    // The canvas fades in over the line drawing on its first frame.
    wrap.setAttribute("data-live", "");
  };

  const near = new IntersectionObserver((es) => {
    if (!es.some((e) => e.isIntersecting)) return;
    near.disconnect();
    loadModel().then((m) => { try { start(m); } catch { /* the drawing stays */ } });
  }, { rootMargin: "600px 0px" });
  near.observe(wrap);
}

try {
  document.querySelectorAll<HTMLElement>(".bitplate").forEach(mount);
} catch { /* the drawing stays */ }
