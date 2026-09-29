/**
 * The directory: the eight teams, every link visible, a pin beside each.
 *
 * Search filters it in place (the one shared `matchDashboards`), so a result
 * appears where the dashboard always lives — people learn the page's
 * geography instead of a results list. The jump bar is buttons with
 * scrollIntoView, never href="#…": the viewer is hash-routed.
 */

import { type RefObject } from "react";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@koc/ui";

import { DASHBOARD_COUNT, PLATFORM_LABEL, TEAMS, type Platform } from "../data";
import { DashboardAnchor, PLATFORM_ICON, PinToggle, type TeamMatch } from "../shared";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export const teamDomId = (code: string) => `dwe2-team-${code}`;

export function Directory({
  query,
  matches,
  isPinned,
  togglePin,
  headingRef,
  onJump,
}: {
  query: string;
  matches: TeamMatch[];
  isPinned: (id: string) => boolean;
  togglePin: (id: string) => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onJump: (code: string) => void;
}) {
  const searching = query.trim().length > 0;
  const found = matches.reduce((n, m) => n + m.links.length, 0);
  const visible = new Set(matches.map((m) => m.team.code));

  return (
    <section id="dwe2-directory" aria-labelledby="dwe2-dir-title" className="scroll-mt-2">
      <div className="mx-auto max-w-[1600px] px-4 pt-6 sm:px-8">
        <div className="flex flex-col gap-3 px-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-baseline gap-4">
            <h2
              ref={headingRef}
              id="dwe2-dir-title"
              tabIndex={-1}
              className="rounded-xs text-xl font-semibold uppercase leading-none tracking-[-0.02em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              <span className="dwe2-bracket mr-3 font-mono text-2xs font-normal tracking-[0.18em] text-muted-foreground">
                Directory
              </span>
              {TEAMS.length} teams · {DASHBOARD_COUNT} dashboards
            </h2>
            <p role="status" className="font-mono text-2xs uppercase tracking-wider text-primary">
              {searching ? (found ? `${found} match${found === 1 ? "" : "es"} for “${query.trim()}”` : `Nothing matches “${query.trim()}”`) : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Legend />
            <div role="group" aria-label="Jump to team" className="flex flex-wrap gap-1">
              {TEAMS.map((t) => (
                <button
                  key={t.code}
                  type="button"
                  disabled={!visible.has(t.code)}
                  onClick={() => onJump(t.code)}
                  title={t.shortName}
                  className={cn(
                    "h-7 rounded-xs border border-border px-1.5 font-mono text-2xs tracking-wider text-foreground transition-colors duration-fast ease-out hover:border-primary hover:text-primary disabled:opacity-40",
                    FOCUS,
                  )}
                >
                  {t.code}
                  <span className="sr-only">{` — ${t.shortName}`}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-4 pt-3 pb-12 sm:px-8">
        {matches.length ? (
          // Borders drawn per cell, so a filtered grid leaves empty cells empty.
          <ul className="grid overflow-hidden rounded-sm border-t border-l border-border sm:grid-cols-2 xl:grid-cols-4">
            {matches.map((m) => (
              <li key={m.team.code} id={teamDomId(m.team.code)} className="flex scroll-mt-4 border-r border-b border-border">
                <TeamCard match={m} isPinned={isPinned} togglePin={togglePin} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-sm border border-border px-4 py-6 text-sm text-muted-foreground">
            No dashboard, team or platform matches that. Try a team code like “EN71”, or “power bi”.
          </p>
        )}
      </div>
    </section>
  );
}

function Legend() {
  return (
    <ul aria-label="Platforms" className="flex items-center gap-3 font-mono text-2xs uppercase tracking-wider text-muted-foreground">
      {(Object.keys(PLATFORM_LABEL) as Platform[]).map((p) => {
        const Icon = PLATFORM_ICON[p];
        return (
          <li key={p} className="flex items-center gap-1.5">
            <Icon className="size-3.5" aria-hidden="true" />
            {PLATFORM_LABEL[p]}
          </li>
        );
      })}
    </ul>
  );
}

function TeamCard({
  match,
  isPinned,
  togglePin,
}: {
  match: TeamMatch;
  isPinned: (id: string) => boolean;
  togglePin: (id: string) => void;
}) {
  const { team, links } = match;
  const headingId = `${teamDomId(team.code)}-name`;
  return (
    <article aria-labelledby={headingId} className="flex w-full flex-col bg-background px-4 pt-3.5 pb-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={headingId} tabIndex={-1} className="min-w-0 rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <span className="dwe2-bracket mr-2 font-mono text-2xs tracking-wider text-muted-foreground">{team.code}</span>
          <span className="text-sm font-semibold uppercase tracking-tight">{team.shortName}</span>
          {team.abbr && <span className="ml-1.5 whitespace-nowrap font-mono text-2xs tracking-wider text-primary">{team.abbr}</span>}
          <span className="sr-only">{` — ${team.name}`}</span>
        </h3>
        <span className="shrink-0 font-mono text-2xs text-muted-foreground tabular-nums" aria-hidden="true">
          {String(links.length).padStart(2, "0")}
          {links.length !== team.links.length && `/${String(team.links.length).padStart(2, "0")}`}
        </span>
      </div>
      <ul className="mt-2">
        {links.map((l) => {
          const Icon = PLATFORM_ICON[l.platform];
          return (
            <li key={l.id} className="flex items-center gap-1 border-t border-border">
              <DashboardAnchor
                link={l}
                className={cn(
                  "group flex min-w-0 flex-1 items-center gap-2.5 rounded-xs py-[7px] text-sm transition-colors duration-fast ease-out hover:text-primary",
                  FOCUS,
                )}
              >
                <Icon className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1">{l.label}</span>
                <ArrowUpRight
                  className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-fast ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
                  aria-hidden="true"
                />
              </DashboardAnchor>
              <PinToggle
                link={l}
                pinned={isPinned(l.id)}
                onTogglePin={togglePin}
                className={cn(
                  "rounded-xs text-muted-foreground transition-colors duration-fast ease-out hover:text-primary aria-pressed:text-primary",
                  FOCUS,
                )}
              />
            </li>
          );
        })}
      </ul>
    </article>
  );
}
