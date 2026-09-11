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

export const floorPlanUploadInputSchema = z.object({
  floorId: z.string().min(1),
  fileName: z.string().min(1),
  fileSize: z.number().int().min(1),
  mimeType: z.string(),
});

export type FloorPlanUploadInput = z.infer<typeof floorPlanUploadInputSchema>;

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

  // ===== FLOOR PLAN VERSIONING =====

  /**
   * Get the current draft floor-plan version for a floor (or create one if none exists).
   * Used by the editor to load the current working copy.
   */
  getDraftFloorPlan: siteAdminProcedure
    .input(z.object({ floorId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const floor = await ctx.db.floor.findUnique({
        where: { id: input.floorId },
        include: { site: true },
      });
      if (!floor) throw new TRPCError({ code: "NOT_FOUND", message: "Floor not found." });

      await assertSiteAdmin(ctx, floor.siteId);

      // Try to find existing draft
      let draft = await ctx.db.floorPlanVersion.findFirst({
        where: { floorId: input.floorId, status: "DRAFT" },
      });

      // If no draft exists, create one from the live version
      if (!draft) {
        const live = await ctx.db.floorPlanVersion.findFirst({
          where: { floorId: input.floorId, status: "LIVE" },
        });

        draft = await ctx.db.floorPlanVersion.create({
          data: {
            organizationId: ctx.organizationId,
            floorId: input.floorId,
            status: "DRAFT",
            sourceFileKey: live?.sourceFileKey || "",
            renderedImageKey: live?.renderedImageKey,
            imageWidth: live?.imageWidth,
            imageHeight: live?.imageHeight,
            createdById: ctx.session.user.id,
          },
        });
      }

      return draft;
    }),

  /**
   * Publish a draft floor-plan version to live.
   * FACILITY_ADMIN or higher.
   */
  publishFloorPlan: siteAdminProcedure
    .input(z.object({ floorId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const floor = await ctx.db.floor.findUnique({
        where: { id: input.floorId },
        include: { site: true },
      });
      if (!floor) throw new TRPCError({ code: "NOT_FOUND", message: "Floor not found." });

      await assertSiteAdmin(ctx, floor.siteId);

      const draft = await ctx.db.floorPlanVersion.findFirst({
        where: { floorId: input.floorId, status: "DRAFT" },
      });
      if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "No draft to publish." });

      // Archive old live version if exists
      if (floor.livePlanVersionId) {
        await ctx.db.floorPlanVersion.update({
          where: { id: floor.livePlanVersionId },
          data: { status: "ARCHIVED" },
        });
      }

      // Promote draft to live
      const published = await ctx.db.floorPlanVersion.update({
        where: { id: draft.id },
        data: { status: "LIVE", publishedAt: new Date() },
      });

      // Update floor's live version reference
      await ctx.db.floor.update({
        where: { id: input.floorId },
        data: { livePlanVersionId: published.id },
      });

      // Audit log
      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "PUBLISH",
          targetType: "FloorPlan",
          targetId: input.floorId,
          after: { status: "LIVE" },
        },
      });

      return published;
    }),

  /**
   * Revert to a previous floor-plan version (create new draft from archived).
   * FACILITY_ADMIN or higher.
   */
  revertFloorPlan: siteAdminProcedure
    .input(
      z.object({
        floorId: z.string().min(1),
        versionId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const floor = await ctx.db.floor.findUnique({
        where: { id: input.floorId },
        include: { site: true },
      });
      if (!floor) throw new TRPCError({ code: "NOT_FOUND", message: "Floor not found." });

      await assertSiteAdmin(ctx, floor.siteId);

      const version = await ctx.db.floorPlanVersion.findUnique({
        where: { id: input.versionId },
      });
      if (!version || version.floorId !== input.floorId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found." });
      }

      // Create new draft from the archived version
      const newDraft = await ctx.db.floorPlanVersion.create({
        data: {
          organizationId: ctx.organizationId,
          floorId: input.floorId,
          status: "DRAFT",
          sourceFileKey: version.sourceFileKey,
          renderedImageKey: version.renderedImageKey,
          imageWidth: version.imageWidth,
          imageHeight: version.imageHeight,
          createdById: ctx.session.user.id,
        },
      });

      // Audit log
      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "REVERT",
          targetType: "FloorPlan",
          targetId: input.floorId,
          after: { revertedTo: input.versionId },
        },
      });

      return newDraft;
    }),

  /**
   * List all floor-plan versions for a floor (live + archived).
   */
  listFloorPlanVersions: orgProcedure
    .input(z.object({ floorId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const versions = await ctx.db.floorPlanVersion.findMany({
        where: { floorId: input.floorId, status: { in: ["LIVE", "ARCHIVED"] } },
        orderBy: { publishedAt: "desc" },
      });
      return versions;
    }),
});
