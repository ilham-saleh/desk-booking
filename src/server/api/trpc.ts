import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { flattenError, ZodError } from "zod";

import { getSession } from "@/server/auth";
import { canAdministerSite, isSiteAdmin, isSuperAdmin } from "@/server/auth/roles";
import { db } from "@/server/db";

export function createTRPCContext(opts: { headers: Headers }) {
  return {
    db,
    session: getSession(),
    headers: opts.headers,
  };
}

type Context = ReturnType<typeof createTRPCContext>;

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

/** Requires a signed-in user. Available to all three roles. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

/**
 * Requires SITE_ADMIN or SUPER_ADMIN. Only confirms the role — callers that
 * act on a specific site must additionally call `assertSiteAdmin` with that
 * site's ID, since a Site Admin's scope always has to be re-checked per call
 * (CLAUDE.md rule 9: never trust a client-supplied site ID for authorization).
 */
export const siteAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isSiteAdmin(ctx.session)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

export const superAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isSuperAdmin(ctx.session)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

/** Call inside a siteAdminProcedure handler once the target siteId is known. */
export function assertSiteAdmin(session: Context["session"], siteId: string) {
  if (!canAdministerSite(session, siteId)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}
