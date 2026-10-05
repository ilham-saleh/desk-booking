import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Status chips. State is always carried by the text label (and usually a dot),
 * never by colour alone.
 */
const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 [&>svg]:pointer-events-none focus-visible:ring-[3px] focus-visible:ring-ring/40 transition-colors overflow-hidden",
  {
    variants: {
      variant: {
        default: "border-transparent bg-navy text-white [a&]:hover:bg-navy-hover",
        secondary: "border-transparent bg-navy-soft text-navy [a&]:hover:bg-[#d9e2ec]",
        destructive: "border-transparent bg-danger-soft text-danger",
        outline: "border-border-strong bg-surface text-text-secondary [a&]:hover:bg-surface-muted",
        success: "border-transparent bg-success-soft text-success",
        warning: "border-transparent bg-warning-soft text-warning",
        brand: "border-transparent bg-cyan-soft text-cyan-ink",
        muted: "border-transparent bg-surface-sunken text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  dot = false,
  children,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean; dot?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && !asChild && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </Comp>
  );
}

export { Badge, badgeVariants };
