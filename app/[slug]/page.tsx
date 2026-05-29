import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { resolveStoreSlug } from "@/lib/storefront/resolve";
import StoreClient from "./StoreClient";
import MaintenancePage from "./MaintenancePage";
import { parseFiltersFromSearchParams } from "./filters";
import { getTopSellers, getRelatedProductIds } from "@/lib/storefront/insights";
import type { UIProduct } from "./types";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const resolution = await resolveStoreSlug(slug);

  if (resolution.kind === "render") {
    const { store } = resolution;
    const title = `${store.name} — Pedí por WhatsApp`;
    const description =
      store.description ?? `Catálogo de ${store.name}. Pedí por WhatsApp.`;
    const ogImageUrl = `/${slug}/opengraph-image`;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        images: [{ url: ogImageUrl }],
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [ogImageUrl],
      },
    };
  }

  if (resolution.kind === "maintenance") {
    return {
      title: `${resolution.store.name} — En mantenimiento`,
      robots: { index: false },
    };
  }

  return { title: "Tienda no encontrada" };
}

export default async function SlugPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const resolution = await resolveStoreSlug(slug);

  switch (resolution.kind) {
    case "render": {
      const initialFilters = parseFiltersFromSearchParams(sp);

      // Validate that ?p=<id> corresponds to an active product in the catalog.
      // If not found, pass null so StoreClient doesn't try to open a stale modal.
      const pRaw = typeof sp.p === "string" ? sp.p : null;
      const initialProductId =
        pRaw && resolution.products.some((prod) => prod.id === pRaw)
          ? pRaw
          : null;

      // Build a local UIProduct map for mapping RPC ids → UIProduct
      const productMap = new Map<string, UIProduct>(
        resolution.products.map((p) => [
          p.id,
          {
            id: p.id,
            sectionId: p.section_id ?? "",
            name: p.name,
            description: p.description ?? "",
            price: p.price_cents / 100,
            priceCents: p.price_cents,
            image:
              p.image_urls && p.image_urls.length > 0
                ? p.image_urls[0]
                : "data:image/svg+xml;charset=utf-8," +
                  encodeURIComponent(
                    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#e5e7eb"/><text x="100" y="105" font-family="system-ui,sans-serif" font-size="14" fill="#9ca3af" text-anchor="middle">Sin imagen</text></svg>'
                  ),
            imageUrls: p.image_urls ?? [],
            stock: p.stock ?? null,
          },
        ])
      );

      // Fetch top sellers and (if deep-link) related products in parallel.
      // Both are best-effort — silently degrade to [] on any error.
      const [topSellerIds, initialRelatedIds] = await Promise.all([
        getTopSellers(resolution.store.id),
        initialProductId
          ? getRelatedProductIds(initialProductId, resolution.store.id)
          : Promise.resolve([]),
      ]);

      // Map RPC ids → UIProduct, filtering products not in the active catalog.
      const topSellerProducts: UIProduct[] = topSellerIds
        .map((id) => productMap.get(id))
        .filter((p): p is UIProduct => p !== undefined);

      return (
        <StoreClient
          store={resolution.store}
          sections={resolution.sections}
          products={resolution.products}
          variantsByProduct={resolution.variantsByProduct}
          initialFilters={initialFilters}
          initialProductId={initialProductId}
          topSellerProducts={topSellerProducts}
          initialRelatedIds={initialRelatedIds}
        />
      );
    }

    case "redirect":
      redirect(`/${resolution.toSlug}`);

    case "maintenance":
      return <MaintenancePage store={resolution.store} />;

    case "not_found":
      notFound();
  }
}
