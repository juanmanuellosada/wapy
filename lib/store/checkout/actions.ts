'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { buildAuthorizationUrl, getStoreMpConnectionStatus } from '@/lib/store/checkout/oauth';
import { createCheckoutPreference } from '@/lib/store/checkout/mp-client';
import { createPendingOrder } from '@/lib/store/orders/actions';
import { buyerSchema, type BuyerInput, type CartItemInput } from '@/lib/store/checkout/schemas';

// ---------------------------------------------------------------------------
// Auth helpers (same pattern as lib/subscription/actions.ts)
// ---------------------------------------------------------------------------

async function requireOwner() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return user;
}

async function requireOwnerStore() {
  const user = await requireOwner();
  const admin = createAdminClient();
  const { data: store, error } = await admin
    .from('stores')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (error || !store) throw new Error('Store not found');
  return { user, store };
}

// ---------------------------------------------------------------------------
// connectMercadoPago (task 3.3)
//
// Generates and returns the Mercado Pago OAuth authorization URL for the
// owner's store. The client redirects to this URL to begin the connect flow.
// The authorization code is received and processed by the callback route handler
// at /api/mp/oauth/callback — tokens are NEVER seen by the client.
// ---------------------------------------------------------------------------

export async function connectMercadoPago(): Promise<
  { ok: true; authUrl: string } | { error: string }
> {
  try {
    const { store } = await requireOwnerStore();
    const authUrl = buildAuthorizationUrl(store.id);
    return { ok: true, authUrl };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Error al iniciar la conexión con Mercado Pago.';
    console.error('[checkout/connectMercadoPago] error', { err });
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// disconnectMercadoPago (task 3.5)
//
// Marks the store's MP connection as revoked (sets revoked_at = now).
// The store's checkout_mode will remain 'mercadopago' in the DB — it is the
// dashboard UI's responsibility to reflect the revoked state and gate checkout.
// The Group 7 UI update (setCheckoutMode) should reset checkout_mode to
// 'whatsapp' when the user explicitly disconnects.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// startCheckout (tasks 5.2, 5.3)
//
// Public server action — no owner session required (guest buyer).
// Validates the store, mode, and MP connection; recalculates prices from the
// DB via createPendingOrder; creates an MP preference; persists mp_preference_id;
// and returns the init_point for client-side redirect (task 5.7).
//
// Rejects:
//   - Empty or invalid cart (5.3)
//   - Store not found / not published (5.3)
//   - checkout_mode !== 'mercadopago' (5.3)
//   - No valid MP connection (5.3)
//   - Invalid buyer data (validated with buyerSchema from 5.1)
// ---------------------------------------------------------------------------

export async function startCheckout({
  slug,
  cart,
  buyer,
}: {
  slug: string;
  cart: CartItemInput[];
  buyer: BuyerInput;
}): Promise<{ initPoint: string } | { error: string }> {
  try {
    // 1. Validate buyer data with Zod schema (task 5.1)
    const buyerParsed = buyerSchema.safeParse(buyer);
    if (!buyerParsed.success) {
      const msg = buyerParsed.error.issues[0]?.message ?? 'Datos del comprador inválidos.';
      return { error: msg };
    }

    // 2. Validate cart not empty
    if (!cart || cart.length === 0) {
      return { error: 'El carrito está vacío.' };
    }

    // 3. Load store by slug (must be published)
    const admin = createAdminClient();
    const { data: store, error: storeError } = await admin
      .from('stores')
      .select('id, slug, checkout_mode, status')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();

    if (storeError || !store) {
      return { error: 'Tienda no disponible.' };
    }

    // 4. Validate checkout_mode (task 5.3)
    const checkoutMode = (store.checkout_mode ?? 'whatsapp') as string;
    if (checkoutMode !== 'mercadopago') {
      return { error: 'Esta tienda no acepta pagos online.' };
    }

    // 5. Validate MP connection (task 5.3)
    let mpStatus;
    try {
      mpStatus = await getStoreMpConnectionStatus(store.id);
    } catch {
      return { error: 'No se pudo verificar la conexión con Mercado Pago.' };
    }
    if (!mpStatus.connected) {
      return { error: 'La tienda no tiene Mercado Pago configurado.' };
    }

    const { name, email, phone, address } = buyerParsed.data;

    // 6. Create pending order — recalculates all prices server-side from DB.
    //    Prices from the client are never used: createPendingOrder fetches
    //    price_cents / variant.price_override directly from the DB.  (D4)
    const orderResult = await createPendingOrder({
      store_id: store.id,
      items: cart.map((i) => ({
        product_id: i.productId,
        quantity: i.quantity,
        variant_id: i.variantId ?? null,
      })),
      channel: 'mercadopago',
      customer_name: name,
      customer_email: email,
      customer_phone: phone,
      delivery_address: address,
    });

    if ('error' in orderResult) {
      switch (orderResult.error) {
        case 'no_valid_items':
          return { error: 'El carrito contiene productos inválidos o sin publicar.' };
        case 'store_unavailable':
          return { error: 'Tienda no disponible.' };
        case 'stock_insufficient':
          return { error: 'Algunos productos no tienen stock suficiente.' };
        case 'qty_violation':
          return { error: 'La cantidad de algún producto es inválida.' };
        default:
          return { error: 'No se pudo crear el pedido.' };
      }
    }

    const { order_id, mp_items } = orderResult;

    // 7. Create Checkout Pro preference with owner's token (task 4.2)
    //    items come from createPendingOrder (server-side prices, currency ARS)
    let preference;
    try {
      preference = await createCheckoutPreference({
        storeId: store.id,
        orderId: order_id,
        slug: store.slug,
        items: mp_items,
      });
    } catch (err) {
      console.error('[startCheckout] createCheckoutPreference failed', { err, orderId: order_id });
      return { error: 'No se pudo crear la preferencia de pago. Intentá de nuevo.' };
    }

    // 8. Persist mp_preference_id on the order (admin client — service role bypasses trigger)
    await admin
      .from('orders')
      .update({ mp_preference_id: preference.preferenceId })
      .eq('id', order_id);

    // 9. Return init_point for client-side redirect (task 5.7)
    //    Always use the production init_point. MP includes sandbox_init_point in
    //    every preference response (even with production tokens), so preferring it
    //    would wrongly send buyers to the Sandbox checkout.
    return { initPoint: preference.initPoint };
  } catch (err) {
    console.error('[startCheckout] unexpected error', { err });
    return { error: 'Error inesperado. Intentá de nuevo.' };
  }
}

export async function disconnectMercadoPago(): Promise<{ ok: true } | { error: string }> {
  try {
    const { store } = await requireOwnerStore();
    const admin = createAdminClient();

    const { error } = await admin
      .from('store_mp_connections')
      .update({
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('store_id', store.id);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath('/dashboard');
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Error al desconectar Mercado Pago.';
    console.error('[checkout/disconnectMercadoPago] error', { err });
    return { error: message };
  }
}
