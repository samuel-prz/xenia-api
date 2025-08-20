import { z } from "zod";

export const PropertyCreateSchema = z.object({
  name: z.string().min(1),
  ownerId: z.string().uuid().nullable().optional(),
  code: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const PropertyUpdateSchema = PropertyCreateSchema.partial();

export type PropertyCreateInput = z.infer<typeof PropertyCreateSchema>;
export type PropertyUpdateInput = z.infer<typeof PropertyUpdateSchema>;
