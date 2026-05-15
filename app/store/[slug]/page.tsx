import { getStore } from "../../../lib/stores";
import StoreClient from "./StoreClient";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function StorePage({ params }: Props) {
  const { slug } = await params;
  const store = getStore(slug);

  if (!store) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8"
        style={{ background: "#FAFAF8", color: "#1A1714" }}
      >
        <h1 className="text-2xl font-semibold" style={{ color: "#1A1714" }}>
          Tienda no encontrada
        </h1>
        <p className="text-sm text-center max-w-xs" style={{ color: "#5C5651" }}>
          No existe ninguna tienda con la dirección{" "}
          <span className="font-mono font-semibold" style={{ color: "#1A1714" }}>{slug}</span>.
        </p>
        <a
          href="/"
          className="mt-2 px-5 py-2.5 rounded-full text-sm font-medium transition-opacity hover:opacity-85 cursor-pointer"
          style={{ background: "#1A1714", color: "#FAFAF8" }}
        >
          ← Volver a Wapy
        </a>
      </main>
    );
  }

  return <StoreClient store={store} />;
}
