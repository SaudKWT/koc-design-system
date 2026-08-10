import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { cn } from "@koc/ui";
import { Overview } from "./sections/Overview";
import { Colour } from "./sections/Colour";
import { Typography } from "./sections/Typography";
import { Components } from "./sections/Components";
import { DashboardDemo } from "./sections/DashboardDemo";
import { Accessibility } from "./sections/Accessibility";
import { Bakeoff } from "./sections/Bakeoff";
import { TeamShell } from "./sections/TeamShell";

const SECTIONS = [
  { id: "overview", label: "Overview", group: "Start", el: Overview },
  { id: "colour", label: "Colour", group: "Foundations", el: Colour },
  { id: "typography", label: "Typography", group: "Foundations", el: Typography },
  { id: "components", label: "Components", group: "Library", el: Components },
  { id: "dashboard", label: "Dashboard pattern", group: "Library", el: DashboardDemo },
  { id: "team-shell", label: "Team dashboard shell", group: "Library", el: TeamShell },
  { id: "a11y", label: "Accessibility", group: "Quality", el: Accessibility },
  // Evaluation only — not part of the system. See src/bakeoff/README.md.
  { id: "bakeoff", label: "Sidebar bake-off", group: "Evaluation", el: Bakeoff },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export default function App() {
  const [active, setActive] = useState<SectionId>("overview");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const Active = SECTIONS.find((s) => s.id === active)!.el;
  const groups = [...new Set(SECTIONS.map((s) => s.group))];

  return (
    <div className="flex min-h-screen">
      {/* The sidebar demonstrates its own tokens — now a quiet surface rather
          than a slab of KOC blue. Brand appears only on the active item and the
          focus ring, so colour on this screen belongs to the data. */}
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-4">
          {/* The KOC logo SVG is fill="white" with no coloured variant, so it is
              invisible on a light surface. It gets its own `bg-primary` tile —
              which is also the only full-strength brand colour in the chrome,
              and reads as a mark rather than as a background. */}
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary">
            <img src="/koc-logo.svg" alt="" className="size-7" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">Design System</div>
            <div className="truncate text-2xs text-muted-foreground">Kuwait Oil Company</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          {groups.map((group) => (
            <div key={group} className="mb-4">
              {/* Opacity-dimmed text was safe on the old blue slab; on a light
                  surface it drops below 4.5:1. Use the tested muted token. */}
              <div className="px-2 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group}
              </div>
              {SECTIONS.filter((s) => s.group === group).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  aria-current={active === s.id ? "page" : undefined}
                  className={cn(
                    "block w-full rounded px-2 py-1.5 text-left text-sm transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                    active === s.id
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <button
            onClick={() => setDark((d) => !d)}
            className={cn(
              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm",
              "text-sidebar-foreground transition-colors hover:bg-sidebar-accent/50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            )}
          >
            {dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
            {dark ? "Dark" : "Light"} theme
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-5xl px-8 py-10">
          <Active />
        </div>
      </main>
    </div>
  );
}
