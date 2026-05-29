import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { resolveStoreSlug } from "@/lib/storefront/resolve";
import StoreClient from "./StoreClient";
import MaintenancePage from "./MaintenancePage";
import { parseFiltersFromSearchParams } from "./filters";

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

      return (
        <StoreClient
          store={resolution.store}
          sections={resolution.sections}
          products={resolution.products}
          variantsByProduct={resolution.variantsByProduct}
          initialFilters={initialFilters}
          initialProductId={initialProductId}
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
