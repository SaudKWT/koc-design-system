import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

/**
 * Badge — a small label for counts, tags and categories.
 *
 * Shaped like shadcn's badge (Base UI track): 20px high, borderless, and the
 * status variants are a pale ground with the hue as the label rather than a
 * solid fill. The corner is ours — `rounded-md`, the radius buttons and inputs
 * use — where shadcn's is a pill. The grounds are the `*-muted` tokens, not
 * shadcn's `bg-destructive/10`: an opacity wash of warning is beige, and a token
 * is a pair `test:tokens` can hold to 4.5:1.
 *
 * For plant/asset state use `StatusBadge` instead: it forces an icon and a text
 * label, which this component does not.
 */
const badgeVariants = cva(
  [
    "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden",
    "rounded-md border border-transparent px-2 py-0.5",
    "text-xs font-medium whitespace-nowrap transition-colors duration-fast ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "[&_svg]:pointer-events-none [&_svg]:size-3 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-destructive-muted text-destructive-muted-foreground",
        success: "bg-success-muted text-success-muted-foreground",
        warning: "bg-warning-muted text-warning-muted-foreground",
        info: "bg-info-muted text-info-muted-foreground",
        // A badge is not a control, so its edge is the decorative `border`,
        // not `input` (invariant 4).
        outline: "border-border text-foreground",
      },
      shape: {
        label: "",
        /**
         * A count next to a label — tab counts, unread markers, nav badges.
         *
         * `min-w-5` with `h-5` rather than a fixed `size-5`: at one digit the
         * min-width and height are equal so it renders as a true circle, and at
         * three digits it grows into a pill instead of clipping the number or
         * squashing it into an ellipse. A hard-coded circle looks right until
         * the first count reaches 100, which on an operations dashboard is a
         * matter of time.
         *
         * The padding is `px-1`, not `px-1.5`: at 1.5 a single digit plus 12px
         * of padding measured 21px against a 20px height — one pixel out of
         * round, which is invisible in a spec and obvious on a 20px circle.
         * At `px-1` the min-width wins for one and two digits and the padding
         * only takes over at three.
         *
         * `tabular-nums` so a count ticking 8 → 9 → 10 does not jitter.
         */
        count: "min-w-5 rounded-full px-1 tabular-nums",
      },
    },
    defaultVariants: { variant: "default", shape: "label" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, shape, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, shape }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
