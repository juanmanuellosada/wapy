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
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 bg-gray-50">
        <h1 className="text-3xl font-bold text-gray-800">Tienda no encontrada</h1>
        <p className="text-gray-500 text-center max-w-sm">
          No existe ninguna tienda con la dirección{" "}
          <span className="font-mono font-semibold text-gray-700">{slug}</span>.
        </p>
        <a
          href="/"
          className="mt-2 px-6 py-2 rounded-full bg-[#16222E] text-[#F5C84B] font-semibold text-sm hover:bg-[#253545] transition-colors"
        >
          ← Volver a Wapy
        </a>
      </main>
    );
  }

  return <StoreClient store={store} />;
}
