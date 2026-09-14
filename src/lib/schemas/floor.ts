import { z } from "zod";

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
