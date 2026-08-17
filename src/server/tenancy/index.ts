import "server-only";

import { db } from "@/server/db";
import { scopedDb, type ScopedDb } from "@/server/db/tenant-scope";

export type { ScopedDb };

/** The tRPC context's org-scoped Prisma client — see tenant-scope.ts for what it enforces. */
export function getScopedDb(organizationId: string) {
  return scopedDb(db, organizationId);
}

/** One-off cross-check for resources fetched by id before acting on them. */
export function assertSameOrg(callerOrganizationId: string, resourceOrganizationId: string): void {
  if (callerOrganizationId !== resourceOrganizationId) {
    throw new Error("Cross-organization access denied");
  }
}
