import { useState } from "react";

import Dialog02 from "../bakeoff/shadcn-space/dialog/dialog-02";
import Calendar16 from "../bakeoff/shadcn-space/calendar/calendar-16";
import Calendar14 from "../bakeoff/shadcn-space/calendar/calendar-14";
import Topbar05 from "../bakeoff/shadcn-space/blocks/topbar-05/header";

// NOT @koc/ui's SidebarProvider. topbar-05 imports SidebarTrigger from
// @/bakeoff/ui/sidebar, which is a *different module* with its own React
// context — providing from @koc/ui satisfies nothing. Two copies of the same
// component do not share context, which is a real hazard of the copy-in
// distribution model and worth seeing once.
import { SidebarProvider } from "../bakeoff/ui/sidebar";

import {
  Button,
  ConfirmDialog,
  DateRangeFilter,
  NotificationMenu,
  PageNav,
  UserMenu,
  resolvePreset,
  type DateRangeValue,
} from "@koc/ui";
import { ClipboardList, Drill, Gauge, LogOut, Settings, UserRound } from "lucide-react";

import { DEMO_TODAY } from "../examples/ddr-data";
import { PageHead, Section, Note } from "./parts";

/**
 * Audit trail for the shadcn-space evaluation.
 *
 * Each row puts the upstream component beside what KOC actually shipped from it,
 * so the decision is checkable rather than asserted. A bake-off that records only
 * the winner is not auditable — six months on nobody can tell whether something
 * was rejected on merit or never opened.
 */

type Status = "ported" | "lifted" | "held";

const STATUS: Record<Status, { label: string; cls: string }> = {
  ported: { label: "Ported", cls: "border-success text-success" },
  lifted: { label: "Partly lifted", cls: "border-warning text-warning" },
  held: { label: "Held", cls: "border-input text-muted-foreground" },
};

function Row({
  title,
  source,
  status,
  taken,
  left,
  upstream,
  ours,
}: {
  title: string;
  source: string;
  status: Status;
  taken: string[];
  left: string[];
  upstream: React.ReactNode;
  ours?: React.ReactNode;
}) {
  const s = STATUS[status];
  return (
    <div className="mb-8 rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{source}</p>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-2xs font-medium ${s.cls}`}>
          {s.label}
        </span>
      </div>

      <div className="grid divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
        <div className="p-4">
          <p className="mb-3 text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
            Upstream
          </p>
          {upstream}
        </div>
        <div className="bg-muted/30 p-4">
          <p className="mb-3 text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
            What KOC ships
          </p>
          {ours ?? <p className="text-sm text-muted-foreground">Nothing — held.</p>}
        </div>
      </div>

      <div className="grid gap-4 border-t border-border px-4 py-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-success">Taken</p>
          <ul className="mt-1 space-y-1">
            {taken.map((t) => (
              <li key={t} className="text-sm text-muted-foreground">
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Left behind</p>
          <ul className="mt-1 space-y-1">
            {left.map((t) => (
              <li key={t} className="text-sm text-muted-foreground">
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

const NAV = [
  {
    label: "Reports",
    icon: ClipboardList,
    items: [
      { label: "Daily drilling", href: "/ddr" },
      { label: "NPT log", href: "/npt" },
    ],
  },
  { label: "Rigs", icon: Drill, href: "/rigs" },
  { label: "Performance", icon: Gauge, href: "/kpi" },
];

export function SpaceCandidates() {
  const [range, setRange] = useState<DateRangeValue>({
    preset: "7d",
    range: resolvePreset("7d", DEMO_TODAY),
  });
  const [confirm, setConfirm] = useState(false);

  return (
    <>
      <PageHead
        title="shadcn-space audit"
        lead="What was evaluated from the @shadcn-space registry, what shipped from it, and what was
              deliberately left. Upstream on the left, ours on the right."
      />

      <Note kind="note" title="Why this page keeps the rejects">
        A bake-off that records only the winner is not auditable — six months on nobody can tell
        whether something was rejected on merit or never opened. Everything installed stays in{" "}
        <code>bakeoff/shadcn-space/</code>, never imported by <code>@koc/ui</code> and outside the
        build gates. All four upstream components below are the <code>/radix/</code> builds; the
        Base UI builds produced 20 type errors against our primitives.
      </Note>

      <Section
        title="Components"
        description="Four evaluated. All four contributed something; none was adopted whole."
      >
        <Row
          title="Dialog 02 — slide from bottom"
          source="@shadcn-space/radix/dialog-02 · 52 LOC"
          status="ported"
          upstream={<Dialog02 />}
          ours={
            <>
              <Button variant="outline" onClick={() => setConfirm(true)}>
                Void report
              </Button>
              <ConfirmDialog
                open={confirm}
                onOpenChange={setConfirm}
                title="Void report"
                subject="BG-1042"
                description="A voided report stays in the record with its figures excluded from unit totals."
                confirmLabel="Void report"
                onConfirm={() => setConfirm(false)}
              />
            </>
          }
          taken={[
            "The rise-from-below entrance, now on @koc/ui's DialogContent — so every dialog inherits it, including the data table's record view.",
            "Centred icon, plain question, two equal-weight buttons.",
          ]}
          left={[
            "Two duration-300 literals, replaced with the motion scale.",
            'The hardcoded "Delete Item". `subject` is a required prop, so it reads "Void report BG-1042?" and a mistake is catchable.',
            "Confirm-button autofocus. Cancel takes initial focus — a stray Enter must not destroy a record.",
          ]}
        />

        <Row
          title="Calendar 16 — compact trigger, horizontal popover"
          source="@shadcn-space/radix/calendar-16 · 244 LOC"
          status="lifted"
          upstream={
            <div className="flex justify-center">
              <Calendar16 />
            </div>
          }
          ours={<DateRangeFilter value={range} onChange={setRange} today={DEMO_TODAY} />}
          taken={[
            "The compact trigger — one line of toolbar stating the current range in words.",
            "The horizontal popover: calendar one side, controls the other, both visible at once.",
          ]}
          left={[
            "The time-range half (start/end times, 1h/2h/4h presets). Good, but it belongs to scheduling rather than filtering, and no such screen exists yet.",
            "Two duration-200 literals.",
          ]}
        />

        <Row
          title="Calendar 14 — grouped range presets"
          source="@shadcn-space/radix/calendar-14 · 1 file"
          status="lifted"
          upstream={
            <div className="flex justify-center">
              <Calendar14 />
            </div>
          }
          ours={
            <div className="space-y-2">
              <DateRangeFilter value={range} onChange={setRange} today={DEMO_TODAY} />
              <p className="text-sm text-muted-foreground">
                Same component as the row above — open it and the presets inside are calendar-14's
                model, grouped Days / Weeks / Months.
              </p>
            </div>
          }
          taken={[
            "Presets grouped by unit of time rather than a flat list.",
            "Selecting a preset moves the calendar to that month — so you see the range rather than trusting a label.",
            "The active preset carries a dot, not colour alone.",
          ]}
          left={[
            "The stacked layout — its presets sit in a 44px scroll area that hides two of the three groups behind a scrollbar nobody notices.",
            "Forward-looking defaults (Tomorrow, Next 7 days, Next month). They suit booking and return nothing on a report list. Exported as FUTURE_PRESETS for when a scheduling screen exists.",
          ]}
        />

        <Row
          title="Topbar 05 — sidebar-integrated topbar"
          source="@shadcn-space/radix/topbar-05 · 5 files"
          status="lifted"
          upstream={
            /* It will not render without one. Topbar05 calls useSidebar(), so it
               throws outside a SidebarProvider — "sidebar-integrated" is a hard
               dependency, not a description. */
            <SidebarProvider className="block min-h-0">
              <div className="w-full overflow-x-auto rounded-md border border-border bg-background">
                <Topbar05 />
              </div>
            </SidebarProvider>
          }
          ours={
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <NotificationMenu
                  items={[
                    {
                      id: "1",
                      severity: "critical",
                      title: "MN-118 stuck pipe",
                      description: "NPT past 24 hrs.",
                      timestamp: "12 min ago",
                    },
                    {
                      id: "2",
                      severity: "warning",
                      title: "RA-207 mud losses",
                      timestamp: "1 hr ago",
                    },
                  ]}
                />
                <UserMenu
                  variant="compact"
                  user={{ name: "Saud Alkharji", role: "Operational Support" }}
                  groups={[
                    [
                      { id: "p", label: "Profile", icon: UserRound },
                      { id: "s", label: "Settings", icon: Settings },
                    ],
                    [{ id: "o", label: "Sign out", icon: LogOut, destructive: true }],
                  ]}
                />
              </div>
              <PageNav groups={NAV} activeHref="/ddr" />
            </div>
          }
          taken={[
            "The notification menu — as @koc/notification-menu, with the unread count derived from the items.",
            "The profile menu — as @koc/user-menu, taking groups.",
            "The dropdown navigation — as @koc/page-nav, for moving between screens inside one app.",
          ]}
          left={[
            "The topbar itself. It competes with AppShell, and calls useSidebar() so it cannot render outside its own shell.",
            "The language switcher — dead weight under ADR 0001.",
            'A literal "5 New" badge that can disagree with its own list.',
            "The SaaS profile items — Billing, Subscription, Team. No KOC app has those.",
            "One duration-400 literal, which is not on Tailwind's scale either.",
          ]}
        />
      </Section>
    </>
  );
}
