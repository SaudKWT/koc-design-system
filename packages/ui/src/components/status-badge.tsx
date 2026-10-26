import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  Info,
  OctagonAlert,
  Wrench,
} from "lucide-react";

import { cn } from "../lib/utils";

/**
 * StatusBadge — operational state for wells, assets, jobs and runs.
 *
 * This is the most safety-relevant component in the system, and its API is shaped
 * to make the unsafe version unbuildable rather than merely discouraged.
 *
 * WCAG 1.4.1 ("Use of Color") requires that colour is never the *only* carrier of
 * meaning. The usual way that rule is broken is not malice — it is a `<Badge
 * variant="destructive">` with a colour and nothing else, shipped by someone in a
 * hurry. So this component does not accept a colour. It accepts a `status`, and
 * derives colour, icon and label together. There is no prop that lets a caller
 * keep the red and drop the icon.
 *
 * Why it matters here specifically: roughly 1 in 12 men has a colour-vision
 * deficiency, and KOC's operational readership skews heavily male. A red/green
 * status pair distinguished by hue alone is unreadable for a meaningful share of
 * the people this dashboard is for. The icon is not decoration — for those
 * readers it is the entire signal.
 */
export type OperationalStatus =
  | "producing"
  | "normal"
  | "warning"
  | "critical"
  | "shutin"
  | "maintenance"
  | "offline"
  | "unknown";

interface StatusSpec {
  /** Default human-readable label. Overridable, but never removable. */
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
  /** The icon carries the hue; the label stays dark, as on shadcn's badge. */
  iconClassName: string;
  /** Prefix announced to screen readers, so the state is spoken, not just seen. */
  srPrefix: string;
}

/**
 * Three steps of weight, and the step IS the importance:
 *
 *   outline   — a state to read: producing, normal, maintenance, shut-in…
 *   tinted    — warning: needs attention, findable down a column without reading
 *   solid     — critical: act now
 *
 * The label is always the foreground colour, as on shadcn's badge; the hue
 * lives in the icon (and, for the top two steps, the ground). Colour is never
 * the only carrier — each status has its own icon shape — so the hue can be
 * this quiet on the outline step without breaking WCAG 1.4.1.
 */
const OUTLINE = "border-border text-foreground";

const STATUS: Record<OperationalStatus, StatusSpec> = {
  producing: {
    label: "Producing",
    icon: CheckCircle2,
    className: OUTLINE,
    iconClassName: "text-success-muted-foreground",
    srPrefix: "Status: producing",
  },
  normal: {
    label: "Normal",
    icon: CheckCircle2,
    className: OUTLINE,
    iconClassName: "text-success-muted-foreground",
    srPrefix: "Status: normal",
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    className: "border-transparent bg-warning-muted text-foreground",
    iconClassName: "text-warning-muted-foreground",
    srPrefix: "Status: warning",
  },
  critical: {
    label: "Critical",
    icon: OctagonAlert,
    // The only status that gets a solid fill. In a column of outlined and
    // tinted badges the filled one is pre-attentively visible — an operator
    // finds it without reading. Reserved exclusively for "act now"; using it
    // decoratively anywhere else devalues it everywhere.
    className: "border-transparent bg-destructive text-destructive-foreground",
    iconClassName: "",
    srPrefix: "Status: critical, action required",
  },
  shutin: {
    label: "Shut-in",
    icon: CircleSlash,
    className: OUTLINE,
    iconClassName: "text-muted-foreground",
    srPrefix: "Status: shut in",
  },
  maintenance: {
    label: "Maintenance",
    icon: Wrench,
    className: OUTLINE,
    iconClassName: "text-info-muted-foreground",
    srPrefix: "Status: under maintenance",
  },
  offline: {
    label: "Offline",
    icon: CircleDashed,
    className: OUTLINE,
    iconClassName: "text-muted-foreground",
    srPrefix: "Status: offline",
  },
  unknown: {
    label: "Unknown",
    icon: Info,
    className: OUTLINE,
    iconClassName: "text-muted-foreground",
    srPrefix: "Status: unknown",
  },
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: OperationalStatus;
  /** Override the displayed text (e.g. "Shut-in — pump 3"). The icon stays. */
  label?: string;
  /**
   * Hide the text label, leaving the icon. Only for genuinely space-constrained
   * cells — the accessible name is preserved via sr-only text, so this stays
   * conformant, but a visible label is better for everyone. Defaults to false.
   */
  iconOnly?: boolean;
}

const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ status, label, iconOnly = false, className, ...props }, ref) => {
    const spec = STATUS[status] ?? STATUS.unknown;
    const Icon = spec.icon;
    const text = label ?? spec.label;

    return (
      <span
        ref={ref}
        data-slot="status-badge"
        data-status={status}
        className={cn(
          // Badge's shape (shadcn's, with our corner): 20px, 12px type. The
          // border is always there, transparent on the tinted and solid steps,
          // so all three are the same size in a column.
          "inline-flex h-5 shrink-0 items-center rounded-md border font-medium",
          "text-xs whitespace-nowrap",
          iconOnly ? "w-5 justify-center" : "gap-1 px-2",
          spec.className,
          className,
        )}
        {...props}
      >
        {/* aria-hidden because the state is already announced via sr-only text —
            otherwise a screen reader says it twice. */}
        <Icon className={cn("size-3 shrink-0", spec.iconClassName)} aria-hidden="true" />
        <span className="sr-only">{spec.srPrefix}</span>
        {!iconOnly && <span aria-hidden="true">{text}</span>}
      </span>
    );
  },
);
StatusBadge.displayName = "StatusBadge";

export { StatusBadge, STATUS as statusSpecs };
