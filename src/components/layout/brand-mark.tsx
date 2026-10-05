import Image from "next/image";

import { cn } from "@/lib/utils";

/** Official Third Bridge mark (docs/third_bridge_logo.jpeg, served from /public/brand). */
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/third-bridge-mark.jpeg"
      alt="Third Bridge"
      width={size}
      height={size}
      priority
      className={cn("shrink-0 rounded-[8px]", className)}
    />
  );
}
