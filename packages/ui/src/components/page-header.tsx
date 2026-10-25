import * as React from "react";

import { cn } from "../lib/utils";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./breadcrumb";

/**
 * PageHeader — the top of every KOC application screen.
 *
 * Not in the shadcn registry and not in any block worth copying: every dashboard
 * kit improvises one, which is exactly why forty KOC apps would improvise forty
 * slightly different ones. This fixes the arrangement so a user moving between
 * two KOC apps finds the title, the context and the actions in the same places.
 *
 * WHY THE TITLE IS AN <h1>
 * ------------------------
 * The app shell contributes no heading — a sidebar is navigation, not document
 * structure. If the page does not supply an h1 the screen has no top-level
 * heading at all, and screen-reader users lose the single most-used way to
 * orient on a page. Making it structural here means a team cannot ship a screen
 * without one by forgetting.
 *
 * WHY BREADCRUMBS ARE OPTIONAL AND SHALLOW
 * ----------------------------------------
 * KOC nests four levels deep, and the temptation is to render the whole chain.
 * But Directorate and Group are identity rather than navigation — a user does
 * not travel up to them from a screen — and the unit is already in the sidebar
 * switcher. So a breadcrumb here should carry only the path *within* the app:
 * the list you came from, and where you are now. Anything more repeats the
 * chrome and buries the one link that matters.
 *
 * THE RIG3 HEADER (2026-10-25)
 * ----------------------------
 * Restyled to the DWEG landing's rig3 page, the base Saud chose for the whole
 * system. The breadcrumb becomes the EYEBROW — 11px capitals set wide, above
 * the title — so the path reads as context rather than as a second row of
 * navigation. The title is light and large (30/36px, weight 300): hierarchy
 * comes from size and air, not from weight, which is what lets the quiet card
 * chrome underneath stay quiet. No rule under the header: whitespace separates
 * it from the content.
 *
 * SectionHeading, below, is the same voice one level down — rig3's numbered
 * sections ("02 — Figures"), for a page long enough to have parts.
 */

/** The eyebrow line: 11px capitals, set wide. Shared by both headings here. */
const EYEBROW = "text-2xs font-medium uppercase tracking-caps text-muted-foreground";

export interface PageHeaderCrumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  /** One line explaining what this screen is for. Optional but usually earned. */
  description?: string;
  /**
   * Path within the app, shown as the eyebrow. The last entry is the current
   * page. Ignored when `eyebrow` is given.
   */
  breadcrumbs?: PageHeaderCrumb[];
  /** An eyebrow that is not a path — "Figures", a unit name. */
  eyebrow?: React.ReactNode;
  /**
   * Primary and secondary actions. Kept to the right of the title so the
   * scan order is "where am I → what is this → what can I do".
   */
  actions?: React.ReactNode;
  /** Counters, freshness stamps, status. Rendered under the title. */
  meta?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  eyebrow,
  actions,
  meta,
  className,
}: PageHeaderProps) {
  return (
    <header data-slot="page-header" className={cn("pb-2", className)}>
      {eyebrow ? (
        <p className={cn(EYEBROW, "mb-2")}>{eyebrow}</p>
      ) : (
        breadcrumbs &&
        breadcrumbs.length > 0 && (
          <Breadcrumb className="mb-2">
            <BreadcrumbList className={cn(EYEBROW, "gap-1.5 sm:gap-2")}>
              {breadcrumbs.map((crumb, i) => {
                const last = i === breadcrumbs.length - 1;
                return (
                  <React.Fragment key={`${crumb.label}-${i}`}>
                    <BreadcrumbItem>
                      {last || !crumb.href ? (
                        <BreadcrumbPage className="font-medium text-muted-foreground">{crumb.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink href={crumb.href} className="underline-offset-4 hover:underline">
                          {crumb.label}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {!last && <BreadcrumbSeparator className="text-muted-foreground/60">/</BreadcrumbSeparator>}
                  </React.Fragment>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        )
      )}

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-light tracking-tight sm:text-4xl">{title}</h1>
          {description && (
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
          {meta && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">{meta}</div>
          )}
        </div>

        {/* `shrink-0` so a long title wraps rather than squeezing the actions
            into an unusable column — the primary action must stay clickable at
            any width. */}
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export interface SectionHeadingProps {
  /** The section's heading text. */
  title: React.ReactNode;
  /** Its number on the page, "02". Rendered in mono, brand blue. */
  index?: string;
  /** The eyebrow beside the number, "Figures". */
  eyebrow?: React.ReactNode;
  /** A muted aside at the right — an as-of stamp, a count, an action. */
  aside?: React.ReactNode;
  /** The heading level. h2 by default; the page's h1 is PageHeader's. */
  as?: "h2" | "h3";
  /** Forwarded to the heading, for `aria-labelledby` on the section. */
  id?: string;
  className?: string;
}

/**
 * SectionHeading — a numbered part of a long page, as rig3 sets them:
 *
 *     02 — FIGURES
 *     Kuwait Oil Company                                   As of 28 Sep, 06:00
 *
 * The number is the one place brand blue appears in a heading: it tells you
 * where you are in the page at a glance, and nothing else on the line competes
 * with it.
 */
export function SectionHeading({ title, index, eyebrow, aside, as: Tag = "h2", id, className }: SectionHeadingProps) {
  return (
    <div data-slot="section-heading" className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-2", className)}>
      <div className="min-w-0">
        {(index || eyebrow) && (
          <p className={EYEBROW}>
            {index && <span className="font-mono text-primary">{index}</span>}
            {index && eyebrow && " — "}
            {eyebrow}
          </p>
        )}
        <Tag id={id} className={cn("font-light tracking-tight", Tag === "h2" ? "mt-2 text-2xl sm:text-3xl" : "mt-1 text-2xl")}>
          {title}
        </Tag>
      </div>
      {aside && <div className="text-xs text-muted-foreground">{aside}</div>}
    </div>
  );
}
