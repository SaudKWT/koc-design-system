import type { ReactNode } from "react";
import { cn } from "@koc/ui";

/** Page title + standfirst. */
export function PageHead({ title, lead }: { title: string; lead: string }) {
  return (
    <header className="mb-10 border-b pb-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-2xl text-md leading-relaxed text-muted-foreground">{lead}</p>
    </header>
  );
}

export function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-12", className)}>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {description && (
        <div className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {description}
        </div>
      )}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** A live example, framed so it reads as "this is the real component". */
export function Demo({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-md border bg-card p-6", className)}>{children}</div>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
      {children}
    </code>
  );
}

export function Pre({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border bg-muted/50 p-4 font-mono text-xs leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

/** A callout for the things a reader must not undo. */
export function Note({
  kind = "note",
  title,
  children,
}: {
  kind?: "note" | "warn";
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-md border-l-2 bg-muted/40 py-3 pl-4 pr-4",
        kind === "warn" ? "border-l-warning" : "border-l-primary",
      )}
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}
