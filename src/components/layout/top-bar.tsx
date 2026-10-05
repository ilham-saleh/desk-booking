"use client";

import { useRouter } from "next/navigation";
import { Bell, ChevronDown, LogOut } from "lucide-react";

import type { Role } from "@/generated/prisma/enums";
import { roleLabel } from "@/lib/roles";
import { signOutAction } from "@/server/auth/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MobileSidebar } from "@/components/layout/sidebar";
import { BrandMark } from "@/components/layout/brand-mark";
import { GlobalSearch } from "@/components/search/global-search";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function TopBar({ user }: { user: { name: string; email: string; role: Role } }) {
  const unreadNotifications = 0;
  const router = useRouter();

  return (
    <header className="bg-surface/95 supports-[backdrop-filter]:bg-surface/85 relative z-30 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur md:px-5">
      <MobileSidebar role={user.role} />
      <BrandMark size={28} className="md:hidden" />

      {/* Picking a result deep-links into the Floor Map: the desk is highlighted, or the person's card opens. */}
      <GlobalSearch
        className="max-w-md flex-1"
        hideLabel
        placeholder="Search desks or people…"
        onPickDesk={(desk) =>
          router.push(
            `/floor-map?${new URLSearchParams({ site: desk.floor.site.id, floor: desk.floor.id, desk: desk.id })}`,
          )
        }
        onPickPerson={(person) => router.push(`/floor-map?${new URLSearchParams({ person: person.id })}`)}
      />

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative" disabled>
          <Bell className="size-[18px]" strokeWidth={1.75} />
          {unreadNotifications > 0 && (
            <Badge className="absolute -top-1 -right-1 size-5 justify-center rounded-full p-0 text-[10px]">
              {unreadNotifications}
            </Badge>
          )}
        </Button>

        <span aria-hidden className="bg-border mx-1.5 h-6 w-px" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="hover:bg-surface-muted focus-visible:ring-cyan/40 data-[state=open]:bg-surface-muted flex h-10 items-center gap-2.5 rounded-full py-1 pr-2.5 pl-1 transition-colors outline-none focus-visible:ring-[3px]"
            >
              <Avatar className="size-8">
                <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
              </Avatar>
              <span className="hidden min-w-0 flex-col text-left leading-tight sm:flex">
                <span className="text-foreground max-w-40 truncate text-[0.8125rem] font-semibold">{user.name}</span>
                <span className="text-muted-foreground text-[0.6875rem]">{roleLabel(user.role)}</span>
              </span>
              <ChevronDown className="text-muted-foreground hidden size-3.5 sm:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="flex items-center gap-3 py-2">
              <Avatar className="size-9">
                <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
              </Avatar>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold">{user.name}</span>
                <span className="text-muted-foreground truncate text-xs font-normal">{user.email}</span>
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>Account</DropdownMenuItem>
            <DropdownMenuItem disabled>Preferences</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void signOutAction()}>
              <LogOut /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
