import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { cn } from "@koc/ui";
import { Overview } from "./sections/Overview";
import { Colour } from "./sections/Colour";
import { Typography } from "./sections/Typography";
import { Components } from "./sections/Components";
import { DashboardDemo } from "./sections/DashboardDemo";
import { Accessibility } from "./sections/Accessibility";

const SECTIONS = [
  { id: "overview", label: "Overview", group: "Start", el: Overview },
  { id: "colour", label: "Colour", group: "Foundations", el: Colour },
  { id: "typography", label: "Typography", group: "Foundations", el: Typography },
  { id: "components", label: "Components", group: "Library", el: Components },
  { id: "dashboard", label: "Dashboard pattern", group: "Library", el: DashboardDemo },
  { id: "a11y", label: "Accessibility", group: "Quality", el: Accessibility },
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
      {/* The sidebar is the design system demonstrating its own sidebar tokens:
          KOC blue at primary-800, which doubles as the dark backdrop the
          white-only KOC logo requires. */}
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-4">
          <img src="/koc-logo.svg" alt="" className="size-9 shrink-0" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">Design System</div>
            <div className="truncate text-2xs text-sidebar-foreground/70">Kuwait Oil Company</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          {groups.map((group) => (
            <div key={group} className="mb-4">
              <div className="px-2 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">
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
                      : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
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
              "text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent/60",
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
