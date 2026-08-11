import { useEffect, useState } from "react";
import { Maximize2 } from "lucide-react";

import { AppShell, cn, type NotificationItem, type UserMenuItem } from "@koc/ui";
import { LogOut, Settings, UserRound } from "lucide-react";

import { DWOS } from "../examples/dwos";
import { PageHead, Section, Note, Pre } from "./parts";

/**
 * The team dashboard shell, configured for D&W Operational Support.
 *
 * This page is the template every other KOC team dashboard is cloned from — so
 * it documents the *shape* as much as it demos the component.
 */
export function TeamShell() {
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
        title="Team dashboard shell"
        lead="One dashboard per team, with the unit as a context you switch rather than a nav
              section you scroll past. Worked example: Drilling & Workover Operational Support."
      />

      <Section
        title="Where a dashboard sits"
        description="KOC nests four levels deep. The dashboard's scope is the team — coarse enough
                     that shared apps aren't duplicated, fine enough that the nav is relevant."
      >
        <div className="rounded-md border border-border bg-card p-4 text-sm">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
            <span>Exploration &amp; Drilling</span>
            <span aria-hidden>›</span>
            <span>Drilling &amp; Workover Engineering</span>
            <span aria-hidden>›</span>
            <span className="rounded bg-accent px-1.5 py-0.5 font-medium text-accent-foreground">
              D&amp;W Operational Support
            </span>
            <span aria-hidden>›</span>
            <span>7 units</span>
          </div>
          <p className="mt-3 text-muted-foreground">
            Directorate and group are <strong className="text-foreground">identity</strong>, not
            navigation — you never travel up to them from here, you just need to know which one
            you're in. They appear in the switcher, not as links.
          </p>
        </div>
      </Section>

      <Section
        title="Why the unit is a switcher, not a section"
        description="This is the load-bearing decision, and it's worth being explicit about."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-card p-4">
            <div className="text-sm font-medium">Unit as nav section</div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              7 units × ~5 apps = <strong className="text-foreground">35 permanent nav items</strong>,
              34 of them irrelevant to any given user on any given day. The nav becomes something
              to scroll past rather than to use.
            </p>
          </div>
          <div className="rounded-md border border-primary bg-accent/40 p-4">
            <div className="text-sm font-medium">Unit as context — chosen</div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              The nav shows <strong className="text-foreground">your</strong> unit's apps. Switching
              is deliberate and changes what you're looking at.{" "}
              <strong className="text-foreground">All units</strong> covers the team lead who needs
              to see across.
            </p>
          </div>
        </div>

        <Note kind="note" title="It also settles team-wide vs unit-scoped structurally">
          Invoicing and GIS live in their own always-visible zone below the unit nav. Because scope
          determines the zone, nobody adding an app has to <em>decide</em> where it goes — and
          shared apps are never duplicated across seven units, which is how a nav rots.
        </Note>
      </Section>

      <Section
        title="Adding a team is a config file"
        description="No JSX, no new component, no fork. There are on the order of a few hundred KOC
                     teams — a hand-built sidebar each is how a standard dies."
      >
        <Pre>{`import { AppShell } from "@koc/ui";
import { DWOS } from "./teams/dwos";

<AppShell
  team={DWOS}
  activeItemId="unit-1-ddr"
  user={{ name: "Saud Alkharji", role: "Operational Support" }}
  renderLink={(item, children) => <Link to={item.href}>{children}</Link>}
/>`}</Pre>
        <p className="mt-3 text-sm text-muted-foreground">
          <code>renderLink</code> exists because KOC teams aren't on one router — some will use
          React Router, some Next, some plain anchors inside an existing SharePoint shell. Baking
          in any one of those makes the shell unusable for the other two.
        </p>
      </Section>

      <Section
        title="Live"
        description="Switch units in the header. Collapse the rail. Note that Team-wide never changes
                     with the switcher."
      >
        <Note kind="warn" title="The org structure is real; the app lists are placeholder">
          Directorate, group, team and the seven unit names come from KOC's MyPortal. The workflows
          under each unit are plausible stand-ins invented to give the shell something realistic to
          hold — replace them with the actual apps before showing this to a KOC team.
        </Note>

        <button
          onClick={() => setFull(true)}
          className={cn(
            "mb-3 mt-5 rounded-md border border-input px-3 py-1.5 text-sm transition-colors duration-fast ease-out",
            "hover:bg-accent hover:text-accent-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <Maximize2 aria-hidden className="mr-1.5 inline size-3.5" />
          Open full screen
        </button>

        {/* Transform re-roots the shell's fixed-position sidebar into this frame.
            See Bakeoff.tsx for the full explanation. */}
        <style>{`
          [data-shell-frame] { transform: translateZ(0); }
          [data-shell-frame] .h-svh,
          [data-shell-frame] .min-h-svh { height: 100%; min-height: 100%; }
        `}</style>
        <div
          data-shell-frame
          className="relative h-[42rem] overflow-hidden rounded-lg border border-input"
        >
          <AppShell
            team={DWOS}
            activeItemId="unit-1-ddr"
            user={DEMO_USER}
            notifications={DEMO_NOTIFICATIONS}
            userMenu={DEMO_USER_MENU}
          >
            <DemoContent />
          </AppShell>
        </div>
      </Section>

      {full && (
        <div className="fixed inset-0 z-50 bg-background">
          <button
            onClick={() => setFull(false)}
            autoFocus
            className={cn(
              "absolute right-4 top-3 z-[60] rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm",
              "hover:bg-accent hover:text-accent-foreground",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            Close (Esc)
          </button>
          <AppShell
            team={DWOS}
            activeItemId="unit-1-ddr"
            user={DEMO_USER}
            notifications={DEMO_NOTIFICATIONS}
            userMenu={DEMO_USER_MENU}
          >
            <DemoContent />
          </AppShell>
        </div>
      )}
    </>
  );
}

const DEMO_USER = { name: "Saud Alkharji", role: "Operational Support" };

/**
 * Placeholder alerts, but the *shape* is the point: a KOC notification is an
 * operational event with a severity, not a marketing announcement.
 */
const DEMO_NOTIFICATIONS: NotificationItem[] = [
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

// Sign out is its own group so it is not one pixel below Settings.
const DEMO_USER_MENU: UserMenuItem[][] = [
  [
    { id: "profile", label: "Profile", icon: UserRound },
    { id: "settings", label: "Settings", icon: Settings },
  ],
  [{ id: "signout", label: "Sign out", icon: LogOut, destructive: true }],
];

function DemoContent() {
  return (
    <div className="p-6">
      <h3 className="text-xl font-semibold">Daily drilling reports</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Unit 1 · placeholder content. The page area is yours; the shell only owns the frame.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {["Active rigs", "Reports today", "Open NPT"].map((t) => (
          <div key={t} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{t}</p>
            <p className="mt-1 text-2xl font-semibold tabular">—</p>
          </div>
        ))}
      </div>
    </div>
  );
}
