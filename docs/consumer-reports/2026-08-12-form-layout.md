# Form layout — evidence from the Daily Vessel Report

Requested input for the deferred form-layout decision. The DVR is the first real
KOC form: ~40 fields across nine sections, filled once a day per vessel by a
ship's master, on a moving vessel, often over a bad connection.

Source: `dwos-platform/web/src/features/vessel-movement/report-form/`
(`ui.tsx` 238 lines, `ReportForm.tsx` ~1000, `model.ts` ~560).

**Headline answer to the last question first: not yet.** Two of the five pieces
are ready; the validation model is the part most likely to be wrong, and encoding
it now would bake in an assumption that is right for this form and wrong for the
next one. Detail in § 5.

---

## 1. What was hand-rolled, and why

### `Field` — a labelled field wrapper

```ts
{ label: string; hint?: string; required?: boolean;
  htmlFor?: string; className?: string; children: React.ReactNode }
```

Wraps `@koc/label` and adds three things it does not do: the required marker, an
optional hint line below the control, and the weight change that makes required
fields read as heavier than optional ones (`font-semibold text-foreground` vs
`font-medium text-muted-foreground`).

**Entirely general.** Nothing in it knows about vessels. If one thing goes into
`@koc/ui` from this exercise, it is this.

The weight distinction earns its place: before it, every one of ~40 labels looked
equally important, and captains were filling optional consumable rows before
required header fields.

### `Card` / `CollapsibleCard` — a titled section

```ts
Card            { title, subtitle?, accent?, required?, id?, children }
CollapsibleCard { title, subtitle?, accent?, open, onOpenChange,
                  summary?, action?, id?, children }
```

Both wrap `@koc/card`. The additions are a coloured left border plus a matching
dot, a `required` asterisk on the section, and — on the collapsible — a `summary`
chip shown when shut.

**Mostly general, one caveat.** The `accent` palette is eight Tailwind steps
(`blue`, `red`, `violet`…) rather than tokens, deliberately: they are decorative
4px rules and 10px dots, never a text or background colour, never the only signal
for anything. Promoting this to `@koc/ui` would force a decision about whether
the system wants a decorative-accent scale at all. I would argue it does not, and
that section identity should come from position and title, not colour — the
colour was a response to nine identical white cards, which is a layout problem.

`open`/`onOpenChange` being controlled is right and should stay: see § 3.

### `NilToggle` — "nothing to report" as a question

```ts
{ label, value: string, isNil: boolean,
  nilWord: string, yesWord: string, placeholder: string,
  onChange: (v: string) => void, id? }
```

Two buttons (`aria-pressed`) that reveal a text input only when the answer is
"yes". Used for safety accidents / incidents / near-miss and for arrival /
departure delays.

**This one is the interesting data point, and its API is wrong for general use.**

The evidence that produced it: across 256 imported reports, **all 719 safety
values are the literal string `"Nil"`, and all 379 delay values are `"NA"`.** Not
one real answer in either field, ever. A free-text box defaulted to "Nil" does not
collect data — it collects the default. Asking the question and only opening a
box on "yes" is the fix.

What is DVR-specific and would have to change:

- The value is a **string**, because a prefilled report has to round-trip
  byte-identically. Toggling to Nil restores whatever nil-ish wording the source
  used (`"NIL"`, `"NA Delay"`) rather than imposing ours — `rememberedNil` in
  local state exists purely for that. A general component wants
  `value: T | null` and no string archaeology.
- The revealed control is a hardcoded `<input>`. It should be a slot; the next
  form will want a textarea, a date, or a select.
- `nilWord` / `yesWord` as free strings is right (`None`/`Reportable` reads
  correctly for safety, `On time`/`Delayed` for delays) but the destructive
  styling on the "yes" side is baked in, and "yes" is not always bad.

---

## 2. The validation model

**Everything is a warning. Nothing blocks submit.** That is the single most
important property and it is deliberate: a captain at sea must always be able to
file, even with a gap in the day. A form that refuses is a form that gets
bypassed by emailing a PDF, which is the process being replaced.

### Shape

```ts
interface Warning { id: string; text: string }
```

`id` is a **DOM element id**, not a field path. There is no schema, no resolver,
no per-field validator — the whole list is one `useMemo` over form state,
recomputed on every keystroke:

```ts
const warnings = useMemo<Warning[]>(() => {
  if (!isWorthSaving(f)) return []      // untouched form warns about nothing
  …push({ id: 'dvr-task-log',        text: 'Nothing logged for 09:56–16:00…' })
  …push({ id: `dvr-row-${i}-to`,     text: 'Row 4 is a span with no end time…' })
  …push({ id: `dvr-tank-${k}-rob`,   text: 'Fuel oil: ROB is above the tank…' })
  …push({ id: 'dvr-report-date',     text: 'Report date is in the future.' })
}, [coverage, f, tanks])
```

### Where the message lives

**Not next to the field.** Warnings live in a sticky action bar at the bottom of
the viewport, behind a count: *"3 things worth checking"*. Clicking one calls

```ts
document.getElementById(id)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
// then .focus() if it is an input/select/textarea
```

This was a correction, not the first design. Originally the warning list sat
above the submit button, nine cards down the page — by the time you could read
"row 4 has no end time" you had scrolled past row 4. The link is the fix.

The one exception is genuinely local: an out-of-range tank ROB also renders a red
line inside its own fieldset, because that one is about two adjacent numbers and
makes no sense read out of context.

### On submit

Warnings are ignored. Only two things actually stop a submit, and both are
structural rather than content:

```ts
if (!f.vesselId || !f.reportDate)   // → focus the missing one, abort
if (!payload.task_log.length)        // → focus the task log, abort
```

Both use the same `focusField(id)` path as the warning links.

### What this model does not do

No async validation, no server-returned field errors, no cross-form
dependencies, no dirty tracking per field, no schema. `isWorthSaving(f)` — a
hand-written predicate — is the only "is this form touched" signal, and it exists
for the draft store rather than for validation.

---

## 3. Collapsing sections

Three of nine sections collapse: **Provisions & delays**, **Deck cargo / lifts**,
**Crew list**.

**What makes a section collapsible is usage frequency, measured.** Deck cargo is
filled in **11 of 256** imported reports; crew in **11 of 256**. The task log is
filled in all 256. Before this, all three had identical visual weight, so a
captain scrolled past two dead sections every single day.

**State is a hybrid, and the hybrid matters:**

```ts
const [open, setOpen] = useState({ provisions: false, cargo: false, crew: false })
```

- **Default: derived.** Closed on a blank form. On prefill (`replaceState`), each
  section opens iff it has content — a report imported with a crew list opens the
  crew section, so nothing is hidden that exists.
- **After that: user preference.** Once opened or closed by hand it stays that
  way for the session. It is *not* persisted, and it is not re-derived on every
  keystroke — a section must not slam shut because you cleared the last field in
  it.

**"Empty" is per-section and hand-written**, which is the weakest part:

```ts
summary={f.crew.length ? `${f.crew.length} aboard` : undefined}
summary={f.lifts.on_deck || f.lifts.loaded || f.lifts.discharged ? 'has entries' : undefined}
summary={provisionsSummary(f)}   // '4 filled' | 'delay reported' | undefined
```

A shut section holding data **must** say so — otherwise collapsing hides
submitted content, which is worse than the noise it solved. But there is no
abstraction behind it: three bespoke functions. **That is the piece a real
form-layout component would need to solve** and I did not solve it.

---

## 4. Tried first, abandoned

The useful half, as you said.

**Drag-to-reorder rows.** Planned, then dropped for a "Sort by time" button. Rows
carry timestamps; at 40 rows what you want is not to place a row precisely, it is
to fix the three you typed out of order. Sorting is one click and needs no drag
affordance, no keyboard-accessible alternative, and no library.

**A read-only "activity" chip.** The first version displayed the classifier's
guess as a non-interactive pill. It became a `<select>` whose empty option reads
`Auto: Cargo loading / unloading`. Same footprint, but the guess is now an
editable default instead of a label. That pattern — *show the inferred value as
the placeholder of the control that overrides it* — is the most reusable idea in
this form and it is not in `ui.tsx` at all; it is inline in the row.

**Quick-pick chips for descriptions.** Would have cost a row of vertical space
times 40 rows. Became a `<datalist>` on the input: native, keyboard-accessible,
zero layout.

**Auto-computing "remaining to load" at prefill.** `remaining = max − ROB` holds
in 646 of 701 filled cases, so computing it looks obviously right. It broke
round-trip parity: five reports have max and ROB but no remaining, and computing
one invents a value the source never had. Now it recomputes **only on a user edit
to ROB**, tracked by a ref of touched keys, never at prefill. The general lesson —
*derived values must distinguish "empty because nobody filled it" from "empty
because it is being edited now"* — will recur in any form that prefills.

**Splitting quantity into number + unit fields.** Abandoned for the same reason:
values like `"CORRECTION 0.001 M3"` and `"-"` exist and must survive untouched.
The unit is stripped for display only and re-appended when the captain types a
bare number; anything unrecognised passes through verbatim.

**One draft per browser.** Was a single `localStorage` key. Starting a second
vessel's report silently destroyed the first. Now keyed per vessel + date, with
partial drafts absorbed once the header completes.

---

## 5. Does this belong in `@koc/ui` yet?

**No. Two pieces yes, the rest not until form two — and form two should be chosen
deliberately.**

**Take now, if anything:**

- `Field`. Thin, general, and it fixes a real problem (required vs optional
  reading identically). Low risk.
- The `required` marker convention on both field and section.

**Not yet:**

- `NilToggle`. The *idea* is strong and evidence-backed — 1,098 fields across 256
  reports that never once carried content. But the API is shaped around
  string round-tripping, and the revealed control is hardcoded. Shipping it now
  ships the DVR's constraints as everyone's.
- `CollapsibleCard`. Close, but the part that matters — deciding whether a
  section is empty, and summarising it when shut — is three bespoke functions.
  Promoting the shell without solving that just moves the problem.
- **The validation model, most of all.** It is whole-form, synchronous,
  warn-only, recomputed every keystroke, and addresses fields by DOM id. Every
  one of those is correct *for this form* — one role, one submission a day, no
  server-side rules, must never block. Not one of them survives contact with a
  form that has blocking validation, async or server-returned errors, or
  per-field dirty state. An AFE approval will need all three.

**What would make me change my mind:** two more real forms, chosen for what they
break rather than what they confirm.

1. **A blocking form** — something with an approval or a financial consequence,
   where "submit anyway" is not acceptable. That tests whether warn-only is a
   parameter or an assumption.
2. **A server-validated form** — where errors arrive from the API after submit
   and must be attached to fields. That tests whether DOM ids are adequate or
   whether field paths are needed.

If both of those land and `Field`, the section shell and the reveal-on-yes toggle
still look like the right shapes, then the abstraction is real. Today there is
one form, and one form cannot tell you which of its properties are essential.

---

## Appendix — things that surprised me, for whoever designs this

- **The most valuable input on the whole form is a row type**, not a field: spans
  that tile the day vs events that mark a moment. 1,535 of 4,835 imported rows
  have no end time and never will. Getting that wrong produced up to 38 spurious
  warnings on a correctly filled report. No form abstraction would have helped;
  it came from reading the data.
- **Defaults are where data goes to die.** `"Nil"` and `"NA"` were defaults, and
  they are 100% of the values in those fields across 256 reports.
- **A warning that fires on two thirds of correct submissions is not a warning.**
  Gap detection originally flagged 165 of 256 real reports. Scoping it to
  "unaccounted stretches with no events in them" is what made it mean something.
- **Print is a first-class output.** The form has a "Print / PDF" button that
  produces the official template, because the report is still emailed. Any KOC
  form abstraction should assume a paper artefact exists downstream.
