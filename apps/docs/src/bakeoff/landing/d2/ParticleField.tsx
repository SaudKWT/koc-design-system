/**
 * <ParticleField> — the React face of the stipple particle renderer (field-renderer.ts).
 *
 * The field walks a `sequence` of states (FieldKey: the terrain, or a drilling model framed in a
 * box of the canvas). Drive it either with the `progress` prop (re-renders) or, from scroll,
 * through the imperative handle — `ref.current.setProgress(p)` — which touches no React state.
 * `useStageScroll` (./useStageScroll) does the latter for the footer's sticky stage.
 *
 *   <ParticleField ref={field} className="absolute inset-0" sequence={keys} quietRef={stage} />
 *
 * v2: never fixed, never behind content. It fills one box that holds no link, KPI or field (the
 * footer stage), is mounted only when that box approaches, and pauses offscreen and in a hidden
 * tab (the renderer's own IntersectionObserver and visibilitychange).
 *
 * Decorative: the canvas, the static fallback and the rig label are all `aria-hidden`.
 *
 * StrictMode: the renderer is started in a task after the effect (so StrictMode's first,
 * throw-away mount never builds one), creates its own canvas and releases it in `destroy()`, so
 * any remount gets a fresh WebGL2 context rather than a lost one. Model sampling is cached per
 * module, so a remount costs no sampling.
 */

import { useEffect, useImperativeHandle, useRef, useState, type Ref, type RefObject } from "react";

import { cn } from "@koc/ui";

import { useReducedMotion } from "../shared";
import { FieldRenderer, type FieldKey } from "./field-renderer";

export { FIELD_MODELS, type FieldKey, type FieldModel } from "./field-renderer";
export { MODEL_INFO, type ModelId } from "./field-models";

export interface ParticleFieldHandle {
  /** Continuous position in `sequence`: 0 is the first key, 1 the second, 1.5 halfway between. */
  setProgress(p: number): void;
}

export interface ParticleFieldProps {
  ref?: Ref<ParticleFieldHandle>;
  className?: string;
  /** The states the field walks through, in order. Defaults to terrain → every model. */
  sequence?: readonly FieldKey[];
  /** Declarative progress. Prefer the handle for scroll-driven updates. */
  progress?: number;
  /**
   * Scope for pointer effects and for the `[data-datum2-quiet]` zones the shader keeps legible
   * (at most 8; the attribute's value is the feather in px). Zones are re-measured on resize,
   * reveal and font load — never on scroll. Defaults to the field's parent element.
   */
  quietRef?: RefObject<HTMLElement | null>;
  /** Rigs and directional well paths on the terrain. */
  rigs?: boolean;
  /** Multiplier on the flight speed. */
  speed?: number;
  /** 0–1 across the field: the column a hovered or focused category surveys. `null` for none. */
  focus?: number | null;
  /** Pointer swell, parallax and rig hover labels. */
  interactive?: boolean;
  /** 0.25–1: scales the particle budget (the device may lower it further). */
  density?: number;
}

export function ParticleField({
  ref,
  className,
  sequence,
  progress,
  quietRef,
  rigs = true,
  speed = 1,
  focus = null,
  interactive = true,
  density = 1,
}: ParticleFieldProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<FieldRenderer | null>(null);
  const reduced = useReducedMotion();
  const [fallback, setFallback] = useState(false);

  // Latest values for the creating effect, without making them re-create the renderer.
  const live = useRef({ reduced, focus, sequence, progress });
  live.current = { reduced, focus, sequence, progress };
  // Progress set through the handle before the renderer exists is kept for it.
  const pending = useRef<number | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      setProgress(p: number) {
        pending.current = p;
        rendererRef.current?.setProgress(p);
      },
    }),
    [],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // Started in a task of its own, after the page has committed and painted, not inside the
    // commit: init is one long task (shader compile and link, the composed-start search, the
    // first model) — ~1.3 s on a software rasteriser — and the page's links and controls must
    // not wait on decoration. It also means StrictMode's mount → unmount → mount builds ONE
    // renderer, not two: the first mount's start is cancelled before it runs. Progress, focus and
    // reduced motion set in the meantime are read here when it starts (the `live` / `pending`
    // refs), so nothing is lost.
    let renderer: FieldRenderer | null = null;
    const start = window.setTimeout(() => {
      renderer = new FieldRenderer(host, {
        scope: quietRef?.current ?? host.parentElement,
        label: labelRef.current,
        rigs,
        speed,
        density,
        interactive,
        reduced: live.current.reduced,
        sequence: live.current.sequence,
        progress: pending.current ?? live.current.progress ?? 0,
        onFallback: () => setFallback(true),
      });
      renderer.setFocus(live.current.focus);
      rendererRef.current = renderer;
    }, 0);
    return () => {
      clearTimeout(start);
      renderer?.destroy();
      rendererRef.current = null;
    };
  }, [quietRef, rigs, speed, density, interactive]);

  // Live: the viewer's forced flag and the OS setting both arrive through useReducedMotion.
  useEffect(() => {
    rendererRef.current?.setReduced(reduced);
  }, [reduced]);
  useEffect(() => {
    rendererRef.current?.setFocus(focus);
  }, [focus]);
  const seqKey = JSON.stringify(sequence ?? null);
  useEffect(() => {
    if (live.current.sequence) rendererRef.current?.setSequence(live.current.sequence);
  }, [seqKey]);
  useEffect(() => {
    if (progress !== undefined) rendererRef.current?.setProgress(progress);
  }, [progress]);

  return (
    <div ref={hostRef} aria-hidden="true" className={cn("datum2-field pointer-events-none overflow-hidden", className)}>
      {fallback && <div className="datum2-field-fallback absolute inset-0" />}
      <div
        ref={labelRef}
        data-datum2-on="false"
        className="absolute left-0 top-0 whitespace-nowrap rounded-md border border-border border-l-2 border-l-primary bg-background/90 px-2 py-1.5 font-mono text-xs text-foreground opacity-0 transition-opacity duration-slower ease-out data-[datum2-on=true]:opacity-100"
      />
    </div>
  );
}
