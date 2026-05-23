import type { Json } from "@/lib/supabase/types";
import WapyFooter from "@/app/components/WapyFooter";

function getAccentColor(theme: Json): string {
  if (
    theme !== null &&
    typeof theme === "object" &&
    !Array.isArray(theme) &&
    "accent_color" in theme &&
    typeof (theme as { accent_color: unknown }).accent_color === "string"
  ) {
    return (theme as { accent_color: string }).accent_color;
  }
  return "#22c55e";
}

interface Props {
  store: {
    name: string;
    logo_url: string | null;
    theme: Json;
  };
}

export default function MaintenancePage({ store }: Props) {
  const accentColor = getAccentColor(store.theme);

  return (
    <div
      className="store-scope min-h-screen flex flex-col"
      style={{ background: "var(--store-bg, #fafaf8)", color: "var(--store-ink, #1a1714)" }}
    >
      <main className="flex-1 flex flex-col items-center justify-center gap-6 px-4 py-20 text-center">
        {/* Logo or initials */}
        <div
          className="flex h-20 w-20 items-center justify-center rounded-2xl overflow-hidden"
          style={{ background: accentColor + "20", border: `2px solid ${accentColor}30` }}
        >
          {store.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={store.logo_url}
              alt={`Logo de ${store.name}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <span
              className="text-2xl font-bold"
              style={{ color: accentColor }}
            >
              {store.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        {/* Store name */}
        <h1
          className="text-3xl font-bold tracking-tight"
          style={{ color: accentColor, fontFamily: "var(--font-rubik, Rubik)" }}
        >
          {store.name}
        </h1>

        {/* Message */}
        <div className="flex flex-col gap-2 max-w-sm">
          <p className="text-lg font-semibold" style={{ color: "var(--store-ink, #1a1714)" }}>
            Estamos haciendo cambios
          </p>
          <p className="text-sm" style={{ color: "var(--store-ink-secondary, #5c5651)" }}>
            Volvemos pronto con novedades. ¡Gracias por tu paciencia!
          </p>
        </div>

        {/* CTA back to Wapy */}
        <a
          href="/"
          className="mt-2 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-85 cursor-pointer"
          style={{ background: accentColor, color: "#ffffff" }}
        >
          Volver a Wapy
        </a>
      </main>

      <WapyFooter />
    </div>
  );
}
