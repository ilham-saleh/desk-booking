import { z } from "zod";

export const facilityFormSchema = z.object({
  name: z.string().min(1, "Facility name is required"),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  description: z.string().optional(),
  timeZone: z.string().min(1, "Timezone is required"),
  unitSystem: z.enum(["METRIC", "IMPERIAL"]).optional(),
  allowEmployeeSeeBookings: z.boolean().optional(),
});

export type FacilityFormData = z.infer<typeof facilityFormSchema>;

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
