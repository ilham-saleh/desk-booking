import { z } from "zod";

import { SLOT_MINUTES } from "@/lib/time-slots";

/** Shared between the booking forms (client) and the booking routers (server). */

export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const timeSlotMinutesSchema = z
  .number()
  .int()
  .min(0)
  .max(24 * 60)
  .multipleOf(SLOT_MINUTES);

export const createBookingInputSchema = z
  .object({
    deskId: z.string().min(1),
    date: dateStringSchema,
    startMinutes: timeSlotMinutesSchema,
    endMinutes: timeSlotMinutesSchema,
    /** Admin-on-behalf: book for another org user. Mutually exclusive with guestName. */
    forUserId: z.string().min(1).optional(),
    /** Admin guest booking: userId stays null, tied to the admin's own account. */
    guestName: z.string().trim().min(1).max(200).optional(),
  })
  .refine((input) => input.endMinutes > input.startMinutes, {
    message: "End time must be after start time",
    path: ["endMinutes"],
  })
  .refine((input) => !(input.forUserId && input.guestName), {
    message: "Choose either a user or a guest name, not both",
    path: ["guestName"],
  });

export type CreateBookingInput = z.infer<typeof createBookingInputSchema>;

export const cancelBookingInputSchema = z.object({
  bookingId: z.string().min(1),
});

export type CancelBookingInput = z.infer<typeof cancelBookingInputSchema>;
