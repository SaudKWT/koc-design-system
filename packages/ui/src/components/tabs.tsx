"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Tabs as TabsPrimitive } from "radix-ui";

import { cn } from "../lib/utils";

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
        className,
      )}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  "group/tabs-list relative inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

/**
 * Tracks the active trigger's box so the indicator can slide to it.
 *
 * Measured from the DOM rather than derived from the value, because the trigger
 * widths depend on their labels — "Report" and "History" are not the same size,
 * and a fixed-width indicator would be wrong on every set of tabs but one.
 *
 * Three things can move it, and all three have to be watched or the indicator
 * desynchronises and looks broken:
 *   - the active tab changing            → MutationObserver on data-state
 *   - the list resizing                  → ResizeObserver
 *   - fonts loading and relayout         → also ResizeObserver, on the list
 */
function useActiveIndicator(listRef: React.RefObject<HTMLDivElement | null>) {
  const [box, setBox] = React.useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () => {
      const active = list.querySelector<HTMLElement>('[data-state="active"]');
      if (!active) return setBox(null);
      setBox({
        left: active.offsetLeft,
        top: active.offsetTop,
        width: active.offsetWidth,
        height: active.offsetHeight,
      });
    };

    measure();

    const mo = new MutationObserver(measure);
    mo.observe(list, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });

    const ro = new ResizeObserver(measure);
    ro.observe(list);

    return () => {
      mo.disconnect();
      ro.disconnect();
    };
  }, [listRef]);

  return box;
}

function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  const ref = React.useRef<HTMLDivElement>(null);
  const box = useActiveIndicator(ref);
  // First paint has no measurement yet. Rendering the indicator at 0,0 and then
  // animating it into place would make every tab set slide in from the left on
  // mount, which reads as a page glitch rather than as a transition.
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    if (box) setReady(true);
  }, [box]);

  return (
    <TabsPrimitive.List
      ref={ref}
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      {/*
       * The sliding indicator.
       *
       * `ease-spring` is the overshoot curve that has sat in foundation.ts
       * unused since the first commit, described there as "for elements that
       * should feel physical". A tab indicator is exactly that: it is a real
       * object moving to a new position, not a colour fading in.
       *
       * Position and size are inline styles because they are measured pixels,
       * not design decisions — the token layer has nothing to say about how wide
       * the word "History" is. Everything else comes from tokens.
       *
       * `prefers-reduced-motion` is handled globally in the base layer, which
       * collapses transition-duration to 0.01ms. The indicator still moves; it
       * just arrives instantly.
       */}
      {variant === "default" && box && (
        <span
          aria-hidden
          data-slot="tabs-indicator"
          className={cn(
            "absolute rounded-md bg-background shadow-sm",
            "transition-[transform,width,height] duration-slow ease-spring",
            !ready && "transition-none",
          )}
          style={{
            transform: `translate(${box.left}px, ${box.top}px)`,
            width: box.width,
            height: box.height,
          }}
        />
      )}
      {children}
    </TabsPrimitive.List>
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // `relative z-10` so the label sits above the sliding indicator behind it.
        "relative z-10 inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-colors duration-fast ease-out group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // The active background is drawn by the indicator now, not by the
        // trigger — a trigger that paints its own background cannot slide.
        "data-[state=active]:text-foreground",
        // `line` variant keeps its underline and gets no sliding pill.
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity after:duration-fast group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
