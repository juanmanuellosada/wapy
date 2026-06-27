import { z } from 'zod';

export const addEmailSchema = z.object({
  email: z.string().email('Email inválido'),
  grant_role: z.enum(['owner', 'superadmin']),
  checkout_mode: z.enum(['whatsapp', 'mercadopago']),
});

export type AddEmailInput = z.infer<typeof addEmailSchema>;

export const adminDeleteStoreSchema = z.object({
  storeId: z.string().uuid('ID de tienda inválido'),
  confirmSlug: z.string().min(1, 'El slug es requerido'),
});

export type AdminDeleteStoreInput = z.infer<typeof adminDeleteStoreSchema>;
