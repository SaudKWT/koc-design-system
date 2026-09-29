/**
 * The directory — eight bordered team panels holding every dashboard link, as in v1: at
 * 1440 × 900 the whole grid is on the first screen.
 *
 * v2 adds three things, none of which moves a panel while you are not searching:
 *   - a PinToggle beside every link (never inside it);
 *   - find, in place: with a query, panels with no match leave the grid and the rest show only
 *     their matching rows, so every hit rises to the top of the grid;
 *   - the first match is ARMED — marked with a ↵ key — because Enter in the find field opens it.
 *
 * Panel anatomy is Terminal Industries' numbered entry card tightened into an instrument
 * channel; the viewfinder (Space Hub's L-brackets) snaps to the panel you point at or tab into.
 */

import { forwardRef, useLayoutEffect, useRef, type CSSProperties } from "react";
import { ArrowUpRight, CornerDownLeft } from "lucide-react";

import { DASHBOARD_COUNT, TEAMS, type Team } from "../data";
import {
  DashboardAnchor,
  PLATFORM_ICON,
  PinToggle,
  type TeamMatch,
  type useDashboardMemory,
} from "../shared";
import { PLATFORM_CODE } from "./platform";
import { useViewfinder } from "./Viewfinder";

type Memory = ReturnType<typeof useDashboardMemory>;

export const pad2 = (n: number) => String(n).padStart(2, "0");
export const teamId = (t: Team) => `df2-team-${t.code.toLowerCase()}`;

/**
 * True when the abbreviation only shortens the short name printed beside it — "HSE & DE" for
 * "HSE & Drilling Excellence" — rather than naming the team another way ("DWOS" for
 * "Operational Support"). Where panels are narrow (drill-floor.css, `.df2-abbr[data-df2-echo]`)
 * the echo is the first thing to go, visually only.
 */
const letters = (s: string) => s.replace(/[^A-Z]/g, "");
const echoesShortName = (t: Team) =>
  !!t.abbr &&
  letters(t.abbr) === letters(t.shortName.split(/\s+/).map((w) => (/^[A-Z&]+$/.test(w) ? w : w[0])).join(""));

interface DirectoryProps {
  query: string;
  matches: TeamMatch[];
  memory: Memory;
  onClear: () => void;
}

export const Directory = forwardRef<HTMLElement, DirectoryProps>(function Directory(
  { query, matches, memory, onClear },
  ref,
) {
  const { gridRef, handlers, frame } = useViewfinder<HTMLDivElement>();
  const finding = query.trim().length > 0;
  const shown = new Map(matches.map((m) => [m.team.code, new Set(m.links.map((l) => l.id))]));
  const first = finding ? matches[0]?.links[0] : undefined;
  const hits = matches.reduce((n, m) => n + m.links.length, 0);

  // The directory's height at rest. While finding, it is held (from 768 up, drill-floor.css) so
  // the results rise to the top of the grid but nothing below them — the footer console — moves.
  const restHeight = useRef(0);
  const sectionRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!finding && sectionRef.current) restHeight.current = sectionRef.current.offsetHeight;
  });
  const setRefs = (el: HTMLElement | null) => {
    sectionRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };

  return (
    <section
      id="df2-directory"
      ref={setRefs}
      style={finding ? ({ "--df2-rest-h": `${restHeight.current}px` } as CSSProperties) : undefined}
      tabIndex={-1}
      aria-labelledby="df2-teams"
      className="mx-auto w-full max-w-[90rem] scroll-mt-2 px-4 pt-2.5 outline-none md:px-6"
    >
      <div className="mb-1.5 flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-2xs tracking-wider text-muted-foreground uppercase">
        <h2 id="df2-teams" className="font-semibold tracking-widest text-foreground">
          Teams
        </h2>
        {/* One live region: quiet at rest, a count while finding. */}
        <p role="status" aria-live="polite" aria-atomic="true">
          {finding ? (
            <>
              <span className="font-semibold text-foreground tabular-nums">{pad2(hits)}</span>
              {` ${hits === 1 ? "dashboard" : "dashboards"} · `}
              <span className="tabular-nums">{pad2(matches.length)}</span>
              {` ${matches.length === 1 ? "channel" : "channels"} for `}
              <span className="text-foreground normal-case">“{query.trim()}”</span>
              {first && <span className="sr-only">. Enter opens {first.label}.</span>}
            </>
          ) : (
            <>
              {pad2(TEAMS.length)} channels · {DASHBOARD_COUNT} dashboards
            </>
          )}
        </p>
        {finding && first && (
          <p aria-hidden="true" className="inline-flex items-center gap-1.5">
            <kbd className="inline-grid h-4.5 place-items-center rounded-sm border border-border bg-muted px-1 text-foreground">
              <CornerDownLeft className="size-3" />
            </kbd>
            opens <span className="text-foreground normal-case">{first.label}</span>
          </p>
        )}
        {finding && (
          <button
            type="button"
            onClick={onClear}
            className="-my-1 h-6 rounded-sm border border-border px-2 font-mono text-2xs tracking-wider uppercase transition-colors duration-fast ease-out hover:bg-muted hover:text-foreground"
          >
            <span aria-hidden="true">Esc · </span>Clear find
          </button>
        )}
        <p className="ml-auto hidden items-center gap-1 sm:inline-flex">
          Each opens in a new tab
          <ArrowUpRight aria-hidden="true" className="size-3" />
        </p>
      </div>

      <div
        ref={gridRef}
        {...handlers}
        className="df2-teams relative grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-x-3"
      >
        {TEAMS.map((t) => (
          <TeamPanel
            key={t.code}
            t={t}
            shown={finding ? (shown.get(t.code) ?? null) : undefined}
            firstId={first?.id}
            memory={memory}
          />
        ))}
        {finding && matches.length === 0 && (
          <div className="col-span-full mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-sm border border-dashed border-border px-3 py-3 font-mono text-2xs tracking-wider text-muted-foreground uppercase">
            <p>
              No dashboard matches <span className="text-foreground normal-case">“{query.trim()}”</span>. Try a
              team code (EN71), a platform (Power BI) or part of a name.
            </p>
          </div>
        )}
        {frame}
      </div>
    </section>
  );
});

function TeamPanel({
  t,
  shown,
  firstId,
  memory,
}: {
  t: Team;
  /** undefined: not finding (show all). null: finding, no match here. Set: the matching links. */
  shown: Set<string> | null | undefined;
  firstId?: string;
  memory: Memory;
}) {
  const id = teamId(t);
  const count = shown ? shown.size : t.links.length;
  return (
    <section
      id={id}
      data-df2-panel
      tabIndex={-1}
      hidden={shown === null}
      aria-labelledby={`${id}-h`}
      aria-describedby={`${id}-name`}
      className="row-span-2 mb-3 grid scroll-mt-4 grid-rows-subgrid rounded-sm border border-border bg-card text-card-foreground"
    >
      <div className="df2-panel-head px-3 pt-2.5 pb-1.5">
        <div className="flex items-start gap-2">
          <h3 id={`${id}-h`} className="flex min-h-5 min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="shrink-0 rounded-sm border border-primary/45 px-1 py-px font-mono text-2xs font-semibold tracking-wider text-primary">
              {t.code}
            </span>
            <span className="font-mono text-xs font-semibold uppercase">{t.shortName}</span>
            {t.abbr && (
              <span
                data-df2-echo={echoesShortName(t) || undefined}
                className="df2-abbr shrink-0 font-mono text-2xs text-muted-foreground uppercase"
              >
                <span className="sr-only">(</span>
                {t.abbr}
                <span className="sr-only">)</span>
              </span>
            )}
          </h3>
          <p className="ml-auto shrink-0 font-mono text-2xs leading-5 text-muted-foreground tabular-nums">
            <span aria-hidden="true">
              {shown ? (
                <>
                  <span className="text-foreground">{pad2(count)}</span>/{pad2(t.links.length)}
                </>
              ) : (
                pad2(count)
              )}
            </span>
            <span className="sr-only">
              {shown ? `${count} of ${t.links.length}` : count} {t.links.length === 1 ? "dashboard" : "dashboards"}
            </span>
          </p>
        </div>
        <p className="mt-1 text-xs leading-snug tracking-tight text-muted-foreground">{t.blurb}</p>
      </div>

      <ul className="flex flex-col border-t border-border">
        {t.links.map((l) => {
          const Icon = PLATFORM_ICON[l.platform];
          const armed = l.id === firstId;
          const pinned = memory.isPinned(l.id);
          return (
            <li key={l.id} hidden={!!shown && !shown.has(l.id)} className="df2-rowli flex items-center">
              <DashboardAnchor
                link={l}
                data-df2-link-id={l.id}
                data-df2-first={armed || undefined}
                className="df2-row group/row flex min-h-8 min-w-0 flex-1 items-center gap-2 self-stretch pr-1.5 pl-3 text-foreground transition-colors duration-fast ease-out -outline-offset-2 hover:bg-muted focus-visible:bg-muted"
              >
                <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 py-1.5 text-sm leading-tight font-medium">{l.label}</span>
                {armed && (
                  <kbd
                    aria-hidden="true"
                    className="grid h-5 shrink-0 place-items-center rounded-sm border border-primary/45 bg-primary/10 px-1 text-primary"
                  >
                    <CornerDownLeft className="size-3" />
                  </kbd>
                )}
                <span
                  aria-hidden="true"
                  className="df2-chip grid h-5 w-9 shrink-0 place-items-center rounded-sm border border-border font-mono text-2xs leading-none tracking-wider text-muted-foreground"
                >
                  {PLATFORM_CODE[l.platform]}
                </span>
                <ArrowUpRight
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-fast ease-out group-hover/row:translate-x-0.5 group-hover/row:-translate-y-0.5 group-focus-visible/row:translate-x-0.5 group-focus-visible/row:-translate-y-0.5"
                />
              </DashboardAnchor>
              <PinToggle
                link={l}
                pinned={pinned}
                onTogglePin={memory.togglePin}
                className="df2-pin mr-1.5 rounded-sm text-muted-foreground transition-colors duration-fast ease-out hover:bg-muted hover:text-foreground aria-pressed:bg-primary/10 aria-pressed:text-primary"
              />
            </li>
          );
        })}
        {/* The panel foot: one closing rule under the last visible link, then plain card —
            closed by the team's full MyPortal name where the row leaves room (drill-floor.css). */}
        <li aria-hidden="true" className="df2-slots flex-1">
          <p
            id={`${id}-name`}
            className="df2-nameplate px-3 pb-2.5 font-mono text-2xs leading-snug tracking-wider text-muted-foreground uppercase"
          >
            {t.name}
          </p>
        </li>
      </ul>
    </section>
  );
}
