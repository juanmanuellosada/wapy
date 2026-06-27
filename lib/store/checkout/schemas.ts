import { z } from 'zod';

// ---------------------------------------------------------------------------
// Buyer schema (task 5.1)
// Used server-side in startCheckout to validate the guest checkout form.
// ---------------------------------------------------------------------------

export const buyerSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  phone: z
    .string()
    .min(7, 'El teléfono debe tener al menos 7 dígitos')
    .regex(/^[0-9+\-\s()]+$/, 'Teléfono inválido'),
  address: z.string().min(5, 'La dirección debe tener al menos 5 caracteres'),
});

export type BuyerInput = z.infer<typeof buyerSchema>;

// ---------------------------------------------------------------------------
// Cart item as received from the client (IDs + quantities only — no prices)
// ---------------------------------------------------------------------------

export const cartItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  quantity: z.number().int().min(1).max(100),
});

export type CartItemInput = z.infer<typeof cartItemSchema>;
