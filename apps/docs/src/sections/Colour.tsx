import { palette, chartSeries, chartSeriesDark, STEPS, describe, light, dark } from "@koc/tokens";
import type { PaletteName } from "@koc/tokens";

import { PageHead, Section, Note, Code } from "./parts";

const RAMPS: { name: PaletteName; blurb: string }[] = [
  { name: "primary", blurb: "Kuwait Oil Company blue. Pinned at 600 — the anchor for everything." },
  { name: "neutral", blurb: "Greys carrying a whisper of the brand hue, so they sit beside it cleanly." },
  { name: "success", blurb: "Okabe–Ito bluish-green. Teal-leaning so it stays separable from red." },
  { name: "warning", blurb: "Okabe–Ito orange. Yellow can't reach 4.5:1 on white at any usable chroma." },
  { name: "danger", blurb: "Okabe–Ito vermillion. The highest-chroma ramp: it means act now." },
  { name: "info", blurb: "Teal-cyan at hue 210 — the maximin between success and primary." },
  { name: "accent", blurb: "Okabe–Ito reddish-purple. The one hue that implies no status." },
];

function Ramp({ name, blurb }: { name: PaletteName; blurb: string }) {
  const ramp = palette[name];
  return (
    <div className="mb-7">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3">
        <h3 className="font-mono text-sm font-semibold">{name}</h3>
        <p className="text-xs text-muted-foreground">{blurb}</p>
      </div>
      <div className="flex overflow-hidden rounded-md border">
        {STEPS.map((step) => {
          const d = describe(ramp[step]);
          const isAnchor = name === "primary" && step === 600;
          // Label colour is picked by measured contrast, not guessed — the same
          // rule the tokens themselves are held to.
          const fg = d.onWhite >= 3 ? "#FFFFFF" : "#0A0F14";
          return (
            <div
              key={step}
              className="group relative flex-1"
              style={{ background: ramp[step] }}
              title={`${name}-${step} · ${d.hex} · L=${d.l} C=${d.c} H=${d.h}`}
            >
              <div className="flex h-16 flex-col justify-end p-1.5" style={{ color: fg }}>
                <span className="text-2xs font-medium leading-none">{step}</span>
                {isAnchor && (
                  <span className="mt-0.5 text-2xs font-semibold leading-none opacity-90">
                    anchor
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex">
        {STEPS.map((step) => (
          <div key={step} className="flex-1 text-center">
            <span className="font-mono text-[9px] text-muted-foreground">
              {ramp[step].replace("#", "")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SwatchRow({ theme, label }: { theme: Record<string, string>; label: string }) {
  const keys = [
    "background",
    "foreground",
    "card",
    "primary",
    "secondary",
    "muted",
    "accent",
    "destructive",
    "success",
    "warning",
    "info",
    "border",
    "input",
    "ring",
  ];
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
        {keys.map((k) => (
          <div key={k} className="rounded border p-1.5">
            <div
              className="mb-1 h-8 rounded-sm border"
              style={{ background: theme[k] }}
            />
            <div className="truncate font-mono text-[10px] text-muted-foreground">{k}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Colour() {
  return (
    <>
      <PageHead
        title="Colour"
        lead="Ramps are generated in OKLCH rather than picked by hand, so every step is a
              perceptually even distance from its neighbours — and a 600 of one hue is
              interchangeable with a 600 of another."
      />

      <Section
        title="The anchor"
        description={
          <>
            KOC's blue measures <Code>L=0.483 C=0.139 H=250.61</Code>. It is pinned at step 600 and
            the ramp is generated around it, so <Code>koc-primary-600</Code> is byte-exact{" "}
            <Code>#0060A9</Code> rather than an approximation of it. A build-time assertion fails if
            that ever stops being true.
          </>
        }
      >
        <Note title="Why the ramp is trustworthy">
          The generated <Code>primary-700</Code> lands within ~0.02 lightness of the darker blues
          KOC already uses for hover and pressed states (<Code>#054C82</Code>, <Code>#0C538A</Code>)
          — colours the generator never saw. The ramp independently reproduced how KOC already
          reaches for its blue on interaction. That agreement is the reason to trust it elsewhere.
        </Note>
      </Section>

      <Section
        title="Ramps"
        description="Seven ramps × eleven steps. Hover any swatch for its OKLCH coordinates."
      >
        {RAMPS.map((r) => (
          <Ramp key={r.name} {...r} />
        ))}
      </Section>

      <Section
        title="Semantic tokens"
        description={
          <>
            What components actually consume. A component never references{" "}
            <Code>primary-600</Code> — it references <Code>--primary</Code>, and this layer decides
            what that means per theme. Names match the shadcn contract exactly.
          </>
        }
      >
        <div className="space-y-6">
          <SwatchRow theme={light} label="Light" />
          <div className="dark rounded-md bg-background p-4">
            <SwatchRow theme={dark} label="Dark" />
          </div>
        </div>
        <div className="mt-4">
          <Note title="Dark mode is a mapping, not an inversion">
            <Code>primary</Code> lifts from 600 to 400 in dark mode. <Code>#0060A9</Code> manages
            only ~3.2:1 on a dark surface and would fail AA outright — so the same token resolves to
            a different step. This is the single reason dark mode can't be a filter over light mode.
          </Note>
        </div>
      </Section>

      <Section
        title="Chart series"
        description="Five slots, each with a light and a dark value — the same hue, re-stepped for the
                     surface. Every neighbour stays distinguishable in colour, in greyscale, and
                     under protanopia, deuteranopia and tritanopia."
      >
        <div className="space-y-3">
          {(
            [
              ["light", chartSeries],
              ["dark", chartSeriesDark],
            ] as const
          ).map(([mode, series]) => (
            <div key={mode} className="flex overflow-hidden rounded-md border">
              {series.map((c, i) => (
                <div key={i} className="flex-1">
                  <div className="h-14" style={{ background: c }} />
                  <div className="bg-card p-1.5 text-center">
                    <div className="text-2xs font-medium">
                      {mode} · series {i + 1}
                    </div>
                    <div className="font-mono text-[9px] text-muted-foreground">{c}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-3">
          <Note title="The happy accident">
            Okabe–Ito's blue is <Code>#0072B2</Code>. KOC's blue is <Code>#0060A9</Code>. The brand
            colour is <em>already</em> a member of the colour-universal set, which is why series 1
            is always KOC blue. Series 2 is its warm partner, coral — the one hue every form of
            colour blindness keeps clear of the blue.
          </Note>
          <Note title="Jewel tones — chosen 2026-10-25">
            KOC blue, coral, indigo, magenta and emerald. The morning's colour-blind fix passed every
            gate with an orange and an olive, and they did not sit with the brand blue; this set was
            searched under the same gates with orange, yellow and olive excluded, and picked by eye
            from the three that passed. No all-cool set passes: teal, sky, indigo and violet collapse
            toward the blue for a red-green colour-blind reader, so slot 2 must be warm. Neighbours
            are held to the dataviz validator in both themes and the token tests fail the build if
            one stops clearing it. Non-neighbours are not — five hues cannot all be pairwise
            colour-blind-safe — so a scatter chart, where any two marks can touch, should still stop
            at three.
          </Note>
          <Note kind="warn" title="Why lightness alternates">
            Hue is not enough. A greyscale printout, a failing projector, and a reader with
            achromatopsia all see only <em>tone</em>. An earlier revision had series 4 and 5 both at
            step 500: ΔE 42 apart — vividly different in colour — yet 1.11:1 in luminance, meaning
            they merged into one line in greyscale. So lightness alternates between neighbours
            (0.48 → 0.62 → 0.56 → 0.50 → 0.59 in light; 0.62 → 0.59 → 0.65 → 0.59 → 0.65 in dark), and
            a test asserts at least 1.2:1 in greyscale between every pair of neighbours, in both
            themes, so nobody quietly undoes it.
          </Note>
        </div>
      </Section>
    </>
  );
}
