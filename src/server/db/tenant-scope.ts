import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Every tenant-owned model — each carries an explicit `organizationId` column
 * (CLAUDE.md rule 1). Organization itself is excluded: it's the tenant, not
 * tenant-owned.
 */
const TENANT_MODELS = new Set([
  "User",
  "Permission",
  "Site",
  "Floor",
  "FloorPlanVersion",
  "Desk",
  "Room",
  "Utility",
  "Booking",
  "DeskWatch",
  "Notification",
  "AuditLog",
  "Department",
  "BookingRestriction",
  "AvailabilityShift",
  "DeskRestrictionAssignment",
  "DeskAttribute",
  "SiteOperatingHours",
]);

const UNIQUE_WHERE_OPERATIONS = new Set(["findUnique", "findUniqueOrThrow", "update", "delete"]);
const FILTER_WHERE_OPERATIONS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
]);

function assertOwnedByOrg(model: string, value: unknown, organizationId: string): void {
  if (value !== undefined && value !== organizationId) {
    throw new Error(
      `Tenant scope violation: attempted to write a ${model} row for a different organization`,
    );
  }
}

/**
 * Wraps a raw Prisma client so every read/write against a tenant-owned model
 * is centrally scoped to one organization — callers can never see or affect
 * another organization's rows, and can never override the scope by passing
 * their own `organizationId`.
 *
 * Limitation: this only rewrites top-level `where`/`data`. Nested relation
 * writes (e.g. `data: { desks: { create: [...] } } }`) are NOT auto-scoped —
 * pass `organizationId` explicitly on any nested create until a future phase
 * needs (and adds) recursive handling.
 */
export function scopedDb(db: PrismaClient, organizationId: string) {
  return db.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) {
            return query(args);
          }

          const scopedArgs = args as Record<string, unknown>;

          if (UNIQUE_WHERE_OPERATIONS.has(operation) || FILTER_WHERE_OPERATIONS.has(operation)) {
            scopedArgs.where = { ...(scopedArgs.where as object | undefined), organizationId };
          }

          if (operation === "create") {
            const data = scopedArgs.data as Record<string, unknown>;
            assertOwnedByOrg(model, data.organizationId, organizationId);
            scopedArgs.data = { ...data, organizationId };
          }

          if (operation === "createMany") {
            const rows = scopedArgs.data as Record<string, unknown>[];
            scopedArgs.data = rows.map((row) => {
              assertOwnedByOrg(model, row.organizationId, organizationId);
              return { ...row, organizationId };
            });
          }

          if (operation === "upsert") {
            scopedArgs.where = { ...(scopedArgs.where as object | undefined), organizationId };
            const createData = scopedArgs.create as Record<string, unknown>;
            assertOwnedByOrg(model, createData.organizationId, organizationId);
            scopedArgs.create = { ...createData, organizationId };
            scopedArgs.update = { ...(scopedArgs.update as object | undefined), organizationId };
          }

          return query(scopedArgs);
        },
      },
    },
  });
}

export type ScopedDb = ReturnType<typeof scopedDb>;
