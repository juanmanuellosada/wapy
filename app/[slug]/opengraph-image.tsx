import { ImageResponse } from "next/og";
import { resolveStoreSlug } from "@/lib/storefront/resolve";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function OgImage({ params }: Props) {
  const { slug } = await params;
  const resolution = await resolveStoreSlug(slug);

  if (resolution.kind !== "render" && resolution.kind !== "maintenance") {
    // Generic Wapy fallback for not_found / redirect
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#F5C84B",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <span style={{ fontSize: 80, fontWeight: 700, color: "#1a1a1a" }}>
            Wapy
          </span>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }

  const store = resolution.store;

  // Resolve accent color from theme JSON
  let accentColor = "#F5C84B";
  if (
    store.theme !== null &&
    typeof store.theme === "object" &&
    "accent_color" in (store.theme as object) &&
    typeof (store.theme as { accent_color: unknown }).accent_color === "string"
  ) {
    accentColor = (store.theme as { accent_color: string }).accent_color;
  }

  // Initials fallback when no logo
  const initials = store.name
    .split(" ")
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? "")
    .join("");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-end",
          padding: "60px 72px",
          background: accentColor,
          fontFamily: "system-ui, sans-serif",
          gap: 16,
        }}
      >
        {/* Logo or initials circle */}
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: "50%",
            overflow: "hidden",
            background: "rgba(0,0,0,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 8,
          }}
        >
          {store.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={store.logo_url}
              width={96}
              height={96}
              style={{ objectFit: "cover" }}
              alt={store.name}
            />
          ) : (
            <span
              style={{
                fontSize: 36,
                fontWeight: 700,
                color: "#ffffff",
              }}
            >
              {initials}
            </span>
          )}
        </div>

        {/* Store name */}
        <span
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1,
            letterSpacing: "-2px",
          }}
        >
          {store.name}
        </span>

        {/* Tagline */}
        <span
          style={{
            fontSize: 32,
            fontWeight: 500,
            color: "rgba(255,255,255,0.85)",
          }}
        >
          Pedí por WhatsApp
        </span>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
