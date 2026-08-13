"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import type { Role } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

import { getNavItems, type NavItem } from "./nav-items";

function NavLinks({ navItems, onNavigate }: { navItems: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-3">
      {navItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Persistent left column, alongside the main content area. Takes `role`
 * rather than `NavItem[]` because these components are rendered directly from
 * a Server Component (the (app) layout) — a prop containing icon component
 * references can't cross that boundary, but a plain enum string can.
 */
export function DesktopSidebar({ role }: { role: Role }) {
  return (
    <aside className="hidden w-56 shrink-0 border-r md:block">
      <NavLinks navItems={getNavItems(role)} />
    </aside>
  );
}

/** Hamburger + slide-out sheet, meant to sit inline in the top bar on mobile. */
export function MobileSidebar({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const navItems = getNavItems(role);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64">
        <SheetHeader>
          <SheetTitle>Desk Booking</SheetTitle>
        </SheetHeader>
        <NavLinks navItems={navItems} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
