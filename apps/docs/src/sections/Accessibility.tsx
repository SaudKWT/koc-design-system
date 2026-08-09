import { differenceCiede2000 } from "culori";

import { contrast, light, dark, palette, chartSeries } from "@koc/tokens";
import { Badge } from "@koc/ui";

import { PageHead, Section, Note, Code } from "./parts";

const deltaE = differenceCiede2000();

function Row({
  label,
  value,
  min,
  unit = ":1",
  note,
}: {
  label: string;
  value: number;
  min: number;
  unit?: string;
  note?: string;
}) {
  const pass = value >= min;
  return (
    <tr className="border-b last:border-0">
      <td className="py-1.5 pr-4 text-sm">{label}</td>
      <td className="py-1.5 pr-4 text-right font-mono text-xs">
        {value.toFixed(2)}
        {unit}
      </td>
      <td className="py-1.5 pr-4 text-right font-mono text-2xs text-muted-foreground">≥{min}</td>
      <td className="py-1.5 pr-4 text-xs text-muted-foreground">{note}</td>
      <td className="py-1.5 text-right">
        <Badge variant={pass ? "success" : "destructive"}>{pass ? "pass" : "fail"}</Badge>
      </td>
    </tr>
  );
}

function Audit({ theme, name }: { theme: Record<string, string>; name: string }) {
  const pairs: [string, string, string, number, string?][] = [
    ["Body text on background", theme.foreground, theme.background, 4.5],
    ["Card text on card", theme["card-foreground"], theme.card, 4.5],
    ["Primary label on primary", theme["primary-foreground"], theme.primary, 4.5],
    ["Muted text on muted", theme["muted-foreground"], theme.muted, 4.5],
    ["Destructive label", theme["destructive-foreground"], theme.destructive, 4.5],
    ["Success label", theme["success-foreground"], theme.success, 4.5],
    ["Warning label", theme["warning-foreground"], theme.warning, 4.5],
    ["Sidebar text on sidebar", theme["sidebar-foreground"], theme.sidebar, 4.5],
    ["Input border vs background", theme.input, theme.background, 3, "WCAG 1.4.11"],
    ["Focus ring vs background", theme.ring, theme.background, 3, "WCAG 2.4.11"],
    ["Border vs background", theme.border, theme.background, 1.25, "decorative — out of 1.4.11 scope"],
  ];

  return (
    <div className="mb-6">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {name}
      </h3>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full">
          <tbody className="[&_tr:last-child]:border-0">
            {pairs.map(([label, fg, bg, min, note]) => (
              <Row
                key={label}
                label={label}
                value={contrast(fg, bg)}
                min={min}
                note={note}
              />
            ))}
            {[1, 2, 3, 4, 5].map((i) => (
              <Row
                key={i}
                label={`Chart series ${i} vs background`}
                value={contrast(theme[`chart-${i}`], theme.background)}
                min={3}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Accessibility() {
  const statusPairs: [string, string, string][] = [
    ["success vs warning", palette.success[600], palette.warning[600]],
    ["success vs danger", palette.success[600], palette.danger[600]],
    ["warning vs danger", palette.warning[600], palette.danger[600]],
    ["success vs info", palette.success[600], palette.info[600]],
    ["info vs primary", palette.info[600], palette.primary[600]],
  ];

  return (
    <>
      <PageHead
        title="Accessibility"
        lead="Every figure on this page is computed from the tokens at render time, not transcribed
              from a spreadsheet. It cannot go stale, and the same assertions run in CI — a token
              that regresses fails the build."
      />

      <Section
        title="Contrast audit"
        description={
          <>
            WCAG 2.1 AA. 63 assertions run on every build via{" "}
            <Code>npm run test:tokens</Code>. A subset is shown live below.
          </>
        }
      >
        <Audit theme={light} name="Light" />
        <div className="dark rounded-md bg-background p-4">
          <Audit theme={dark} name="Dark" />
        </div>
      </Section>

      <Section
        title="Status separation"
        description="Measured in ΔE2000 — perceptual distance — not WCAG contrast."
      >
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full">
            <tbody>
              {statusPairs.map(([label, a, b]) => (
                <Row key={label} label={label} value={deltaE(a, b)} min={15} unit="" />
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 space-y-3">
          <Note kind="warn" title="WCAG contrast is the wrong instrument here">
            Contrast measures a <em>luminance ratio</em>. Any two colours sharing a perceptual
            lightness score ~1:1 no matter how different their hues — and in a perceptual ramp every{" "}
            <Code>600</Code> shares a lightness <em>by construction</em>. An early revision of our
            test suite measured hue separation with WCAG contrast and reported total failure on a
            palette that was in fact perfectly legible. ΔE2000 is the right tool; the tests now use
            it.
          </Note>
          <Note title="ΔE ≈ 19 for info vs primary is the tightest pair">
            <Code>info</Code> is boxed in: it must clear <Code>success</Code> at hue 164 on one side
            and <Code>primary</Code> at 250.6 on the other, and moving away from either walks it
            into the other. Hue 210 is the maximin — the point where the <em>worst</em> neighbour
            separation is as large as it can be. That's acceptable only because colour is never the
            sole channel: every status also carries an icon and a label.
          </Note>
        </div>
      </Section>

      <Section
        title="Chart series — checked two ways"
        description="Adjacent series can fail two different ways, and passing one test doesn't imply
                     passing the other."
      >
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full">
            <tbody>
              {chartSeries.slice(0, -1).map((c, i) => (
                <Row
                  key={`de-${i}`}
                  label={`Series ${i + 1} vs ${i + 2} — colour`}
                  value={deltaE(c, chartSeries[i + 1])}
                  min={15}
                  unit=""
                  note="ΔE2000"
                />
              ))}
              {chartSeries.slice(0, -1).map((c, i) => (
                <Row
                  key={`tone-${i}`}
                  label={`Series ${i + 1} vs ${i + 2} — greyscale`}
                  value={contrast(c, chartSeries[i + 1])}
                  min={1.2}
                  note="tonal separation"
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <Note title="Why greyscale is tested separately">
            ΔE catches “these look the same to a colour-sighted reader”. Luminance catches “these
            collapse to the same grey” — what happens on a printout, a failing projector, or to a
            reader with achromatopsia. Hue separation does nothing for any of them. A palette can
            pass either test alone and still be unreadable in the field.
          </Note>
        </div>
      </Section>

      <Section title="What's enforced in code, not guidelines">
        <div className="space-y-3">
          <Note title="StatusBadge cannot be built unsafely">
            It takes a <Code>status</Code>, not a colour, and derives colour + icon + label
            together. There is no prop that keeps the red and drops the icon.
          </Note>
          <Note title="Input borders clear 1.4.11">
            <Code>border-input</Code> and <Code>border-border</Code> are different tokens for a
            reason. Most systems conflate them and ship inputs at ~1.6:1.
          </Note>
          <Note title="Reduced motion is respected globally">
            <Code>prefers-reduced-motion</Code> collapses every animation in the base layer. Nothing
            in the system exceeds 300ms regardless.
          </Note>
          <Note title="Focus is never removed">
            One <Code>:focus-visible</Code> style, defined once, applied everywhere.
          </Note>
        </div>
      </Section>

      <Section title="Known gaps" description="Recorded honestly rather than omitted.">
        <div className="space-y-3">
          <Note kind="warn" title="No RTL / Arabic support">
            Decided deliberately (ADR 0001) — the system is English-only and uses physical CSS
            properties, matching upstream shadcn. KOC's logo is bilingual and Kuwait's official
            language is Arabic, so this is worth revisiting. Retrofitting means touching spacing,
            layout and icon direction across every component.
          </Note>
          <Note kind="warn" title="Contrast is tested; behaviour is not">
            These tests prove colour conformance. They say nothing about focus order, screen-reader
            output, or keyboard traps in composed views. Those need a real audit against real
            screens — ideally with axe DevTools, which is already in your Tool Kit.
          </Note>
        </div>
      </Section>
    </>
  );
}
