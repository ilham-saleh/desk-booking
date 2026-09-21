"use client";

import Link from "next/link";
import { Bell, Search } from "lucide-react";

import type { Role } from "@/generated/prisma/enums";
import { roleLabel } from "@/lib/roles";
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
import { Input } from "@/components/ui/input";
import { MobileSidebar } from "@/components/layout/sidebar";

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

  return (
    <header className="flex h-14 items-center gap-3 border-b px-4">
      <MobileSidebar role={user.role} />

      <Link href="/home" className="mr-2 shrink-0 font-semibold">
        Desk Booking
      </Link>

      <div className="relative max-w-sm flex-1">
        <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input placeholder="Search desks, people, bookings…" className="pl-8" disabled />
      </div>

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
          <DropdownMenuItem disabled>Log out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
