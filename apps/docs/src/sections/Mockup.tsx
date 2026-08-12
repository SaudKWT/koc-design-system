import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  ClipboardList,
  Download,
  Drill,
  Gauge,
  History,
  Maximize2,
  Package,
  Pencil,
  Plus,
  TriangleAlert,
  Trash2,
} from "lucide-react";
import { LogOut, Settings, UserRound } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  AppShell,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Combobox,
  ComparisonChart,
  ConfirmDialog,
  DataTable,
  DateRangeFilter,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
  PageHeader,
  PageNav,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Sidebar,
  StatCard,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TrendChart,
  VolumeChart,
  cn,
  kocColumnHelper,
  resolvePreset,
  toast,
  unitDisplayName,
  type DateRangeValue,
  type NavItem,
  type NotificationItem,
  type UserMenuItem,
} from "@koc/ui";

import { DWOS } from "../examples/dwos";
import { DDR_ROWS, RIGS, WELLS, DEMO_TODAY, type DdrRow } from "../examples/ddr-data";
import {
  CRITICAL,
  MY_TASKS,
  NEEDS_ATTENTION,
  NPT_ROWS,
  RIG_STATE,
  TOTALS,
  type NptRow,
} from "../examples/unit-app-data";
import { PageHead, Section, Note } from "./parts";

/**
 * The full application mockup.
 *
 * Every other page in these docs shows one component or one pattern in a frame.
 * This is the thing they add up to: a working KOC unit application, navigable,
 * where clicking a sidebar item changes the screen, clicking a row opens a
 * record, switching unit re-scopes the nav, and the sliding tab indicator, the
 * toasts and the confirm dialogs all fire for real.
 *
 * WHY A MOCKUP EARNS ITS PLACE ALONGSIDE THE PATTERN PAGES
 * -------------------------------------------------------
 * The pattern pages each prove a component works. None of them proves the
 * components work *together*, and that is where design systems actually fail:
 * the header and the in-app nav both claim the top of the page, the filter bar
 * and the table's own search look identical and do different things, four
 * screens each solve "where am I" differently. Those are composition faults, and
 * they are invisible until something is composed.
 *
 * It is also the artefact a KOC team can be shown. "Here are 41 components" asks
 * someone to imagine an application; this one is the application.
 *
 * WHAT IS DELIBERATELY NOT FAKED
 * ------------------------------
 * Four screens are real. The rest of the nav resolves to an explicit
 * "not built yet" state rather than a plausible-looking stub, because a mockup
 * whose every link leads somewhere convincing is a promise the repo has not
 * made. The empty screens are the honest part of the demo, and they cost one
 * component to render — which is itself the argument for the system.
 */

const col = kocColumnHelper<DdrRow>();
const nptCol = kocColumnHelper<NptRow>();

const num = (v: number) => v.toLocaleString("en-GB");

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

/**
 * Which screen a nav item leads to.
 *
 * Matched on the id's suffix rather than a lookup table, because the DWOS config
 * generates ids per unit (`unit-1-ddr`, `unit-2-ddr`, …) and units 5–7 use their
 * own prefixes. A hand-maintained map would need an entry per unit per screen
 * and would silently fall out of date the first time a unit is added — which is
 * the exact failure the TeamConfig indirection exists to prevent.
 */
type ScreenKind = "home" | "kpi" | "ddr" | "npt" | "rigs" | "unbuilt";

function screenOf(itemId: string | undefined): ScreenKind {
  if (!itemId) return "unbuilt";
  if (itemId.endsWith("-home")) return "home";
  if (itemId.endsWith("-kpi")) return "kpi";
  if (itemId.endsWith("-ddr") || itemId.endsWith("-reports")) return "ddr";
  if (itemId.endsWith("-npt")) return "npt";
  if (itemId.endsWith("-rig-status")) return "rigs";
  return "unbuilt";
}

/** Every nav item in a unit, flattened, so a unit switch can keep your screen. */
function itemsOf(unitId: string): NavItem[] {
  const unit = DWOS.units.find((u) => u.id === unitId);
  return unit ? unit.groups.flatMap((g) => g.items) : [];
}

export function Mockup() {
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  return (
    <>
      <PageHead
        title="Full application"
        lead="Every other page here shows one component in a frame. This is what they add up to — a
              working KOC unit application you can navigate, with the shell, the three patterns and
              the whole component library composed together."
      />

      <Note kind="warn" title="Real structure, placeholder content">
        The org model, the screen composition and every interaction are real. The wells, rigs,
        figures and app lists are invented — see the list-view and shell pages for exactly which
        parts have been checked against KOC and which have not. Four screens are built; the rest of
        the nav resolves to an explicit <strong>not built</strong> state rather than a convincing
        stub.
      </Note>

      <Section
        title="The application"
        description="Click through the sidebar, switch unit in the header, open a report, void it.
                     Nothing here is a screenshot."
      >
        <button
          onClick={() => setFull(true)}
          className={cn(
            "mb-3 rounded-md border border-input px-3 py-1.5 text-sm transition-colors duration-fast ease-out",
            "hover:bg-accent hover:text-accent-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <Maximize2 aria-hidden className="mr-1.5 inline size-3.5" />
          Open full screen
        </button>

        {/* Re-roots the shell's fixed-position sidebar into this frame. A
            transform creates a containing block for `position: fixed`, which is
            what lets a full-viewport shell render inside a 46rem box. */}
        <style>{`
          [data-shell-frame] { transform: translateZ(0); }
          [data-shell-frame] .h-svh,
          [data-shell-frame] .min-h-svh { height: 100%; min-height: 100%; }
        `}</style>
        <div
          data-shell-frame
          className="relative h-[46rem] overflow-hidden rounded-lg border border-input"
        >
          <UnitApp />
        </div>
      </Section>

      <Section
        title="What composing them actually surfaced"
        description="Things that are invisible when each component has its own page."
      >
        <ul className="space-y-2 text-sm">
          {[
            "Two navigations need different jobs. The sidebar says which app you are in; PageNav says which part of it. Put them both at full strength and the page has two competing top-levels — so the in-app nav is quiet, sits below the page header, and never repeats a sidebar destination.",
            "The unit switcher has to survive a screen change. Switching from Unit 1 to Unit 3 while reading NPT should land on Unit 3's NPT, not bounce you to a dashboard. That only matters once screens and units are both real, and it is why the config generates matching ids per unit.",
            "A record needs two depths. The dialog is for a glance you return from; the detail screen has a breadcrumb, tabs and destructive actions. Building both revealed the dialog should offer a way *up* to the full record rather than duplicating it.",
            "Numbers must come from one source. The tiles, the tables and the charts here are all derived from the same rows, so they cannot disagree. Independently invented datasets look fine and quietly contradict each other.",
            "Unbuilt screens need a real state. Most of this nav is not built, and saying so in a component is more honest — and shorter — than a stub that implies otherwise.",
          ].map((t) => (
            <li key={t} className="flex gap-2">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </Section>

      {full && (
        <div className="fixed inset-0 z-50 bg-background">
          <button
            onClick={() => setFull(false)}
            autoFocus
            className={cn(
              "absolute right-4 top-3 z-[60] rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm",
              "hover:bg-accent hover:text-accent-foreground",
              "transition-colors duration-fast ease-out",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            Close (Esc)
          </button>
          <UnitApp />
        </div>
      )}
    </>
  );
}

// ── The application ─────────────────────────────────────────────────────────

function UnitApp() {
  const [unitId, setUnitId] = useState("unit-1");
  const [activeItemId, setActiveItemId] = useState("unit-1-home");
  /** The open record, if any. Null means we are on the list, not the detail. */
  const [record, setRecord] = useState<DdrRow | null>(null);

  const unit = DWOS.units.find((u) => u.id === unitId);
  const screen = screenOf(activeItemId);

  const navigate = useCallback((id: string) => {
    setActiveItemId(id);
    // Leaving a screen closes the record it was showing, or navigating away and
    // back would drop you into a detail view you never asked for.
    setRecord(null);
  }, []);

  /**
   * Switching unit keeps you on the same *kind* of screen where one exists.
   *
   * Unit 5 has no NPT screen, so reading NPT in Unit 1 and switching there falls
   * back to that unit's first destination rather than leaving `activeItemId`
   * pointing at an item the new unit does not contain — which would render a
   * nav with nothing highlighted and a screen that belongs to a unit you left.
   */
  const changeUnit = useCallback(
    (next: string) => {
      const kind = screenOf(activeItemId);
      const items = itemsOf(next);
      const match = items.find((i) => screenOf(i.id) === kind);
      setUnitId(next);
      setActiveItemId(match?.id ?? items[0]?.id ?? "");
      setRecord(null);
    },
    [activeItemId],
  );

  return (
    <AppShell
      team={DWOS}
      unitId={unitId}
      onUnitChange={changeUnit}
      activeItemId={activeItemId}
      user={USER}
      notifications={NOTIFICATIONS}
      userMenu={USER_MENU}
      onNotificationSelect={(n) => toast(n.title, { description: n.description })}
      onMarkAllRead={() => toast.success("All notifications marked read")}
      /*
       * A real anchor, intercepted — not a button.
       *
       * There is no router in the docs app, but nav items are still destinations:
       * they should be middle-clickable, copyable and announced as links. A
       * button would be a lie about what the control is, and would announce
       * wrongly to a screen reader. A consuming app passes its own Link here and
       * this problem disappears.
       */
      renderLink={(item, children) => (
        <a
          href={item.href}
          onClick={(e) => {
            e.preventDefault();
            navigate(item.id);
          }}
        >
          {children}
        </a>
      )}
    >
      {screen === "home" && (
        <UnitHomeScreen
          unitName={unitLabel(unitId)}
          onNavigate={(kind) => gotoKind(kind, unitId, navigate)}
        />
      )}
      {screen === "kpi" && <KpiScreen unitName={unitLabel(unitId)} onOpenNpt={() => gotoKind("npt", unitId, navigate)} />}
      {screen === "ddr" && !record && (
        <DdrScreen unitName={unitLabel(unitId)} onOpen={setRecord} onNav={(id) => navigate(id)} />
      )}
      {screen === "ddr" && record && (
        <DetailScreen record={record} unitName={unitLabel(unitId)} onBack={() => setRecord(null)} />
      )}
      {screen === "npt" && <NptScreen unitName={unitLabel(unitId)} />}
      {screen === "rigs" && <RigScreen unitName={unitLabel(unitId)} />}
      {screen === "unbuilt" && (
        <UnbuiltScreen
          label={
            unit?.groups
              .flatMap((g) => g.items)
              .find((i) => i.id === activeItemId)?.label ?? "This screen"
          }
        />
      )}
    </AppShell>
  );
}

function unitLabel(unitId: string): string {
  const unit = DWOS.units.find((u) => u.id === unitId);
  return unit ? `${unit.label} — ${unitDisplayName(unit)}` : "—";
}

/** Jump to a unit's screen of a given kind, if it has one. */
function gotoKind(kind: ScreenKind, unitId: string, navigate: (id: string) => void) {
  const match = itemsOf(unitId).find((i) => screenOf(i.id) === kind);
  if (match) navigate(match.id);
}

// ── Screens ─────────────────────────────────────────────────────────────────

const PRODUCTION = [
  { day: "03 Aug", unit1: 8420, unit2: 6180, unit3: 4310 },
  { day: "04 Aug", unit1: 8610, unit2: 6040, unit3: 4405 },
  { day: "05 Aug", unit1: 8280, unit2: 6320, unit3: 4180 },
  { day: "06 Aug", unit1: 8790, unit2: 6255, unit3: 4520 },
  { day: "07 Aug", unit1: 8515, unit2: 6410, unit3: 4390 },
  { day: "08 Aug", unit1: 8930, unit2: 6180, unit3: 4610 },
  { day: "09 Aug", unit1: 9105, unit2: 6350, unit3: 4475 },
];

/** NPT by rig, derived so it agrees with the NPT table exactly. */
const NPT_BY_RIG = RIGS.map((rig) => {
  const forRig = NPT_ROWS.filter((r) => r.rig === rig);
  return {
    rig,
    planned: forRig.filter((r) => r.planned).reduce((n, r) => n + r.hours, 0),
    unplanned: forRig.filter((r) => !r.planned).reduce((n, r) => n + r.hours, 0),
  };
});

const FOOTAGE = [...new Set(DDR_ROWS.map((r) => r.date))].sort().map((date) => ({
  day: fmtDate(date),
  footage: DDR_ROWS.filter((r) => r.date === date).reduce((n, r) => n + r.footage, 0),
}));

function Screen({ children }: { children: ReactNode }) {
  return <div className="@container mx-auto max-w-7xl p-6">{children}</div>;
}

/** The alert a unit head should see before anything else on the screen. */
function CriticalAlert({ onOpen }: { onOpen?: () => void }) {
  if (!CRITICAL) return null;
  return (
    /*
     * `variant="destructive"`, and NOT role="alert".
     *
     * This is present when the page loads rather than raised in response to
     * something the user just did, so role="alert" would interrupt a screen
     * reader mid-sentence on arrival. It is in the reading order at the top of
     * the page, which is where it belongs and how it will be reached.
     */
    <Alert variant="destructive" className="mb-5">
      <TriangleAlert aria-hidden />
      <AlertTitle>
        {CRITICAL.well} — NPT past {CRITICAL.npt.toFixed(0)} hrs
      </AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          {CRITICAL.summary} Rig {CRITICAL.rig}.
        </span>
        {onOpen && (
          <Button variant="outline" size="sm" onClick={onOpen}>
            Open NPT log
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Unit home — the landing screen.
 *
 * Answers "what should I look at first today", which is a different question
 * from the KPI dashboard's "how are we doing" and the list view's "show me the
 * records". It is the only screen here that mixes UNIT state with PERSONAL
 * state, and that split is what the two columns are for.
 *
 * THE RAIL: A SIDEBAR'S LOOK, A PAGE COLUMN'S BEHAVIOUR
 * -----------------------------------------------------
 * This was a grid of Cards, on the reasoning that a Sidebar is app chrome and
 * would persist across every screen — an empty "My tasks" panel beside the DDR
 * table on every other route. That reasoning still holds and is why the rail is
 * still a grid column, stacking under the main column on narrow screens, which
 * is also the correct reading order: unit state first, personal state second.
 *
 * What changed is the surface. Saud asked for it to match the left sidebar, so
 * it now renders `<Sidebar collapsible="none">` and gets bg-sidebar,
 * SidebarGroup, SidebarMenu and real visual parity.
 *
 * `collapsible="none"` is the whole trick, and it is what shadcn's own
 * sidebar-15 (left AND right sidebars) does. It hits an early return in
 * sidebar.tsx that renders a plain styled div and NEVER READS PROVIDER STATE.
 * That matters because SidebarProvider holds exactly one `open` boolean, one
 * `openMobile`, one Cmd/Ctrl+B listener and one cookie — two collapsible
 * sidebars under it would toggle in lockstep, and below 768px would open two
 * Sheets with two focus traps at once. A second provider does not help: both
 * keydown handlers fire on the same keypress.
 *
 * So this is a styled div wearing sidebar tokens, not chrome. Real chrome parity
 * — its own trigger, its own collapse, its own mobile sheet — needs per-sidebar
 * identity in the provider, which is a refactor of a component KOC teams already
 * consume. Worth doing deliberately, not as a side effect of a styling request.
 *
 * `role="complementary"` and the label are passed explicitly because Sidebar
 * renders a div, not an aside — without them the landmark is simply lost.
 *
 * DO NOT make this collapsible in place. Its container would be
 * `fixed inset-y-0 right-0`, escaping SidebarInset — and the docs frame would
 * HIDE that from you, because `[data-shell-frame] { transform: translateZ(0) }`
 * creates a containing block for fixed positioning. It would look right here and
 * pin to the viewport in a real consumer app.
 */
function UnitHomeScreen({
  unitName,
  onNavigate,
}: {
  unitName: string;
  onNavigate: (kind: ScreenKind) => void;
}) {
  const [done, setDone] = useState<string[]>(MY_TASKS.filter((t) => t.done).map((t) => t.id));
  const open = MY_TASKS.filter((t) => !done.includes(t.id));

  return (
    <Screen>
      <PageHeader
        title={unitName}
        description="Where the unit stands today, and what is waiting for you."
        meta={
          <span className="text-xs text-muted-foreground">
            {TOTALS.reports} reports · {TOTALS.rigs} rigs · updated 06:00
          </span>
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => onNavigate("kpi")}>
            Full KPIs
            <ArrowRight aria-hidden className="ml-1.5 size-3.5" />
          </Button>
        }
      />

      {/*
       * 1fr + a fixed rail, not two fractions. The rail holds a task list and
       * short cards whose width should not grow with the viewport — at 1920px a
       * fractional rail becomes a column of very wide checkboxes. The main
       * column takes the slack instead, which is where tables and charts want it.
       */}
      <div className="@container mt-5 grid items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="@container min-w-0 space-y-6">
          <CriticalAlert onOpen={() => onNavigate("npt")} />

          {/*
           * CONTAINER queries, not viewport ones.
           *
           * `xl:grid-cols-4` was true at a 1600px viewport while this column was
           * ~600px wide, because the rail takes 20rem out of it and a media
           * query cannot see that. Four stat cards were forced into the space
           * for two and every label truncated — "PRODUCT…", "3,20".
           *
           * Any component that can sit in a narrowed column has this problem,
           * and it is invisible until something is placed beside it. That is the
           * same class of bug as the whole mockup: it only appears once things
           * are composed.
           */}
          <div className="grid gap-4 @md:grid-cols-2 @3xl:grid-cols-4">
            <StatCard label="Production" value="9,105" unit="bbl/d" delta={2.1} intent="higher-is-better" />
            <StatCard
              label="NPT this period"
              value={TOTALS.npt.toFixed(1)}
              unit="hrs"
              delta={18.4}
              intent="lower-is-better"
            />
            <StatCard
              label="Footage"
              value={num(TOTALS.footage)}
              unit="ft"
              delta={4.2}
              intent="higher-is-better"
            />
            <StatCard label="Active rigs" value={TOTALS.rigs} delta={0} intent="neutral" />
          </div>

          {/* Derived from the reports' own status, so this cannot claim things
              are fine while the DDR table shows a stuck pipe. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Needs attention</CardTitle>
              <CardDescription>
                {NEEDS_ATTENTION.length} report{NEEDS_ATTENTION.length === 1 ? "" : "s"} not in a
                normal state
              </CardDescription>
              {/* CardAction, not a wrapper div plus flex-row. CardHeader is a
                  grid now, so `flex-row justify-between` is inert — the button
                  simply fell under the title. */}
              <CardAction>
                <Button variant="ghost" size="sm" onClick={() => onNavigate("ddr")}>
                  All reports
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {NEEDS_ATTENTION.slice(0, 5).map((r) => (
                <div key={r.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <StatusBadge status={r.status} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {r.well} <span className="font-normal text-muted-foreground">· {r.rig}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{r.summary}</p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {r.npt.toFixed(1)} hrs
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Footage drilled</CardTitle>
              <CardDescription>ft per day, all rigs</CardDescription>
            </CardHeader>
            <CardContent>
              <VolumeChart
                data={FOOTAGE}
                xKey="day"
                caption="Footage drilled per day in feet, across all rigs"
                valueFormat={num}
                height={180}
                series={[{ key: "footage", label: "Footage" }]}
              />
            </CardContent>
          </Card>
        </div>

        {/* `aside` with a name: it is genuinely complementary content, and a
            screen reader user landing here should be able to skip past unit
            state to their own without reading it all. */}
        <Sidebar
          collapsible="none"
          role="complementary"
          aria-label="Your work"
          className="h-fit gap-6 rounded-lg border border-border bg-sidebar p-4"
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">My tasks</CardTitle>
              <CardDescription>
                {open.length} open · {done.length} done
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {MY_TASKS.map((t) => {
                const isDone = done.includes(t.id);
                return (
                  <div key={t.id} className="flex items-start gap-2.5">
                    <Checkbox
                      id={t.id}
                      checked={isDone}
                      className="mt-0.5"
                      onCheckedChange={(v) =>
                        setDone((d) => (v === true ? [...d, t.id] : d.filter((x) => x !== t.id)))
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <Label
                        htmlFor={t.id}
                        className={cn(
                          "block text-sm font-normal leading-snug",
                          // Struck through AND muted. Strike-through alone is
                          // invisible to anyone who cannot see it, and colour
                          // alone is invisible in greyscale; the checkbox state
                          // is what actually carries it to a screen reader.
                          isDone && "text-muted-foreground line-through",
                        )}
                      >
                        {t.label}
                      </Label>
                      {t.context && (
                        <p className="truncate text-xs text-muted-foreground">{t.context}</p>
                      )}
                    </div>
                    {t.due && !isDone && (
                      <span className="shrink-0 text-2xs text-muted-foreground">{t.due}</span>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <CalendarClock aria-hidden className="size-3.5" />
                This shift
              </CardTitle>
              <CardDescription>06:00 – 18:00</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                {[
                  ["Reports due", `${TOTALS.rigs}`],
                  ["Received", `${TOTALS.rigs - 1}`],
                  ["Handover", "17:30"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="font-medium tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          {/* Shortcuts to this unit's own screens. Not a second navigation —
              these are the two or three destinations a landing page should
              short-circuit to, and they duplicate the sidebar on purpose. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Jump to</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1">
              {([
                ["Daily drilling reports", "ddr"],
                ["NPT tracking", "npt"],
                ["Rig status", "rigs"],
              ] as [string, ScreenKind][]).map(([label, kind]) => (
                <Button
                  key={kind}
                  variant="ghost"
                  size="sm"
                  className="justify-start px-2"
                  onClick={() => onNavigate(kind)}
                >
                  {label}
                </Button>
              ))}
            </CardContent>
          </Card>
        </Sidebar>
      </div>
    </Screen>
  );
}

function KpiScreen({ unitName, onOpenNpt }: { unitName: string; onOpenNpt: () => void }) {
  const [range, setRange] = useState<DateRangeValue>({
    preset: "7d",
    range: resolvePreset("7d", DEMO_TODAY),
  });

  return (
    <Screen>
      <PageHeader
        title={unitName}
        description="Production, non-productive time and drilling progress for the selected period."
        actions={
          <Button variant="outline" size="sm">
            <Download aria-hidden className="mr-1.5 size-3.5" />
            Export
          </Button>
        }
        meta={
          <span className="text-xs text-muted-foreground">
            {TOTALS.reports} reports · {TOTALS.rigs} rigs · updated 06:00
          </span>
        }
      />

      <div className="py-4">
        <DateRangeFilter value={range} onChange={setRange} today={DEMO_TODAY} />
      </div>

      <CriticalAlert onOpen={onOpenNpt} />

      {/* Tiles answer "what is the number"; charts answer "how did it get
          there". Someone scanning for a problem wants the first in under a
          second, and only then the second. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Production" value="9,105" unit="bbl/d" delta={2.1} intent="higher-is-better" />
        <StatCard
          label="NPT this period"
          value={TOTALS.npt.toFixed(1)}
          unit="hrs"
          delta={18.4}
          intent="lower-is-better"
        />
        <StatCard
          label="Footage drilled"
          value={num(TOTALS.footage)}
          unit="ft"
          delta={4.2}
          intent="higher-is-better"
        />
        <StatCard label="Active rigs" value={TOTALS.rigs} delta={0} intent="neutral" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Production by unit</CardTitle>
            <CardDescription>bbl/d, last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={PRODUCTION}
              xKey="day"
              caption="Daily production in barrels per day, by unit, over the last seven days"
              valueFormat={num}
              height={220}
              series={[
                { key: "unit1", label: "Unit 1" },
                { key: "unit2", label: "Unit 2" },
                { key: "unit3", label: "Unit 3" },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Non-productive time by rig</CardTitle>
            <CardDescription>hours, planned vs unplanned</CardDescription>
          </CardHeader>
          <CardContent>
            <ComparisonChart
              data={NPT_BY_RIG}
              xKey="rig"
              caption="Non-productive time in hours by rig, split into planned and unplanned"
              height={220}
              series={[
                { key: "planned", label: "Planned" },
                { key: "unplanned", label: "Unplanned" },
              ]}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Footage drilled</CardTitle>
            <CardDescription>ft per day, all rigs</CardDescription>
          </CardHeader>
          <CardContent>
            <VolumeChart
              data={FOOTAGE}
              xKey="day"
              caption="Footage drilled per day in feet, across all rigs"
              valueFormat={num}
              height={200}
              series={[{ key: "footage", label: "Footage" }]}
            />
          </CardContent>
        </Card>
      </div>
    </Screen>
  );
}

function DdrScreen({
  unitName,
  onOpen,
  onNav,
}: {
  unitName: string;
  onOpen: (row: DdrRow) => void;
  onNav: (id: string) => void;
}) {
  const [dateRange, setDateRange] = useState<DateRangeValue>({
    preset: "7d",
    range: resolvePreset("7d", DEMO_TODAY),
  });
  const [rig, setRig] = useState("all");
  const [well, setWell] = useState<string | undefined>();
  const [showVoided, setShowVoided] = useState(true);
  const [glance, setGlance] = useState<DdrRow | null>(null);
  const [confirming, setConfirming] = useState<DdrRow | null>(null);
  const [voided, setVoided] = useState<string[]>([]);

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("date", { header: "Date", cell: ({ row }) => fmtDate(row.original.date) }),
        col.accessor("well", { header: "Well" }),
        col.accessor("rig", { header: "Rig" }),
        col.accessor("depth", {
          header: "Depth (ft)",
          meta: { numeric: true },
          cell: ({ row }) => num(row.original.depth),
        }),
        col.accessor("footage", {
          header: "Footage (ft)",
          meta: { numeric: true },
          cell: ({ row }) => num(row.original.footage),
        }),
        col.accessor("npt", {
          header: "NPT (hrs)",
          meta: { numeric: true },
          cell: ({ row }) => row.original.npt.toFixed(2),
        }),
        col.accessor("status", {
          header: "Status",
          cell: ({ row }) =>
            voided.includes(row.original.id) ? (
              <span className="text-xs font-medium text-muted-foreground">Voided</span>
            ) : (
              <StatusBadge status={row.original.status} />
            ),
        }),
        col.display({
          id: "open",
          // A display column still needs a header NAME even when it shows none —
          // an empty `th` is an unlabelled column to anyone navigating a table
          // by header. Visually hidden, still announced.
          header: () => <span className="sr-only">Actions</span>,
          cell: ({ row }) => (
            <Button variant="ghost" size="sm" className="-my-1" onClick={() => setGlance(row.original)}>
              Open
            </Button>
          ),
        }),
      ]),
    [voided],
  );

  const rows = useMemo(() => {
    const from = dateRange.range?.from;
    const to = dateRange.range?.to;
    return DDR_ROWS.filter((r) => {
      const d = new Date(r.date);
      if (from && d < new Date(from.toDateString())) return false;
      if (to && d > new Date(to.toDateString())) return false;
      if (rig !== "all" && r.rig !== rig) return false;
      if (well && r.well !== well) return false;
      if (!showVoided && voided.includes(r.id)) return false;
      return true;
    });
  }, [dateRange, rig, well, showVoided, voided]);

  return (
    <Screen>
      <PageHeader
        title="Daily Drilling Reports"
        description="One report per well per day. Filter by period, rig or well; open a row for the full record."
        breadcrumbs={[{ label: unitName, href: "#" }, { label: "Daily Drilling Reports" }]}
        actions={
          <>
            <Button variant="outline" size="sm">
              <Download aria-hidden className="mr-1.5 size-3.5" />
              Export
            </Button>
            <Button size="sm">
              <Plus aria-hidden className="mr-1.5 size-3.5" />
              New report
            </Button>
          </>
        }
        meta={
          <span className="text-xs text-muted-foreground">
            {rows.length} of {DDR_ROWS.length} reports · updated 06:00
          </span>
        }
      />

      {/* In-app navigation, deliberately quiet. The sidebar already owns "which
          app am I in" at full strength; a second bold nav here would give the
          page two competing top-levels. */}
      <div className="border-b border-border py-2">
        <PageNav
          activeHref="/ddr"
          groups={APP_NAV}
          renderLink={(item, children) => (
            <a
              href={item.href}
              onClick={(e) => {
                e.preventDefault();
                // Only the destinations this mockup actually implements move;
                // the rest stay put rather than pretending.
                if (item.href === "/npt") onNav(activeUnitItem("npt"));
                if (item.href === "/rigs") onNav(activeUnitItem("rigs"));
                if (item.href === "/kpi") onNav(activeUnitItem("kpi"));
              }}
            >
              {children}
            </a>
          )}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 py-4">
        <DateRangeFilter value={dateRange} onChange={setDateRange} today={DEMO_TODAY} />

        <div className="ml-auto flex flex-wrap items-center gap-3">
          {/* A voided report stays in the record — hiding it is a view
              preference, never a deletion. */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="show-voided"
              checked={showVoided}
              onCheckedChange={(v) => setShowVoided(v === true)}
            />
            <Label htmlFor="show-voided" className="text-sm font-normal text-muted-foreground">
              Show voided
            </Label>
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Short, stable list → Select. Long list → searchable combobox. */}
          <Select value={rig} onValueChange={setRig}>
            <SelectTrigger size="sm" className="w-36" aria-label="Filter by rig">
              <SelectValue placeholder="All rigs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All rigs</SelectItem>
              {RIGS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Combobox
            label="Filter by well"
            placeholder="All wells"
            searchPlaceholder="Search wells…"
            className="w-44"
            options={WELLS.map((w) => ({ value: w, label: w }))}
            value={well}
            onChange={setWell}
          />
        </div>
      </div>

      <DataTable
        caption="Daily drilling reports, filtered by the selected period, rig and well"
        columns={columns}
        data={rows}
        filterColumn="well"
        filterPlaceholder="Search within results…"
        pageSize={8}
        empty={{
          title: "No reports in this period",
          description: "Widen the date range, or clear the rig and well filters.",
          action: (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDateRange({ preset: "30d", range: resolvePreset("30d", DEMO_TODAY) });
                setRig("all");
                setWell(undefined);
              }}
            >
              Reset filters
            </Button>
          ),
        }}
      />

      {/* A glance you return from. The way *up* to the full record is an action
          inside it, rather than the dialog trying to be the record. */}
      <Dialog open={!!glance} onOpenChange={(o) => !o && setGlance(null)}>
        <DialogContent className="sm:max-w-lg">
          {glance && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {glance.well}
                  <StatusBadge status={glance.status} />
                </DialogTitle>
                <DialogDescription>
                  {fmtDate(glance.date)} · Rig {glance.rig}
                </DialogDescription>
              </DialogHeader>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {[
                  ["Depth", `${num(glance.depth)} ft`],
                  ["Footage", `${num(glance.footage)} ft`],
                  ["Rotating hours", glance.hours.toFixed(2)],
                  ["NPT", `${glance.npt.toFixed(2)} hrs`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>

              <div>
                <p className="text-xs text-muted-foreground">Operations summary</p>
                <p className="mt-1 text-sm">{glance.summary}</p>
              </div>

              <div className="flex justify-between gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setConfirming(glance)}
                >
                  <Trash2 aria-hidden className="mr-1.5 size-3.5" />
                  Void report
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const r = glance;
                    setGlance(null);
                    onOpen(r);
                  }}
                >
                  <Maximize2 aria-hidden className="mr-1.5 size-3.5" />
                  Open full report
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(o) => !o && setConfirming(null)}
        title="Void report"
        subject={confirming?.well ?? ""}
        description="A voided report stays in the record with its figures excluded from unit totals. This cannot be undone from here."
        confirmLabel="Void report"
        onConfirm={() => {
          if (confirming) {
            setVoided((v) => [...v, confirming.id]);
            toast.success(`Report ${confirming.well} voided`, {
              description: "Its figures are excluded from unit totals.",
            });
          }
          setConfirming(null);
          setGlance(null);
        }}
      />
    </Screen>
  );
}

/**
 * The in-app nav's destinations, expressed as this unit's item ids.
 *
 * Hardcoded to Unit 1's ids because PageNav takes hrefs rather than item ids —
 * a real app routes on the URL and never needs this bridge.
 */
function activeUnitItem(kind: ScreenKind): string {
  const match = itemsOf("unit-1").find((i) => screenOf(i.id) === kind);
  return match?.id ?? "unit-1-home";
}

function DetailScreen({
  record,
  unitName,
  onBack,
}: {
  record: DdrRow;
  unitName: string;
  onBack: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [voided, setVoided] = useState(false);

  const auditColumns = useMemo(
    () =>
      auditCol.columns([
        auditCol.accessor("at", { header: "When" }),
        auditCol.accessor("who", { header: "Who" }),
        auditCol.accessor("action", { header: "What changed" }),
      ]),
    [],
  );

  return (
    <Screen>
      <PageHeader
        /* The record's identity, not the screen's function. This page is about
           one well on one day, and that is what belongs in the h1. */
        title={`${record.well} — ${fmtDate(record.date)} 2026`}
        description={`Rig ${record.rig} · ${unitName}`}
        breadcrumbs={[
          { label: unitName, href: "#" },
          { label: "Daily Drilling Reports", href: "#" },
          { label: `${record.well} — ${fmtDate(record.date)}` },
        ]}
        meta={
          <>
            {voided ? (
              <span className="rounded border border-input px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                Voided
              </span>
            ) : (
              <StatusBadge status={record.status} />
            )}
            <span className="text-xs text-muted-foreground">Submitted 06:12 · approved 08:05</span>
          </>
        }
        actions={
          <>
            {/* The way back is not optional — someone arriving from a link in an
                email has no list to press Back to. */}
            <Button variant="outline" size="sm" onClick={onBack}>
              <ArrowLeft aria-hidden className="mr-1.5 size-3.5" />
              Back to list
            </Button>
            <Button variant="outline" size="sm" disabled={voided}>
              <Pencil aria-hidden className="mr-1.5 size-3.5" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              disabled={voided}
              onClick={() => setConfirming(true)}
            >
              <Trash2 aria-hidden className="mr-1.5 size-3.5" />
              Void
            </Button>
          </>
        }
      />

      <div className="grid gap-4 py-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Depth" value={num(record.depth)} unit="ft" />
        <StatCard label="Footage" value={num(record.footage)} unit="ft" />
        <StatCard label="Rotating hours" value={record.hours.toFixed(2)} />
        <StatCard label="NPT" value={record.npt.toFixed(2)} unit="hrs" intent="lower-is-better" />
      </div>

      <Tabs defaultValue="report">
        <TabsList>
          <TabsTrigger value="report">Report</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5">
            <History aria-hidden className="size-3.5" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="report" className="pt-4">
          {/* A definition list, not a table. One record's fields are pairs; a
              two-column table of them announces as tabular data and sorts
              nothing. */}
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Well", record.well],
              ["Rig", record.rig],
              ["Date", `${fmtDate(record.date)} 2026`],
              ["Hole section", '12¼"'],
              ["Mud weight", "10.2 ppg"],
              ["Bit hours", "18.5"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 text-sm font-medium tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6">
            <p className="text-xs text-muted-foreground">Operations summary</p>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed">{record.summary}</p>
          </div>
        </TabsContent>

        <TabsContent value="audit" className="pt-4">
          <DataTable
            caption="Change history for this report — who changed what, and when"
            columns={auditColumns}
            data={AUDIT}
            pageSize={10}
            empty={{ title: "No changes recorded" }}
          />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Void report"
        subject={`${record.well} — ${fmtDate(record.date)}`}
        description="A voided report stays in the record with its figures excluded from unit totals. The change is written to the history tab."
        confirmLabel="Void report"
        onConfirm={() => {
          setVoided(true);
          setConfirming(false);
          toast.success(`Report ${record.well} voided`, {
            description: "Recorded in the change history.",
          });
        }}
      />
    </Screen>
  );
}

function NptScreen({ unitName }: { unitName: string }) {
  const columns = useMemo(
    () =>
      nptCol.columns([
        nptCol.accessor("date", { header: "Date", cell: ({ row }) => fmtDate(row.original.date) }),
        nptCol.accessor("well", { header: "Well" }),
        nptCol.accessor("rig", { header: "Rig" }),
        nptCol.accessor("category", { header: "Category" }),
        nptCol.accessor("planned", {
          header: "Type",
          /* Planned downtime is a schedule item; unplanned is an incident.
             StatusBadge is not used here — this is not an operational status,
             and borrowing the badge would imply a severity it does not carry. */
          cell: ({ row }) => (
            <span className="text-sm">{row.original.planned ? "Planned" : "Unplanned"}</span>
          ),
        }),
        nptCol.accessor("hours", {
          header: "Hours",
          meta: { numeric: true },
          cell: ({ row }) => row.original.hours.toFixed(2),
        }),
      ]),
    [],
  );

  const unplanned = NPT_ROWS.filter((r) => !r.planned).reduce((n, r) => n + r.hours, 0);
  const planned = NPT_ROWS.filter((r) => r.planned).reduce((n, r) => n + r.hours, 0);

  return (
    <Screen>
      <PageHeader
        title="NPT tracking"
        description="Every hour a rig was not making hole, and why. Planned downtime is separated from incidents."
        breadcrumbs={[{ label: unitName, href: "#" }, { label: "NPT tracking" }]}
        meta={
          <span className="text-xs text-muted-foreground">
            {NPT_ROWS.length} entries · {TOTALS.npt.toFixed(1)} hrs total
          </span>
        }
      />

      <CriticalAlert />

      <div className="grid gap-4 py-5 sm:grid-cols-3">
        <StatCard label="Unplanned" value={unplanned.toFixed(1)} unit="hrs" intent="lower-is-better" />
        <StatCard label="Planned" value={planned.toFixed(1)} unit="hrs" intent="neutral" />
        <StatCard
          label="Share unplanned"
          value={`${Math.round((unplanned / (unplanned + planned)) * 100)}%`}
          intent="lower-is-better"
        />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">By rig</CardTitle>
          <CardDescription>hours, planned vs unplanned</CardDescription>
        </CardHeader>
        <CardContent>
          <ComparisonChart
            data={NPT_BY_RIG}
            xKey="rig"
            caption="Non-productive time in hours by rig, split into planned and unplanned"
            height={200}
            series={[
              { key: "planned", label: "Planned" },
              { key: "unplanned", label: "Unplanned" },
            ]}
          />
        </CardContent>
      </Card>

      <DataTable
        caption="Non-productive time entries, most recent first"
        columns={columns}
        data={NPT_ROWS}
        filterColumn="well"
        filterPlaceholder="Search wells…"
        pageSize={8}
        empty={{ title: "No non-productive time recorded" }}
      />
    </Screen>
  );
}

function RigScreen({ unitName }: { unitName: string }) {
  return (
    <Screen>
      <PageHeader
        title="Rig status"
        description="Where each rig is, what it is on, and how much time it has lost."
        breadcrumbs={[{ label: unitName, href: "#" }, { label: "Rig status" }]}
        meta={<span className="text-xs text-muted-foreground">{RIG_STATE.length} rigs</span>}
      />

      {/* Cards rather than a table, deliberately: four rigs is a set you look
          at, not a list you scan. A table earns its structure at thirty rows,
          and imposes overhead at four. */}
      <div className="grid gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-4">
        {RIG_STATE.map((r) => (
          <Card key={r.rig}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{r.rig}</CardTitle>
                  <CardDescription>{r.well}</CardDescription>
                </div>
                <StatusBadge status={r.status} />
              </div>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Depth</dt>
                  <dd className="font-medium tabular-nums">{num(r.depth)} ft</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">NPT, period</dt>
                  <dd className="font-medium tabular-nums">{r.nptTotal.toFixed(2)} hrs</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Last report</dt>
                  <dd className="font-medium">{fmtDate(r.lastReport)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
    </Screen>
  );
}

/**
 * The honest screen.
 *
 * Most of this nav is not built. A convincing stub here would make the mockup
 * read as a finished application and set an expectation the repo has not earned
 * — and the first person to click three of them would stop trusting all of it.
 * Saying so costs one component.
 */
function UnbuiltScreen({ label }: { label: string }) {
  return (
    <Screen>
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-md bg-muted">
          <Package aria-hidden className="size-5 text-muted-foreground" />
        </div>
        {/* h1, matching every other screen. This IS the page inside the shell,
            and a screen whose heading level depends on whether it happens to be
            built is a heading outline that shifts as the app fills in. */}
        <h1 className="mt-4 text-lg font-semibold">{label}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Not built. This mockup implements four screens — the unit dashboard, daily drilling
          reports, the report detail and NPT tracking — plus rig status. The rest of the nav is
          here because the <strong className="text-foreground">org structure</strong> is real, not
          because the screens are.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Building one is a list, a detail or a dashboard — the three patterns already in this
          system.
        </p>
      </div>
    </Screen>
  );
}

// ── Shared demo data ────────────────────────────────────────────────────────

interface AuditRow extends Record<string, unknown> {
  id: string;
  at: string;
  who: string;
  action: string;
}

const auditCol = kocColumnHelper<AuditRow>();

const AUDIT: AuditRow[] = [
  { id: "a1", at: "09 Aug 06:12", who: "A. Al-Rashidi", action: "Report submitted" },
  { id: "a2", at: "09 Aug 07:40", who: "S. Alkharji", action: "Depth corrected 9,438 → 9,450 ft" },
  { id: "a3", at: "09 Aug 08:05", who: "M. Haddad", action: "Approved" },
];

const USER = { name: "Saud Alkharji", role: "Operational Support" };

const NOTIFICATIONS: NotificationItem[] = [
  {
    id: "n1",
    severity: "critical",
    title: "MN-118 stuck pipe",
    description: "NPT has passed 24 hrs. Fishing operations ongoing.",
    timestamp: "12 min ago",
  },
  {
    id: "n2",
    severity: "warning",
    title: "RA-207 mud losses",
    description: "Losses reported at 7,290 ft. LCM pill pumped.",
    timestamp: "1 hr ago",
  },
  {
    id: "n3",
    severity: "info",
    title: "Daily reports submitted",
    description: "11 of 12 wells reported for 08 Aug.",
    timestamp: "3 hrs ago",
    read: true,
  },
];

const USER_MENU: UserMenuItem[][] = [
  [
    { id: "profile", label: "Profile", icon: UserRound },
    { id: "settings", label: "Settings", icon: Settings },
  ],
  [{ id: "signout", label: "Sign out", icon: LogOut, destructive: true }],
];

const APP_NAV = [
  {
    label: "Reports",
    icon: ClipboardList,
    items: [
      { label: "Daily drilling", href: "/ddr", description: "One per well per day" },
      { label: "NPT log", href: "/npt", description: "Non-productive time" },
    ],
  },
  { label: "Rigs", icon: Drill, href: "/rigs" },
  { label: "Materials", icon: Package, href: "/materials" },
  { label: "Performance", icon: Gauge, href: "/kpi" },
];
