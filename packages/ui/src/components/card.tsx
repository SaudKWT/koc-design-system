import * as React from "react";
import { cn } from "../lib/utils";

/**
 * Card — the primary surface for grouping dashboard content.
 *
 * Uses `border-border` (decorative, quiet) rather than `border-input`. A card's
 * edge is a grouping cue, not a control affordance, so it is deliberately low
 * contrast — a 3:1 outline around every panel would turn a dense dashboard into
 * a grid of boxes.
 *
 * RESTYLED 2026-08-12 to the shadcn canonical shape, which is also what
 * shadcn-space's dashboard-shell-03 renders. Padding moved from each slot onto
 * the Card as `py-6` plus per-slot `px-6`, with a `gap-6` between slots. That is
 * what lets a card carry a header, a divider and a footer without every slot
 * re-declaring its own padding and fighting the one above it.
 *
 * IT MAKES CARDS TALLER. A header sitting directly on content gains 24px of gap.
 * That is the intended change and it is visible in any consuming app the moment
 * @koc/card is re-added — nothing errors, cards simply grow.
 *
 * WHAT WAS DELIBERATELY NOT COPIED FROM THE REFERENCE:
 *
 *   Its 14px description. That means moving --text-sm from 0.8125rem, which
 *   re-points a class used on every table cell and form label in every consuming
 *   app — the exact re-flow docs/consumer-reports/2026-08-12-dwos.md measured.
 *   Not worth one pixel on a card description.
 *
 *   Its borderless hairline (a ~10% ring, no border). Reproducing it means
 *   lightening --border to roughly neutral[100], which FAILS test:tokens against
 *   the 1.25:1 decorative floor, and collapses --border onto accent/secondary/
 *   muted — the same token collapse that broke the DWOS toggle in v0.1.4.
 *
 *   Its KPI tiles, which wash a whole card in 10%-alpha hue that does not track
 *   sentiment: -12% on green, +23% on red. That is decoratively the failure
 *   stat-card.tsx exists to prevent, and its bg-teal-400/10 is a raw palette
 *   colour, which is invariant 1 outright.
 */
/*
 * RESTYLED AGAIN 2026-10-25 — the rig3 surface, which Saud chose as the base
 * for the whole system:
 *
 *   rounded-xl, a hairline border, NO shadow, and the card token at 70% over
 *   a backdrop blur. The page's fog shows faintly through, so a card reads as
 *   a pane laid on the page rather than a box lifted off it — the hero's fade
 *   continues under the content instead of stopping at a white edge.
 *
 *   Denser: 16px padding and a 12px gap, down from 24/24. rig3 runs eight tiles
 *   across a 1440px screen under a hero; at 24px that does not fit, and the
 *   whitespace that matters is BETWEEN sections, not inside every card.
 *
 *   Quiet titles: CardTitle is 14px medium, CardDescription 12px. The data is
 *   what a card is for; section headings (PageHeader's SectionHeading) carry
 *   the page's hierarchy in light large type, so card chrome need not shout.
 *
 * IT MAKES CARDS SMALLER — the reverse of the August change. Visible in any
 * consuming app the moment @koc/card is re-added; nothing errors.
 *
 * Contrast is unaffected: 70% card over the background lands between two
 * surfaces that test:tokens already clears every foreground against.
 */
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card"
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card/70 py-4 text-card-foreground backdrop-blur",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card-header"
      /* A grid, so CardAction can occupy a second column spanning both rows
         without the title and description having to know it is there. */
      className={cn(
        "grid auto-rows-min grid-rows-[auto_auto] items-start gap-0.5 px-4",
        "has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        "[.border-b]:pb-4",
        className,
      )}
      {...props}
    />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card-title"
      /* 14px medium since the rig3 restyle (it was 18px semibold): the card's
         title labels its content, it does not head the page — SectionHeading
         does that. No `tracking-tight`: foundation.ts's letterSpacing scale is
         not emitted except for `caps`, so it would silently apply Tailwind's
         -0.025em rather than KOC's -0.015em. */
      className={cn("text-sm font-medium", className)}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="card-content" className={cn("px-4", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card-footer"
      className={cn("flex items-center px-4 [.border-t]:pt-4", className)}
      {...props}
    />
  ),
);
CardFooter.displayName = "CardFooter";

/**
 * CardAction — a control in the card's top-right, beside the title.
 *
 * New, and not cosmetic: any block copied from ui.shadcn.com today uses
 * `<CardAction>`, and without it those blocks do not compile against @koc/card.
 * It also replaces the pattern this repo had been hand-rolling —
 * `<CardHeader className="flex-row items-start justify-between space-y-0">` —
 * which is now inert, because CardHeader is a grid and `flex-row` does nothing
 * to it.
 */
const CardAction = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  ),
);
CardAction.displayName = "CardAction";

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
