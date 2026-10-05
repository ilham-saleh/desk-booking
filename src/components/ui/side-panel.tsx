"use client";

import * as React from "react";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Docked right-hand panel for map screens (booking form, desk details, person
 * card). It sits beside the map instead of covering it, so opening one never
 * reflows the map; below `lg` it floats over the map's right edge.
 */
export function SidePanel({
  className,
  dockAt = "lg",
  ...props
}: React.ComponentProps<"aside"> & {
  /** Breakpoint from which the panel docks beside the content; below it, it floats over the right edge. */
  dockAt?: "lg" | "xl";
}) {
  return (
    <aside
      className={cn(
        "bg-surface animate-in fade-in-0 flex min-h-0 w-full flex-col border-l duration-200",
        dockAt === "lg"
          ? "max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-20 max-lg:max-w-[320px] max-lg:shadow-lg lg:w-[320px] lg:shrink-0"
          : "max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-20 max-xl:max-w-[320px] max-xl:shadow-lg max-xl:slide-in-from-right-4 xl:w-[320px] xl:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

export function SidePanelHeader({
  title,
  subtitle,
  status,
  onClose,
  className,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** A status chip shown under the title. */
  status?: React.ReactNode;
  onClose?: () => void;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("animate-in fade-in-0 slide-in-from-right-1 border-b px-5 pt-5 pb-4 duration-200", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-navy truncate text-lg leading-7 font-semibold tracking-[-0.015em]">{title}</h2>
          {subtitle && <p className="text-muted-foreground line-clamp-2 text-[0.8125rem]">{subtitle}</p>}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="text-muted-foreground hover:bg-navy-soft hover:text-navy focus-visible:ring-cyan/40 -mt-0.5 -mr-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-[3px]"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>
      {status && <div className="mt-3 flex flex-wrap items-center gap-2">{status}</div>}
      {children}
    </div>
  );
}

export function SidePanelBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "scroll-quiet animate-in fade-in-0 min-h-0 flex-1 divide-y overflow-y-auto overscroll-contain duration-300",
        className,
      )}
      {...props}
    />
  );
}

export function SidePanelSection({
  title,
  action,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"section">, "title"> & { title?: React.ReactNode; action?: React.ReactNode }) {
  const headingId = React.useId();
  return (
    <section aria-labelledby={title ? headingId : undefined} className={cn("space-y-3 px-5 py-4", className)} {...props}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2">
          {title && (
            <h3 id={headingId} className="type-overline">
              {title}
            </h3>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function SidePanelFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("bg-surface border-t px-5 py-4", className)} {...props} />;
}

/** "Label / value" pair used for read-only details in panels. */
export function DetailRow({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 text-sm", className)}>
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-foreground min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
}
