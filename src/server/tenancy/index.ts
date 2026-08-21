import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { scopedDb, type ScopedDb } from "@/server/db/tenant-scope";

export type { ScopedDb };

/**
 * The tRPC context's org-scoped Prisma client — see tenant-scope.ts for what
 * it enforces. Takes the raw client from the caller's own context (rather
 * than importing the `@/server/db` singleton itself) so tests can inject a
 * client pointed at DATABASE_URL_TEST via `appRouter.createCaller`.
 */
export function getScopedDb(rawDb: PrismaClient, organizationId: string) {
  return scopedDb(rawDb, organizationId);
}

/** One-off cross-check for resources fetched by id before acting on them. */
export function assertSameOrg(callerOrganizationId: string, resourceOrganizationId: string): void {
  if (callerOrganizationId !== resourceOrganizationId) {
    throw new Error("Cross-organization access denied");
  }
}
