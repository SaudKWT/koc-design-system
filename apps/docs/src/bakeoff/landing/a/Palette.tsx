/**
 * "Find a dashboard" — the shipped @koc/command palette (shadcn Command, 21st.dev), one group
 * per team, opened by the header button or Ctrl K.
 *
 * It renders NO anchors. Choosing an item closes the palette and then focuses and clicks that
 * dashboard's station on the drawing, so the new-tab and placeholder-toast behaviour lives in
 * DashboardAnchor alone, and the page keeps exactly 28 dashboard anchors.
 *
 * FILTERING IS OURS, NOT CMDK'S. cmdk 1.1.1 scores a fuzzy subsequence over the value and every
 * keyword joined, so "payment" survives on "…Rig contract expiry EN11 Contracts…"; and it never
 * reorders groups (its group sort looks a group up by `data-value`, which holds the heading, not
 * the id it searches for), so the first SURVIVING item is auto-selected whatever its score —
 * "payment" + Enter opened Rig contract expiry. `CommandDialog` does not forward `filter` or
 * `shouldFilter`, so this composes Dialog + Command directly with `shouldFilter={false}` and
 * renders only real matches, best first: every query word must be a substring of the item's
 * label, team code, team name, abbreviation or platform; groups come in best-match order and
 * empty groups are omitted. cmdk then selects the first item in the DOM, which is the best.
 *
 * It is not in the DOM at all while closed: it mounts on open and unmounts once the close has
 * finished (so the exit animation and the focus return still run).
 */

import { useEffect, useMemo, useRef, useState } from "react";

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

import { DASHBOARD_COUNT, PLATFORM_LABEL, TEAMS, type DashboardLink, type Team } from "../data";
import { PLATFORM_ICON } from "../shared";

interface Entry {
  team: Team;
  link: DashboardLink;
  /** Lower-cased label, and the words in it. */
  label: string;
  words: string[];
  code: string;
  /** Everything a query may match: label, code, team name, abbreviation, platform. */
  hay: string;
}

const ENTRIES: Entry[] = TEAMS.flatMap((team) =>
  team.links.map((link) => {
    const label = link.label.toLowerCase();
    return {
      team,
      link,
      label,
      words: label.split(/[^a-z0-9]+/).filter(Boolean),
      code: team.code.toLowerCase(),
      hay: [link.label, team.code, team.shortName, team.abbr ?? "", PLATFORM_LABEL[link.platform]]
        .join(" ")
        .toLowerCase(),
    };
  }),
);

/**
 * 0 = not a match. Every token must be a substring of the haystack. A label that starts with the
 * whole query ranks first; then per token: a label word starting with it, the label containing
 * it, the team code or abbreviation starting with it, and last a hit on team name or platform.
 */
function score(e: Entry, query: string, tokens: string[]): number {
  if (!tokens.every((t) => e.hay.includes(t))) return 0;
  let s = e.label.startsWith(query) ? 10 : 0;
  for (const t of tokens) {
    if (e.words.some((w) => w.startsWith(t))) s += 3;
    else if (e.label.includes(t)) s += 2;
    else if (e.code.startsWith(t) || e.team.abbr?.toLowerCase().startsWith(t)) s += 2;
    else s += 1;
  }
  return s;
}

/** The teams to show, best match first, each with its matching links best first. */
function search(raw: string): { team: Team; links: DashboardLink[] }[] {
  const query = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!query) return TEAMS.map((team) => ({ team, links: team.links }));
  const tokens = query.split(" ");
  const groups = new Map<Team, { best: number; hits: { link: DashboardLink; s: number }[] }>();
  for (const e of ENTRIES) {
    const s = score(e, query, tokens);
    if (!s) continue;
    const g = groups.get(e.team) ?? { best: 0, hits: [] };
    g.best = Math.max(g.best, s);
    g.hits.push({ link: e.link, s });
    groups.set(e.team, g);
  }
  // Array.prototype.sort is stable, so ties keep code order and link order.
  return [...groups.entries()]
    .sort((a, b) => b[1].best - a[1].best)
    .map(([team, g]) => ({ team, links: g.hits.sort((a, b) => b.s - a.s).map((h) => h.link) }));
}

export function Palette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const chosen = useRef<string | null>(null);
  const [mounted, setMounted] = useState(open);
  const [query, setQuery] = useState("");
  // Mount in the same render that opens it (React's derived-state pattern), never later.
  if (open && !mounted) setMounted(true);

  const results = useMemo(() => search(query), [query]);

  // Ctrl K (and ⌘K) toggles, from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!mounted) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      // Runs after the close has finished, i.e. after Base UI has returned focus — so the
      // station can take focus and keep it. Then the palette leaves the DOM.
      onOpenChangeComplete={(isOpen: boolean) => {
        if (isOpen) return;
        setMounted(false);
        setQuery("");
        const id = chosen.current;
        chosen.current = null;
        if (!id) return;
        const a = document.querySelector<HTMLAnchorElement>(`a[data-station="${id}"]`);
        if (!a) return;
        a.focus({ preventScroll: true });
        a.scrollIntoView({ block: "nearest" });
        a.click();
      }}
    >
      <DialogContent className="overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Find a dashboard</DialogTitle>
          <DialogDescription>
            {`Search all ${DASHBOARD_COUNT} dashboards by name, team code or platform.`}
          </DialogDescription>
        </DialogHeader>
        {/* The same part styling CommandDialog applies, minus its filtering. */}
        <Command
          shouldFilter={false}
          className="**:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={`Search ${DASHBOARD_COUNT} dashboards — name, EN code or platform`}
          />
          <CommandList className="max-h-[min(420px,60vh)]">
            <CommandEmpty>No dashboard matches that.</CommandEmpty>
            {results.map(({ team: t, links }) => (
              <CommandGroup key={t.code} heading={`${t.code} · ${t.shortName}`}>
                {links.map((l) => {
                  const Icon = PLATFORM_ICON[l.platform];
                  return (
                    <CommandItem
                      key={l.id}
                      value={l.id}
                      onSelect={() => {
                        chosen.current = l.id;
                        onOpenChange(false);
                      }}
                    >
                      <Icon aria-hidden="true" />
                      <span>{l.label}</span>
                      <CommandShortcut className="tracking-normal">{PLATFORM_LABEL[l.platform]}</CommandShortcut>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
