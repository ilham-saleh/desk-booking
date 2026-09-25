"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";

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
    <header className="flex h-14 items-center gap-3 border-b px-4">
      <MobileSidebar role={user.role} />

      <Link href="/home" className="mr-2 shrink-0 font-semibold">
        Desk Booking
      </Link>

      {/* Picking a result deep-links into the Floor Map: the desk is highlighted, or the person's card opens. */}
      <GlobalSearch
        className="max-w-sm flex-1"
        hideLabel
        placeholder="Search desks or people…"
        onPickDesk={(desk) =>
          router.push(
            `/floor-map?${new URLSearchParams({ site: desk.floor.site.id, floor: desk.floor.id, desk: desk.id })}`,
          )
        }
        onPickPerson={(person) => router.push(`/floor-map?${new URLSearchParams({ person: person.id })}`)}
      />

      <Button variant="ghost" size="icon" aria-label="Notifications" className="relative" disabled>
        <Bell className="size-5" />
        {unreadNotifications > 0 && (
          <Badge className="absolute -top-1 -right-1 size-5 justify-center rounded-full p-0 text-[10px]">
            {unreadNotifications}
          </Badge>
        )}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2 px-2">
            <Avatar className="size-7">
              <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
            </Avatar>
            <span className="hidden text-sm font-medium sm:inline">{user.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col">
            <span className="font-medium">{user.name}</span>
            <span className="text-muted-foreground text-xs font-normal">{user.email}</span>
            <span className="text-muted-foreground text-xs font-normal">{roleLabel(user.role)}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>Account</DropdownMenuItem>
          <DropdownMenuItem disabled>Preferences</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void signOutAction()}>Log out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
