import { z } from "zod";

import { Role } from "@/generated/prisma/enums";
import { ASSIGNABLE_ROLES } from "@/lib/roles";

export const USER_STATUS_FILTERS = ["active", "inactive", "all"] as const;
export type UserStatusFilter = (typeof USER_STATUS_FILTERS)[number];

export const USER_SORT_FIELDS = ["name", "role", "email", "lastLoginAt"] as const;

/** Server-side directory query — paginated, never the whole company in one response. */
export const userDirectoryInputSchema = z.object({
  search: z.string().trim().max(120).default(""),
  role: z.nativeEnum(Role).optional(),
  status: z.enum(USER_STATUS_FILTERS).default("active"),
  sortBy: z.enum(USER_SORT_FIELDS).default("name"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
});
export type UserDirectoryInput = z.infer<typeof userDirectoryInputSchema>;

/** Only the four application roles may be assigned in-app. */
export const assignableRoleSchema = z.nativeEnum(Role).refine((role) => ASSIGNABLE_ROLES.includes(role), {
  message: "That role can't be assigned here.",
});

/**
 * User Details → Save User. Only the app-owned role is accepted: names, email,
 * title, department and location are Entra-owned and refresh on sign-in.
 */
export const userSaveInputSchema = z.object({
  userId: z.string().min(1),
  role: assignableRoleSchema,
});
export type UserSaveInput = z.infer<typeof userSaveInputSchema>;

export const sitePermissionInputSchema = z.object({
  userId: z.string().min(1),
  siteIds: z.array(z.string().min(1)).min(1, "Select at least one site").max(200),
});

export const removeSitePermissionInputSchema = z.object({
  userId: z.string().min(1),
  siteId: z.string().min(1),
});

export const deactivateUsersInputSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(500),
});
