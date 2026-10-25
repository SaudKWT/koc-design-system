import * as React from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "../lib/utils";
import { Card } from "./card";
import { Sparkline } from "./sparkline";

/**
 * StatCard — a single KPI: label, value, unit, and change over a period.
 *
 * ── The rig3 tile (2026-10-25) ────────────────────────────────────────────────
 *
 * Restyled to the DWEG landing's rig3 figures, which Saud chose as the base for
 * the whole system. The figure is LIGHT and large, the chrome around it quiet:
 * the label in plain text, an optional uppercase `tag` (LIVE, YTD, COST) set
 * wide at the right, the change line with a trend glyph, a `trend` sparkline,
 * and an optional one-line `description` of what the figure counts. A semibold
 * 30px number shouted over its own label; a light one reads as the data.
 *
 * Two densities. `default` is the dashboard tile. `compact` is the KPI strip —
 * eight across under a hero — where the sparkline grows into whatever height
 * the strip gives the card, and the change keeps only its number.
 *
 * Everything below about `intent` is unchanged and still the point.
 *
 * ── The `intent` prop, and why it exists ──────────────────────────────────────
 *
 * Nearly every stat card ever written colours the delta green when the arrow
 * points up. That is a bug wearing a convention's clothing, and it is an actively
 * dangerous one at an oil company:
 *
 *   Production up 4%   → good
 *   Gas flared up 4%   → bad, and reportable
 *   Emissions up 4%    → bad
 *   Downtime up 4%     → bad
 *   Water cut up 4%    → bad
 *
 * A component that infers sentiment from direction gets *half* of a KOC dashboard
 * backwards, and it does so silently and confidently — a green arrow next to
 * rising flare volume tells an operator the opposite of the truth.
 *
 * So direction and sentiment are separate inputs here. `delta` carries the
 * arithmetic (which way it moved); `intent` carries the meaning (whether that is
 * good). Direction is derived and cannot be wrong. Sentiment must be declared by
 * the caller, because only the caller knows what the metric *is*.
 *
 * `intent="higher-is-better"` is NOT the default — `"neutral"` is. An unthinking
 * StatCard renders an honest grey delta rather than a confident wrong colour.
 */
export type StatIntent =
  /** Up is good, down is bad. Production, uptime, recovery factor. */
  | "higher-is-better"
  /** Down is good, up is bad. Flaring, emissions, downtime, water cut, cost. */
  | "lower-is-better"
  /** No inherent sentiment — the delta renders grey. The default. */
  | "neutral";

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  /** The value. Pre-formatted by the caller — this component will not guess at
   *  locale, precision or unit conventions for a plant measurement. */
  value: string | number;
  unit?: string;
  /** Signed change. Sign gives direction; `intent` gives meaning. */
  delta?: number;
  /** How to format the delta. */
  deltaFormat?: "percent" | "absolute";
  /** What the delta is measured against, e.g. "vs last month". */
  deltaLabel?: string;
  /** Whether a rise is good, bad, or neither. Defaults to "neutral" on purpose. */
  intent?: StatIntent;
  icon?: React.ReactNode;
  /**
   * A short uppercase tag set at the top right — what kind of figure this is
   * ("LIVE", "YTD", "COST"). Rendered as text, so keep it to one word.
   */
  tag?: string;
  /** The recent series, oldest first. Drawn as a sparkline under the figure. */
  trend?: number[];
  /** One line on what the figure counts. Also the tile's tooltip in `compact`. */
  description?: string;
  /** `compact` for a KPI strip; `default` for a dashboard tile. */
  density?: "default" | "compact";
}

/** Direction is arithmetic. Sentiment is editorial. Only the first is derivable. */
function sentimentOf(delta: number, intent: StatIntent): "good" | "bad" | "flat" {
  if (delta === 0 || intent === "neutral") return "flat";
  const rising = delta > 0;
  if (intent === "higher-is-better") return rising ? "good" : "bad";
  return rising ? "bad" : "good"; // lower-is-better
}

const SENTIMENT_CLASS: Record<"good" | "bad" | "flat", string> = {
  good: "text-success",
  bad: "text-destructive",
  flat: "text-muted-foreground",
};

const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  (
    {
      label,
      value,
      unit,
      delta,
      deltaFormat = "percent",
      deltaLabel,
      intent = "neutral",
      icon,
      tag,
      trend,
      description,
      density = "default",
      className,
      ...props
    },
    ref,
  ) => {
    const compact = density === "compact";
    const hasDelta = typeof delta === "number";
    const sentiment = hasDelta ? sentimentOf(delta, intent) : "flat";
    const Glyph = !hasDelta || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;

    // A real minus sign, not a hyphen: "−1.2" sets on the same width as "+1.2".
    const deltaText = hasDelta
      ? `${delta > 0 ? "+" : delta < 0 ? "\u2212" : ""}${
          deltaFormat === "percent" ? `${Math.abs(delta).toFixed(1)}%` : Math.abs(delta).toLocaleString("en-GB")
        }`
      : null;

    // `gap-1` is load-bearing: Card sets its own gap and padding for content
    // cards, and a tile's rows are direct children of it.
    return (
      <Card
        ref={ref}
        data-slot="stat-card"
        data-density={density}
        title={compact ? description : undefined}
        className={cn("min-w-0 gap-1", compact ? "rounded-lg px-3 py-2" : "p-4", className)}
        {...props}
      >
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          <span className={cn("min-w-0 truncate", compact ? "text-2xs leading-tight text-muted-foreground" : "text-sm")}>
            {label}
          </span>
          {tag ? (
            <span className="shrink-0 text-2xs font-medium uppercase tracking-caps text-muted-foreground">{tag}</span>
          ) : (
            icon && <span className="shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span>
          )}
        </div>

        <div className={cn("flex items-baseline gap-1.5 whitespace-nowrap", !compact && "mt-1")}>
          {/* data-slot drives tabular-nums from the base layer, so a column of
              these aligns on the decimal instead of shimmying digit by digit. */}
          <span
            data-slot="kpi-value"
            className={cn("font-light tracking-tight", compact ? "text-2xl leading-7" : "text-3xl leading-9")}
          >
            {value}
          </span>
          {unit && <span className={cn("text-muted-foreground", compact ? "text-2xs" : "text-sm")}>{unit}</span>}
        </div>

        {/* In a compact tile the trend fills the height the strip gives the card
            and the change sits under it; in a default tile the change comes first
            and the trend is a fixed band beneath. */}
        {compact && trend && <Sparkline values={trend} className="h-auto min-h-6 flex-1 text-primary/50" />}

        {hasDelta ? (
          <div className={cn("flex min-w-0 items-center gap-1.5", compact ? "text-2xs" : "text-xs")}>
            <span className={cn("inline-flex shrink-0 items-center gap-1 font-medium", SENTIMENT_CLASS[sentiment])}>
              <Glyph className={compact ? "size-3" : "size-3.5"} aria-hidden="true" />
              <span data-slot="kpi-value" aria-hidden="true">{deltaText}</span>
            </span>
            {deltaLabel && !compact && (
              <span aria-hidden="true" className="truncate text-muted-foreground">{deltaLabel}</span>
            )}
            {/* The glyph and colour are visual; this is what a screen reader gets.
                "increase"/"decrease" is stated in words so the direction does not
                depend on perceiving an icon. */}
            <span className="sr-only">
              {deltaText}{" "}
              {delta === 0
                ? "no change"
                : `${delta > 0 ? "increase" : "decrease"}${
                    sentiment !== "flat" ? `, ${sentiment === "good" ? "favourable" : "unfavourable"}` : ""
                  }`}
              {deltaLabel ? ` ${deltaLabel}` : ""}
            </span>
          </div>
        ) : (
          compact && <p className="truncate text-2xs text-muted-foreground">No comparison</p>
        )}

        {!compact && trend && <Sparkline values={trend} className="mt-2 h-9" />}
        {!compact && description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </Card>
    );
  },
);
StatCard.displayName = "StatCard";

export { StatCard };
