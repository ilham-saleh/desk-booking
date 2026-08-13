import "server-only";

import { Role } from "@/generated/prisma/enums";

import type { Session } from "./roles";

/**
 * Phase 0 stand-in for Auth.js. This is the one function Phase 1 replaces
 * with a real `auth()` call — every caller already goes through here, so
 * swapping the implementation is a one-file change.
 */
export function getSession(): Session {
  return {
    user: {
      id: "seed-super-admin",
      name: "Alex Super",
      email: "alex.super@example.com",
      role: Role.SUPER_ADMIN,
      adminSiteIds: [],
    },
  };
}
