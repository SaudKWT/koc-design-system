/**
 * Full-screen viewer for one landing direction — `/#/landing/<id>`.
 *
 * A landing page cannot be judged inside the docs frame: it is designed for the
 * whole viewport, and the docs `main` caps content at max-w-5xl. So each
 * direction renders here with no docs chrome at all, exactly as a user would
 * meet it, plus one small evaluation bar that is not part of any direction.
 */

import { Suspense, useEffect, useState } from "react";
import { ArrowLeft, Moon, Sun, Turtle } from "lucide-react";

import { Toaster, cn } from "@koc/ui";

import { DIRECTIONS, LANDING_HASH, letterOf, versionOf, type Direction } from "./directions";

export function LandingViewer({ id }: { id: Direction["id"] }) {
  const direction = DIRECTIONS.find((d) => d.id === id)!;
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [reduce, setReduce] = useState(
    () => document.documentElement.dataset.forceReducedMotion === "true",
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  useEffect(() => {
    if (reduce) document.documentElement.dataset.forceReducedMotion = "true";
    else delete document.documentElement.dataset.forceReducedMotion;
  }, [reduce]);
  useEffect(() => {
    document.title = `${direction.name} ${versionOf(direction.id) === 2 ? "v2" : "v1"} — D&W landing direction`;
    window.scrollTo(0, 0);
  }, [direction.name]);

  const { Page } = direction;

  return (
    <>
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        {/* Keyed so switching direction remounts cleanly — no WebGL context or
            observer from the previous one survives the switch. */}
        <Page key={direction.id} />
      </Suspense>

      <Toaster position="bottom-right" />

      {/* Evaluation chrome, not part of any direction. Deliberately small and
          parked bottom-left, where no direction puts primary content. */}
      {/* A labelled landmark, so axe's `region` rule holds for every direction
          without each one having to account for this bar. */}
      <nav
        aria-label="Direction viewer"
        className="fixed bottom-3 left-3 z-[100] flex items-center gap-1 rounded-full border bg-popover/95 p-1 text-popover-foreground shadow-lg backdrop-blur"
      >
        <a
          href="#"
          className="inline-flex size-8 items-center justify-center rounded-full hover:bg-accent"
          aria-label="Back to the design system docs"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </a>
        {/* Round switch: jumps to the same letter in the other round when it
            exists, so comparing a direction's v1 and v2 is one click. */}
        {([1, 2] as const).map((v) => {
          const target =
            DIRECTIONS.find((d) => versionOf(d.id) === v && letterOf(d.id) === letterOf(id)) ??
            DIRECTIONS.find((d) => versionOf(d.id) === v);
          if (!target) return null;
          const current = versionOf(id) === v;
          return (
            <a
              key={v}
              href={`${LANDING_HASH}${target.id}`}
              aria-current={current ? "true" : undefined}
              className={cn(
                "inline-flex h-8 items-center justify-center rounded-full px-2 font-mono text-xs",
                current ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent",
              )}
            >
              v{v}
              <span className="sr-only">{v === 1 ? " — first round" : " — daily-use round"}</span>
            </a>
          );
        })}
        <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
        {DIRECTIONS.filter((d) => versionOf(d.id) === versionOf(id)).map((d) => (
          <a
            key={d.id}
            href={`${LANDING_HASH}${d.id}`}
            aria-current={d.id === id ? "page" : undefined}
            title={d.name}
            className={cn(
              "inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-semibold uppercase",
              d.id === id ? "bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            {letterOf(d.id)}
            <span className="sr-only">{` — ${d.name}, ${versionOf(d.id) === 2 ? "v2" : "v1"}`}</span>
          </a>
        ))}
        <button
          type="button"
          onClick={() => setDark((v) => !v)}
          aria-pressed={dark}
          aria-label="Dark theme"
          className="inline-flex size-8 items-center justify-center rounded-full hover:bg-accent"
        >
          {dark ? <Moon className="size-4" aria-hidden="true" /> : <Sun className="size-4" aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={() => setReduce((v) => !v)}
          aria-pressed={reduce}
          aria-label="Simulate reduced motion"
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-full",
            reduce ? "bg-primary text-primary-foreground" : "hover:bg-accent",
          )}
        >
          <Turtle className="size-4" aria-hidden="true" />
        </button>
      </nav>
    </>
  );
}
