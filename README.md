# Wapy

**Tu negocio, más simple.** — SaaS para crear tiendas online con subdominio propio y pedidos por WhatsApp.

## Stack

- Next.js 16 (App Router, TypeScript)
- Tailwind CSS v4
- React 19

## Requisitos

- Node.js 20.19+
- npm 10+

## Instalación y desarrollo

```bash
npm install
npm run dev
```

El servidor queda en `http://localhost:3000`.

## Rutas locales

| URL | Qué muestra |
|-----|------------|
| `http://localhost:3000` | Landing page de Wapy |
| `http://demo.localhost:3000` | Placeholder de tienda "demo" |
| `http://cualquier-slug.localhost:3000` | Placeholder de tienda `{slug}` |

> `*.localhost` se resuelve automáticamente en Chrome, Firefox y Safari — no necesitás editar `/etc/hosts`.

## Producción

```bash
npm run build
npm run start
```

En producción, configurá la variable de entorno `PROD_ROOT_DOMAIN` con tu dominio raíz (e.g. `wapy.app`). Las requests a `slug.wapy.app` se redirigen internamente a `/store/{slug}`.

## Variables de entorno

Copiá `.env.local` y ajustá según necesites:

```env
# Dominio raíz en producción (opcional, vacío en dev local)
# PROD_ROOT_DOMAIN=wapy.app

# URL de la tienda demo — usada en la landing
NEXT_PUBLIC_DEMO_URL=http://demo.localhost:3000
```

## Estructura del proyecto

```
wapy/
├── app/
│   ├── components/        # Secciones de la landing page
│   │   ├── Header.tsx
│   │   ├── Hero.tsx
│   │   ├── HowItWorks.tsx
│   │   ├── Features.tsx
│   │   ├── DemoBand.tsx
│   │   ├── Pricing.tsx
│   │   └── Footer.tsx
│   ├── fonts/             # Fuente Agbalumo (local)
│   │   ├── Agbalumo-Regular.ttf
│   │   └── OFL.txt
│   ├── store/
│   │   └── [slug]/
│   │       └── page.tsx   # Placeholder de tienda (próxima delegación)
│   ├── globals.css        # Tokens de marca (Tailwind v4 theme)
│   ├── layout.tsx         # Fuentes + metadata global
│   └── page.tsx           # Landing page
├── public/
│   └── brand/             # Assets de marca
│       ├── wordmark.png          # Logo tipográfico
│       ├── icon.png              # Ícono cuadrado (favicon)
│       ├── isotype.png           # Isotipo W-flecha
│       ├── mascot.png            # Mascota Wapy
│       ├── wordmark-tagline-1.png  # "MENOS VUELTAS, MÁS PEDIDOS"
│       └── wordmark-tagline-2.png  # "TU NEGOCIO, MÁS SIMPLE"
├── proxy.ts               # Subdomain routing (Next.js proxy)
├── next.config.ts
├── tsconfig.json
└── .env.local             # Variables de entorno locales
```

## Colores de marca

| Token | Hex | Uso |
|-------|-----|-----|
| `yellow` | `#F5C84B` | Primario, fondos, CTAs |
| `navy` | `#16222E` | Texto, fondos oscuros |

## Fuentes

- **Agbalumo** (local, `app/fonts/`) — display / títulos / wordmark
- **Nunito Sans** (Google Fonts) — cuerpo de texto
