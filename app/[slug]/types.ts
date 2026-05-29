// Shared UI types for the public storefront.
// These are local-only representations derived from the Supabase row types.

export interface UIProduct {
  id: string;
  sectionId: string;
  name: string;
  description: string;
  price: number; // ARS float (price_cents / 100)
  priceCents: number; // raw cents — needed for variant price fallback
  image: string;
  imageUrls: string[]; // all images for the gallery
  stock: number | null; // null = no tracking, 0 = out of stock, N = N units available
}
