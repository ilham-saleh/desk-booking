import * as React from "react";

import { cn } from "@/lib/utils";

/** Shared field chrome — inputs, selects, comboboxes and textareas all use it so they line up. */
export const fieldClassName =
  "border-input bg-surface text-foreground placeholder:text-muted-foreground flex h-10 w-full min-w-0 rounded-[10px] border px-3 text-sm shadow-xs outline-none transition-[border-color,box-shadow,background-color] duration-150 hover:border-navy/30 focus-visible:border-cyan focus-visible:ring-[3px] focus-visible:ring-cyan/20 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60 aria-invalid:border-danger aria-invalid:ring-danger/15";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldClassName,
        "py-1 selection:bg-light-blue selection:text-navy file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
