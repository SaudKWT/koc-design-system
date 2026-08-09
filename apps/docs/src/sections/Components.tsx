import { Download, Info, Plus, Search, TriangleAlert } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  StatCard,
  StatusBadge,
  type OperationalStatus,
} from "@koc/ui";

import { PageHead, Section, Demo, Note, Pre, Code } from "./parts";

const STATUSES: OperationalStatus[] = [
  "producing",
  "normal",
  "warning",
  "critical",
  "shutin",
  "maintenance",
  "offline",
  "unknown",
];

export function Components() {
  return (
    <>
      <PageHead
        title="Components"
        lead="shadcn/ui primitives wearing the KOC design language, plus the components KOC needs
              that shadcn has no opinion about. Everything below is the real component, rendering
              live."
      />

      <Section title="Button" description="Six variants, four sizes.">
        <Demo className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Shut in well</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Small</Button>
            <Button>Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="Add well">
              <Plus />
            </Button>
            <Button disabled>Disabled</Button>
            <Button>
              <Download />
              With icon
            </Button>
          </div>
        </Demo>
        <div className="mt-4">
          <Note title="Try tabbing through them">
            The focus ring is deliberately loud — 2px of brand blue at 2px offset. It is the only
            affordance a keyboard user has. If it ever looks “too strong” in a design review, that
            is the ring working.
          </Note>
        </div>
      </Section>

      <Section
        title="StatusBadge"
        description={
          <>
            Operational state for wells, assets and jobs. The most safety-relevant component here —
            and its API is shaped so the unsafe version is <em>unbuildable</em>, not merely
            discouraged.
          </>
        }
      >
        <Demo className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Icon-only, for dense table cells
            </div>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <StatusBadge key={s} status={s} iconOnly />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Custom label — the icon stays
            </div>
            <StatusBadge status="shutin" label="Shut-in — pump 3 replacement" />
          </div>
        </Demo>

        <div className="mt-4 space-y-3">
          <Note title="It takes a status, not a colour">
            WCAG 1.4.1 says colour must never be the only carrier of meaning. That rule usually
            breaks not through malice but through a <Code>&lt;Badge variant="destructive"&gt;</Code>{" "}
            with a colour and nothing else, shipped in a hurry. So this component doesn't accept a
            colour — it accepts a <Code>status</Code>, and derives colour, icon and label together.
            There is no prop that keeps the red and drops the icon.
          </Note>
          <Note kind="warn" title="Why this matters at KOC specifically">
            Roughly 1 in 12 men has a colour-vision deficiency, and KOC's operational readership
            skews heavily male. A red/green status pair distinguished by hue alone is unreadable for
            a meaningful share of the people these dashboards are for. The icon isn't decoration —
            for those readers it is the entire signal.
          </Note>
          <Pre>{`<StatusBadge status="critical" />
<StatusBadge status="shutin" label="Shut-in — pump 3" />
<StatusBadge status="producing" iconOnly />   // name preserved for screen readers`}</Pre>
        </div>
      </Section>

      <Section
        title="StatCard"
        description="A single KPI. Direction and sentiment are separate inputs — which is the whole point."
      >
        <Demo>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Oil production"
              value="118,402"
              unit="bbl/d"
              delta={4.2}
              deltaLabel="vs last month"
              intent="higher-is-better"
            />
            <StatCard
              label="Gas flared"
              value="1,004"
              unit="MMscf"
              delta={4.2}
              deltaLabel="vs last month"
              intent="lower-is-better"
            />
            <StatCard
              label="Water cut"
              value="31.8"
              unit="%"
              delta={-1.4}
              deltaLabel="vs last month"
              intent="lower-is-better"
            />
            <StatCard
              label="Active wells"
              value="1,286"
              delta={0}
              deltaLabel="vs last month"
            />
          </div>
        </Demo>
        <div className="mt-4 space-y-3">
          <Note kind="warn" title="Look at the first two cards">
            Both are <strong>+4.2%</strong>. The first is green, the second is red — because
            production rising is good and flaring rising is not. Nearly every stat card ever written
            colours the delta green when the arrow points up. At an oil company that gets half the
            dashboard backwards, silently and confidently: a green arrow beside rising flare volume
            tells an operator the opposite of the truth.
          </Note>
          <Note title="So sentiment must be declared">
            <Code>delta</Code> carries the arithmetic; <Code>intent</Code> carries the meaning.
            Direction is derived and cannot be wrong. Sentiment can't be inferred, because only the
            caller knows what the metric is — so <Code>intent</Code> defaults to{" "}
            <Code>"neutral"</Code>, not <Code>"higher-is-better"</Code>. An unthinking StatCard
            renders an honest grey delta rather than a confident wrong colour.
          </Note>
          <Pre>{`<StatCard label="Oil production" value="118,402" unit="bbl/d"
          delta={4.2} intent="higher-is-better" />   // green

<StatCard label="Gas flared" value="1,004" unit="MMscf"
          delta={4.2} intent="lower-is-better" />    // red — same number`}</Pre>
        </div>
      </Section>

      <Section title="Card" description="The primary surface for grouping dashboard content.">
        <Demo>
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>Burgan field</CardTitle>
              <CardDescription>Greater Burgan · South &amp; East Kuwait</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Active wells</span>
                <span className="font-medium">412</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge status="producing" />
              </div>
            </CardContent>
          </Card>
        </Demo>
      </Section>

      <Section
        title="Input & Label"
        description="Always pair a label with its control via htmlFor — an unassociated label is
                     invisible to assistive tech and kills click-to-focus for everyone."
      >
        <Demo>
          <div className="grid max-w-md gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="well">Well identifier</Label>
              <Input id="well" placeholder="BG-1042" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input id="search" placeholder="Search wells…" className="pl-8" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bad">Invalid state</Label>
              <Input id="bad" defaultValue="BG-99999" aria-invalid="true" aria-describedby="bad-err" />
              <p id="bad-err" className="text-xs text-destructive">
                No well matches that identifier.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="off">Disabled</Label>
              <Input id="off" defaultValue="Read-only" disabled />
            </div>
          </div>
        </Demo>
        <div className="mt-4">
          <Note title="That border is load-bearing">
            <Code>border-input</Code> measures 3.63:1 against the page. It looks slightly heavier
            than most design systems' input borders — and most design systems fail WCAG 1.4.11 here,
            because an input's boundary is the only thing telling a user the control exists. Don't
            soften it to <Code>border-border</Code> to make forms look lighter: that drops it to
            1.6:1, which looks fine to everyone reviewing it and invisible to a low-vision user.
          </Note>
        </div>
      </Section>

      <Section title="Alert" description="Inline messages. Callers must supply an icon.">
        <Demo className="space-y-3">
          <Alert variant="info">
            <Info />
            <AlertTitle>Scheduled maintenance</AlertTitle>
            <AlertDescription>
              Gathering centre 12 is offline for planned maintenance until 06:00.
            </AlertDescription>
          </Alert>
          <Alert variant="warning">
            <TriangleAlert />
            <AlertTitle>Flare volume above target</AlertTitle>
            <AlertDescription>
              Flaring is 4.2% above the monthly target. Review before the reporting deadline.
            </AlertDescription>
          </Alert>
        </Demo>
      </Section>

      <Section title="Badge" description="Counts, tags and categories. For plant state, use StatusBadge.">
        <Demo className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="info">Info</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </Demo>
      </Section>
    </>
  );
}
