import * as React from "react";
import { Check, ChevronRight, ChevronsUpDown, LayoutGrid, Pin, Search, X } from "lucide-react";

import { cn } from "../lib/utils";
import {
  ALL_UNITS,
  groupsForUnit,
  unitDisplayName,
  type NavGroup,
  type NavItem,
  type TeamConfig,
} from "../lib/org";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "./sidebar";
import { NotificationMenu, type NotificationItem } from "./notification-menu";
import { initials, type UserMenuItem } from "./user-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";

/**
 * AppShell — the standard KOC team dashboard frame.
 *
 * One dashboard is one **team**. The unit is a context you switch, not a nav
 * section you scroll past: seven units × five apps is thirty-five permanent
 * items, thirty-four of which are irrelevant to any given user. See lib/org.ts
 * for the full reasoning.
 *
 * The shell holds three zones, and which zone an app lands in is decided by its
 * scope rather than by whoever adds it:
 *
 *   1. Unit switcher (header)  — which unit's work you are looking at
 *   2. Unit nav (content)      — that unit's workflows and apps
 *   3. Team-wide (content)     — invoicing, GIS, shared reporting. Never filtered.
 *
 * Building a dashboard for another KOC team means writing a TeamConfig. No JSX,
 * no new component, no fork. That is the whole point — there are on the order of
 * a few hundred teams, and a hand-built sidebar each is how a standard dies.
 *
 * ── THE RIG3 SHELL (2026-10-25) ───────────────────────────────────────────────
 *
 * Restyled to the DWEG landing's rig3 sidebar, the base Saud chose for the whole
 * system (that sidebar was itself ported from this one, so the parts are the
 * same — what changed is the arrangement):
 *
 *   - The brand row: the KOC emblem in brand blue with no tile (`brandMark`),
 *     the team, and "Kuwait Oil Company". The unit switcher sits under it as a
 *     quiet row — still the switcher, still the 2026-08-09 decision (Saud
 *     re-confirmed it for the rework), just not dressed as the brand.
 *   - Find (Ctrl K): filters every destination in the unit and the team-wide
 *     zone as you type; Enter goes to the first match, Esc clears.
 *   - Pinned, per browser, so the screen you open every morning is one click
 *     from anywhere. Shown only once something is pinned. rig3's Recent is
 *     NOT here: Saud kept it for the landing page alone (2026-10-25) — an app
 *     has a handful of screens and the folded groups already show where you
 *     are, so a recent list only repeated them.
 *   - Each app (NavGroup) is a folded row with its code in mono; its screens
 *     nest under it. The group holding the current screen opens itself. Folded
 *     by default because seven units' worth of apps is the case to design for.
 *   - NO TOP BAR on desktop. rig3 has none, and the strip's two jobs move to
 *     where they belong: alerts and the as-of stamp to the sidebar foot beside
 *     the account, the scope to the page's own eyebrow. A phone keeps a slim
 *     bar, because it needs a way to open the sidebar.
 *
 * The icon rail is kept, and in it the folded groups would show nothing — so
 * collapsed, the shell draws every destination as a flat icon button with a
 * tooltip, exactly as before the rework. Open, it draws rig3's folded groups.
 */

export interface AppShellUser {
  name: string;
  role?: string;
}

export interface AppShellProps {
  team: TeamConfig;
  /** Controlled unit selection. Omit to let the shell manage it. */
  unitId?: string;
  defaultUnitId?: string;
  onUnitChange?: (unitId: string) => void;
  /** `id` of the currently open NavItem, for the active state. */
  activeItemId?: string;
  user?: AppShellUser;
  /**
   * How a nav destination becomes a link.
   *
   * KOC teams are not on one router — some will be on React Router, some on
   * Next, some on plain anchors inside an existing SharePoint shell. Baking in
   * any one of those makes the shell unusable for the other two, so routing is
   * the consumer's to supply and a plain `<a>` is the default.
   */
  /** Must return an element (an `<a>`, or your router's Link) — it becomes
   *  the rendered control via Base UI's render prop. */
  renderLink?: (item: NavItem, children: React.ReactNode) => React.ReactElement;
  /**
   * The brand mark — a URL to a single-colour SVG (the KOC emblem), drawn in
   * brand blue through a CSS mask so the white artwork KOC ships works on a
   * light surface without a tile. Omit for a plain brand-blue tile.
   */
  brandMark?: string;
  /**
   * Operational alerts. Omit to hide the bell entirely — an empty notification
   * icon that never does anything is worse than no icon.
   */
  notifications?: NotificationItem[];
  onNotificationSelect?: (item: NotificationItem) => void;
  onMarkAllRead?: () => void;
  /**
   * Account menu groups. Each array is a group, rendered with a separator —
   * put sign out in its own so it is not one pixel below Settings.
   */
  userMenu?: UserMenuItem[][];
  /**
   * When the figures on screen were last refreshed, shown in the sidebar foot.
   *
   * Opt-in like `notifications`: omitted, nothing renders. A freshness stamp
   * nobody wired to a real refresh is worse than none, because it is believed.
   * Pass a Date to have it formatted, or a string to control the wording.
   */
  asOf?: Date | string;
  children?: React.ReactNode;
}

const defaultRenderLink: NonNullable<AppShellProps["renderLink"]> = (item, children) => (
  <a href={item.href}>{children}</a>
);

/** A destination with the group it belongs to — what search and memory hold. */
interface Destination {
  item: NavItem;
  group: NavGroup;
}

export function AppShell({
  team,
  unitId,
  defaultUnitId,
  onUnitChange,
  activeItemId,
  user,
  renderLink = defaultRenderLink,
  brandMark,
  notifications,
  onNotificationSelect,
  onMarkAllRead,
  userMenu,
  asOf,
  children,
}: AppShellProps) {
  const [internalUnit, setInternalUnit] = React.useState(
    defaultUnitId ?? team.units[0]?.id ?? ALL_UNITS,
  );
  const currentUnit = unitId ?? internalUnit;

  const selectUnit = (id: string) => {
    if (unitId === undefined) setInternalUnit(id);
    onUnitChange?.(id);
  };

  const activeUnit = team.units.find((u) => u.id === currentUnit);
  // What the unit *covers*, not its number — "Deep" rather than "Unit 3". The
  // number stays in the switcher, where it is needed to match forms and titles.
  const unitLabel =
    currentUnit === ALL_UNITS ? "All units" : activeUnit ? unitDisplayName(activeUnit) : "—";

  return (
    <SidebarProvider style={{ "--sidebar-width": "18rem" } as React.CSSProperties}>
      {/*
       * `role="navigation"` with a label, on the sidebar itself.
       *
       * The shell produced `main` and two `header`s, and the sidebar — every nav
       * link, every group label, the unit switcher, the user menu — sat in none
       * of them. axe reported 19 `region` nodes on a typical DWOS screen.
       *
       * The label is not optional: PageHeader's breadcrumb is also a nav, and
       * two unlabelled navigation landmarks are worse than one.
       *
       * Reported from the DWOS app. It could not be found from the docs site,
       * where the shell is embedded inside a page that already has a `main`.
       */}
      <Sidebar collapsible="icon" role="navigation" aria-label={`${team.shortName} navigation`}>
        <ShellSidebar
          team={team}
          currentUnit={currentUnit}
          unitLabel={unitLabel}
          selectUnit={selectUnit}
          activeItemId={activeItemId}
          renderLink={renderLink}
          brandMark={brandMark}
          user={user}
          userMenu={userMenu}
          notifications={notifications}
          onNotificationSelect={onNotificationSelect}
          onMarkAllRead={onMarkAllRead}
          asOf={asOf}
        />
        <SidebarRail />
      </Sidebar>

      {/* `min-w-0`: the inset is a flex child, and without it a wide table
          anywhere in the page grows the whole main area past the viewport
          instead of scrolling inside its own container — found in DWOS's
          ten-column call-off register (2026-10-25). */}
      <SidebarInset className="min-w-0">
        {/* Phones only: the sidebar is a sheet there and needs a way in. On a
            desktop rig3 has no top bar — the rail and Ctrl B collapse the
            sidebar, and the page's eyebrow says where you are. */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 md:hidden">
          <SidebarTrigger className="-ml-1" />
          <span className="truncate text-sm font-medium">{unitLabel}</span>
        </header>
        <div className="flex-1 overflow-auto">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

// ── The sidebar's contents ──────────────────────────────────────────────────

function ShellSidebar({
  team,
  currentUnit,
  unitLabel,
  selectUnit,
  activeItemId,
  renderLink,
  brandMark,
  user,
  userMenu,
  notifications,
  onNotificationSelect,
  onMarkAllRead,
  asOf,
}: {
  team: TeamConfig;
  currentUnit: string;
  unitLabel: string;
  selectUnit: (id: string) => void;
  activeItemId?: string;
  renderLink: NonNullable<AppShellProps["renderLink"]>;
  brandMark?: string;
  user?: AppShellUser;
  userMenu?: UserMenuItem[][];
  notifications?: NotificationItem[];
  onNotificationSelect?: (item: NotificationItem) => void;
  onMarkAllRead?: () => void;
  asOf?: Date | string;
}) {
  const { state, isMobile, setOpen, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;

  const unitGroups = groupsForUnit(team, currentUnit);
  const everyGroup = React.useMemo(() => [...unitGroups, ...team.teamWide], [unitGroups, team.teamWide]);
  const destinations = React.useMemo<Destination[]>(
    () => everyGroup.flatMap((group) => flatten(group.items).map((item) => ({ item, group }))),
    [everyGroup],
  );

  const memory = useShellMemory(team.id, destinations);

  const [query, setQuery] = React.useState("");
  const field = React.useRef<HTMLInputElement>(null);
  const navId = React.useId();

  // Ctrl K / Cmd K focuses Find from anywhere — opening the sidebar first if it
  // is a rail or a closed sheet. `code`, not `key`, so it works on an Arabic
  // keyboard layout, where the K key does not type "k".
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === "KeyK") {
        e.preventDefault();
        if (isMobile) setOpenMobile(true);
        else setOpen(true);
        requestAnimationFrame(() => field.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobile, setOpen, setOpenMobile]);

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (d: Destination) =>
    words.every((w) => `${d.item.label} ${d.group.label} ${d.group.code ?? ""}`.toLowerCase().includes(w));
  const found = words.length ? destinations.filter(matches) : [];

  const onFindKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && query) {
      e.preventDefault();
      setQuery("");
    } else if (e.key === "Enter" || e.key === "ArrowDown") {
      const first = document.querySelector<HTMLElement>(`[id="${navId}"] a[href]`);
      if (first) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <>
      <SidebarHeader className="gap-1 pb-1">
        {/* The brand row — identity, not a control. */}
        <div className="flex h-14 items-center gap-2.5 px-1 group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1 group-data-[collapsible=icon]:px-0">
          {brandMark ? (
            <span
              aria-hidden="true"
              className="h-11 w-9 shrink-0 bg-primary group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8"
              style={{
                mask: `url(${brandMark}) center / contain no-repeat`,
                WebkitMask: `url(${brandMark}) center / contain no-repeat`,
              }}
            />
          ) : (
            <span aria-hidden="true" className="size-8 shrink-0 rounded-md bg-primary" />
          )}
          <span className="min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-sm font-semibold" title={team.name}>
              {team.shortName}
            </span>
            <span className="block truncate text-xs text-sidebar-foreground/70">Kuwait Oil Company</span>
          </span>
          {/* The visible way to fold the sidebar to its rail, now that there is
              no top bar to hold it. The rail edge and Ctrl B still work, but
              neither is discoverable from a keyboard. Hidden on phones, where
              the sidebar is a sheet with its own close. */}
          <SidebarTrigger className="ml-auto shrink-0 text-sidebar-foreground/70 max-md:hidden" />
        </div>

        <UnitSwitcher team={team} currentUnit={currentUnit} unitLabel={unitLabel} selectUnit={selectUnit} />

        {/* Find — SidebarInput's look, rig3's behaviour. */}
        <div role="search" className="relative mt-1 group-data-[collapsible=icon]:hidden">
          <label htmlFor={`${navId}-find`} className="sr-only">
            Find a screen
          </label>
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={field}
            id={`${navId}-find`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onFindKey}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={`${navId}-find-hint`}
            aria-controls={navId}
            placeholder="Find a screen"
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-14 text-sm outline-hidden placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                field.current?.focus();
              }}
              className="absolute right-1 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-hidden hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <X className="size-3.5" aria-hidden="true" />
              <span className="sr-only">Clear the search</span>
            </button>
          ) : (
            <kbd aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border bg-sidebar px-1 font-mono text-2xs text-muted-foreground">
              Ctrl K
            </kbd>
          )}
          <p id={`${navId}-find-hint`} className="sr-only">
            Shortcut: Control K. Filters the screens below as you type; Enter moves to the first result.
          </p>
          <p className="sr-only" aria-live="polite">
            {words.length ? `${found.length} ${found.length === 1 ? "screen matches" : "screens match"}` : ""}
          </p>
        </div>
      </SidebarHeader>

      <SidebarContent className="[scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]">
        {collapsed ? (
          // The rail: every destination as an icon with a tooltip.
          everyGroup.map((group) => (
            <RailSection key={group.id} group={group} activeItemId={activeItemId} renderLink={renderLink} />
          ))
        ) : words.length ? (
          <SidebarGroup id={navId} aria-label="Matching screens">
            <SidebarGroupLabel>Matches</SidebarGroupLabel>
            {found.length === 0 ? (
              <p className="px-2 py-1 text-xs text-sidebar-foreground/70">
                Nothing matches &ldquo;{query}&rdquo;.{" "}
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="font-medium text-sidebar-primary underline-offset-4 outline-hidden hover:underline focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                >
                  Show all
                </button>
              </p>
            ) : (
              // Choosing a match ends the search: the query clears so the nav
              // shows where you landed. (rig3 kept its query because its links
              // open in a new tab; an app's links replace the page.)
              <SidebarMenu onClick={(e) => (e.target as Element).closest("a[href]") && setQuery("")}>
                {found.map((d) => (
                  <DestinationRow key={d.item.id} d={d} activeItemId={activeItemId} renderLink={renderLink} memory={memory} hint />
                ))}
              </SidebarMenu>
            )}
          </SidebarGroup>
        ) : (
          <div id={navId} className="contents">
            {memory.pinned.length > 0 && (
              <Remembered title="Pinned" items={memory.pinned} activeItemId={activeItemId} renderLink={renderLink} memory={memory} />
            )}
            <FoldedGroups
              label={currentUnit === ALL_UNITS ? "All units" : "Applications"}
              groups={unitGroups}
              activeItemId={activeItemId}
              renderLink={renderLink}
              memory={memory}
            />
            {/* Team-wide sits below the unit nav and never changes with the
                switcher, so "does this belong to my unit or the team?" is
                answered by where it is rather than by asking someone. */}
            {team.teamWide.length > 0 && (
              <FoldedGroups
                label="Team-wide"
                groups={team.teamWide}
                activeItemId={activeItemId}
                renderLink={renderLink}
                memory={memory}
              />
            )}
          </div>
        )}
      </SidebarContent>

      <SidebarFooter className="gap-1">
        {(notifications || asOf) && (
          <div className="flex items-center gap-2 px-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-0">
            {asOf && (
              <span className="min-w-0 flex-1 truncate text-2xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
                {typeof asOf === "string"
                  ? asOf
                  : `Figures as of ${asOf.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`}
              </span>
            )}
            {/* Alerts are about operational events, not about you, and must be
                reachable from any screen — so they sit in the one place that is
                on every screen, beside the account. */}
            {notifications && (
              <NotificationMenu items={notifications} onSelect={onNotificationSelect} onMarkAllRead={onMarkAllRead} />
            )}
          </div>
        )}
        {user && (
          <SidebarMenu>
            <SidebarMenuItem>
              <AccountMenu user={user} groups={userMenu} />
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>
    </>
  );
}

/**
 * The unit switcher, as a quiet row under the brand: the unit's number as an
 * eyebrow, what it covers under it. Still the switcher (2026-08-09) — only the
 * dress changed.
 */
function UnitSwitcher({
  team,
  currentUnit,
  unitLabel,
  selectUnit,
}: {
  team: TeamConfig;
  currentUnit: string;
  unitLabel: string;
  selectUnit: (id: string) => void;
}) {
  const unit = team.units.find((u) => u.id === currentUnit);
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                aria-label={`Unit: ${unitLabel}. Switch unit`}
                className="h-11 border border-sidebar-border data-popup-open:bg-sidebar-accent group-data-[collapsible=icon]:border-0"
              />
            }
          >
            {/* The unit's own icon when it has one; the number otherwise. */}
            <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-accent font-mono text-2xs font-medium [&>svg]:size-4 [&>svg]:text-sidebar-foreground/80">
              {currentUnit === ALL_UNITS ? (
                <LayoutGrid />
              ) : unit?.icon ? (
                <unit.icon />
              ) : (
                (unit?.label ?? "").replace(/\D+/g, "") || "—"
              )}
            </span>
            {/* `min-w-0` is what makes `truncate` work on the children: a grid
                item's default `min-width: auto` refuses to shrink below its
                content, and the chevron gets shoved out instead. */}
            <span className="grid min-w-0 flex-1 text-left leading-tight">
              <span className="truncate text-2xs font-medium uppercase tracking-caps text-sidebar-foreground/70">
                {currentUnit === ALL_UNITS ? team.shortName : (unit?.label ?? "Unit")}
              </span>
              <span className="truncate text-sm font-medium">{unitLabel}</span>
            </span>
            <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/60" />
          </DropdownMenuTrigger>

          <DropdownMenuContent className="w-[var(--anchor-width)] min-w-64" align="start" side="bottom" sideOffset={4}>
            {/* Directorate and group are identity, not navigation. */}
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              {team.directorate} · {team.group}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {team.units.map((u) => (
              <DropdownMenuItem key={u.id} onClick={() => selectUnit(u.id)} className="gap-2">
                {u.icon && <u.icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
                <div className="grid min-w-0 flex-1">
                  <span>{u.label}</span>
                  {u.name && <span className="truncate text-xs text-muted-foreground">{u.name}</span>}
                </div>
                {u.id === currentUnit && <Check className="size-4" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {/* Team leads genuinely need to see across units. */}
            <DropdownMenuItem onClick={() => selectUnit(ALL_UNITS)} className="gap-2">
              <LayoutGrid aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1">All units</span>
              {currentUnit === ALL_UNITS && <Check className="size-4" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/** A labelled zone of folded app groups — rig3's "Teams" list. */
function FoldedGroups({
  label,
  groups,
  activeItemId,
  renderLink,
  memory,
}: {
  label: string;
  groups: NavGroup[];
  activeItemId?: string;
  renderLink: NonNullable<AppShellProps["renderLink"]>;
  memory: ShellMemory;
}) {
  const holding = (g: NavGroup) => flatten(g.items).some((i) => i.id === activeItemId);
  const [open, setOpen] = React.useState<Set<string>>(
    () => new Set(groups.filter(holding).map((g) => g.id)),
  );
  // Navigating into another group opens it too: a deep link must never land on
  // a screen whose nav entry is folded away.
  React.useEffect(() => {
    const g = groups.find(holding);
    if (g) setOpen((s) => (s.has(g.id) ? s : new Set(s).add(g.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItemId]);

  const labelId = React.useId();

  // A zone holding one group of the same name ("Team-wide" in "Team-wide")
  // lists its screens directly: a folded row that only repeats the label
  // above it is a click for nothing.
  if (groups.length === 1 && groups[0].label === label) {
    const only = groups[0];
    return (
      <SidebarGroup aria-labelledby={labelId}>
        <SidebarGroupLabel id={labelId}>{label}</SidebarGroupLabel>
        <SidebarMenu>
          {flatten(only.items).map((item) => (
            <DestinationRow key={item.id} d={{ item, group: only }} activeItemId={activeItemId} renderLink={renderLink} memory={memory} />
          ))}
        </SidebarMenu>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup aria-labelledby={labelId}>
      <SidebarGroupLabel id={labelId}>{label}</SidebarGroupLabel>
      <SidebarMenu className="gap-0.5">
        {groups.map((group) => {
          const isOpen = open.has(group.id);
          const subId = `${labelId}-${group.id}`;
          return (
            <SidebarMenuItem key={group.id}>
              <SidebarMenuButton
                aria-expanded={isOpen}
                aria-controls={subId}
                onClick={() =>
                  setOpen((s) => {
                    const n = new Set(s);
                    if (n.has(group.id)) n.delete(group.id);
                    else n.add(group.id);
                    return n;
                  })
                }
              >
                {group.code && (
                  <span className="w-9 shrink-0 font-mono text-2xs font-normal text-sidebar-foreground/60">{group.code}</span>
                )}
                <span className="min-w-0 flex-1 truncate">{group.label}</span>
                <ChevronRight
                  aria-hidden="true"
                  className={cn("ml-auto text-sidebar-foreground/50 transition-transform duration-fast ease-out", isOpen && "rotate-90")}
                />
              </SidebarMenuButton>
              <SidebarMenuSub id={subId} hidden={!isOpen} className="mr-0 pr-0">
                {group.items.map((item) => (
                  <SubDestination key={item.id} item={item} group={group} activeItemId={activeItemId} renderLink={renderLink} memory={memory} />
                ))}
              </SidebarMenuSub>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

/** One screen inside a folded group, with its pin. Children nest one step in. */
function SubDestination({
  item,
  group,
  activeItemId,
  renderLink,
  memory,
  depth = 0,
}: {
  item: NavItem;
  group: NavGroup;
  activeItemId?: string;
  renderLink: NonNullable<AppShellProps["renderLink"]>;
  memory: ShellMemory;
  depth?: number;
}) {
  return (
    <>
      <SidebarMenuSubItem className="group/menu-sub-item relative flex">
        <SidebarMenuSubButton
          isActive={item.id === activeItemId}
          aria-current={item.id === activeItemId ? "page" : undefined}
          className={cn("flex-1 pr-7 data-[active=true]:font-medium [&>svg]:text-sidebar-foreground/60", depth > 0 && "pl-6")}
          render={renderLink(
            item,
            <>
              {item.icon && <item.icon aria-hidden="true" />}
              <span>{item.label}</span>
            </>,
          )}
        />
        {item.badge !== undefined && (
          <span className="pointer-events-none absolute right-7 top-1 rounded-md px-1 text-xs font-medium tabular-nums text-sidebar-foreground">
            {item.badge}
          </span>
        )}
        <PinToggle item={item} memory={memory} />
      </SidebarMenuSubItem>
      {item.children?.map((child) => (
        <SubDestination
          key={child.id}
          item={child}
          group={group}
          activeItemId={activeItemId}
          renderLink={renderLink}
          memory={memory}
          depth={depth + 1}
        />
      ))}
    </>
  );
}

/** A search result or a remembered screen: the screen, with its app beside it. */
function DestinationRow({
  d,
  activeItemId,
  renderLink,
  memory,
  hint,
}: {
  d: Destination;
  activeItemId?: string;
  renderLink: NonNullable<AppShellProps["renderLink"]>;
  memory: ShellMemory;
  hint?: boolean;
}) {
  return (
    <SidebarMenuItem className="group/menu-sub-item relative flex">
      <SidebarMenuSubButton
        isActive={d.item.id === activeItemId}
        aria-current={d.item.id === activeItemId ? "page" : undefined}
        className="w-full flex-1 translate-x-0 pr-7 data-[active=true]:font-medium [&>svg]:text-sidebar-foreground/60"
        render={renderLink(
          d.item,
          <>
            {d.item.icon && <d.item.icon aria-hidden="true" />}
            <span className="min-w-0 flex-1 truncate">{d.item.label}</span>
            {hint && (
              <span className="max-w-24 shrink-0 truncate text-2xs text-sidebar-foreground/60">{d.group.code ?? d.group.label}</span>
            )}
          </>,
        )}
      />
      <PinToggle item={d.item} memory={memory} />
    </SidebarMenuItem>
  );
}

function Remembered({
  title,
  items,
  activeItemId,
  renderLink,
  memory,
  action,
}: {
  title: string;
  items: Destination[];
  activeItemId?: string;
  renderLink: NonNullable<AppShellProps["renderLink"]>;
  memory: ShellMemory;
  action?: React.ReactNode;
}) {
  const labelId = React.useId();
  return (
    <SidebarGroup aria-labelledby={labelId} className="pb-0">
      <div className="flex items-center">
        <SidebarGroupLabel id={labelId}>{title}</SidebarGroupLabel>
        {action}
      </div>
      <SidebarMenu>
        {items.map((d) => (
          <DestinationRow key={d.item.id} d={d} activeItemId={activeItemId} renderLink={renderLink} memory={memory} hint />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

/** Hidden until the row is hovered or focused; always shown once pinned. */
function PinToggle({ item, memory }: { item: NavItem; memory: ShellMemory }) {
  const pinned = memory.isPinned(item.id);
  return (
    <button
      type="button"
      aria-pressed={pinned}
      onClick={() => memory.togglePin(item.id)}
      className="absolute right-1 top-0.5 inline-flex size-6 items-center justify-center rounded-md text-sidebar-foreground/70 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring group-focus-within/menu-sub-item:opacity-100 group-hover/menu-sub-item:opacity-100 aria-pressed:text-sidebar-primary aria-pressed:opacity-100 md:opacity-0"
    >
      <Pin className={cn("size-3.5", pinned && "fill-current")} aria-hidden="true" />
      <span className="sr-only">
        {pinned ? "Unpin" : "Pin"} {item.label}
      </span>
    </button>
  );
}

/** The icon rail: what the shell drew before the rework, kept for collapse. */
function RailSection({
  group,
  activeItemId,
  renderLink,
}: {
  group: NavGroup;
  activeItemId?: string;
  renderLink: NonNullable<AppShellProps["renderLink"]>;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      <SidebarMenu>
        {flatten(group.items).map((item) => (
          <SidebarMenuItem key={item.id}>
            <SidebarMenuButton
              isActive={item.id === activeItemId}
              tooltip={item.label}
              render={renderLink(
                item,
                <>
                  {item.icon && <item.icon />}
                  <span>{item.label}</span>
                </>,
              )}
            />
            {/* A sibling, not a child, so it never enters the button's row —
                see the SidebarMenuBadge note in sidebar.tsx. */}
            {item.badge !== undefined && <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>}
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function flatten(items: NavItem[]): NavItem[] {
  return items.flatMap((i) => [i, ...flatten(i.children ?? [])]);
}

// ── Pinned ──────────────────────────────────────────────────────────────────

interface ShellMemory {
  pinned: Destination[];
  isPinned: (id: string) => boolean;
  togglePin: (id: string) => void;
}

/**
 * Per browser and per team (localStorage), which is the right scope for "my
 * shortcuts" and needs no server. Storage can be blocked or throw (private
 * windows, locked-down profiles), so every access is guarded and the shell
 * works without it. Ids that no longer exist in the config are dropped on read.
 *
 * Pins only. rig3's Recent belongs to the landing page (Saud, 2026-10-25); in
 * an app it repeated what the folded groups already show.
 */
function useShellMemory(teamId: string, destinations: Destination[]): ShellMemory {
  const key = `koc-shell:${teamId}`;
  const [pinned, setPinned] = React.useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? (JSON.parse(raw) as { pinned?: unknown }) : {};
      return Array.isArray(parsed.pinned) ? parsed.pinned.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  });

  const byId = React.useMemo(() => new Map(destinations.map((d) => [d.item.id, d])), [destinations]);

  return {
    pinned: pinned.map((id) => byId.get(id)).filter((d): d is Destination => Boolean(d)),
    isPinned: (id) => pinned.includes(id),
    togglePin: (id) => {
      const next = pinned.includes(id) ? pinned.filter((p) => p !== id) : [...pinned, id];
      setPinned(next);
      try {
        window.localStorage.setItem(key, JSON.stringify({ pinned: next }));
      } catch {
        /* storage blocked: the session still works, it just forgets */
      }
    },
  };
}

/**
 * The account menu, in the sidebar footer.
 *
 * It was a UserMenu in the top-right, and the comment justifying that said the
 * rail collapses to 32px so the menu had to stay in the header. That premise was
 * simply wrong: SIDEBAR_WIDTH_ICON is 3rem — 48px — and SidebarFooter carries no
 * collapse rule, so it stays visible. An `lg` SidebarMenuButton collapses to
 * exactly 32px inside that 48px rail through the sidebar's own size overrides,
 * with no extra CSS. The constraint that moved it away never existed.
 *
 * It also replaces a real defect. The footer previously rendered a
 * SidebarMenuButton — a genuine <button> — with no handler: focusable, in the
 * tab order, doing nothing. Anyone who tabbed to it got silence.
 *
 * TWO TRAPS, both of which fail silently:
 *
 *   1. NO `tooltip` PROP. With one, SidebarMenuButton returns a Tooltip root
 *      rather than a bare button. Under Radix's slot that silently broke the
 *      menu (props cloned onto a non-DOM component); Base's render prop
 *      forwards props through to the real button, but the account menu still
 *      omits the tooltip: the footer never collapses to icons, so a tooltip
 *      here would be noise announced to every screen reader for no benefit.
 *   2. NOT the UserMenu component. It renders a Button, which has neither
 *      overflow-hidden nor any of the sidebar's icon-rail size overrides, so it
 *      overflows the collapsed rail. The markup here is the sidebar's own.
 *
 * `side="right"` on the content is what makes it usable from the collapsed rail:
 * a menu opening upward from a 48px column would be clipped by the viewport edge.
 */
function AccountMenu({
  user,
  groups,
}: {
  user: AppShellUser;
  groups?: UserMenuItem[][];
}) {
  const { isMobile } = useSidebar();

  const identity = (
    <>
      <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium">
        {initials(user.name)}
      </div>
      <div className="grid min-w-0 flex-1 text-left leading-tight">
        <span className="truncate text-sm font-medium">{user.name}</span>
        {user.role && (
          <span className="truncate text-xs text-muted-foreground">{user.role}</span>
        )}
      </div>
    </>
  );

  // No menu supplied — render the identity, but NOT as a button. A control that
  // does nothing is worse than no control, and that is what shipped before.
  if (!groups?.length) {
    return (
      <div
        data-slot="sidebar-menu-button"
        className="flex h-12 w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0!"
      >
        {identity}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            size="lg"
            aria-label={`Account menu for ${user.name}`}
            className="data-popup-open:bg-sidebar-accent"
          />
        }
      >
        {identity}
        <ChevronsUpDown className="ml-auto size-4 shrink-0" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-[var(--anchor-width)] min-w-56"
        side={isMobile ? "bottom" : "right"}
        align="end"
        sideOffset={4}
      >
        <DropdownMenuLabel className="flex items-center gap-2 font-normal">
          <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-muted text-xs font-medium">
            {initials(user.name)}
          </div>
          <div className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate text-sm font-medium">{user.name}</span>
            {user.role && (
              <span className="truncate text-xs text-muted-foreground">{user.role}</span>
            )}
          </div>
        </DropdownMenuLabel>

        {groups.map((group, gi) => (
          <React.Fragment key={gi}>
            <DropdownMenuSeparator />
            {group.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onClick={() => item.onSelect?.()}
                className={cn("gap-2", item.destructive && "text-destructive")}
              >
                {item.icon && <item.icon className="size-4" />}
                {item.label}
              </DropdownMenuItem>
            ))}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

