import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import {
  CalendarCheck,
  LayoutDashboard,
  MapPinned,
  PencilRuler,
  Building2,
  Users,
  SquareStack,
} from "lucide-react";

import { Role } from "@/generated/prisma/enums";

export interface NavItem {
  label: string;
  href: Route;
  icon: LucideIcon;
}

const userNavItems: NavItem[] = [
  { label: "Home", href: "/home", icon: LayoutDashboard },
  { label: "My Bookings", href: "/bookings", icon: CalendarCheck },
  { label: "Book a Desk", href: "/book", icon: SquareStack },
  { label: "Floor Map", href: "/floor-map", icon: MapPinned },
];

const adminNavItems: NavItem[] = [
  { label: "Editing Platform", href: "/admin/editor", icon: PencilRuler },
  { label: "Facilities / Sites", href: "/admin/sites", icon: Building2 },
  { label: "Users", href: "/admin/users", icon: Users },
];

/** Display concern only — actual authorization is re-checked server-side on every request. */
function isAdminRole(role: Role): boolean {
  return role === Role.SITE_ADMIN || role === Role.ORG_SUPER_ADMIN;
}

export function getNavItems(role: Role): NavItem[] {
  // Admin roles (FACILITY_ADMIN/SITE_ADMIN, ORG_SUPER_ADMIN) see employee + admin nav
  if (isAdminRole(role)) {
    return [...userNavItems, ...adminNavItems];
  }

  // All other roles (BOOKING_MANAGER, STANDARD_USER) see employee nav only
  // (BOOKING_MANAGER gets extended booking UI, not separate nav items)
  return userNavItems;
}
