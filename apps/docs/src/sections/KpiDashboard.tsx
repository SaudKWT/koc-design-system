import { useState } from "react";
import { Download } from "lucide-react";

import {
  Button,
  ComparisonChart,
  DateRangeFilter,
  PageHeader,
  StatCard,
  TrendChart,
  VolumeChart,
  resolvePreset,
  type DateRangeValue,
} from "@koc/ui";

import { DEMO_TODAY } from "../examples/ddr-data";
import { PageHead, Section, Note } from "./parts";

/**
 * KPI dashboard — the landing screen for a unit.
 *
 * The other half of the pattern set. List view answers "show me the records";
 * this answers "how are we doing", and it is what a unit head opens first.
 *
 * Its job is to make a small number of figures legible at a glance and let
 * someone drill from a number into the list behind it — which is why every tile
 * and chart here is a link in a real app, not an ornament.
 */

const PRODUCTION = [
  { day: "03 Aug", unit1: 8420, unit2: 6180, unit3: 4310 },
  { day: "04 Aug", unit1: 8610, unit2: 6040, unit3: 4405 },
  { day: "05 Aug", unit1: 8280, unit2: 6320, unit3: 4180 },
  { day: "06 Aug", unit1: 8790, unit2: 6255, unit3: 4520 },
  { day: "07 Aug", unit1: 8515, unit2: 6410, unit3: 4390 },
  { day: "08 Aug", unit1: 8930, unit2: 6180, unit3: 4610 },
  { day: "09 Aug", unit1: 9105, unit2: 6350, unit3: 4475 },
];

const NPT_BY_RIG = [
  { rig: "KDC-04", planned: 6.5, unplanned: 22.25 },
  { rig: "KDC-07", planned: 4.0, unplanned: 41.75 },
  { rig: "KDC-12", planned: 8.5, unplanned: 2.5 },
  { rig: "KDC-19", planned: 5.0, unplanned: 14.5 },
];

const FOOTAGE = [
  { day: "03 Aug", footage: 1180 },
  { day: "04 Aug", footage: 1340 },
  { day: "05 Aug", footage: 890 },
  { day: "06 Aug", footage: 1465 },
  { day: "07 Aug", footage: 1210 },
  { day: "08 Aug", footage: 705 },
  { day: "09 Aug", footage: 1396 },
];

const num = (v: number) => v.toLocaleString("en-GB");

export function KpiDashboard() {
  const [range, setRange] = useState<DateRangeValue>({
    preset: "7d",
    range: resolvePreset("7d", DEMO_TODAY),
  });

  return (
    <>
      <PageHead
        title="KPI dashboard"
        lead="The landing screen for a unit — a few figures at a glance, and a way into the records
              behind them. The other half of the pattern set alongside list view."
      />

      <Note kind="warn" title="Every figure is invented">
        Production volumes, NPT hours and footage are placeholder. The <em>shape</em> is the
        argument: which numbers get a tile, which get a chart, and what each chart is for.
      </Note>

      <Section
        title="The screen"
        description="In a real app this sits inside AppShell, where the sidebar supplies the unit."
      >
        <div className="rounded-lg border border-input p-5">
          <PageHeader
            title="Unit 1 — North & West + Heavy Oil"
            description="Production, non-productive time and drilling progress for the selected period."
            actions={
              <Button variant="outline" size="sm">
                <Download aria-hidden className="mr-1.5 size-3.5" />
                Export
              </Button>
            }
          />

          <div className="flex flex-wrap items-center gap-3 py-4">
            <DateRangeFilter value={range} onChange={setRange} today={DEMO_TODAY} />
          </div>

          {/*
           * Tiles first, then charts. A tile answers "what is the number"; a
           * chart answers "how did it get there". Someone scanning for a problem
           * wants the first in under a second, and only then the second.
           *
           * StatCard takes `intent` separately from `delta` on purpose: at an oil
           * company "up" is not always good. Production up is good; NPT up is
           * reportable. Getting that backwards is a confidently wrong green arrow
           * on a number that should worry someone.
           */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Production"
              value="9,105"
              unit="bbl/d"
              delta={2.1}
              intent="higher-is-better"
            />
            <StatCard
              label="NPT this period"
              value="81.0"
              unit="hrs"
              delta={18.4}
              intent="lower-is-better"
            />
            <StatCard label="Footage drilled" value="8,186" unit="ft" delta={4.2} intent="higher-is-better" />
            <StatCard label="Active rigs" value="4" delta={0} intent="neutral" />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-medium">Production by unit</h3>
              <p className="mb-3 text-xs text-muted-foreground">bbl/d, last 7 days</p>
              <TrendChart
                data={PRODUCTION}
                xKey="day"
                caption="Daily production in barrels per day, by unit, over the last seven days"
                valueFormat={num}
                height={240}
                series={[
                  { key: "unit1", label: "Unit 1" },
                  { key: "unit2", label: "Unit 2" },
                  { key: "unit3", label: "Unit 3" },
                ]}
              />
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-medium">Non-productive time by rig</h3>
              <p className="mb-3 text-xs text-muted-foreground">hours, split planned vs unplanned</p>
              <ComparisonChart
                data={NPT_BY_RIG}
                xKey="rig"
                caption="Non-productive time in hours by rig, split into planned and unplanned"
                height={240}
                series={[
                  { key: "planned", label: "Planned" },
                  { key: "unplanned", label: "Unplanned" },
                ]}
              />
            </div>

            <div className="rounded-lg border border-border bg-card p-4 lg:col-span-2">
              <h3 className="text-sm font-medium">Footage drilled</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                ft per day — the table below is the chart's text alternative, shown here on purpose
              </p>
              <VolumeChart
                data={FOOTAGE}
                xKey="day"
                caption="Footage drilled per day in feet, over the last seven days"
                valueFormat={num}
                height={200}
                showTable
                series={[{ key: "footage", label: "Footage" }]}
              />
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="What the chart wrappers do that raw Recharts doesn't"
        description="A Recharts line chart is ~50 lines of config before it draws anything. Forty apps
                     writing that by hand produces forty different charts and three specific bugs."
      >
        <ul className="space-y-2 text-sm">
          {[
            "isAnimationActive={false} is not a prop. Under React 19 StrictMode, Recharts' mount tween never advances past frame zero and lines render with correct geometry, opacity 1, and zero pixels drawn. Still true in recharts 3.8. A prop that can be forgotten is a prop that will be.",
            "Series colour comes from --chart-1..5, in order. Each adjacent pair is asserted at ΔE2000 ≥ 15 and ≥ 1.2:1 in greyscale luminance — so the series survive a printout and achromatopsia. Choosing colours per chart throws that away silently.",
            "Every chart carries a text alternative. Recharts emits SVG with no meaningful structure, so a chart is silence to a screen reader. A hidden table carries the numbers; pass showTable to make it visible, as above.",
            "Axis, grid and tooltip styling come from tokens, so a chart re-themes with everything else.",
          ].map((t) => (
            <li key={t} className="flex gap-2">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
