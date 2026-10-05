import * as React from "react";

import { cn } from "@/lib/utils";

/** Title block used at the top of every standard (non-map) page. */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Small context line above the title, e.g. a back link. */
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0 space-y-1">
        {eyebrow && <div className="text-muted-foreground mb-2 text-[0.8125rem]">{eyebrow}</div>}
        <h1 className="type-page-title">{title}</h1>
        {description && <p className="text-muted-foreground max-w-[70ch] text-sm leading-6">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Standard page container: consistent max width, gutters and vertical rhythm. */
export function PageContainer({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mx-auto flex w-full max-w-[1400px] flex-col gap-6", className)} {...props} />;
}
