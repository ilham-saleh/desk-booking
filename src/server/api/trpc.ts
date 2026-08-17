import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { flattenError, ZodError } from "zod";

import { auth } from "@/server/auth";
import { isOrgSuperAdmin, isPlatformAdmin, isSiteAdminRole, type Session } from "@/server/auth/roles";
import { db } from "@/server/db";
import { getScopedDb, type ScopedDb } from "@/server/tenancy";

export async function createTRPCContext(opts: { headers: Headers }) {
  const session = await auth();
  return {
    db,
    session: session as Session | null,
    headers: opts.headers,
  };
}

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? flattenError(error.cause) : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

/** Requires a signed-in user. Available to all four roles. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

/**
 * Base for every org-facing router: requires the caller to belong to an
 * organization (rejects PLATFORM_ADMIN, who belongs to none) and swaps
 * `ctx.db` for the tenant-scoped client — see src/server/db/tenant-scope.ts.
 */
export const orgProcedure = protectedProcedure.use(({ ctx, next }) => {
  const { organizationId } = ctx.session.user;
  if (!organizationId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx: { ...ctx, db: getScopedDb(organizationId), organizationId } });
});

/**
 * Requires SITE_ADMIN or ORG_SUPER_ADMIN. Only confirms the role — callers
 * that act on a specific site must additionally call `assertSiteAdmin` with
 * that site's ID, since a Site Admin's scope always has to be re-checked
 * live (CLAUDE.md rule 10: never trust anything cached for authorization).
 */
export const siteAdminProcedure = orgProcedure.use(({ ctx, next }) => {
  if (!isSiteAdminRole(ctx.session)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

export const orgAdminProcedure = orgProcedure.use(({ ctx, next }) => {
  if (!isOrgSuperAdmin(ctx.session)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

/** Platform Admin only. `ctx.db` stays the raw, unscoped client — the only procedure family that may see cross-org data. */
export const platformAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isPlatformAdmin(ctx.session)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

/** Call inside a siteAdminProcedure handler once the target siteId is known. */
export async function assertSiteAdmin(
  ctx: { db: ScopedDb; session: Session },
  siteId: string,
): Promise<void> {
  if (isOrgSuperAdmin(ctx.session)) return;

  const permission = await ctx.db.permission.findUnique({
    where: { userId_siteId: { userId: ctx.session.user.id, siteId } },
  });
  if (!permission) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}
