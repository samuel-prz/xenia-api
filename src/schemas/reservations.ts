import { z } from "zod";

export const ReservationCreateSchema = z.object({
  propertyId: z.string().uuid(),
  guestName: z.string().optional(),
  checkinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkoutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalAmountCents: z.number().int().nonnegative(),
  currency: z.string().default("USD"),
  status: z.enum(["pending","confirmed","checked_in","checked_out","cancelled"]).default("pending"),
  channel: z.string().optional(),
});

export const ReservationUpdateSchema = ReservationCreateSchema.partial();

export type ReservationCreateInput = z.infer<typeof ReservationCreateSchema>;
export type ReservationUpdateInput = z.infer<typeof ReservationUpdateSchema>;
