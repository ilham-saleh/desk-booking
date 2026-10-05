import * as React from "react";

import { cn } from "@/lib/utils";
import { fieldClassName } from "@/components/ui/input";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldClassName, "field-sizing-content h-auto min-h-20 py-2.5 leading-relaxed", className)}
      {...props}
    />
  );
}

export { Textarea };
