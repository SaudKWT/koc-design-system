/**
 * BlurFade — ported from Magic UI's Blur Fade (21st.dev/@dillionverma/components/blur-fade).
 *
 * The original is framer-motion: `motion.div` animating y ±6px, opacity 0→1 and blur(6px)→0 on
 * mount or when in view. The port:
 *   - no framer-motion: a CSS keyframe in datum.css, started by `data-shown`;
 *   - in-view via the shared `useInView` (fires once), not framer's hook;
 *   - no colour at all, so nothing to map to tokens;
 *   - reduced motion (OS or the viewer's forced flag) renders the final state, no animation —
 *     handled in CSS, so it holds even before hydration effects run.
 * Kept: the 6px blur and offset, ease-out, a per-item delay for staggering.
 */

import type { CSSProperties, ReactNode } from "react";

import { cn } from "@koc/ui";

import { useInView } from "../shared";

export function BlurFade({
  children,
  className,
  delay = 0,
  inView = false,
  id,
}: {
  children: ReactNode;
  className?: string;
  /** Stagger, ms. */
  delay?: number;
  /** Wait until scrolled into view; otherwise play on mount. */
  inView?: boolean;
  id?: string;
}) {
  const [ref, seen] = useInView<HTMLDivElement>("0px 0px -8% 0px");
  const shown = !inView || seen;
  return (
    <div
      ref={ref}
      id={id}
      data-shown={shown}
      className={cn("datum-blur-fade", className)}
      style={{ "--bf-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}
