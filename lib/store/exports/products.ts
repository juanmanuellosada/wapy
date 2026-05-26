'use server';

import { redirect } from 'next/navigation';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Auth guard (mirrors pattern in lib/store/actions.ts)
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
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();
  return { user, store };
}

// ---------------------------------------------------------------------------
// CSV helpers (same approach as exportOrdersCsv in lib/store/orders/actions.ts)
// ---------------------------------------------------------------------------

function csvEscape(value: string | null | undefined): string {
  const s = value ?? '';
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function formatCsvPrice(cents: number): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

// ---------------------------------------------------------------------------
// exportProductsCsv — 7.1 / 7.2 / 7.3
//
// Decision (b): one row per SKU comprable.
//   - Producto simple  → 1 fila, columna "Variante" vacía.
//   - Producto con N variedades → N filas (sin fila padre), columna "Variante"
//     con el label "Rojo / M" (valores ordenados por option_type.position).
//
// Header (Spanish, matching project conventions):
//   Nombre,Descripción,Precio,Stock,Activo,Imagen,Sección,Variante
//
// Columns:
//   Nombre       — product.name
//   Descripción  — product.description (puede ser vacío)
//   Precio       — precio efectivo en ARS: variant.price_override ?? product.price_cents
//   Stock        — variant.stock  (o product.stock para simples, vacío si null)
//   Activo       — "Sí" / "No"
//   Imagen       — variant.image_url ?? product.image_urls[0] (para filas de variedad)
//                  product.image_urls[0]                      (para productos simples)
//   Sección      — nombre de la sección del producto (vacío si sin sección)
//   Variante     — vacío para simples; "Rojo / M" para variedades
// ---------------------------------------------------------------------------

export type ExportProductsCsvResult =
  | { csv: string }
  | { error: 'unauthorized' | 'empty' };

export async function exportProductsCsv(): Promise<ExportProductsCsvResult> {
  const { store } = await requireOwnerStore();
  if (!store) return { error: 'unauthorized' };

  const admin = createAdminClient();

  // 1. Fetch all products with section name
  const { data: products } = await admin
    .from('products')
    .select('id, name, description, price_cents, stock, is_active, image_urls, section_id, sections(name)')
    .eq('store_id', store.id)
    .order('position', { ascending: true });

  if (!products || products.length === 0) return { error: 'empty' };

  const productIds = products.map((p) => p.id);

  // 2. Fetch all active variants with their option value labels (one query for all products)
  //    We join through product_variant_option_values → product_option_values → product_option_types
  //    to reconstruct the label without N+1 queries.
  //
  //    Note: Supabase's TypeScript inference breaks on deeply nested selects and returns
  //    GenericStringError. We cast to an explicit interface, same pattern used in
  //    lib/store/orders/actions.ts for variants.
  type RawVariant = {
    id: string;
    product_id: string;
    stock: number | null; // null = no tracking (infinite)
    price_override: number | null;
    image_url: string | null;
    position: number;
    product_variant_option_values: Array<{
      option_value_id: string;
      product_option_values: {
        value: string;
        product_option_types: { position: number } | null;
      } | null;
    }>;
  };

  const { data: rawVariantData } = await admin
    .from('product_variants')
    .select(
      'id, product_id, stock, price_override, image_url, position, ' +
      'product_variant_option_values(option_value_id, product_option_values(value, product_option_types(position)))'
    )
    .in('product_id', productIds)
    .is('deleted_at', null)
    .order('position', { ascending: true });

  const variantRows = (rawVariantData ?? []) as unknown as RawVariant[];
  const variantsByProduct = new Map<string, RawVariant[]>();
  for (const v of variantRows ?? []) {
    const list = variantsByProduct.get(v.product_id) ?? [];
    list.push(v);
    variantsByProduct.set(v.product_id, list);
  }

  // Build variant label from option values ordered by option_type.position
  function buildVariantLabel(v: RawVariant): string {
    const entries = (v.product_variant_option_values ?? [])
      .map((ov) => {
        const pov = ov.product_option_values as {
          value: string;
          product_option_types: { position: number } | null;
        } | null;
        return {
          position: pov?.product_option_types?.position ?? 0,
          value: pov?.value ?? '',
        };
      })
      .sort((a, b) => a.position - b.position);
    return entries.map((e) => e.value).join(' / ');
  }

  // 3. Build CSV rows
  const HEADER = 'Nombre,Descripción,Precio,Stock,Activo,Imagen,Sección,Variante';

  const rows: string[] = [];

  for (const product of products) {
    const sectionName = (product.sections as { name: string } | null)?.name ?? '';
    const activo = product.is_active ? 'Sí' : 'No';
    const variants = variantsByProduct.get(product.id);

    if (!variants || variants.length === 0) {
      // 7.1 Producto simple — una fila, columna Variante vacía
      const stockStr = product.stock !== null ? String(product.stock) : '';
      const imagenStr = product.image_urls[0] ?? '';
      rows.push(
        [
          csvEscape(product.name),
          csvEscape(product.description),
          csvEscape(formatCsvPrice(product.price_cents)),
          stockStr,
          activo,
          csvEscape(imagenStr),
          csvEscape(sectionName),
          '', // Variante vacía para simples
        ].join(',')
      );
    } else {
      // 7.1 Producto con variedades — una fila por variedad (enfoque b)
      for (const v of variants) {
        // 7.2 Precio efectivo: price_override ?? product.price_cents
        const effectivePrice =
          v.price_override !== null ? v.price_override : product.price_cents;

        // 7.2 Imagen: variant.image_url ?? product.image_urls[0]
        const imagenStr = v.image_url ?? product.image_urls[0] ?? '';

        // 7.2 Label "Rojo / M" ordenado por position del option_type
        const variantLabel = buildVariantLabel(v);

        // null stock = no tracking; export as empty string (matches products.stock null behavior)
        const stockStr = v.stock !== null ? String(v.stock) : '';
        rows.push(
          [
            csvEscape(product.name),
            csvEscape(product.description),
            csvEscape(formatCsvPrice(effectivePrice)),
            stockStr,
            activo,
            csvEscape(imagenStr),
            csvEscape(sectionName),
            csvEscape(variantLabel),
          ].join(',')
        );
      }
    }
  }

  if (rows.length === 0) return { error: 'empty' };

  // BOM UTF-8 so Excel (es-AR) opens accents correctly — same as exportOrdersCsv
  const csv = '﻿' + [HEADER, ...rows].join('\r\n');
  return { csv };
}
