/**
 * Scroll → particle-field progress.
 *
 * Every element under `root` carrying `data-field-key="<i>"` is the scroll anchor for key i of
 * the field's sequence. While the middle of the viewport is inside an anchor (less a margin at
 * each end) the field holds that key; between two anchors it morphs linearly from one to the
 * next. An anchor that is not rendered (zero height, e.g. `hidden` at this breakpoint) is
 * skipped, so a page can offer different anchors per breakpoint under the same key.
 *
 * Layout is read only when it can have changed (ResizeObserver, resize, fonts): anchors are
 * cached in page coordinates. On scroll, one rAF per frame reads `scrollY` and nothing else.
 */

import { useEffect, type RefObject } from "react";

import type { ParticleFieldHandle } from "./ParticleField";

interface Span {
  key: number;
  top: number;
  bottom: number;
}

/** Progress for viewport-centre `y` (page px) given the anchors, sorted by key. */
export function progressAt(y: number, spans: Span[], vh: number): number {
  if (!spans.length) return 0;
  const hold = spans.map((s) => {
    const m = Math.min(0.28 * vh, 0.35 * (s.bottom - s.top));
    return [s.top + m, s.bottom - m] as const;
  });
  if (y <= hold[0][1]) return spans[0].key;
  for (let i = 0; i < spans.length - 1; i++) {
    const end = hold[i][1], next = hold[i + 1][0];
    if (y <= end) return spans[i].key;
    if (y < next) {
      const t = (y - end) / Math.max(1, next - end);
      return spans[i].key + t * (spans[i + 1].key - spans[i].key);
    }
  }
  return spans[spans.length - 1].key;
}

export function useFieldScroll(field: RefObject<ParticleFieldHandle | null>, root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let spans: Span[] = [];
    let vh = window.innerHeight;
    let raf = 0;
    let dead = false;
    const apply = () => {
      raf = 0;
      field.current?.setProgress(progressAt(window.scrollY + vh * 0.5, spans, vh));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const measure = () => {
      if (dead) return;
      vh = window.innerHeight;
      const y = window.scrollY;
      spans = Array.from(el.querySelectorAll<HTMLElement>("[data-field-key]"))
        .map((n) => {
          const r = n.getBoundingClientRect();
          return { key: Number(n.dataset.fieldKey), top: r.top + y, bottom: r.bottom + y, h: r.height };
        })
        .filter((s) => s.h > 0 && Number.isFinite(s.key))
        .sort((a, b) => a.key - b.key || a.top - b.top)
        .map(({ key, top, bottom }) => ({ key, top, bottom }));
      onScroll();
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
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
  }, [field, root]);
}
