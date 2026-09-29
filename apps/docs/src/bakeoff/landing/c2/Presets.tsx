/**
 * Presets — "your dashboards", as the console's preset bank.
 *
 * A driller's console keeps the settings you return to on preset keys; this page keeps the
 * dashboards you return to the same way. Two rows on the faceplate, under the readings:
 *
 *   PINNED  the dashboards you pinned, in the order you pinned them;
 *   RECENT  the last ones you opened, newest first, never repeating a pin.
 *
 * Both come from the shared `useDashboardMemory()` (per browser, synced across tabs), so a pin
 * made here, in the directory or in another tab lands everywhere at once. Each key is the one
 * DashboardAnchor plus the one PinToggle beside it — never inside it.
 *
 * Pinned wraps rather than hides: a pin is never out of reach. Recent, from 1024 up, holds to
 * ONE line — the newest that fit — so opening dashboards can never push the directory off the
 * first screen; older entries simply wait off the end, as a recents list does. An empty row is
 * one quiet line, not an empty box.
 */

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { ArrowUpRight } from "lucide-react";

import { DashboardAnchor, PinToggle, type RememberedLink, type useDashboardMemory } from "../shared";

type Memory = ReturnType<typeof useDashboardMemory>;

export function Presets({ memory }: { memory: Memory }) {
  const { pinned, recent, isPinned, togglePin, clearRecent } = memory;
  return (
    <div
      id="df2-yours"
      tabIndex={-1}
      className="grid scroll-mt-4 grid-cols-[minmax(0,1fr)] gap-px overflow-hidden rounded-sm border border-border bg-border"
    >
      <PresetRow
        name="Pinned"
        items={pinned}
        isPinned={isPinned}
        onTogglePin={togglePin}
        empty={<>Pin a dashboard with the pin icon to keep it here</>}
      />
      <PresetRow
        name="Recent"
        items={recent}
        isPinned={isPinned}
        onTogglePin={togglePin}
        empty={<>Dashboards you open from this page appear here</>}
        oneLine
        action={
          recent.length > 0 && (
            <button
              type="button"
              onClick={clearRecent}
              className="h-7 shrink-0 rounded-sm px-2 font-mono text-2xs tracking-wider text-muted-foreground uppercase transition-colors duration-fast ease-out hover:bg-muted hover:text-foreground"
            >
              Clear<span className="sr-only"> recent dashboards</span>
            </button>
          )
        }
      />
    </div>
  );
}

function PresetRow({
  name,
  items,
  isPinned,
  onTogglePin,
  empty,
  action,
  oneLine = false,
}: {
  name: "Pinned" | "Recent";
  items: RememberedLink[];
  isPinned: (id: string) => boolean;
  onTogglePin: (id: string) => void;
  empty: ReactNode;
  action?: ReactNode;
  oneLine?: boolean;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  useOneLine(listRef, oneLine, items.map((i) => i.link.id).join(" "));
  return (
    <section aria-label={`${name} dashboards`} className="flex min-h-9 items-start gap-3 bg-background px-3 py-1">
      <h2 className="w-14 shrink-0 font-mono text-2xs leading-7 font-semibold tracking-widest text-foreground uppercase">
        {name}
        <span className="sr-only"> dashboards</span>
      </h2>
      {items.length > 0 ? (
        <ul ref={listRef} className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {items.map(({ link, team }) => (
            <li
              key={link.id}
              className="flex h-7 max-w-full items-stretch overflow-hidden rounded-sm border border-border bg-card"
            >
              <DashboardAnchor
                link={link}
                className="group/key flex min-w-0 items-center gap-2 pr-2 pl-1.5 text-foreground transition-colors duration-fast ease-out -outline-offset-2 hover:bg-muted focus-visible:bg-muted"
              >
                <span className="shrink-0 font-mono text-2xs font-semibold tracking-wider text-primary">
                  {team.code}
                  <span className="sr-only">, </span>
                </span>
                <span className="truncate text-xs font-medium">{link.label}</span>
                <ArrowUpRight
                  aria-hidden="true"
                  className="size-3 shrink-0 text-muted-foreground transition-transform duration-fast ease-out group-hover/key:translate-x-px group-hover/key:-translate-y-px"
                />
              </DashboardAnchor>
              <PinToggle
                link={link}
                pinned={isPinned(link.id)}
                onTogglePin={onTogglePin}
                className="h-full w-7 border-l border-border text-muted-foreground transition-colors duration-fast ease-out -outline-offset-2 hover:bg-muted hover:text-foreground aria-pressed:text-primary"
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="min-w-0 flex-1 py-1.5 font-mono text-2xs leading-snug tracking-wider text-muted-foreground uppercase">
          {empty}
        </p>
      )}
      {action}
    </section>
  );
}

/**
 * Keep a wrapping list to its first line from 1024 up: every item that would start a second
 * line gets `hidden`. Measured in a ResizeObserver callback, which runs before paint — un-hide
 * all, read the line, hide the rest — so nothing flickers. Below 1024 the list wraps freely.
 */
function useOneLine(ref: RefObject<HTMLUListElement | null>, enabled: boolean, ids: string) {
  useLayoutEffect(() => {
    const ul = ref.current;
    if (!ul || !enabled) return;
    const wide = window.matchMedia("(min-width: 64rem)");
    const fit = () => {
      const items = [...ul.children] as HTMLElement[];
      items.forEach((li) => (li.hidden = false));
      if (!wide.matches || !items.length) return;
      const top = items[0].offsetTop;
      items.forEach((li) => (li.hidden = li.offsetTop > top));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(ul.parentElement ?? ul);
    wide.addEventListener("change", fit);
    return () => {
      ro.disconnect();
      wide.removeEventListener("change", fit);
    };
  }, [ref, enabled, ids]);
}
