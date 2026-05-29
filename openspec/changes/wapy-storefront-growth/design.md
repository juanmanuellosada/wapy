## Context

El storefront ya genera órdenes via `createPendingOrder()` (`lib/store/orders/actions.ts:25+`), que inserta en `orders` y `order_items`. Las órdenes pasan por estados `pending → confirmed → delivered | cancelled` (enum `order_status` definido en `019_orders.sql:6-34`). Cada `order_item` guarda `product_id`, `quantity`, `unit_price_cents` y, post-variants (`021_product_variants.sql`), `variant_id` y `variant_label`.

El campo `order_items.product_id` es nullable (preserva histórico si el producto se elimina), pero para insights agregamos sólo donde `product_id IS NOT NULL`. Existen índices sobre `order_items(order_id, product_id)` y `orders(store_id, status)`, `orders(store_id, created_at DESC)`.

`createPendingOrder` crea la orden con `status='pending'`. La transición a `confirmed`/`delivered` la hace el dueño desde el dashboard (cuando confirma o entrega el pedido). Para los insights queremos sólo órdenes `confirmed` o `delivered` — `pending` y `cancelled` se excluyen.

El modal de detalle de producto recibe (post-discovery change) un slot `relatedSlot?: React.ReactNode`. Este change consume ese slot.

El carrito drawer (`CartDrawer` en `StoreClient.tsx:850+`) actualmente tiene un botón "Comprar por WhatsApp" que llama a `createPendingOrder` y luego abre `wa.me/<numero>?text=<mensaje>` con el pedido al **dueño**.

## Goals / Non-Goals

**Goals:**
- Mostrar "Lo más pedido" automáticamente cuando hay datos suficientes; ocultarlo elegantemente cuando no.
- Mostrar productos relacionados (co-pedidos) dentro del modal cuando hay datos; ocultar el bloque sin error cuando no.
- Botón viral de compartir carrito que abra WhatsApp con un mensaje persuasivo + link a la tienda, sin requerir login ni backend.
- RPCs Postgres `STABLE` + `SECURITY INVOKER` que respeten RLS y sean llamables desde anon.
- Sin cron, sin materialized views, sin cache layer extra en Fase 2. Si crece el volumen, refactorear.

**Non-Goals:**
- Restaurar el carrito en otro dispositivo via link (descartado en discusión inicial).
- Recomendaciones basadas en ML / embeddings.
- Fallback "misma sección" para productos relacionados — si los co-pedidos no rinden en producción, se evalúa por separado.
- Métricas/analytics del share viral (cuántos clics, etc.) — fuera de scope.
- Editar/personalizar el copy del share viral desde el dashboard.

## Decisions

### D1. RPC `storefront_top_sellers` con ventana de 30 días

```sql
CREATE OR REPLACE FUNCTION public.storefront_top_sellers(
  p_store_id uuid,
  p_days int DEFAULT 30,
  p_limit int DEFAULT 10
)
RETURNS TABLE (product_id uuid, units_sold bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT oi.product_id, SUM(oi.quantity)::bigint AS units_sold
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.store_id = p_store_id
    AND o.status IN ('confirmed','delivered')
    AND o.created_at >= now() - make_interval(days => p_days)
    AND oi.product_id IS NOT NULL
  GROUP BY oi.product_id
  ORDER BY units_sold DESC, oi.product_id ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.storefront_top_sellers(uuid, int, int) TO anon, authenticated;
```

**Por qué SQL function y no Server Action con select**:
- Server Action requeriría admin client (`bypassRLS`) o duplicar lógica RLS en código.
- RPC con `SECURITY INVOKER` aprovecha RLS existente: `orders` ya tiene RLS que permite owner SELECT; anon NO tiene SELECT directo a `orders`. Para que anon pueda llamar la RPC y obtener resultados, la RPC necesita correr con privilegios elevados → cambiamos a `SECURITY DEFINER` y restringimos por `p_store_id` validando que la tienda esté `published`.

**Corrección a D1**: la función debe ser `SECURITY DEFINER` para que anon pueda agregar sobre `orders` sin RLS. Para evitar que anon consulte tiendas no publicadas, la función valida:

```sql
-- en el body de la función:
IF NOT EXISTS (
  SELECT 1 FROM stores WHERE id = p_store_id AND status = 'published'
) THEN
  RETURN; -- empty result
END IF;
```

**Tradeoff**: cualquier visitante anónimo puede pedir top sellers de cualquier tienda publicada. Aceptable: los productos ya son públicos para tiendas publicadas, exponer "qué se vende más" no agrega leak relevante.

### D2. RPC `storefront_co_purchased`

```sql
CREATE OR REPLACE FUNCTION public.storefront_co_purchased(
  p_product_id uuid,
  p_store_id uuid,
  p_limit int DEFAULT 6
)
RETURNS TABLE (product_id uuid, co_orders bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Validar store publicada (early return si no)
  WITH valid_store AS (
    SELECT 1 FROM stores WHERE id = p_store_id AND status = 'published'
  ),
  orders_with_target AS (
    SELECT DISTINCT o.id
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.store_id = p_store_id
      AND oi.product_id = p_product_id
      AND o.status IN ('confirmed','delivered')
  )
  SELECT oi.product_id, COUNT(DISTINCT oi.order_id)::bigint AS co_orders
  FROM order_items oi
  WHERE oi.order_id IN (SELECT id FROM orders_with_target)
    AND oi.product_id IS NOT NULL
    AND oi.product_id <> p_product_id
    AND EXISTS (SELECT 1 FROM valid_store)
  GROUP BY oi.product_id
  ORDER BY co_orders DESC, oi.product_id ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.storefront_co_purchased(uuid, uuid, int) TO anon, authenticated;
```

**Por qué requerir `p_store_id` explícito y no inferirlo del producto**: defensa en profundidad. El cliente ya sabe el `store_id` (lo carga al resolver el slug), pasarlo permite el `EXISTS (valid_store)` corto y consistente con `top_sellers`.

### D3. Filtrar productos activos en el cliente

Las RPCs devuelven sólo `product_id`. El cliente (que tiene el catálogo en memoria) mapea esos ids a `UIProduct` y descarta los que no estén activos o publicados. Esto evita lógica extra en SQL para resolver el producto completo.

**Por qué no devolver el producto en la RPC**: la RPC se mantiene simple y barata. El mapeo es O(1) en cliente porque el catálogo ya es un Map.

### D4. Cuándo se llama la RPC de co-purchased

Tres escenarios:
1. **Deep-link directo `?p=<id>`** → SSR llama la RPC en `page.tsx` y pasa los related ids como prop a `StoreClient`, que los renderiza en el modal desde el primer paint.
2. **Click en card desde el catálogo** → cliente hace fetch a un endpoint que llame la RPC. Opciones:
   - Server Action `getRelatedProductIds(productId, storeId)` invocada client-side.
   - Endpoint route handler `app/api/storefront/related/route.ts`.
3. **Producto sin datos** → la RPC devuelve 0 rows → el cliente no renderiza el bloque.

**Decisión**: usar Server Action en `lib/storefront/insights.ts` con `"use server"`. La action llama a Supabase anon client (RPC respeta RLS via store check) y cachea por `productId` con un Map en memoria del cliente para no re-pedir si el visitante vuelve a abrir el mismo producto.

### D5. Sección "Lo más pedido" — ubicación y diseño

- Render entre el hero/header y el primer bloque de secciones del catálogo.
- Sólo se muestra si `topSellers.length >= 3`. Por debajo, ocultar todo el bloque (incluyendo título).
- Title: "Lo más pedido" (sin caps lock, manteniendo el tono casual del storefront).
- Layout: grid horizontal scrollable en mobile (igual que las secciones del catálogo), grid 4 columnas en desktop.
- Las cards de top sellers usan `ProductCardClient` (mismo componente, mismas funciones de carrito), no un componente especial.

**Por qué reutilizar `ProductCardClient`**: cohesión visual + comportamiento idéntico (modal, agregar, variantes). El "ranking" no aparece como número, sólo el orden importa.

### D6. Productos relacionados en el modal

- Render dentro del `relatedSlot` del modal.
- Sólo se muestra si hay ≥ 1 relacionado.
- Title del bloque: "Quienes lo pidieron, también pidieron…".
- Layout: scroll horizontal de 3-6 mini-cards (sin selector de variantes, sin botón agregar; click abre el modal del producto relacionado, reemplazando el actual).
- Click en related → `setModalProduct(related)` + `router.replace(?p=<newId>)`. El back del navegador NO conserva historial entre modales (porque usamos `replace`); esto es OK porque cerrar el modal va a la tienda en general.

**Por qué mini-cards y no full cards**: las full cards con selectores ocuparían demasiado espacio en el modal. Las mini-cards (imagen + nombre + precio) son suficientes para que el visitante decida abrir y ver detalle.

### D7. Share viral del carrito — flujo

Botón nuevo "Compartí tu pedido" arriba o al costado del botón "Comprar por WhatsApp" en el `CartDrawer`. Visible sólo si `items.length > 0`.

Click ejecuta:
1. Construye texto: `*Mirá lo que me voy a pedir en {storeName}!*\n\n• Nx Producto — $Y\n...\n*Total: $Z*\n\nVer la tienda: https://wapy.com.ar/{slug}`.
2. Si `navigator.share` está disponible (mobile moderno), llamar `navigator.share({ text, url })` — esto abre el share-sheet nativo del SO.
3. Sino, fallback: abrir `https://wa.me/?text=<encodeURIComponent(text)>` (sin número destino, WhatsApp pide al usuario elegir contacto).
4. NO crea orden en DB. NO modifica el carrito. Es un share puro.

**Por qué no crear una orden pendiente al compartir**: el share no es checkout. Crear órdenes "para compartir" inflaría la tabla `orders` con basura.

**Por qué no incluir el carrito reconstruido**: requeriría persistir carritos en DB con un id compartible. Scope demasiado grande para el valor (la mayoría de los clientes finales no van a "retomar el carrito" en otro dispositivo — re-arman en uno solo). Si el feedback lo pide, lo agregamos como change futuro.

### D8. Idiomas y formato

Todo el copy en español (es-AR), consistente con la convención del repo. Precios con `formatARS`.

## Risks / Trade-offs

- **[Riesgo]** Las RPCs con `SECURITY DEFINER` corren con privilegios del owner del schema (postgres). Mitigación: `search_path = public` fijo en la función + validación explícita de `store.status = 'published'` antes de devolver datos.
- **[Riesgo]** `storefront_top_sellers` se ejecuta en cada render del storefront (SSR). En tiendas con muchas órdenes, podría ralentizar. **Mitigación**: el query usa los índices `orders(store_id, status)` y `orders(store_id, created_at)`, devuelve sólo top 10 — debería estar bien <50ms incluso con 10k órdenes. Si crece, materialized view con refresh cada hora.
- **[Riesgo]** Productos relacionados sin datos hace que el modal cambie de tamaño tras la respuesta async → flicker. **Mitigación**: en SSR (deep-link) la respuesta ya viene resuelta; en cliente, reservar espacio mínimo o aceptar que el slot crece al cargar. Aceptamos el flicker en cliente; es mínimo.
- **[Trade-off]** Share viral sin restaurar carrito = menos persuasión a quien recibe el link (no ve el carrito armado, sólo ve la tienda). **Aceptado** — el costo de persistir carritos es alto y el target son ventas WhatsApp; el receptor de un share típico ya conoce la tienda por relación.
- **[Riesgo]** Co-pedidos en tiendas nuevas = casi siempre 0 → bloque oculto siempre. **Aceptado** — eso es correcto. El feature aporta valor sólo cuando hay datos; ocultarlo es better than mostrar relacionados malos. Si en producción muchas tiendas nunca lo ven, considerar fallback "misma sección" en un change posterior.
- **[Trade-off]** Top sellers usa `confirmed` + `delivered` solamente → tiendas que rara vez "confirman" órdenes en el dashboard verán "lo más pedido" vacío. **Mitigación**: en el dashboard, asegurar que el flujo de confirmación es fácil (fuera de este change). Si el problema persiste, considerar incluir `pending` con ventana corta (ej. 7 días).

## Migration Plan

1. Crear migración Supabase con las dos RPCs + grants.
2. Aplicar localmente, validar con `select * from storefront_top_sellers('<uuid>', 30, 10)` en SQL editor.
3. Implementar componentes en cliente.
4. Deploy en preview. Verificar manualmente:
   - Tienda con órdenes recientes → "Lo más pedido" aparece.
   - Tienda nueva sin órdenes → bloque oculto, sin error.
   - Modal con producto vendido junto a otros → muestra relacionados.
   - Modal con producto sin historial → bloque oculto.
   - Share viral abre WhatsApp con texto correcto, link a la tienda funciona.
5. Rollback: revertir el PR + drop de las RPCs. Sin pérdida de datos.

## Open Questions

- ¿Mantenemos `confirmed + delivered` o sumamos `pending` con ventana de 7 días para tiendas nuevas? Default: sólo confirmed/delivered. Re-evaluar en producción.
- ¿La sección "Lo más pedido" se renderiza también si el visitante tiene filtros aplicados? Default: sí, aparece siempre (filtros aplican al grid principal, no al bloque destacado).
- ¿Top sellers excluye productos sin stock actual? Default: no — incluye igual; si el visitante clickea uno sin stock, el modal ya muestra "Sin stock disponible" y el botón está deshabilitado.
