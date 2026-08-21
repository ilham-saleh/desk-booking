import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, orgProcedure } from "@/server/api/trpc";

export const floorRouter = createTRPCRouter({
  listForSite: orgProcedure.input(z.object({ siteId: z.string().min(1) })).query(({ ctx, input }) =>
    ctx.db.floor.findMany({
      where: { siteId: input.siteId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ),

  /** Static floor-map data (background image, desks, rooms, utilities) — see booking.getFloorAvailability for live desk state. */
  get: orgProcedure.input(z.object({ floorId: z.string().min(1) })).query(async ({ ctx, input }) => {
    const floor = await ctx.db.floor.findUnique({
      where: { id: input.floorId },
      include: {
        site: true,
        livePlanVersion: true,
        desks: { orderBy: { number: "asc" } },
        rooms: true,
        utilities: true,
      },
    });
    if (!floor) throw new TRPCError({ code: "NOT_FOUND", message: "Floor not found." });
    return floor;
  }),
});
