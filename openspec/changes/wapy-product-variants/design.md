## Context

Wapy es un SaaS de tiendas embebibles en `wapy.app/[slug]`. Cada tienda pertenece a un dueño (1:1). El catálogo actual asume **producto = SKU**: una fila en `products` con `price`, `stock`, `image_url`. Server Actions ya validan stock y suben imágenes vía admin client (no desde el cliente, por el gotcha documentado en memoria: el worker de Supabase Storage no verifica JWT ES256, así que `auth.uid()` queda NULL y cualquier RLS con subquery rompe).

Las features de dashboard, public store y carrito ya viven como changes activos no archivados — no hay specs vivos en `openspec/specs/`. Por eso esta feature consolida sus reglas en una nueva capability `product-variants` en vez de modificar specs inexistentes.

Restricción clave: **productos simples no deben verse afectados**. Quienes ya cargaron catálogo no deben rehacer nada y el path de "producto sin variedades" debe seguir siendo el camino corto en código y en UI.

## Goals / Non-Goals

**Goals:**
- Modelar variedades como matriz de combinaciones de tipos de opción (estilo Shopify).
- Stock, precio e imagen viven en la variedad cuando existe; el producto solo provee defaults / fallback para precio e imagen.
- Storefront muestra selector inline en la card del grid; sin variedades, render idéntico al actual.
- Carrito/checkout descuenta stock atómicamente sobre la variedad correcta.
- Duplicar producto duplica también opciones + variedades.
- Export CSV refleja variedades con filas hijas.
- RLS preserva el invariante público/privado actual.

**Non-Goals:**
- No se implementa página de detalle de producto (`/[slug]/[producto]`); todo vive en la card del grid.
- No se soporta más de un atributo "global" — los tipos de opción son por producto, no compartidos entre productos.
- No se modelan variantes con SKU externo / código de barras / atributos de envío. Una variedad es: combinación de valores + stock + (precio opcional) + (imagen opcional).
- No se agrega un sistema de inventario / historial / movimientos. Sigue siendo un contador.
- No se introduce caché de matriz pre-calculada en frontend; la matriz se reconstruye on-the-fly desde las filas (catálogos de Wapy son chicos).
- No se migran productos existentes a "variedad por defecto" — quedan simples.

## Decisions

### D1. Modelo de datos: 4 tablas nuevas

```
product_option_types
  id (uuid, pk)
  product_id (uuid, fk products.id, on delete cascade)
  name (text)                           -- "Color", "Talle"
  position (int)                         -- orden de columnas en UI
  created_at (timestamptz)
  unique (product_id, name)

product_option_values
  id (uuid, pk)
  option_type_id (uuid, fk product_option_types.id, on delete cascade)
  value (text)                          -- "Rojo", "M"
  position (int)
  created_at (timestamptz)
  unique (option_type_id, value)

product_variants
  id (uuid, pk)
  product_id (uuid, fk products.id, on delete cascade)
  stock (int, not null, default 0, check stock >= 0)
  price_override (int, nullable, en cents)  -- null = hereda del producto.
                                            -- Convención del proyecto: precios siempre en int/cents
                                            -- (igual que products.price_cents, order_items.unit_price_cents).
  image_url (text, nullable)                -- null = hereda del producto
  position (int)
  created_at (timestamptz)
  updated_at (timestamptz)
  deleted_at (timestamptz, nullable)        -- soft-delete cuando la variedad está en órdenes históricas

product_variant_option_values
  variant_id (uuid, fk product_variants.id, on delete cascade)
  option_value_id (uuid, fk product_option_values.id, on delete cascade)
  primary key (variant_id, option_value_id)
```

**Por qué tablas separadas para tipos y valores:** permite renombrar/reordenar sin tocar variedades, y mantiene normalizado lo que va a la UI del selector. Una alternativa más simple (JSONB en `products`) la descarté porque rompe la validación de unicidad de combinaciones, complica RLS y obliga a parseo en cliente.

**Por qué `price_override` en vez de `price` siempre poblado:** preserva el invariante "si no defino variedades, no me importan". Quien edita la variedad solo carga precio si difiere — la mayoría de los rubros tienen precio uniforme entre variedades de un mismo producto.

**Por qué `stock` siempre poblado en variant (no nullable):** cuando hay variedades, el stock del producto deja de ser fuente de verdad. No tener un default ambiguo evita bugs de "¿de dónde descuento?".

### D2. Relación con stock del producto

- Si `products` tiene `product_variants`, el campo `products.stock` se ignora en validación y descuento. Se mantiene la columna por compatibilidad de queries existentes pero pasa a ser informativo. **No se sincroniza automáticamente** (sumando stock de variedades) — agrega complejidad sin valor, y un campo derivado que se desactualiza es peor que un campo claramente ignorado.
- El dashboard puede mostrar el stock total como suma agregada en la card del producto cuando hay variedades, pero ese número se computa en el server, no se persiste.

### D3. Order items: `variant_id` nullable

```
alter table order_items add column variant_id uuid references product_variants(id);
```

- `variant_id` nullable: un order_item de producto simple lleva `product_id` y `variant_id = null`. Uno de producto con variedades lleva ambos.
- Constraint check opcional: si el producto referenciado tiene variedades, `variant_id` debe ser non-null. Lo dejo a nivel Server Action (validación + RPC), no a nivel DB constraint — el constraint cross-table es engorroso y la Server Action ya es el único punto de escritura.
- Snapshot de precio y nombre de variedad en `order_items` (campos `price_at_purchase`, `variant_label`): obligatorio. Si el dueño cambia precio o nombre de variedad después, el pedido histórico sigue siendo el de la compra.

### D4. Descuento de stock atómico

Hoy hay (o debería haber) un `update products set stock = stock - X where id = ? and stock >= X` dentro de una transacción al confirmar pedido. Mismo patrón sobre `product_variants`:

```sql
update product_variants
   set stock = stock - :qty
 where id = :variant_id and stock >= :qty
returning stock;
```

Si afecta 0 filas → falla con "stock insuficiente" y rollback. La transacción debe agrupar todos los items del pedido para que sea todo-o-nada.

### D5. Generación de matriz de variedades

Producto del usuario: tipos de opción + valores → en el server, **generar producto cartesiano** y persistir como filas de `product_variants` + `product_variant_option_values`.

- Si el usuario agrega un nuevo valor a un tipo existente, el server **crea las variedades nuevas** que correspondan (stock = 0, sin precio ni imagen override), no toca las existentes.
- Si el usuario remueve un valor, las variedades que lo incluían se borran (cascade). Si esas variedades ya están en órdenes, no se borran físicamente — se "archivan" con un soft-delete `deleted_at`. Decisión: agregar `deleted_at timestamptz` a `product_variants` y filtrar en queries públicas.
- Si el usuario agrega un nuevo **tipo** a un producto que ya tiene variedades, se requiere migración de datos (cada variedad existente se replica por cada valor del nuevo tipo). Esto es complejo y poco común; lo dejamos como **operación restringida**: el dashboard solo permite agregar tipos si el producto no tiene variedades aún (matriz vacía). Si quiere cambiar la dimensionalidad, debe borrar variedades primero. Esta restricción se explica en UI.

### D6. UX del selector inline en storefront

Storefront es Server Component (Next.js App Router). El selector necesita interactividad → componente cliente. Patrón:

```
<ProductCard>           {/* server */}
  <ProductCardClient    {/* client */}
    product={...}
    variants={...}      {/* serialized */}
  />
</ProductCard>
```

`ProductCardClient`:
- Mantiene state local `selectedValues: Record<optionTypeId, optionValueId>`.
- Resuelve la variedad activa con un lookup contra `variants` (matriz preserializada).
- Render precio = variant.price_override ?? product.price.
- Render imagen = variant.image_url ?? product.image_url.
- Stock = variant.stock (deshabilita "Agregar" cuando 0).
- Combinaciones inválidas (sin variedad): se grisan los valores que no producen ninguna combinación con la selección actual. Permite "elegir Rojo y deshabilita talles que no existen en rojo".

Cuando el producto no tiene tipos de opción, `ProductCardClient` renderiza exactamente como hoy (sin selectores).

**No se usa URL state** (queryparams) para la variedad activa: el grid puede tener N productos, los queryparams se llenarían y no aporta — no hay deep-linking porque no hay página de detalle.

### D7. RLS

Tres patrones, copiados del existente:

1. **Lectura pública** (storefront): `product_option_types`, `product_option_values`, `product_variants`, `product_variant_option_values` → visibles solo si su producto pertenece a una tienda pública y el producto está publicado. Subquery contra `products` join `stores`.
2. **Escritura por dueño**: el dueño de la tienda (subquery `stores.owner_id = auth.uid()`) puede insert/update/delete.
3. **Imágenes de variedad**: subida vía Server Action + admin client (mismo patrón que productos por gotcha ES256). El path en Storage incluye `store_id/product_id/variant_id/` para aislamiento.

### D8. Duplicar producto

La acción existente clona la fila de `products`. Se extiende para clonar:
1. Sus `product_option_types` y `product_option_values` (nuevos ids).
2. Sus `product_variants` **incluyendo su `stock`, `price_override` e `image_url`** tal cual del original. Consistente con la duplicación de producto simple, que hoy también copia stock e imagen.
3. Las relaciones `product_variant_option_values` mapeando a los nuevos ids.
4. Las imágenes de variedad: **no se copian** archivos físicos en Storage; se reutiliza la misma URL. Si el dueño edita la variedad duplicada y sube imagen nueva, se sobreescribe. Decisión consciente para evitar O(N) writes a Storage en una operación de UX rápida.

### D9. Export CSV

Hoy el CSV tiene una fila por producto. Decisión: **filas hijas** para variedades.

```
sku,name,price,stock,...           <- producto simple o cabecera de producto con variedades
,,,                                 <- (si tiene variedades) opcionalmente fila padre con resumen
sku-variant,name-color-talle,price-override-o-padre,stock-variant,...   <- fila por variedad
```

El consumidor del CSV (probablemente humano viendo Excel) entiende mejor "una fila por SKU comprable". Productos simples siguen siendo una fila como hoy.

### D10. Validaciones Server Action

- Nombre de tipo de opción: no vacío, único dentro del producto, max 32 chars.
- Valor de opción: no vacío, único dentro del tipo, max 32 chars.
- Stock: entero ≥ 0.
- Precio override: numeric ≥ 0 o null.
- Al menos 1 variedad cuando hay tipos de opción (no se permite tipos sin valores).
- Cantidad de variedades acotada: **max 25 por producto** (cubre el clásico 5×5 de indumentaria con 5 colores × 5 talles XS–XL; si alguien necesita más, conviene separar en dos productos para no romper UX del selector inline).

## Risks / Trade-offs

- **[Riesgo] Dueños esperan que el campo `products.stock` siga siendo "el stock"** → la UI debe mostrar claramente que cuando hay variedades el stock se gestiona por variedad. **Mitigación**: el form esconde el input de stock del producto cuando hay variedades, y la card del dashboard muestra "Stock: X (variedades)" con detalle al hover.
- **[Riesgo] Agregar un tipo de opción a un producto con variedades existentes es operación destructiva** (D5). **Mitigación**: bloquear en UI, mensaje claro, exigir borrar variedades primero. Es una restricción aceptable porque es operación rara.
- **[Riesgo] Duplicar producto reutiliza URLs de imágenes de variedad en Storage** (D8) → si el dueño borra el producto original, las URLs del duplicado pueden romper si el storage hace cleanup. **Mitigación**: la política de borrado físico en Storage requiere paso manual (no se borran archivos al borrar fila); ya es así para productos hoy.
- **[Riesgo] Snapshot en `order_items` agrega columnas** → migración mínima, sin downtime, pero los queries de "historial de pedidos" deben usar el snapshot en vez de joinear contra el producto/variedad actual. **Mitigación**: explicitar en código de checkout y en cualquier vista de pedido.
- **[Riesgo] Selector inline en la card del grid se ve apretado en mobile** cuando hay 2 tipos × varios valores. **Mitigación**: en mobile, el selector colapsa los valores en un sub-dropdown o segmented control compacto; usar swatches para "Color" (visual, no texto) reduce ancho.

## Migration Plan

**Despliegue (orden estricto):**
1. Migración SQL de Supabase: nuevas tablas + nueva columna en `order_items` + RLS. Sin tocar `products`.
2. Server Actions nuevas y modificadas (compatibles hacia atrás: si `variant_id` es null, comportamiento actual).
3. Frontend dashboard: form con sección "Variedades" (oculta para productos simples por default).
4. Frontend storefront: render con selector inline (no-op si no hay variedades).
5. Export CSV extendido.

**Rollback:**
- Frontend: revert por deploy (sin migración inversa de datos).
- DB: `drop` de tablas nuevas y de la columna `order_items.variant_id` solo si no hay datos. Si ya hay pedidos con `variant_id`, rollback no es viable sin pérdida → tratarlo como cambio "forward-only" después del primer pedido con variedad.

**Feature flag:** no se requiere — el path "producto simple" es indistinguible del actual y el path "con variedades" solo se activa cuando un dueño explícitamente crea opciones. La feature es opt-in por producto.

## Open Questions

Resueltas con el usuario antes de implementar:

- **OQ1** (resuelta): Duplicar producto **clona variedades incluyendo su stock**, no las pone en 0. Consistente con la duplicación de producto simple actual.
- **OQ2** (resuelta): Selector con **texto en v1**. Swatches reales / paleta queda como mejora visual posterior, fuera del scope de este change.
- **OQ3** (resuelta): Cap de **25 variedades por producto** (5×5).
