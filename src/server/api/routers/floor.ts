import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, orgProcedure, siteAdminProcedure, assertSiteAdmin } from "@/server/api/trpc";

export const floorCreateInputSchema = z.object({
  siteId: z.string().min(1),
  name: z.string().min(1, "Floor name required"),
  description: z.string().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export type FloorCreateInput = z.infer<typeof floorCreateInputSchema>;

export const floorUpdateInputSchema = z.object({
  floorId: z.string().min(1),
  name: z.string().min(1, "Floor name required"),
  description: z.string().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export type FloorUpdateInput = z.infer<typeof floorUpdateInputSchema>;

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

  /**
   * Create a new floor within a facility.
   * Requires FACILITY_ADMIN permission for the site.
   */
  create: siteAdminProcedure.input(floorCreateInputSchema).mutation(async ({ ctx, input }) => {
    await assertSiteAdmin(ctx, input.siteId);

    // Verify site exists
    const site = await ctx.db.site.findUnique({ where: { id: input.siteId } });
    if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Facility not found." });

    // Get next sort order
    const lastFloor = await ctx.db.floor.findFirst({
      where: { siteId: input.siteId },
      orderBy: { sortOrder: "desc" },
    });
    const nextSortOrder = (lastFloor?.sortOrder ?? -1) + 1;

    const floor = await ctx.db.floor.create({
      data: {
        organizationId: ctx.organizationId,
        siteId: input.siteId,
        name: input.name,
        sortOrder: input.sortOrder ?? nextSortOrder,
      },
    });

    // Audit log
    await ctx.db.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.session.user.id,
        action: "CREATE",
        targetType: "Floor",
        targetId: floor.id,
        after: { name: floor.name, siteId: input.siteId },
      },
    });

    return floor;
  }),

  /**
   * Update a floor.
   * Requires FACILITY_ADMIN permission for the floor's parent site.
   */
  update: siteAdminProcedure.input(floorUpdateInputSchema).mutation(async ({ ctx, input }) => {
    const floor = await ctx.db.floor.findUnique({ where: { id: input.floorId } });
    if (!floor) throw new TRPCError({ code: "NOT_FOUND", message: "Floor not found." });

    await assertSiteAdmin(ctx, floor.siteId);

    const updated = await ctx.db.floor.update({
      where: { id: input.floorId },
      data: {
        name: input.name,
        sortOrder: input.sortOrder,
      },
    });

    // Audit log
    await ctx.db.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.session.user.id,
        action: "UPDATE",
        targetType: "Floor",
        targetId: floor.id,
        before: { name: floor.name },
        after: { name: updated.name },
      },
    });

    return updated;
  }),

  /**
   * Delete a floor (cascade deletes desks, rooms, utilities).
   * Requires FACILITY_ADMIN permission for the floor's parent site.
   */
  delete: siteAdminProcedure.input(z.object({ floorId: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const floor = await ctx.db.floor.findUnique({ where: { id: input.floorId } });
    if (!floor) throw new TRPCError({ code: "NOT_FOUND", message: "Floor not found." });

    await assertSiteAdmin(ctx, floor.siteId);

    await ctx.db.floor.delete({ where: { id: input.floorId } });

    // Audit log
    await ctx.db.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.session.user.id,
        action: "DELETE",
        targetType: "Floor",
        targetId: floor.id,
        before: { name: floor.name },
      },
    });
  }),

  /**
   * Reorder floors within a site.
   * Pass array of { floorId, sortOrder } to set new order.
   */
  reorder: siteAdminProcedure
    .input(
      z.object({
        siteId: z.string().min(1),
        floors: z.array(
          z.object({
            floorId: z.string().min(1),
            sortOrder: z.number().int().min(0),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertSiteAdmin(ctx, input.siteId);

      // Batch update all floor sort orders
      await Promise.all(
        input.floors.map((f) =>
          ctx.db.floor.update({
            where: { id: f.floorId },
            data: { sortOrder: f.sortOrder },
          }),
        ),
      );

      // Audit log
      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "UPDATE",
          targetType: "FloorOrder",
          targetId: input.siteId,
          after: { floors: input.floors.length },
        },
      });
    }),
});
