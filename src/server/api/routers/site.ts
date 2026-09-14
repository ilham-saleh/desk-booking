import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, orgProcedure } from "@/server/api/trpc";

export const siteRouter = createTRPCRouter({
  /** For the site picker in the "Book a Desk" flow. */
  list: orgProcedure.query(({ ctx }) =>
    ctx.db.site.findMany({
      orderBy: { name: "asc" },
      include: { floors: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true } } },
    }),
  ),

  get: orgProcedure.input(z.object({ siteId: z.string().min(1) })).query(async ({ ctx, input }) => {
    const site = await ctx.db.site.findUnique({ where: { id: input.siteId } });
    if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Site not found." });
    return site;
  }),
});
