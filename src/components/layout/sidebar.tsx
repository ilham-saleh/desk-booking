"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import type { Role } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BrandMark } from "@/components/layout/brand-mark";
import { SIDEBAR_COLLAPSED, SIDEBAR_COOKIE, SIDEBAR_EXPANDED } from "@/components/layout/sidebar-state";

import { getNavGroups, type NavGroup } from "./nav-items";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Labels stay mounted and fade rather than unmount, so expanding never
 * re-flows the rail mid-animation. They fade in after the width has started
 * opening and fade out at once when collapsing, so text is never squeezed.
 */
function labelFade(collapsed: boolean) {
  return cn(
    "min-w-0 overflow-hidden whitespace-nowrap transition-opacity ease-out",
    collapsed ? "pointer-events-none opacity-0 duration-100" : "opacity-100 delay-100 duration-200",
  );
}

/** Shows `label` beside a rail item, only while the rail is collapsed. */
function RailTooltip({ label, collapsed, children }: { label: string; collapsed: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      {collapsed && <TooltipContent side="right">{label}</TooltipContent>}
    </Tooltip>
  );
}

function BrandBlock({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link
      href="/home"
      className="focus-visible:ring-cyan/60 flex h-16 shrink-0 items-center gap-3 rounded-lg px-4 outline-none focus-visible:ring-2"
      aria-label="Third Bridge Desk Booking — home"
    >
      <BrandMark size={34} />
      <span aria-hidden className={cn("flex min-w-0 flex-col leading-tight", labelFade(collapsed))}>
        <span className="text-off-white text-[0.9375rem] font-semibold tracking-[-0.01em]">Third Bridge</span>
        <span className="text-light-blue/80 text-xs font-medium">Desk Booking</span>
      </span>
    </Link>
  );
}

function NavLinks({
  groups,
  collapsed = false,
  onNavigate,
}: {
  groups: NavGroup[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="scroll-quiet flex flex-1 flex-col gap-6 overflow-x-hidden overflow-y-auto px-3 py-4" aria-label="Main">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          {/* Fixed-height header that cross-fades between the group label and a divider, so items don't shift. */}
          <div className="relative mb-1.5 h-4">
            <p className={cn("absolute inset-x-3 top-0 text-[0.6875rem] leading-4 font-semibold tracking-[0.06em] text-white/45 uppercase", labelFade(collapsed))}>
              {group.label}
            </p>
            <span
              aria-hidden
              className={cn(
                "absolute top-1/2 left-[13px] h-px w-[18px] bg-white/12 transition-opacity duration-200",
                collapsed ? "opacity-100" : "opacity-0",
              )}
            />
          </div>
          {group.items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <RailTooltip key={item.href} label={item.label} collapsed={collapsed}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150 outline-none",
                    "focus-visible:ring-cyan/60 focus-visible:ring-2",
                    isActive ? "bg-white/[0.09] text-white" : "text-white/70 hover:bg-white/[0.05] hover:text-white",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "bg-cyan absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full transition-opacity duration-150",
                      isActive ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <Icon
                    className={cn("size-[18px] shrink-0 transition-colors", isActive ? "text-cyan" : "text-white/60 group-hover:text-white/90")}
                    strokeWidth={1.75}
                  />
                  <span className={cn("truncate", labelFade(collapsed))}>{item.label}</span>
                </Link>
              </RailTooltip>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/**
 * Full-height navy navigation column carrying the Third Bridge mark. Takes
 * `role` rather than nav items because it's rendered from a Server Component
 * (the (app) layout) — icon component references can't cross that boundary,
 * a plain enum string can. Collapsed (icon rail) by default; the viewer's
 * choice persists in a cookie the layout reads, so `defaultExpanded` is
 * already correct on the server render.
 */
export function DesktopSidebar({ role, defaultExpanded = false }: { role: Role; defaultExpanded?: boolean }) {
  const [collapsed, setCollapsed] = useState(!defaultExpanded);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
  }

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "bg-navy hidden shrink-0 flex-col overflow-clip transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] md:flex",
          collapsed ? "w-[68px]" : "w-60",
        )}
      >
        <BrandBlock collapsed={collapsed} />
        <NavLinks groups={getNavGroups(role)} collapsed={collapsed} />
        <div className="border-t border-white/10 p-3">
          <RailTooltip label="Expand sidebar" collapsed={collapsed}>
            <button
              type="button"
              onClick={toggle}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              className="focus-visible:ring-cyan/60 flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[0.8125rem] font-medium text-white/60 transition-colors outline-none hover:bg-white/[0.05] hover:text-white focus-visible:ring-2"
            >
              {collapsed ? (
                <PanelLeftOpen className="size-[18px] shrink-0" strokeWidth={1.75} />
              ) : (
                <PanelLeftClose className="size-[18px] shrink-0" strokeWidth={1.75} />
              )}
              <span aria-hidden className={labelFade(collapsed)}>
                Collapse
              </span>
            </button>
          </RailTooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}

/** Hamburger + slide-out sheet, meant to sit inline in the top bar on mobile. */
export function MobileSidebar({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="bg-navy w-72 gap-0 border-none p-0 [&>button]:text-white/70 [&>button:hover]:bg-white/10 [&>button:hover]:text-white">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <BrandBlock />
        <TooltipProvider>
          <NavLinks groups={getNavGroups(role)} onNavigate={() => setOpen(false)} />
        </TooltipProvider>
      </SheetContent>
    </Sheet>
  );
}
