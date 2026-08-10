"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { cn } from "../lib/utils";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/**
 * DateRangeFilter — presets first, calendar second.
 *
 * The usual dashboard pattern is a bare date-range picker, and it is a poor fit
 * for operations work. "Yesterday's reports" and "this week" are the questions
 * people actually ask, dozens of times a day, and a calendar makes each of them
 * a four-interaction task: open, click a start day, navigate, click an end day.
 * Presets make the common case one click and leave the calendar for the genuine
 * exception.
 *
 * The presets are relative to a `today` the CALLER passes in. That is not
 * ceremony: reading the clock inside the component makes it untestable and makes
 * server and client disagree during hydration, and a "Today" filter that quietly
 * means a different day than the data does is the kind of bug nobody reports —
 * they just stop trusting the dashboard.
 */

export type DateRangePresetId = "today" | "7d" | "30d" | "month" | "custom";

export interface DateRangeValue {
  preset: DateRangePresetId;
  range?: DateRange;
}

const PRESETS: { id: Exclude<DateRangePresetId, "custom">; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "month", label: "This month" },
];

/** Resolve a preset to concrete dates, relative to the caller's `today`. */
export function resolvePreset(
  preset: Exclude<DateRangePresetId, "custom">,
  today: Date,
): DateRange {
  const end = new Date(today);
  const start = new Date(today);

  switch (preset) {
    case "today":
      break;
    case "7d":
      start.setDate(start.getDate() - 6);
      break;
    case "30d":
      start.setDate(start.getDate() - 29);
      break;
    case "month":
      start.setDate(1);
      break;
  }
  return { from: start, to: end };
}

function format(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export interface DateRangeFilterProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  /** Today's date. Passed in rather than read from the clock — see above. */
  today: Date;
  className?: string;
}

export function DateRangeFilter({
  value,
  onChange,
  today,
  className,
}: DateRangeFilterProps) {
  const [open, setOpen] = React.useState(false);

  const customLabel =
    value.preset === "custom" && value.range?.from
      ? value.range.to
        ? `${format(value.range.from)} – ${format(value.range.to)}`
        : format(value.range.from)
      : "Custom";

  return (
    <div
      className={cn("flex flex-wrap items-center gap-1", className)}
      role="group"
      aria-label="Date range"
    >
      {PRESETS.map((p) => {
        const active = value.preset === p.id;
        return (
          <Button
            key={p.id}
            type="button"
            size="sm"
            variant={active ? "default" : "outline"}
            // `aria-pressed` rather than relying on colour: these are toggles,
            // and which one is on must be available to a screen reader.
            aria-pressed={active}
            onClick={() => onChange({ preset: p.id, range: resolvePreset(p.id, today) })}
          >
            {p.label}
          </Button>
        );
      })}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant={value.preset === "custom" ? "default" : "outline"}
            aria-pressed={value.preset === "custom"}
          >
            <CalendarIcon aria-hidden className="mr-1.5 size-3.5" />
            {customLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            defaultMonth={value.range?.from ?? today}
            selected={value.range}
            onSelect={(range) => onChange({ preset: "custom", range })}
            numberOfMonths={2}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
