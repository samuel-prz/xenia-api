import { z } from "zod";

export const AcceptInviteSchema = z.object({
  token: z.string().min(16),
  password: z.string().min(8, "Min 8 chars"),
  name: z.string().min(1).optional(), // opcional si quieres guardar nombre
});

export type AcceptInviteInput = z.infer<typeof AcceptInviteSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  orgId: z.string().uuid().optional(), // si el user pertenece a varias orgs
});

export type LoginInput = z.infer<typeof LoginSchema>;
