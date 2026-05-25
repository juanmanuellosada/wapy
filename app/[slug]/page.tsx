import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { resolveStoreSlug } from "@/lib/storefront/resolve";
import StoreClient from "./StoreClient";
import MaintenancePage from "./MaintenancePage";

interface Props {
  params: Promise<{ slug: string }>;
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

export default async function SlugPage({ params }: Props) {
  const { slug } = await params;
  const resolution = await resolveStoreSlug(slug);

  switch (resolution.kind) {
    case "render":
      return (
        <StoreClient
          store={resolution.store}
          sections={resolution.sections}
          products={resolution.products}
        />
      );

    case "redirect":
      redirect(`/${resolution.toSlug}`);

    case "maintenance":
      return <MaintenancePage store={resolution.store} />;

    case "not_found":
      notFound();
  }
}
