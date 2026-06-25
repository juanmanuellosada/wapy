'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { normalizeCouponCode, isCouponValid, calculateDiscount } from './validity';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Coupon = {
  id: string;
  store_id: string;
  code: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  expires_at: string | null;
  min_purchase: number | null;
  max_uses: number | null;
  uses_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type ActionResult = { ok: true } | { error: string };

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const couponSchema = z.object({
  code: z.string().min(1, 'El código es requerido').max(50, 'Máximo 50 caracteres'),
  discount_type: z.enum(['percent', 'fixed'], { error: 'Tipo de descuento inválido' }),
  discount_value: z
    .number({ error: 'El valor debe ser un número' })
    .positive('El valor debe ser mayor a 0'),
  expires_at: z.string().nullable().optional(),
  min_purchase: z
    .number({ error: 'El mínimo debe ser un número' })
    .min(0, 'El mínimo no puede ser negativo')
    .nullable()
    .optional(),
  max_uses: z
    .number({ error: 'El límite debe ser un número entero' })
    .int('El límite debe ser un entero')
    .positive('El límite debe ser mayor a 0')
    .nullable()
    .optional(),
  is_active: z.boolean().optional().default(true),
}).superRefine((data, ctx) => {
  if (data.discount_type === 'percent' && data.discount_value > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['discount_value'],
      message: 'El porcentaje no puede superar 100',
    });
  }
});

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

async function requireOwnerStore() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const { data: store } = await admin
    .from('stores')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle();
  return { user, store };
}

// ---------------------------------------------------------------------------
// saveCoupon — create or update
// ---------------------------------------------------------------------------

export type SaveCouponInput = {
  id?: string;
  code: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  expires_at?: string | null;
  min_purchase?: number | null;
  max_uses?: number | null;
  is_active?: boolean;
};

export async function saveCoupon(input: SaveCouponInput): Promise<ActionResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  const parsed = couponSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const data = parsed.data;
  const normalizedCode = normalizeCouponCode(data.code);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  if (input.id) {
    // UPDATE
    const { error } = await admin
      .from('coupons')
      .update({
        code: normalizedCode,
        discount_type: data.discount_type,
        discount_value: data.discount_value,
        expires_at: data.expires_at ?? null,
        min_purchase: data.min_purchase ?? null,
        max_uses: data.max_uses ?? null,
        is_active: data.is_active ?? true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id)
      .eq('store_id', store.id);

    if (error) {
      if (error.code === '23505') return { error: 'Ya existe un cupón con ese código en tu tienda.' };
      return { error: 'No se pudo actualizar el cupón.' };
    }
  } else {
    // INSERT
    const { error } = await admin
      .from('coupons')
      .insert({
        store_id: store.id,
        code: normalizedCode,
        discount_type: data.discount_type,
        discount_value: data.discount_value,
        expires_at: data.expires_at ?? null,
        min_purchase: data.min_purchase ?? null,
        max_uses: data.max_uses ?? null,
        is_active: data.is_active ?? true,
      });

    if (error) {
      if (error.code === '23505') return { error: 'Ya existe un cupón con ese código en tu tienda.' };
      return { error: 'No se pudo crear el cupón.' };
    }
  }

  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// deleteCoupon
// ---------------------------------------------------------------------------

export async function deleteCoupon(couponId: string): Promise<ActionResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { error } = await admin
    .from('coupons')
    .delete()
    .eq('id', couponId)
    .eq('store_id', store.id);

  if (error) return { error: 'No se pudo eliminar el cupón.' };

  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// toggleCoupon
// ---------------------------------------------------------------------------

export async function toggleCoupon(couponId: string, isActive: boolean): Promise<ActionResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'No se encontró la tienda.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { error } = await admin
    .from('coupons')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', couponId)
    .eq('store_id', store.id);

  if (error) return { error: 'No se pudo actualizar el cupón.' };

  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// validateCoupon — public (anonymous) action
// ---------------------------------------------------------------------------

export type ValidateCouponInput = {
  storeId: string;
  code: string;
  cartTotal: number;
};

export type ValidateCouponResult =
  | {
      ok: true;
      discount: number;
      finalTotal: number;
      coupon: { code: string; discountType: 'percent' | 'fixed'; discountValue: number };
    }
  | { error: string };

export async function validateCoupon(input: ValidateCouponInput): Promise<ValidateCouponResult> {
  const { storeId, code, cartTotal } = input;

  if (!storeId || !code) return { error: 'Datos inválidos.' };

  const normalizedCode = normalizeCouponCode(code);

  // Use admin client — this is a public action (no user session) so we bypass RLS via service role.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: coupon, error: fetchError } = await admin
    .from('coupons')
    .select('*')
    .eq('store_id', storeId)
    .eq('code', normalizedCode)
    .maybeSingle();

  if (fetchError) return { error: 'Error al validar el cupón.' };
  if (!coupon) return { error: 'Cupón no encontrado o inválido.' };
  if (!coupon.is_active) return { error: 'El cupón está desactivado.' };

  // Expiry check (AR timezone, UTC-3 fixed)
  if (!isCouponValid(coupon.expires_at as string | null)) {
    return { error: 'El cupón está vencido.' };
  }

  // Min purchase
  if (coupon.min_purchase !== null && cartTotal < Number(coupon.min_purchase)) {
    const formatted = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(
      Number(coupon.min_purchase)
    );
    return { error: `El cupón requiere un mínimo de ${formatted}.` };
  }

  // Max uses
  if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses) {
    return { error: 'El cupón ya fue utilizado el máximo de veces.' };
  }

  const discountType = coupon.discount_type as 'percent' | 'fixed';
  const discountValue = Number(coupon.discount_value);
  const discount = calculateDiscount(discountType, discountValue, cartTotal);
  const finalTotal = Math.max(0, cartTotal - discount);

  return {
    ok: true,
    discount,
    finalTotal,
    coupon: {
      code: coupon.code as string,
      discountType,
      discountValue,
    },
  };
}
