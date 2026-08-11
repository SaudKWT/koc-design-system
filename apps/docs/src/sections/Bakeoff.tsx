import { useEffect, useState } from "react";
import { ExternalLink, Maximize2, TriangleAlert } from "lucide-react";

import { cn } from "@koc/ui";

import { SidebarProvider, SidebarInset } from "../bakeoff/ui/sidebar";
import { CANDIDATES } from "../bakeoff/candidates";
import { PageHead, Section, Note } from "./parts";

/**
 * Live comparison of sidebar candidates, rendered on KOC tokens.
 *
 * The point is to judge behaviour — collapse, hover, focus, how the brand reads
 * at density — rather than looks. None of these were restyled; they arrive
 * on-brand because `semantic.ts` matches the shadcn variable contract.
 */
export function Bakeoff() {
  const [activeId, setActiveId] = useState(CANDIDATES[1].id);
  const [full, setFull] = useState(false);
  const active = CANDIDATES.find((c) => c.id === activeId)!;
  const { Component } = active;

  // Esc closes the overlay. Without it the only way out is a mouse, which is a
  // poor look on the page arguing that keyboard behaviour is what to evaluate.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  return (
    <>
      <PageHead
        title="Sidebar bake-off"
        lead="Candidate navigation shells, installed for real and rendered on KOC tokens. Compare
              them by using them — collapse them, tab through them, switch to dark — not by
              looking at them."
      />

      <Note kind="warn" title="Evaluation code — not the design system">
        <strong>Nothing on this page is part of the design system.</strong> These are evaluation
        copies living in <code>src/bakeoff/</code>. When one wins it gets reimplemented into{" "}
        <code>@koc/ui</code> against tokens and contrast tests — promotion is a rewrite, not a
        move.
      </Note>

      <Section
        title="Candidates"
        description="All three are MIT, from shadcn/ui's own block collection. They differ in navigation
              model, not in styling."
      >
        <div className="flex flex-wrap gap-2">
          {CANDIDATES.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              aria-pressed={c.id === activeId}
              className={cn(
                "rounded-md border px-3 py-2 text-sm transition-colors duration-fast ease-out",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                c.id === activeId
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <Fact label="Source">
            <a
              href={active.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 underline underline-offset-2"
            >
              {active.source}
              <ExternalLink aria-hidden className="size-3" />
            </a>
          </Fact>
          <Fact label="Licence">{active.licence}</Fact>
          <Fact label="Files added">{active.files}</Fact>
          <Fact label="Lines of code">{active.loc}</Fact>
        </dl>

        <p className="mt-4 text-sm text-muted-foreground">{active.summary}</p>

        <ul className="mt-4 space-y-2 text-sm">
          {active.notes.map((n) => (
            <li key={n} className="flex gap-2">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
              <span>{n}</span>
            </li>
          ))}
        </ul>

        {active.deBrandsOnInstall && (
          <p className="mt-4 flex items-start gap-2 rounded-md border border-input p-3 text-sm">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              Installing this appended stock Zinc theme tokens to the app's CSS entry, overriding
              KOC's sidebar colours silently. Caught by <code>npm run check:drift</code> and
              removed. True of every candidate here — it is a property of the shadcn CLI, not of
              any one block.
            </span>
          </p>
        )}
      </Section>

      <Section
        title="Live"
        description="Real components, real interaction. Collapse the rail, tab through the items, toggle
              dark mode in the header — the differences that matter are the ones you cannot see in
              a screenshot."
      >
        {/*
         * `Sidebar` renders `fixed inset-y-0 h-svh`, so without intervention it
         * escapes any container and pins itself to the viewport.
         *
         * A `transform` on an ancestor makes that ancestor the containing block
         * for fixed-position descendants, which re-roots the sidebar inside this
         * frame. `translateZ(0)` is the cheapest transform that does it.
         *
         * The viewport-relative *heights* still resolve against the viewport, so
         * the scoped rule below rewrites svh units to fill the frame instead.
         */}
        <style>{`
          [data-bakeoff-frame] { transform: translateZ(0); }
          [data-bakeoff-frame] .h-svh,
          [data-bakeoff-frame] .min-h-svh { height: 100%; min-height: 100%; }
        `}</style>

        <button
          onClick={() => setFull(true)}
          className={cn(
            "mb-3 rounded-md border border-input px-3 py-1.5 text-sm transition-colors duration-fast ease-out",
            "hover:bg-accent hover:text-accent-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <Maximize2 aria-hidden className="mr-1.5 inline size-3.5" />
          Open full screen
        </button>

        <div
          data-bakeoff-frame
          className="relative h-[42rem] overflow-hidden rounded-lg border border-input"
        >
          {/* Remounting per candidate resets collapse state, so each one is
              judged from the same starting position rather than inheriting the
              previous candidate's open/closed rail. */}
          <SidebarProvider key={active.id} className="h-full min-h-full">
            <Component />
            {active.variant === "inset" ? (
              <SidebarInset>
                <FrameContent />
              </SidebarInset>
            ) : (
              <div className="flex-1 overflow-auto">
                <FrameContent />
              </div>
            )}
          </SidebarProvider>
        </div>
      </Section>

      {/*
       * Full-screen preview.
       *
       * A nav cannot honestly be judged in a 42rem box — the thing you are
       * actually assessing is how it behaves against a real viewport at real
       * density. This overlay is deliberately NOT inside `[data-bakeoff-frame]`,
       * so no transform re-roots the sidebar: it gets the viewport, `h-svh`
       * resolves the way it will in production, and the mobile breakpoint fires
       * for real.
       */}
      {full && (
        <div className="fixed inset-0 z-50 bg-background">
          <button
            onClick={() => setFull(false)}
            autoFocus
            className={cn(
              "absolute right-4 top-4 z-[60] rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm",
              "hover:bg-accent hover:text-accent-foreground",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            Close (Esc)
          </button>
          <SidebarProvider key={`full-${active.id}`}>
            <Component />
            {active.variant === "inset" ? (
              <SidebarInset>
                <FrameContent />
              </SidebarInset>
            ) : (
              <div className="flex-1 overflow-auto">
                <FrameContent />
              </div>
            )}
          </SidebarProvider>
        </div>
      )}
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}

/**
 * Filler content so the sidebar is judged against a realistic page rather than
 * against emptiness — density is most of what separates these.
 */
function FrameContent() {
  return (
    <div className="p-6">
      <h3 className="text-xl font-semibold">Production overview</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Placeholder content. Judge the nav against it, not on its own.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {["Daily output", "Active wells", "Flaring"].map((t) => (
          <div key={t} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{t}</p>
            <p className="mt-1 text-2xl font-semibold tabular">—</p>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-9 rounded-md border border-border bg-card" />
        ))}
      </div>
    </div>
  );
}
