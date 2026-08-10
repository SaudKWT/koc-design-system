"use client";

import * as React from "react";
import { CalendarIcon, ChevronDown } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { cn } from "../lib/utils";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/**
 * DateRangeFilter — one compact trigger, presets and calendar inside.
 *
 * The first version put the presets in the toolbar as a row of five buttons.
 * That is one click to "last 7 days", which is good, and a permanent 340px of
 * chrome saying the same thing every day, which is not — on a filter bar that
 * also carries rig, well and search, it crowds out the controls people change
 * *less* often but need to find.
 *
 * This arrangement, adapted from shadcn-space's calendar-16, keeps the one-click
 * property where it matters and gives the toolbar back its space: the trigger
 * states the current range in words, and everything that changes it lives in the
 * popover — presets down one side, calendar down the other, both visible at
 * once. Picking a preset closes it; dragging a custom range does not, because
 * you are mid-gesture and have a second date to choose.
 *
 * `today` is still a prop rather than a clock read: it keeps the component
 * testable, and stops "Today" quietly meaning a different day than the data does.
 */

export type DateRangePresetId = "today" | "7d" | "30d" | "month" | "custom";

export interface DateRangeValue {
  preset: DateRangePresetId;
  range?: DateRange;
}

const PRESETS: { id: Exclude<DateRangePresetId, "custom">; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
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

function fmt(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** What the trigger says. A preset states its own name; a custom range states the dates. */
export function describeRange(value: DateRangeValue): string {
  if (value.preset !== "custom") {
    return PRESETS.find((p) => p.id === value.preset)?.label ?? "Select dates";
  }
  const { from, to } = value.range ?? {};
  if (!from) return "Select dates";
  return to ? `${fmt(from)} – ${fmt(to)}` : fmt(from);
}

export interface DateRangeFilterProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  /** Today's date. Passed in rather than read from the clock — see above. */
  today: Date;
  className?: string;
  /** Accessible name for the trigger. */
  label?: string;
}

export function DateRangeFilter({
  value,
  onChange,
  today,
  className,
  label = "Date range",
}: DateRangeFilterProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`${label}: ${describeRange(value)}`}
          className={cn("justify-between gap-2 font-normal", className)}
        >
          <span className="flex items-center gap-2">
            <CalendarIcon aria-hidden className="size-3.5 text-muted-foreground" />
            {describeRange(value)}
          </span>
          <ChevronDown aria-hidden className="size-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col sm:flex-row">
          {/* Presets first in DOM order so a keyboard user reaches the one-click
              answers before the calendar grid, which is 42 tab stops of days. */}
          <div
            className="flex flex-col gap-1 border-b border-border p-2 sm:border-r sm:border-b-0"
            role="group"
            aria-label="Date range presets"
          >
            {PRESETS.map((p) => {
              const active = value.preset === p.id;
              return (
                <Button
                  key={p.id}
                  variant={active ? "default" : "ghost"}
                  size="sm"
                  aria-pressed={active}
                  className="justify-start"
                  onClick={() => {
                    onChange({ preset: p.id, range: resolvePreset(p.id, today) });
                    // A preset is a complete answer, so close. A custom range is
                    // not — see below.
                    setOpen(false);
                  }}
                >
                  {p.label}
                </Button>
              );
            })}
          </div>

          <Calendar
            mode="range"
            defaultMonth={value.range?.from ?? today}
            selected={value.range}
            // Deliberately does NOT close: selecting `from` leaves the user
            // mid-gesture with `to` still to pick. Closing here is the most
            // common way a range picker becomes infuriating.
            onSelect={(range) => onChange({ preset: "custom", range })}
            numberOfMonths={1}
            autoFocus
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
