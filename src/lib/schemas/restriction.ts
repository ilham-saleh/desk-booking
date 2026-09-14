import { z } from "zod";

export const departmentCreateInputSchema = z.object({
  name: z.string().min(1, "Department name required"),
});

export type DepartmentCreateInput = z.infer<typeof departmentCreateInputSchema>;

export const restrictionRuleSchema = z.object({
  fieldType: z.enum(["DEPARTMENT", "EMAIL", "USER"]),
  operator: z.enum(["IS", "IS_NOT", "IS_ANY_OF", "IS_NOT_ANY_OF"]),
  value: z.union([z.string(), z.array(z.string())]),
});

export type RestrictionRuleInput = z.infer<typeof restrictionRuleSchema>;

export const restrictionCreateInputSchema = z.object({
  name: z.string().min(1, "Restriction name required"),
  rules: z.array(restrictionRuleSchema).optional(),
});

export type RestrictionCreateInput = z.infer<typeof restrictionCreateInputSchema>;

export const restrictionUpdateInputSchema = restrictionCreateInputSchema.extend({
  restrictionId: z.string().min(1),
});

export type RestrictionUpdateInput = z.infer<typeof restrictionUpdateInputSchema>;
