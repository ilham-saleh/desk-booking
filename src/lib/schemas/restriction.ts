import { z } from "zod";

export const departmentCreateInputSchema = z.object({
  name: z.string().min(1, "Department name required"),
});

export type DepartmentCreateInput = z.infer<typeof departmentCreateInputSchema>;

export const restrictionFieldTypeSchema = z.enum(["DEPARTMENT", "EMAIL", "USER"]);
export const restrictionOperatorSchema = z.enum(["IS", "IS_NOT", "IS_ANY_OF", "IS_NOT_ANY_OF", "IS_EMPTY", "IS_NOT_EMPTY"]);
export const ruleConnectorSchema = z.enum(["AND", "OR"]);

export const restrictionRuleSchema = z
  .object({
    fieldType: restrictionFieldTypeSchema,
    operator: restrictionOperatorSchema,
    value: z.array(z.string().trim().min(1)).max(500),
    /** How this rule joins the previous one; ignored on the first rule. */
    connector: ruleConnectorSchema.default("OR"),
  })
  .superRefine((rule, ctx) => {
    const count = rule.value.length;
    if ((rule.operator === "IS" || rule.operator === "IS_NOT") && count !== 1) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "Choose exactly one value for 'is' / 'is not'" });
    }
    if ((rule.operator === "IS_ANY_OF" || rule.operator === "IS_NOT_ANY_OF") && count === 0) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "Choose at least one value" });
    }
  });

export type RestrictionRuleInput = z.infer<typeof restrictionRuleSchema>;

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colour must be a hex value like #2563eb");

export const restrictionCreateInputSchema = z.object({
  name: z.string().trim().min(1, "Restriction name required").max(120),
  color: hexColorSchema.nullable().optional(),
  rules: z.array(restrictionRuleSchema).max(50).default([]),
});

export type RestrictionCreateInput = z.infer<typeof restrictionCreateInputSchema>;

export const restrictionUpdateInputSchema = restrictionCreateInputSchema.extend({
  restrictionId: z.string().min(1),
});

export type RestrictionUpdateInput = z.infer<typeof restrictionUpdateInputSchema>;

/** Reusable availability shift (named weekday set). */
export const shiftCreateInputSchema = z
  .object({
    name: z.string().trim().min(1, "Shift name required").max(80),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one day").max(7),
    startTimeMinutes: z.number().int().min(0).max(1440).nullable().optional(),
    endTimeMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  })
  .refine(
    (shift) =>
      (shift.startTimeMinutes == null) === (shift.endTimeMinutes == null) &&
      (shift.startTimeMinutes == null || shift.endTimeMinutes == null || shift.endTimeMinutes > shift.startTimeMinutes),
    { message: "Provide both a start and an end time, with the end after the start", path: ["endTimeMinutes"] },
  );

export type ShiftCreateInput = z.infer<typeof shiftCreateInputSchema>;

export const shiftUpdateInputSchema = shiftCreateInputSchema.safeExtend({ shiftId: z.string().min(1) });

export type ShiftUpdateInput = z.infer<typeof shiftUpdateInputSchema>;
