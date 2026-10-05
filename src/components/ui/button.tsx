import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Pill buttons, following the Third Bridge site's CTA treatment. `default`
 * (navy) is the everyday action; `brand` (teal with dark-teal ink, the site's
 * own CTA) is reserved for the one primary action on a screen.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45 aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-navy text-white shadow-xs hover:bg-navy-hover",
        brand: "bg-cyan text-cyan-ink shadow-xs hover:bg-cyan-hover",
        destructive: "bg-danger text-white shadow-xs hover:bg-danger/90 focus-visible:ring-danger/25",
        outline:
          "border border-border-strong bg-surface text-navy shadow-xs hover:border-navy/35 hover:bg-surface-muted",
        secondary: "bg-navy-soft text-navy hover:bg-[#d9e2ec]",
        ghost: "text-text-secondary hover:bg-navy-soft hover:text-navy",
        link: "rounded-none text-navy underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-10 px-5 has-[>svg]:px-4",
        sm: "h-8 px-3.5 text-[0.8125rem] has-[>svg]:px-3",
        lg: "h-11 px-6 text-[0.9375rem] has-[>svg]:px-5",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
