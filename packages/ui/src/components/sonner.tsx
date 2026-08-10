"use client";

import * as React from "react";
import {
  CircleCheck,
  Info,
  Loader2,
  OctagonX,
  TriangleAlert,
} from "lucide-react";
import { Toaster as Sonner, toast, type ToasterProps } from "sonner";

/**
 * Toaster — transient confirmation, mounted once per app.
 *
 * Two changes from the stock shadcn wrapper.
 *
 * NO next-themes. The original reads the theme from `next-themes`, which is a
 * Next.js library; KOC apps are Vite and Next and plain SharePoint-hosted
 * bundles, and this system already decided dark mode is a `.dark` class on the
 * root. Taking a framework dependency for one boolean would make the toaster
 * unusable in two of the three.
 *
 * SEVERITY COLOURS COME FROM KOC TOKENS. Sonner ships its own green and red,
 * which are not the tested ones — `success` and `destructive` here have been
 * asserted against their foregrounds. A toast is also the one surface where a
 * wrong red is most likely to go unnoticed, because it is gone in four seconds.
 *
 * WHAT A TOAST IS NOT FOR, in an operations context: a toast is transient and
 * easily missed. Use it to confirm an action the user just took ("Report
 * voided"). Never use it as the only notification of an operational event — an
 * NPT threshold or a well going critical belongs in @koc/notification-menu,
 * where it persists until acknowledged.
 */

/** Watches the `.dark` class so the toaster follows the app's theme. */
function useIsDark(): boolean {
  const [dark, setDark] = React.useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );

  React.useEffect(() => {
    const el = document.documentElement;
    const update = () => setDark(el.classList.contains("dark"));
    update();
    // The class is toggled imperatively, so there is no event to listen for —
    // observing the attribute is the only way to stay in sync.
    const observer = new MutationObserver(update);
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return dark;
}

export function Toaster(props: ToasterProps) {
  const dark = useIsDark();

  return (
    <Sonner
      theme={dark ? "dark" : "light"}
      className="toaster group"
      // Each severity has its own icon, not just its own colour — the rule
      // StatusBadge and NotificationMenu already follow.
      icons={{
        success: <CircleCheck className="size-4" />,
        info: <Info className="size-4" />,
        warning: <TriangleAlert className="size-4" />,
        error: <OctagonX className="size-4" />,
        loading: <Loader2 className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          "--success-bg": "var(--popover)",
          "--success-text": "var(--success)",
          "--success-border": "var(--border)",
          "--error-bg": "var(--popover)",
          "--error-text": "var(--destructive)",
          "--error-border": "var(--border)",
          "--warning-bg": "var(--popover)",
          "--warning-text": "var(--warning)",
          "--warning-border": "var(--border)",
          "--info-bg": "var(--popover)",
          "--info-text": "var(--info)",
          "--info-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

/**
 * Re-exported so consumers import from `@koc/ui` rather than `sonner`.
 *
 * That keeps the dependency swappable: if sonner is ever replaced, forty apps
 * change one import path instead of every call site.
 */
export { toast };
