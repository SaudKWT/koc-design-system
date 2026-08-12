# Spec request — `@koc/time-field`

Saud sourced `@shadcn-space/radix/date-picker-03` for the Daily Vessel Report's
time fields. It was rejected, and the reason generalises: **no off-the-shelf time
component can represent this domain**, so if one is going to exist it has to be
built here.

## The blocker

`<input type="time">` caps at `23:59`. This domain uses `24:00`:

```
task rows using 24:00     238 of 4,835
reports containing one    187 of 255
period_end = "24:00"      255 of 255
```

`00:00` and `24:00` are the same instant and different meanings — the start of
the day versus the end of the period. A row ending `24:00` ran to the end of the
report. Collapse them and a 24-hour span becomes zero-length. That is why
`daily-report.schema.json` allows it and why the form's `parseClock` accepts
0–1440 rather than 0–1439.

Any component that stores `23:59` instead silently shortens 238 spans by a
minute, shifts every derived duration, and breaks round-trip parity against the
imported corpus — without erroring anywhere. Worth naming explicitly, because it
looks like a rounding detail.

## Volume

Two per task row, up to 41 rows in a real report. **Up to 80 per submission**, and
a captain files one a day per vessel. This is the highest-traffic control in the
application by a wide margin, which means typing speed dominates every other
consideration.

## Spec

- **Range `00:00`–`24:00`.** Not `23:59`. This is the requirement that rules out
  every existing option.
- **Returns a `"HH:MM"` string. Never a `Date`.** The model round-trips strings
  end to end, from the source PDFs through the importer to the API. A `Date`
  forces a timezone decision this data does not contain.
- **Free typing, normalise on blur, never reformat mid-keystroke.** The current
  hand-rolled input does this — `7:0` becomes `07:00` when you leave the field —
  and it is the single reason the form is usable at 80 fields. Anything that
  reformats while typing, or forces a picker, is slower than what exists today.
- **A picker is optional, and must offer `24:00`** if present. A picker that
  cannot select end-of-day is worse than none, because the one value people reach
  for is the one it omits.
- **Invalid input should show at the field.** Today an unparseable value surfaces
  only indirectly, as a coverage warning in the action bar.

## What is being done meanwhile

Nothing behavioural. The existing free-text input stays exactly as it is; it is
only being wrapped in `InputGroup` so it looks like it belongs to the system.
Presentation now, component later — and no third-party candidate in between,
because the range requirement eliminates all of them before evaluation starts.

## The wider point

Of the five things this form needed and the system did not have —
`textarea`, `toggle-group`, `time-field`, `number-with-unit`, `form/field` —
two now exist, one was solved by porting `InputGroup` from a rejected package's
dependency graph, and one **cannot be bought at any price**.

That is the argument for the deferred form-layout work, made from a real form
rather than from imagination. A design system for an oil company will keep
meeting inputs whose domain does not fit the web platform's assumptions; a 25th
hour is just the first one.
