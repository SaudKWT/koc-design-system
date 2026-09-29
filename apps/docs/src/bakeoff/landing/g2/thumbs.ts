/**
 * The team cards' wellsite thumbnails, for daily use.
 *
 * v1 drew them with the hero's live renderer. v2's live drawing lives in the
 * footer and only mounts when the footer comes near, so the cards cannot wait
 * for it. Instead a throwaway offscreen renderer paints them once, at browser
 * idle, and they are cached per theme in localStorage: the hundredth visit does
 * no WebGL work at load at all. A software rasteriser (VDI, blocklisted GPU)
 * skips them — the cards read fine without.
 */

import { useEffect, useState } from "react";

import { member, type Vec3 } from "./gl/math";
import { readPalette } from "./gl/palette";
import { fitCamera, Renderer, type Frame } from "./gl/renderer";
import { buildModel, hoseCurve, PART_TEAMS, rigState, STILL_T } from "./gl/rig";
import { INST_STRIDE, MAT, PART, ROLE, SEG_STRIDE, writeInstance, writeSeg } from "./gl/scene";

/** Bump when the model or framing changes, so stale cached drawings are dropped. */
const MODEL_VERSION = 1;
const CACHE_KEY = `dweg-landing:g2-thumbs:v${MODEL_VERSION}`;
const W = 208;
const H = 144;
const YAW = 1.01;
const PITCH = 0.54;

/** Framing where a part's own bounds would not read at card size (see v1). */
const THUMB: Partial<Record<number, { bounds: [Vec3, Vec3]; radial?: number; pitch?: number }>> = {
  [PART.rig]: { bounds: [[-24, 0, -26], [32, 96, 26]] },
  [PART.well]: { bounds: [[-9, -110, -9], [9, -4, 9]], radial: 7, pitch: 0.42 },
};

function isSoftware(gl: WebGL2RenderingContext): boolean {
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  const name = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  return /swiftshader|llvmpipe|softpipe|software|basic render|\bwarp\b/i.test(name);
}

function paint(): Record<number, string> | null {
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = 1;
  const gl = cvs.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: true });
  if (!gl) return null;
  const release = () => gl.getExtension("WEBGL_lose_context")?.loseContext();
  if (isSoftware(gl)) {
    release();
    return null;
  }
  try {
    const model = buildModel();
    const renderer = new Renderer(gl, model);
    renderer.setPalette(readPalette());
    renderer.dpr = 2;
    const s = rigState(STILL_T);
    // the rig's thumbnail carries the stand on the elevator and the rotary hose
    const stands = new Float32Array(2 * INST_STRIDE);
    let nStands = 0;
    for (const st of [s.attached, s.stump]) {
      if (!st) continue;
      writeInstance(stands, nStands++, member(st[0], st[1], 1, 1), PART.rig, MAT.fine, 0);
    }
    const hose = hoseCurve(s.quill, 256);
    const segs = new Float32Array(hose.length * SEG_STRIDE);
    for (let i = 0; i < hose.length - 1; i++)
      writeSeg(segs, i, hose[i], hose[i + 1], { role: ROLE.ink, alpha: 0.85, width: 1.3, part: PART.rig });

    const out = document.createElement("canvas");
    out.width = W * 2;
    out.height = H * 2;
    const c2 = out.getContext("2d");
    if (!c2) return null;
    const thumbs: Record<number, string> = {};
    for (const part of new Set(Object.values(PART_TEAMS))) {
      const spec = THUMB[part];
      const b = spec?.bounds ?? [model.partMin.get(part)!, model.partMax.get(part)!];
      if (!b[0]) continue;
      const pts: Vec3[] = [];
      for (let c = 0; c < 8; c++) pts.push([c & 1 ? b[1][0] : b[0][0], c & 2 ? b[1][1] : b[0][1], c & 4 ? b[1][2] : b[0][2]]);
      const cam = fitCamera(pts, [YAW], spec?.pitch ?? PITCH, W * 2, H * 2, { l: 10, r: 10, t: 10, b: 10 });
      const frame: Frame = {
        cam,
        quill: s.quill,
        time: 0,
        flowAmt: 1,
        highlight: -1,
        hiAmt: 0,
        xray: [],
        isolate: part,
        radial: spec?.radial ?? 1,
        dynSegs: segs,
        dynSegCount: part === PART.rig ? hose.length - 1 : 0,
        dynStands: stands,
        dynStandCount: part === PART.rig ? nStands : 0,
      };
      const img = renderer.snapshot(frame, W * 2, H * 2);
      if (!img) continue;
      c2.clearRect(0, 0, out.width, out.height);
      c2.putImageData(img, 0, 0);
      // WebP where the browser encodes it (Chromium, so Edge), PNG otherwise
      const webp = out.toDataURL("image/webp", 0.9);
      thumbs[part] = webp.startsWith("data:image/webp") ? webp : out.toDataURL("image/png");
    }
    return thumbs;
  } catch {
    return null;
  } finally {
    release();
  }
}

const themeKey = () => `${CACHE_KEY}:${document.documentElement.classList.contains("dark") ? "dark" : "light"}`;

function readCache(key: string): Record<number, string> | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<number, string>) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, v: Record<number, string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage full or blocked: they are simply repainted next visit */
  }
}

/** Part id → data URL. Empty until painted (first visit) or read from cache. */
export function useWellsiteThumbnails(): Record<number, string> {
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  useEffect(() => {
    let cancelled = false;
    let handle = 0;
    // requestIdleCallback where it exists (Chromium, so Edge); a short timeout elsewhere
    const hasIdle = typeof window.requestIdleCallback === "function";
    const idle = (fn: () => void) => (hasIdle ? window.requestIdleCallback(fn, { timeout: 2000 }) : window.setTimeout(fn, 300));
    const cancelIdle = (h: number) => (hasIdle ? window.cancelIdleCallback(h) : window.clearTimeout(h));
    const load = () => {
      const key = themeKey();
      const cached = readCache(key);
      if (cached) {
        setThumbs(cached);
        return;
      }
      cancelIdle(handle);
      handle = idle(() => {
        if (cancelled) return;
        const painted = paint();
        if (!painted || cancelled) return;
        writeCache(key, painted);
        if (key === themeKey()) setThumbs(painted);
      });
    };
    load();
    const mo = new MutationObserver(load);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      cancelled = true;
      cancelIdle(handle);
      mo.disconnect();
    };
  }, []);
  return thumbs;
}
