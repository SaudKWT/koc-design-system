/**
 * The viewfinder — four primary L-brackets that snap to the panel you point at or tab into.
 *
 * Clean-room, after Space Hub's viewfinder corners (https://www.awwwards.com/sites/space-hub).
 * One absolutely positioned frame for the whole grid; a panel is anything with `data-panel`.
 * Pointer and keyboard are the same event path: `pointermove` and `focusin` both sight a panel,
 * the most recent one wins, and leaving the grid with both hands hides the frame. Geometry is
 * read only in those handlers and on resize — never in a scroll handler.
 *
 * Motion lives in drill-floor.css (`.c-viewfinder`): transform + size at duration-base with
 * ease-spring, the appear fade at duration-fast. It travels only between panels while it is
 * showing: every appearance — the first, and each one after the pointer or focus has left the
 * grid — lands on its panel and fades in there. Reduced motion: it jumps every time, but still
 * shows.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
} from "react";

type Box = { x: number; y: number; w: number; h: number };

const panelOf = (t: EventTarget | null) =>
  t instanceof Element ? t.closest<HTMLElement>("[data-panel]") : null;

export function useViewfinder<T extends HTMLElement>() {
  const gridRef = useRef<T>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [visible, setVisible] = useState(false);
  const [armed, setArmed] = useState(false);
  const pointerPanel = useRef<HTMLElement | null>(null);
  const focusPanel = useRef<HTMLElement | null>(null);
  const sighted = useRef<HTMLElement | null>(null);

  const sight = useCallback((panel: HTMLElement | null) => {
    sighted.current = panel;
    if (!panel) {
      // Hiding disarms travel: the next sighting must appear on its panel, never fly there
      // from wherever the frame was last seen.
      setVisible(false);
      setArmed(false);
      return;
    }
    setBox({ x: panel.offsetLeft, y: panel.offsetTop, w: panel.offsetWidth, h: panel.offsetHeight });
    setVisible(true);
  }, []);

  // Arm travel one frame AFTER each appearance, so the frame lands in place and only fades in.
  // `visible` gates it: arming on the hide render would leave the invisible frame armed, and the
  // next sighting would travel again.
  useEffect(() => {
    if (!box || !visible || armed) return;
    const raf = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(raf);
  }, [box, visible, armed]);

  // Panels reflow with the viewport; keep the frame on its panel.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const ro = new ResizeObserver(() => {
      if (sighted.current) sight(sighted.current);
    });
    ro.observe(grid);
    return () => ro.disconnect();
  }, [sight]);

  const handlers = {
    // Movement, not `pointerover`: Chromium fires pointerover when content scrolls under a still
    // cursor, so after a channel key scrolls a panel into view the panel under the cursor would
    // steal the frame from the one just focused. Only a pointer that actually moves sights.
    onPointerMove: (e: PointerEvent<T>) => {
      const p = panelOf(e.target);
      // Crossing a gutter keeps the last panel sighted rather than blinking.
      if (!p || p === pointerPanel.current) return;
      pointerPanel.current = p;
      sight(p);
    },
    onPointerLeave: () => {
      pointerPanel.current = null;
      sight(focusPanel.current);
    },
    onFocus: (e: FocusEvent<T>) => {
      const p = panelOf(e.target);
      focusPanel.current = p;
      if (p) sight(p);
    },
    onBlur: (e: FocusEvent<T>) => {
      if (gridRef.current?.contains(e.relatedTarget as Node | null)) return;
      focusPanel.current = null;
      sight(pointerPanel.current);
    },
  };

  const frame = (
    <div
      aria-hidden="true"
      className="c-viewfinder text-primary"
      data-visible={visible}
      data-armed={armed}
      style={
        box
          ? { transform: `translate(${box.x - 5}px, ${box.y - 5}px)`, width: box.w + 10, height: box.h + 10 }
          : undefined
      }
    >
      {(["tl", "tr", "bl", "br"] as const).map((at) => (
        <span key={at} data-at={at} className="c-corner [--c-arm:14px] [--c-stroke:2px]" />
      ))}
    </div>
  );

  return { gridRef, handlers, frame };
}
