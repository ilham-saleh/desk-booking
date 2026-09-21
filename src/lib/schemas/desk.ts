import { z } from "zod";

/** Shared between the Edit Desk modal (client) and the desk router (server). */

export const deskRestrictionModeSchema = z.enum(["ANYONE", "ASSIGNED_OCCUPANTS", "DEPARTMENT", "CUSTOM"]);
export const MAX_BLOCK_OCCUPANTS = 10;
export const deskAssignmentModeSchema = z.enum(["BOOKABLE", "ASSIGNED"]);

/** One "restriction block" on the desk: who may book + on which shift + how far ahead. */
export const deskRestrictionAssignmentInputSchema = z
  .object({
    restrictionMode: deskRestrictionModeSchema,
    restrictionId: z.string().min(1).nullable().optional(),
    /** ASSIGNED_OCCUPANTS: the people admitted (user ids). */
    occupantUserIds: z.array(z.string().min(1)).max(MAX_BLOCK_OCCUPANTS, `Up to ${MAX_BLOCK_OCCUPANTS} occupants per block`).default([]),
    /** DEPARTMENT: department names admitted, as they appear on employee records. */
    departmentNames: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
    shiftId: z.string().min(1, "Choose an availability shift"),
    advanceBookingWindowDays: z.number().int().min(1).max(730).nullable().optional(),
  })
  .superRefine((block, ctx) => {
    if (block.restrictionMode === "CUSTOM" && !block.restrictionId) {
      ctx.addIssue({ code: "custom", path: ["restrictionId"], message: "Choose a custom restriction" });
    }
    if (block.restrictionMode === "ASSIGNED_OCCUPANTS" && block.occupantUserIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["occupantUserIds"], message: "Add at least one occupant" });
    }
    if (block.restrictionMode === "DEPARTMENT" && block.departmentNames.length === 0) {
      ctx.addIssue({ code: "custom", path: ["departmentNames"], message: "Choose at least one department" });
    }
  });

export type DeskRestrictionAssignmentInput = z.infer<typeof deskRestrictionAssignmentInputSchema>;

export const deskNameSchema = z.string().trim().min(1, "Desk name is required").max(60);

/** Everything the Edit Desk modal's Save button persists, in one transaction. */
export const deskSaveInputSchema = z.object({
  deskId: z.string().min(1),
  number: deskNameSchema,
  description: z.string().trim().max(1000).nullable().optional(),
  spaceType: z.string().trim().max(60).nullable().optional(),
  isActive: z.boolean(),
  requiresCheckIn: z.boolean(),
  assignmentMode: deskAssignmentModeSchema,
  assignedOccupantId: z.string().min(1).nullable().optional(),
  /** Attribute type keys, e.g. "STANDING_DESK". Replaces the desk's current set. */
  attributes: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  /** Replaces the desk's current restriction blocks, in display order. */
  assignments: z.array(deskRestrictionAssignmentInputSchema).max(20).default([]),
});

export type DeskSaveInput = z.infer<typeof deskSaveInputSchema>;

export const deskCreateInputSchema = z.object({
  floorId: z.string().min(1),
  /** Omit to let the server pick the next free "Desk N" name for the floor. */
  number: deskNameSchema.optional(),
  x: z.number().min(0),
  y: z.number().min(0),
});

export type DeskCreateInput = z.infer<typeof deskCreateInputSchema>;

export const deskMoveInputSchema = z.object({
  deskId: z.string().min(1),
  x: z.number().min(0),
  y: z.number().min(0),
});

export type DeskMoveInput = z.infer<typeof deskMoveInputSchema>;

/** Well-known desk attributes offered in the editor; any other key is still stored verbatim. */
export const DESK_ATTRIBUTE_OPTIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "STANDING_DESK", label: "Standing desk" },
  { key: "DUAL_MONITORS", label: "Dual monitors" },
  { key: "SINGLE_MONITOR", label: "Single monitor" },
  { key: "DOCKING_STATION", label: "Docking station" },
  { key: "ACCESSIBLE", label: "Accessible desk" },
  { key: "NEAR_WINDOW", label: "Near window" },
  { key: "QUIET_ZONE", label: "Quiet zone" },
  { key: "PHONE_FRIENDLY", label: "Phone-friendly" },
];
