/**
 * Scroll → particle-field progress, for the footer stage (v2).
 *
 * v1 walked the field through the whole page from `[data-*-key]` anchors, because the field sat
 * behind everything. In v2 the field lives only in the footer: a sticky stage inside a tall
 * track. While the track scrolls past, the stage holds still and the reader's scroll walks the
 * sequence, key by key; before the stage sticks it shows the first key (the terrain), and after
 * the last morph it holds the last.
 *
 * Layout is read only when it can have changed (ResizeObserver on the track and on <body>, whose
 * height changes when anything above the footer does, e.g. the directory filtering; resize;
 * fonts). On scroll, one rAF per frame reads `scrollY` and nothing else.
 */

import { useEffect, type RefObject } from "react";

import type { ParticleFieldHandle } from "./ParticleField";

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** Share of the sticky range held on the first key before the first morph, and on the last after. */
const LEAD = 0.08;
const TAIL = 0.14;
/** Share of each key-to-key step spent holding either side of the morph (so each model settles). */
const HOLD = 0.2;

/**
 * Progress through `count` keys for `s`, the stage's position in its sticky range (0 when it
 * sticks, 1 when it lets go; negative while the footer is still arriving).
 */
export function stageProgress(s: number, count: number): number {
  if (count < 2) return 0;
  const u = clamp((s - LEAD) / (1 - LEAD - TAIL), 0, 1) * (count - 1);
  const i = Math.min(Math.floor(u), count - 2);
  return i + clamp((u - i - HOLD) / (1 - 2 * HOLD), 0, 1);
}

export function useStageScroll(
  track: RefObject<HTMLElement | null>,
  field: RefObject<ParticleFieldHandle | null>,
  count: number,
  /** The key nearest the progress (the figure to caption). Called only when it changes. */
  onFigure: (i: number) => void,
  /** Re-run when the lazily mounted field appears, so it starts where the reader is. */
  mounted: boolean,
) {
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let top = 0;
    let range = 1;
    let raf = 0;
    let dead = false;
    let figure = -1;
    const apply = () => {
      raf = 0;
      const p = stageProgress((window.scrollY - top) / range, count);
      field.current?.setProgress(p);
      const f = Math.round(p);
      if (f !== figure) {
        figure = f;
        onFigure(f);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const measure = () => {
      if (dead) return;
      const r = el.getBoundingClientRect();
      top = r.top + window.scrollY;
      range = Math.max(1, r.height - window.innerHeight);
      onScroll();
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(document.body);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure).catch(() => {});
    measure();
    return () => {
      dead = true;
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
    };
  }, [track, field, count, onFigure, mounted]);
}
