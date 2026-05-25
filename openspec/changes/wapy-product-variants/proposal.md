## Why

Hoy un producto en Wapy es una única SKU con un solo precio, una sola imagen y un solo contador de stock. Esto deja afuera rubros muy comunes (indumentaria con color/talle, alimentos con sabor/peso, productos en distintas presentaciones) y obliga al dueño a crear N productos casi idénticos, ensuciando el catálogo y rompiendo el reporte de stock. Agregar variedades por producto desbloquea esos rubros sin forzar a nadie a usarlas: los productos actuales siguen funcionando exactamente igual.

## What Changes

- Un producto puede definir **0..N tipos de opción** (ej. `Color`, `Talle`) y cada tipo sus valores. Sin tipos de opción, el producto es "simple" y se comporta como hoy.
- Si el producto tiene tipos de opción, se generan **variedades** (combinaciones de valores). Cada variedad tiene:
  - **Stock propio** (obligatorio cuando hay variedades — el stock del producto deja de usarse para esas filas).
  - **Precio opcional** que sobreescribe el del producto (si está vacío, hereda).
  - **Imagen opcional** en Storage (si está vacía, hereda la del producto).
- **Storefront**: la card del grid muestra selectores inline (uno por tipo de opción). Al elegir una combinación, la card refleja precio, imagen y stock de esa variedad. Sin variedades, la card es idéntica a la actual.
- **Carrito / checkout**: cada línea registra `variant_id` cuando aplica. Validación y descuento de stock operan sobre la variedad. Productos simples siguen descontando stock del producto.
- **Dashboard**: el form de alta/edición de producto incorpora una sección "Variedades" con tabla editable (stock + precio opcional + imagen opcional por fila). La duplicación de producto duplica también sus tipos de opción y variedades. El export CSV incluye filas de variedades cuando existen.
- **Migración no invasiva**: tablas nuevas (`product_option_types`, `product_option_values`, `product_variants`, `product_variant_option_values`). Productos existentes no se tocan; no se les crea variedad "default".
- **Storage**: las imágenes de variedad se suben vía Server Action + admin client (mismo patrón que productos, por el gotcha conocido de ES256 + RLS).

## Capabilities

### New Capabilities
- `product-variants`: define el modelo de variedades por producto (tipos de opción, valores, combinaciones), sus reglas de stock/precio/imagen y cómo interactúan con storefront, carrito, checkout y dashboard. Capability cross-cutting que vive como contrato único para esta feature.

### Modified Capabilities
<!-- openspec/specs/ está vacío al momento de proponer este cambio; las features previas existen como changes activos no archivados, no como specs vivos. Por eso esta feature consolida sus reglas en una nueva capability dedicada en vez de modificar specs inexistentes. -->

## Impact

**Base de datos (Supabase / Postgres)**
- Nuevas tablas: `product_option_types`, `product_option_values`, `product_variants`, `product_variant_option_values`.
- Nueva columna en `order_items` (o equivalente): `variant_id` nullable.
- RLS para todas las tablas nuevas: lectura pública condicionada a tienda pública + producto público; escritura solo para el dueño de la tienda.

**Storage**
- Nuevo bucket / prefijo para imágenes de variedad (o reutiliza el de productos con convención de path). Subidas siempre vía Server Action + admin client.

**Server Actions / API**
- Acciones nuevas / extendidas para CRUD de tipos de opción, valores y variedades.
- Acción existente de "agregar al carrito" debe aceptar `variantId`.
- Acción existente de "confirmar pedido" debe descontar stock de variedades.
- Acción existente de "duplicar producto" debe duplicar opciones + variedades.

**Frontend**
- Dashboard: nueva sección "Variedades" en el form de producto (tabla editable + uploader de imagen por fila).
- Storefront: selector inline en la card del grid + lógica de variedad activa (precio/imagen/stock).
- Carrito: render del nombre de variedad junto al producto.

**Export CSV**
- Filas hijas por variedad cuando existan.

**Sin impacto**
- Productos sin variedades quedan exactamente como hoy (precio/stock/imagen del producto).
- Routing público `/[slug]` no cambia.
- Sentry / observabilidad: solo se suman eventos nuevos al patrón existente.
