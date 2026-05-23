import { z } from 'zod';

export const addEmailSchema = z.object({
  email: z.string().email('Email inválido'),
  grant_role: z.enum(['owner', 'superadmin']),
});

export type AddEmailInput = z.infer<typeof addEmailSchema>;
