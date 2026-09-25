import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, siteAdminProcedure, assertSiteAdmin } from "@/server/api/trpc";
import { RestrictionFieldType, RestrictionOperator, RuleConnector } from "@/generated/prisma/enums";

const neighbourhoodInputSchema = z.object({
  name: z.string().min(1, "Neighbourhood name is required"),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "Invalid color format"),
  description: z.string().optional(),
  captain: z.string().optional(),
  imageUrl: z.string().optional(),
});

const neighbourhoodRuleSchema = z.object({
  fieldType: z.nativeEnum(RestrictionFieldType),
  operator: z.nativeEnum(RestrictionOperator),
  value: z.array(z.string()),
  connector: z.nativeEnum(RuleConnector).default(RuleConnector.OR),
  sortOrder: z.number().default(0),
});

export const neighbourhoodRouter = createTRPCRouter({
  /**
   * List neighbourhoods for a floor.
   */
  listForFloor: siteAdminProcedure
    .input(z.object({ floorId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const floor = await ctx.db.floor.findUnique({
        where: { id: input.floorId },
        select: { siteId: true },
      });
      if (!floor) throw new TRPCError({ code: "NOT_FOUND", message: "Floor not found." });

      await assertSiteAdmin(ctx, floor.siteId);

      return ctx.db.neighbourhood.findMany({
        where: { floorId: input.floorId },
        include: {
          desks: { select: { deskId: true } },
          members: { select: { userId: true } },
          rules: { orderBy: { sortOrder: "asc" } },
        },
        orderBy: { name: "asc" },
      });
    }),

  /**
   * Get a single neighbourhood with full details.
   */
  get: siteAdminProcedure
    .input(z.object({ neighbourhoodId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const neighbourhood = await ctx.db.neighbourhood.findUnique({
        where: { id: input.neighbourhoodId },
        include: {
          floor: { select: { siteId: true } },
          desks: { include: { desk: true } },
          members: { include: { user: true } },
          rules: { orderBy: { sortOrder: "asc" } },
        },
      });
      if (!neighbourhood) throw new TRPCError({ code: "NOT_FOUND", message: "Neighbourhood not found." });

      await assertSiteAdmin(ctx, neighbourhood.floor.siteId);

      return neighbourhood;
    }),

  /**
   * Create a new neighbourhood.
   * Requires FACILITY_ADMIN permission for the site.
   */
  create: siteAdminProcedure
    .input(
      z.object({
        floorId: z.string().min(1),
        ...neighbourhoodInputSchema.shape,
        deskIds: z.array(z.string()),
        members: z
          .object({
            userIds: z.array(z.string()),
            rules: z.array(neighbourhoodRuleSchema),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const floor = await ctx.db.floor.findUnique({
        where: { id: input.floorId },
        select: { siteId: true },
      });
      if (!floor) throw new TRPCError({ code: "NOT_FOUND", message: "Floor not found." });

      await assertSiteAdmin(ctx, floor.siteId);

      // Verify all desks exist and belong to this floor
      const desks = await ctx.db.desk.findMany({
        where: {
          id: { in: input.deskIds },
          floorId: input.floorId,
        },
      });
      if (desks.length !== input.deskIds.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Some desks not found or don't belong to this floor." });
      }

      // Check for duplicate neighbourhood name on this floor
      const existing = await ctx.db.neighbourhood.findFirst({
        where: { floorId: input.floorId, name: input.name },
      });
      if (existing) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Neighbourhood "${input.name}" already exists on this floor.` });
      }

      const neighbourhood = await ctx.db.neighbourhood.create({
        data: {
          organizationId: ctx.organizationId,
          floorId: input.floorId,
          name: input.name,
          color: input.color,
          description: input.description,
          captain: input.captain,
          imageUrl: input.imageUrl,
          desks: {
            createMany: {
              data: input.deskIds.map((deskId) => ({ deskId })),
            },
          },
          members:
            input.members && input.members.userIds.length > 0
              ? {
                  createMany: {
                    data: input.members.userIds.map((userId) => ({ userId })),
                  },
                }
              : undefined,
          rules:
            input.members && input.members.rules.length > 0
              ? {
                  createMany: {
                    data: input.members.rules,
                  },
                }
              : undefined,
        },
        include: {
          desks: { include: { desk: true } },
          members: { include: { user: true } },
          rules: { orderBy: { sortOrder: "asc" } },
        },
      });

      // Audit log
      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "CREATE",
          targetType: "Neighbourhood",
          targetId: neighbourhood.id,
          after: { name: neighbourhood.name, floorId: input.floorId },
        },
      });

      return neighbourhood;
    }),

  /**
   * Update an existing neighbourhood.
   * Requires FACILITY_ADMIN permission for the site.
   */
  update: siteAdminProcedure
    .input(
      z.object({
        neighbourhoodId: z.string().min(1),
        ...neighbourhoodInputSchema.shape,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const neighbourhood = await ctx.db.neighbourhood.findUnique({
        where: { id: input.neighbourhoodId },
        include: { floor: { select: { siteId: true } } },
      });
      if (!neighbourhood) throw new TRPCError({ code: "NOT_FOUND", message: "Neighbourhood not found." });

      await assertSiteAdmin(ctx, neighbourhood.floor.siteId);

      // Check for duplicate name on same floor (if name changed)
      if (input.name !== neighbourhood.name) {
        const existing = await ctx.db.neighbourhood.findFirst({
          where: { floorId: neighbourhood.floorId, name: input.name },
        });
        if (existing) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Neighbourhood "${input.name}" already exists on this floor.` });
        }
      }

      const updated = await ctx.db.neighbourhood.update({
        where: { id: input.neighbourhoodId },
        data: {
          name: input.name,
          color: input.color,
          description: input.description,
          captain: input.captain,
          imageUrl: input.imageUrl,
        },
        include: {
          desks: { include: { desk: true } },
          members: { include: { user: true } },
          rules: { orderBy: { sortOrder: "asc" } },
        },
      });

      // Audit log
      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "UPDATE",
          targetType: "Neighbourhood",
          targetId: neighbourhood.id,
          before: { name: neighbourhood.name, color: neighbourhood.color },
          after: { name: updated.name, color: updated.color },
        },
      });

      return updated;
    }),

  /**
   * Delete a neighbourhood.
   * Does NOT delete its desks.
   * Requires FACILITY_ADMIN permission for the site.
   */
  delete: siteAdminProcedure.input(z.object({ neighbourhoodId: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const neighbourhood = await ctx.db.neighbourhood.findUnique({
      where: { id: input.neighbourhoodId },
      include: { floor: { select: { siteId: true } } },
    });
    if (!neighbourhood) throw new TRPCError({ code: "NOT_FOUND", message: "Neighbourhood not found." });

    await assertSiteAdmin(ctx, neighbourhood.floor.siteId);

    await ctx.db.neighbourhood.delete({ where: { id: input.neighbourhoodId } });

    // Audit log
    await ctx.db.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.session.user.id,
        action: "DELETE",
        targetType: "Neighbourhood",
        targetId: neighbourhood.id,
        before: { name: neighbourhood.name },
      },
    });
  }),

  /**
   * Update desks assigned to a neighbourhood.
   */
  updateDesks: siteAdminProcedure
    .input(
      z.object({
        neighbourhoodId: z.string().min(1),
        deskIds: z.array(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const neighbourhood = await ctx.db.neighbourhood.findUnique({
        where: { id: input.neighbourhoodId },
        include: { floor: { select: { siteId: true, id: true } } },
      });
      if (!neighbourhood) throw new TRPCError({ code: "NOT_FOUND", message: "Neighbourhood not found." });

      await assertSiteAdmin(ctx, neighbourhood.floor.siteId);

      // Verify all desks exist and belong to this floor
      const desks = await ctx.db.desk.findMany({
        where: {
          id: { in: input.deskIds },
          floorId: neighbourhood.floor.id,
        },
      });
      if (desks.length !== input.deskIds.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Some desks not found or don't belong to this floor." });
      }

      // Replace desks
      await ctx.db.neighbourhoodDesk.deleteMany({ where: { neighbourhoodId: input.neighbourhoodId } });
      await ctx.db.neighbourhoodDesk.createMany({
        data: input.deskIds.map((deskId) => ({
          neighbourhoodId: input.neighbourhoodId,
          deskId,
        })),
      });

      const updated = await ctx.db.neighbourhood.findUnique({
        where: { id: input.neighbourhoodId },
        include: {
          desks: { include: { desk: true } },
          members: { include: { user: true } },
          rules: { orderBy: { sortOrder: "asc" } },
        },
      });

      return updated;
    }),

  /**
   * Update members (manual user assignments) for a neighbourhood.
   */
  updateMembers: siteAdminProcedure
    .input(
      z.object({
        neighbourhoodId: z.string().min(1),
        userIds: z.array(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const neighbourhood = await ctx.db.neighbourhood.findUnique({
        where: { id: input.neighbourhoodId },
        include: { floor: { select: { siteId: true } } },
      });
      if (!neighbourhood) throw new TRPCError({ code: "NOT_FOUND", message: "Neighbourhood not found." });

      await assertSiteAdmin(ctx, neighbourhood.floor.siteId);

      // Replace members
      await ctx.db.neighbourhoodMember.deleteMany({ where: { neighbourhoodId: input.neighbourhoodId } });
      if (input.userIds.length > 0) {
        await ctx.db.neighbourhoodMember.createMany({
          data: input.userIds.map((userId) => ({
            neighbourhoodId: input.neighbourhoodId,
            userId,
          })),
        });
      }

      const updated = await ctx.db.neighbourhood.findUnique({
        where: { id: input.neighbourhoodId },
        include: {
          desks: { include: { desk: true } },
          members: { include: { user: true } },
          rules: { orderBy: { sortOrder: "asc" } },
        },
      });

      return updated;
    }),

  /**
   * Update member rules (auto-matching criteria) for a neighbourhood.
   */
  updateRules: siteAdminProcedure
    .input(
      z.object({
        neighbourhoodId: z.string().min(1),
        rules: z.array(neighbourhoodRuleSchema),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const neighbourhood = await ctx.db.neighbourhood.findUnique({
        where: { id: input.neighbourhoodId },
        include: { floor: { select: { siteId: true } } },
      });
      if (!neighbourhood) throw new TRPCError({ code: "NOT_FOUND", message: "Neighbourhood not found." });

      await assertSiteAdmin(ctx, neighbourhood.floor.siteId);

      // Replace rules
      await ctx.db.neighbourhoodRule.deleteMany({ where: { neighbourhoodId: input.neighbourhoodId } });
      if (input.rules.length > 0) {
        await ctx.db.neighbourhoodRule.createMany({
          data: input.rules.map((rule) => ({
            neighbourhoodId: input.neighbourhoodId,
            ...rule,
          })),
        });
      }

      const updated = await ctx.db.neighbourhood.findUnique({
        where: { id: input.neighbourhoodId },
        include: {
          desks: { include: { desk: true } },
          members: { include: { user: true } },
          rules: { orderBy: { sortOrder: "asc" } },
        },
      });

      return updated;
    }),
});
