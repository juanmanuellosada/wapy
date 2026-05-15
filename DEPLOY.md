# Guía de despliegue — Wapy en Vercel

## 1. Importar el repositorio en Vercel

1. Ir a [vercel.com/new](https://vercel.com/new) e iniciar sesión con tu cuenta de GitHub.
2. Seleccionar el repositorio `wapy` y hacer clic en **Import**.
3. Vercel detecta automáticamente Next.js — no hay que cambiar nada en la configuración del build.
4. Hacer clic en **Deploy**.

Cada push a `main` dispara un deploy de producción automáticamente.
Cada Pull Request recibe su propia URL de preview — sin configurar ningún workflow de GitHub Actions.

---

## 2. Variables de entorno en Vercel

En **Project Settings → Environment Variables**, agregar las siguientes variables para el entorno **Production** (y opcionalmente Preview):

| Variable | Valor de ejemplo | Para qué sirve |
|---|---|---|
| `PROD_ROOT_DOMAIN` | `wapy.app` | Dominio raíz de producción. El middleware lo usa para distinguir el root (`wapy.app`) de los subdominios de tiendas (`demo.wapy.app`). **Obligatorio** para que el ruteo de subdominios funcione. |
| `NEXT_PUBLIC_DEMO_URL` | `https://demo.wapy.app` | URL de la tienda demo. Se muestra en los botones "Ver tienda de ejemplo" de la landing page. |

> **Nota de seguridad:** nunca subas valores de producción al `.env.local` del repositorio. Ese archivo es solo para desarrollo local.

---

## 3. Dominio personalizado y subdominios

Sin un dominio propio los subdominios de tiendas **no funcionan** en producción: Vercel no soporta subdominios wildcard en los dominios `*.vercel.app`.

### Pasos para configurar el dominio

1. En **Project Settings → Domains**, agregar el dominio raíz: `wapy.app`
2. Agregar también el dominio wildcard: `*.wapy.app`
3. En el panel de DNS de tu registrador, crear dos registros CNAME:

   | Nombre | Tipo | Valor |
   |---|---|---|
   | `@` (o `wapy.app`) | `A` / `ALIAS` | `76.76.21.21` (IP de Vercel, o seguir las instrucciones de Vercel) |
   | `*` | `CNAME` | `cname.vercel-dns.com` |

   Vercel muestra los registros exactos al agregar el dominio — seguí esas instrucciones porque pueden variar según el registrador.

4. Esperar la propagación DNS (puede tardar hasta 24 h, normalmente menos de 1 h).

Una vez configurado:
- `wapy.app` → landing page
- `demo.wapy.app` → tienda demo
- `{slug}.wapy.app` → tienda del slug correspondiente

---

## 4. Verificar el despliegue

```bash
# Build local para verificar que no hay errores antes de hacer push
npm run build
```

Después del deploy en Vercel, visitar:
- `https://wapy.app` — landing page
- `https://demo.wapy.app` — tienda de demo
