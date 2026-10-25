import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  StatCard,
  StatusBadge,
  SectionHeading,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TrendChart,
  type OperationalStatus,
} from "@koc/ui";

import { PageHead, Section, Note, Code } from "./parts";

/** Illustrative figures only — shaped to look like KOC data, not sourced from it. */
const TREND = [
  { month: "Jan", burgan: 112, raudhatain: 41, sabriyah: 33 },
  { month: "Feb", burgan: 115, raudhatain: 43, sabriyah: 31 },
  { month: "Mar", burgan: 113, raudhatain: 40, sabriyah: 34 },
  { month: "Apr", burgan: 119, raudhatain: 44, sabriyah: 36 },
  { month: "May", burgan: 117, raudhatain: 46, sabriyah: 35 },
  { month: "Jun", burgan: 121, raudhatain: 45, sabriyah: 38 },
];

const WELLS: {
  id: string;
  field: string;
  status: OperationalStatus;
  rate: string;
  cut: string;
}[] = [
  { id: "BG-1042", field: "Burgan", status: "producing", rate: "1,284", cut: "28.4" },
  { id: "BG-1043", field: "Burgan", status: "producing", rate: "1,102", cut: "31.2" },
  { id: "RA-0211", field: "Raudhatain", status: "warning", rate: "864", cut: "44.8" },
  { id: "SA-0788", field: "Sabriyah", status: "critical", rate: "0", cut: "—" },
  { id: "BG-1051", field: "Burgan", status: "maintenance", rate: "0", cut: "—" },
  { id: "RA-0219", field: "Raudhatain", status: "shutin", rate: "0", cut: "—" },
];

export function DashboardDemo() {
  return (
    <>
      <PageHead
        title="Dashboard pattern"
        lead="The reference composition — KPI row, trend, asset table. Every colour, size and space
              below comes from a token; nothing on this page is hard-coded."
      />

      <Note kind="warn" title="Illustrative data">
        The figures here are invented to demonstrate layout and are not KOC production data. Field
        names are real; the numbers are not.
      </Note>

      <div className="mt-6 space-y-5">
        <SectionHeading index="01" eyebrow="Figures" title="North Kuwait fields" aside="June · placeholder figures" />

        {/* KPI row — the rig3 tile: tag, light figure, change, trend, one line on what it counts. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Oil production"
            tag="Live"
            value="118,402"
            unit="bbl/d"
            delta={4.2}
            deltaLabel="vs May"
            intent="higher-is-better"
            trend={[112, 115, 113, 119, 117, 121, 118.4]}
            description="Field total, trailing seven-day average."
          />
          <StatCard
            label="Gas flared"
            tag="HSE"
            value="1,004"
            unit="MMscf"
            delta={2.8}
            deltaLabel="vs May"
            intent="lower-is-better"
            trend={[930, 951, 968, 940, 982, 977, 1004]}
            description="Flared this month — up is bad, and reportable."
          />
          <StatCard
            label="Water cut"
            tag="Reservoir"
            value="31.8"
            unit="%"
            delta={-1.4}
            deltaLabel="vs May"
            intent="lower-is-better"
            trend={[33.9, 33.4, 33.6, 32.9, 32.5, 32.2, 31.8]}
            description="Water share of produced liquid."
          />
          <StatCard
            label="Wellhead pressure"
            tag="Ops"
            value="2,318"
            unit="psi"
            delta={0.3}
            deltaLabel="vs May"
            trend={[2301, 2296, 2310, 2305, 2312, 2311, 2318]}
            description="Median across producing wells. No sentiment — neutral."
          />
        </div>

        {/* Trend — a framed @koc/chart: title, legend, hover values and a Table toggle. */}
        <TrendChart
          title="Production by field"
          subtitle="Thousand barrels per day · last six months"
          caption="Production by field over the last six months: Burgan rises from 112 to 121 thousand barrels per day; Raudhatain and Sabriyah hold near 40 and 35."
          data={TREND}
          xKey="month"
          series={[
            { key: "burgan", label: "Burgan" },
            { key: "raudhatain", label: "Raudhatain" },
            { key: "sabriyah", label: "Sabriyah" },
          ]}
          height={256}
        />

        {/* Asset table */}
        <Card>
          <CardHeader>
            <CardTitle>Wells</CardTitle>
            <CardDescription>Six of 1,286 · filtered to recent activity</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Well</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Rate (bbl/d)</TableHead>
                  <TableHead className="pr-6 text-right">Water cut (%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {WELLS.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="pl-6 font-mono text-xs font-medium">{w.id}</TableCell>
                    <TableCell>{w.field}</TableCell>
                    <TableCell>
                      <StatusBadge status={w.status} />
                    </TableCell>
                    <TableCell className="text-right">{w.rate}</TableCell>
                    <TableCell className="pr-6 text-right">{w.cut}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Section title="What this demonstrates" className="mt-12">
        <div className="space-y-3">
          <Note title="Rate and water-cut columns are right-aligned">
            Tabular figures only pay off if numbers are right-aligned — that is what puts digits in
            columns so the eye can scan down and compare. Body cells get{" "}
            <Code>tabular-nums</Code> automatically; the alignment is the one thing you have to
            bring.
          </Note>
          <Note title="Toggle the theme in the sidebar">
            Every surface, line, axis and series re-maps. The chart colours lift a step in dark mode
            and the axis labels re-derive from <Code>--muted-foreground</Code> — nothing here needed
            a second implementation.
          </Note>
          <Note title="The chart is our own SVG">
            No chart library since 2026-10-25: <Code>@koc/chart</Code> draws plain SVG in the rig3
            style, hover any month for its values, and <Code>Table</Code> swaps the plot for the
            numbers. Recharts and its dependency tree are out of the approval pack.
          </Note>
          <Note title="SA-0788 is the only filled badge on the page">
            <Code>critical</Code> is the one status that gets a solid fill. In a wall of outlined
            badges the filled one is pre-attentively visible — an operator finds it without reading.
            That only works if it stays rare, which is why the component reserves it.
          </Note>
        </div>
      </Section>
    </>
  );
}
