/**
 * "Jump to dashboard" — Ctrl K.
 *
 * `@koc/command` (shadcn's Command, https://21st.dev/@shadcn/components/command, already ported
 * to Base UI in @koc/ui), composed from `Dialog` + `DialogContent` + `Command` rather than
 * `CommandDialog`, because the page needs to own the ranking:
 *
 *   cmdk 1.1.1 never reorders its groups — it looks each group up by
 *   `[data-value="<React useId>"]` while the attribute holds the heading, so no group moves —
 *   and its fuzzy scorer lets "payment" match "Rig contract expiry". Together they auto-selected
 *   the wrong dashboard, and Enter opened it. So cmdk's own filter is off (`shouldFilter={false}`)
 *   and this file ranks: every query word must be the START of a word in the dashboard's label,
 *   team code or number, team abbreviation, team name, or platform. Label hits outrank team hits,
 *   which outrank platform hits; teams are ordered by their best hit and dashboards within a team
 *   by theirs; the top result is selected. "payment" → Payment certificates; "hse" → EN41 with
 *   HSE incident dashboard first; "EN31" → DWOS platform; "invoice" → Invoice status only.
 *
 * With no query it lists every dashboard, one group per team, in team order.
 *
 * Three rules the page depends on:
 *   - Nothing of it is in the DOM while closed — Base UI unmounts the popup once its exit
 *     animation has played — so the page has exactly 28 dashboard anchors at load. The palette
 *     renders no anchors of its own in any case.
 *   - Every opening is a fresh session (a `key` bumped on open), so the query starts empty and
 *     the first dashboard is selected, while closing still plays the library's exit.
 *   - A selection is not a second link implementation. It focuses and clicks the panel's own
 *     DashboardAnchor, so the new tab, the platform announcement and the placeholder toast all
 *     come from the one component that owns them — and keyboard focus lands on that row, where
 *     the viewfinder sights the team that owns the dashboard.
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@koc/ui";

import { PLATFORM_LABEL, TEAMS, type DashboardLink, type Team } from "../data";
import { PLATFORM_ICON } from "../shared";
import { PLATFORM_CODE } from "./platform";

export function JumpPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const launchFrame = useRef(0);
  // The row a selection launched, which is where focus goes when the palette closes.
  const launched = useRef<HTMLAnchorElement | null>(null);

  // One session per opening: bumping the body's key resets the query and the selection.
  // (Adjusted during render, React's pattern for state that follows a prop.)
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((n) => n + 1);
  }

  // Ctrl K (⌘K on a Mac) toggles it from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey) && !e.altKey) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // A new opening has launched nothing yet.
  useEffect(() => {
    if (open) launched.current = null;
  }, [open]);

  // The one deferred handle in this file: cancelled if the page goes away first.
  useEffect(() => () => cancelAnimationFrame(launchFrame.current), []);

  const launch = (link: DashboardLink) => {
    const row = document.querySelector<HTMLAnchorElement>(`a[data-link-id="${link.id}"]`);
    launched.current = row;
    onOpenChange(false);
    // Still inside the keypress/click's user activation, so a real href may open its tab.
    cancelAnimationFrame(launchFrame.current);
    launchFrame.current = requestAnimationFrame(() => {
      if (!row) return;
      // Focus first, so a keyboard user keeps their place (and sees which team owns it).
      row.focus({ preventScroll: false });
      row.click();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <PaletteBody key={session} onLaunch={launch} launched={launched} />
    </Dialog>
  );
}

// ── The body: search, rank, list ────────────────────────────────────────────────────────────

function PaletteBody({
  onLaunch,
  launched,
}: {
  onLaunch: (link: DashboardLink) => void;
  launched: RefObject<HTMLAnchorElement | null>;
}) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => rank(query), [query]);
  const first = groups[0]?.hits[0]?.link.id ?? "";
  const [selected, setSelected] = useState(first);

  return (
    <DialogContent
      className="overflow-hidden p-0 sm:max-w-xl"
      // After a selection, focus belongs on the launched row — not back on the Jump button.
      // Escape or the close button keeps the default: back to where the palette was opened.
      finalFocus={() => launched.current ?? true}
    >
      <DialogHeader className="sr-only">
        <DialogTitle>Jump to dashboard</DialogTitle>
        <DialogDescription>
          Search every Drilling &amp; Workover dashboard by name, team code or platform.
        </DialogDescription>
      </DialogHeader>
      {/* The class list is CommandDialog's own, so the palette looks like every other one. */}
      <Command
        label="Dashboards"
        shouldFilter={false}
        value={selected}
        onValueChange={setSelected}
        className="**:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
      >
        <CommandInput
          value={query}
          onValueChange={(q) => {
            setQuery(q);
            setSelected(rank(q)[0]?.hits[0]?.link.id ?? "");
          }}
          placeholder="Dashboard, team or code — e.g. EN71, invoice, Power BI"
          className="font-sans"
        />
        <CommandList className="max-h-[min(60vh,26rem)]">
          <CommandEmpty className="py-6 text-center font-mono text-xs tracking-wider text-muted-foreground uppercase">
            No dashboard matches
          </CommandEmpty>
          {groups.map(({ team: t, hits }) => (
            <CommandGroup
              key={t.code}
              heading={`${t.code} · ${t.shortName}`}
              className="[&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:uppercase"
            >
              {hits.map(({ link: l }) => {
                const Icon = PLATFORM_ICON[l.platform];
                return (
                  <CommandItem key={l.id} value={l.id} onSelect={() => onLaunch(l)} className="py-2!">
                    <Icon aria-hidden="true" />
                    <span className="flex-1 font-medium">{l.label}</span>
                    <CommandShortcut className="font-mono text-2xs tracking-wider">
                      {PLATFORM_CODE[l.platform]}
                    </CommandShortcut>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </DialogContent>
  );
}

// ── Ranking ─────────────────────────────────────────────────────────────────────────────────

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** What each dashboard can be found by, as word lists, strongest field first. */
const INDEX = TEAMS.map((team) => ({
  team,
  links: team.links.map((link) => ({
    link,
    label: words(link.label),
    labelText: link.label.toLowerCase(),
    code: [team.code.toLowerCase(), team.index],
    abbr: words(team.abbr ?? ""),
    team: words(team.shortName),
    platform: [...words(PLATFORM_LABEL[link.platform]), PLATFORM_CODE[link.platform].toLowerCase()],
  })),
}));

type Entry = (typeof INDEX)[number]["links"][number];

/** The best score one query word earns against one dashboard, or 0 when it starts no word. */
function wordScore(q: string, e: Entry): number {
  let best = 0;
  e.label.forEach((w, i) => {
    if (w.startsWith(q)) best = Math.max(best, 100 + (w === q ? 20 : 0) + (i === 0 ? 10 : 0));
  });
  if (e.code.some((c) => c.startsWith(q))) best = Math.max(best, e.code.includes(q) ? 120 : 95);
  if (e.abbr.some((w) => w.startsWith(q))) best = Math.max(best, 80);
  if (e.team.some((w) => w.startsWith(q))) best = Math.max(best, 60);
  if (e.platform.some((w) => w.startsWith(q))) best = Math.max(best, 40);
  return best;
}

function rank(query: string): { team: Team; hits: { link: DashboardLink; score: number }[] }[] {
  const qs = words(query);
  if (qs.length === 0) return INDEX.map(({ team, links }) => ({ team, hits: links.map(({ link }) => ({ link, score: 0 })) }));

  const phrase = query.trim().toLowerCase();
  const groups = INDEX.map(({ team, links }) => {
    const hits = links
      .map((e) => {
        let score = 0;
        for (const q of qs) {
          const s = wordScore(q, e);
          if (s === 0) return null; // every word must match something
          score += s;
        }
        // The whole query opening the label is the strongest signal there is.
        if (e.labelText.startsWith(phrase)) score += 30;
        return { link: e.link, score };
      })
      .filter((h): h is { link: DashboardLink; score: number } => h !== null)
      .sort((a, b) => b.score - a.score); // stable: ties keep the panel's order
    return { team, hits, best: hits[0]?.score ?? 0 };
  });
  return groups
    .filter((g) => g.hits.length > 0)
    .sort((a, b) => b.best - a.best) // stable: ties keep team order
    .map(({ team, hits }) => ({ team, hits }));
}
