import { z } from "zod";

export const facilityCreateInputSchema = z.object({
  name: z.string().min(1, "Facility name required"),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  description: z.string().optional(),
  timeZone: z.string().min(1, "Timezone required"),
  unitSystem: z.enum(["METRIC", "IMPERIAL"]).optional(),
  allowEmployeeSeeBookings: z.boolean().optional(),
});

export type FacilityCreateInput = z.infer<typeof facilityCreateInputSchema>;

export const facilityUpdateInputSchema = facilityCreateInputSchema.extend({
  siteId: z.string().min(1),
});

export type FacilityUpdateInput = z.infer<typeof facilityUpdateInputSchema>;

const operatingHoursSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  openAtMinutes: z.number().int().min(0).max(1440),
  closeAtMinutes: z.number().int().min(0).max(1440),
});

export const operatingHoursInputSchema = z.array(operatingHoursSchema);

export type OperatingHoursInput = z.infer<typeof operatingHoursInputSchema>;

export const operatingHoursFormSchema = z.array(
  z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    dayName: z.string(), // Display only
    openAtMinutes: z.number().int().min(0).max(1440),
    closeAtMinutes: z.number().int().min(0).max(1440),
  }),
);

export type OperatingHoursFormData = z.infer<typeof operatingHoursFormSchema>;

export const floorFormSchema = z.object({
  name: z.string().min(1, "Floor name is required"),
  description: z.string().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export type FloorFormData = z.infer<typeof floorFormSchema>;

export const facilityFormSchema = facilityCreateInputSchema;
export type FacilityFormData = z.infer<typeof facilityFormSchema>;
