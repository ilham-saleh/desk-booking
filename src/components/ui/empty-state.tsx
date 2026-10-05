import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}>
      {Icon && (
        <span className="bg-navy-soft text-navy flex size-12 items-center justify-center rounded-2xl">
          <Icon className="size-5" strokeWidth={1.75} />
        </span>
      )}
      <div className="space-y-1">
        <p className="type-card-title">{title}</p>
        {description && <p className="text-muted-foreground mx-auto max-w-sm text-[0.8125rem] leading-5">{description}</p>}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
