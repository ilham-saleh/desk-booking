import * as React from "react";

import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden className={cn("skeleton rounded-lg", className)} {...props} />;
}

/** Thin indeterminate bar for background refreshes — never blocks the content under it. */
export function ProgressBar({ active = true, className }: { active?: boolean; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none h-0.5 w-full overflow-hidden transition-opacity duration-200",
        active ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      <div className="progress-indeterminate bg-cyan h-full w-2/5 rounded-full" />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  );
}

/** Placeholder rows that match a table's shape while it loads. */
export function TableSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2 p-4", className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}
