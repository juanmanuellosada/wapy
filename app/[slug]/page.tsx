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
    return {
      title: store.name,
      description: store.description ?? `${store.name} — tienda online en Wapy`,
      openGraph: {
        title: store.name,
        description: store.description ?? undefined,
        images: store.logo_url ? [store.logo_url] : undefined,
        type: "website",
      },
    };
  }

  if (resolution.kind === "maintenance") {
    return {
      title: `${resolution.store.name} — En mantenimiento`,
      robots: { index: false },
    };
  }

  return { title: "Esta tienda no existe" };
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
