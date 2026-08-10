import Dialog02 from "../bakeoff/shadcn-space/dialog/dialog-02";
import Calendar16 from "../bakeoff/shadcn-space/calendar/calendar-16";
import Topbar05 from "../bakeoff/shadcn-space/blocks/topbar-05/header";

// NOT @koc/ui's SidebarProvider. topbar-05 imports SidebarTrigger from
// @/bakeoff/ui/sidebar, which is a *different module* with its own React
// context — providing from @koc/ui satisfies nothing. Two copies of the same
// component do not share context, which is a real hazard of the copy-in
// distribution model and worth seeing once.
import { SidebarProvider } from "../bakeoff/ui/sidebar";

import { PageHead, Section, Note } from "./parts";

/**
 * Three shadcn-space picks, rendered so they can actually be judged.
 *
 * They are installed and compiling, but nothing is promoted — see
 * bakeoff/README.md. Each block below states what it would cost to adopt,
 * because "it looks nice" is not the whole decision when the thing has to serve
 * forty apps.
 */

interface CandidateProps {
  title: string;
  source: string;
  verdict: "port" | "partial" | "hold";
  summary: string;
  cost: string[];
  children: React.ReactNode;
}

const VERDICT: Record<CandidateProps["verdict"], { label: string; cls: string }> = {
  port: { label: "Worth porting", cls: "border-success text-success" },
  partial: { label: "Take part of it", cls: "border-warning text-warning" },
  hold: { label: "Hold", cls: "border-input text-muted-foreground" },
};

function Candidate({ title, source, verdict, summary, cost, children }: CandidateProps) {
  const v = VERDICT[verdict];
  return (
    <div className="mb-8 rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{source}</p>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-2xs font-medium ${v.cls}`}>
          {v.label}
        </span>
      </div>

      <div className="border-b border-border bg-muted/30 px-4 py-4">{children}</div>

      <div className="px-4 py-3">
        <p className="text-sm">{summary}</p>
        <ul className="mt-2 space-y-1">
          {cost.map((c) => (
            <li key={c} className="flex gap-2 text-sm text-muted-foreground">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function SpaceCandidates() {
  return (
    <>
      <PageHead
        title="shadcn-space picks"
        lead="Three components installed from the @shadcn-space registry, rendered live so they can
              be judged rather than described. None is promoted — this is the evaluation shelf."
      />

      <Note kind="warn" title="Installed, compiling, not adopted">
        These came from <code>@shadcn-space/radix/*</code> — the Radix builds. The Base UI builds of
        the same three produced 20 type errors against our primitives. All three now compile, but{" "}
        <code>check:motion</code> finds five off-scale duration literals across them
        (<code>duration-200</code>, <code>-300</code>, <code>-400</code>) which would fail the build
        the moment they entered <code>@koc/ui</code>. Promotion is a rewrite, not a move.
      </Note>

      <Section
        title="Candidates"
        description="Try them. The verdicts below are mine — argue with them."
      >
        <Candidate
          title="Dialog 02 — slide from bottom"
          source="@shadcn-space/radix/dialog-02 · 52 LOC"
          verdict="port"
          summary="A destructive confirmation: centred icon, plain question, two equal-weight buttons. KOC apps will void and delete reports, and this is a better default than a bare 'Are you sure?'."
          cost={[
            "Two duration-300 literals to put on the motion scale (slower/slow, enter/exit).",
            "The slide-from-bottom entrance is a mobile idiom; on a desktop operations screen a centred fade reads calmer. Worth changing during the port.",
            "Destructive confirms should name the thing being deleted — 'Delete report BG-1042?' not 'Delete Item'. The component takes no props yet; the port should.",
          ]}
        >
          <Dialog02 />
        </Candidate>

        <Candidate
          title="Calendar 16 — date + time scheduler"
          source="@shadcn-space/radix/calendar-16 · 244 LOC"
          verdict="hold"
          summary="A booking UI — pick a day, a start time, an end time, see the duration. Well built, but it answers a question no screen in this system currently asks."
          cost={[
            "It is not a filter. DateRangeFilter already covers filtering, and the two would compete for the same slot in a toolbar.",
            "Real use would be scheduling — maintenance windows, rig moves, crew rotations. That is a genuine KOC need, but no screen for it exists yet.",
            "Two duration-200 literals, and it pulls input-group as a new primitive.",
          ]}
        >
          <div className="flex justify-center">
            <Calendar16 />
          </div>
        </Candidate>

        <Candidate
          title="Topbar 05 — sidebar-integrated topbar"
          source="@shadcn-space/radix/topbar-05 · 5 files"
          verdict="partial"
          summary="A topbar with search, notifications, language and profile menus. The topbar itself overlaps AppShell — but the notification and profile menus are a real gap in our shell."
          cost={[
            "It cannot render standalone — it calls useSidebar() and throws outside a SidebarProvider. The sidebar coupling is structural, not cosmetic.",
            "Adopting the whole block would mean running two navigation systems alongside AppShell.",
            "The language switcher is dead weight under ADR 0001 — English only, re-confirmed for the org-wide scope.",
            "Its sample nav imports four lucide icons that need lucide 1.x; we are on 0.469, so they are swapped locally.",
            "One duration-400 literal — not even on Tailwind's own scale.",
            "What is worth taking: notifications and the profile menu, lifted into AppShell's header.",
          ]}
        >
          {/* It will not render without one. Topbar05 calls useSidebar(), so it
              throws outside a SidebarProvider — the "sidebar-integrated" in its
              name is a hard dependency, not a description. That is the clearest
              possible demonstration of why adopting the whole block would mean
              running two navigation systems. */}
          <SidebarProvider className="block min-h-0">
            <div className="w-full overflow-hidden rounded-md border border-border bg-background">
              <Topbar05 />
            </div>
          </SidebarProvider>
        </Candidate>
      </Section>
    </>
  );
}
