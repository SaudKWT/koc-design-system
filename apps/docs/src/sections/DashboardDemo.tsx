import { Droplets, Flame, Gauge, Waves } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  StatCard,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type OperationalStatus,
} from "@koc/ui";
import { chartSeries } from "@koc/tokens";

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
        {/* KPI row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Oil production"
            value="118,402"
            unit="bbl/d"
            delta={4.2}
            deltaLabel="vs May"
            intent="higher-is-better"
            icon={<Droplets />}
          />
          <StatCard
            label="Gas flared"
            value="1,004"
            unit="MMscf"
            delta={2.8}
            deltaLabel="vs May"
            intent="lower-is-better"
            icon={<Flame />}
          />
          <StatCard
            label="Water cut"
            value="31.8"
            unit="%"
            delta={-1.4}
            deltaLabel="vs May"
            intent="lower-is-better"
            icon={<Waves />}
          />
          <StatCard
            label="Wellhead pressure"
            value="2,318"
            unit="psi"
            delta={0.3}
            deltaLabel="vs May"
            icon={<Gauge />}
          />
        </div>

        {/* Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Production by field</CardTitle>
            <CardDescription>Thousand barrels per day · last six months</CardDescription>
            <CardAction>
              <Button variant="outline" size="sm">
                Export
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={TREND} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    stroke="var(--muted-foreground)"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      color: "var(--popover-foreground)",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {/* Series colours come straight from the token package — the same
                      values the contrast tests assert.

                      isAnimationActive={false} is NOT a style preference — it is
                      required for correctness. Recharts 2.x animates a line by
                      tweening stroke-dasharray from "0px <len>" up to the full
                      length. Under React 19's StrictMode, effects are
                      double-invoked, react-smooth's animation is cancelled, and
                      the tween never advances past frame zero — leaving every line
                      with stroke-dasharray "0px 858px": drawn correctly, and
                      completely invisible. Correct `d`, correct stroke, opacity 1,
                      zero pixels rendered.

                      Disabling the mount animation sidesteps it entirely, and
                      matches the motion policy anyway: a dashboard is a tool
                      someone stares at for eight hours, and a chart that replays
                      its entrance on every data refresh is noise. */}
                  <Line
                    type="monotone"
                    dataKey="burgan"
                    name="Burgan"
                    stroke={chartSeries[0]}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="raudhatain"
                    name="Raudhatain"
                    stroke={chartSeries[1]}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="sabriyah"
                    name="Sabriyah"
                    stroke={chartSeries[2]}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

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
