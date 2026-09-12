## 1. Migración

- [x] 1.1 Crear `042_cost_is_estimated.sql` con cabecera comentada, referenciando el `design.md` de este change
- [x] 1.2 `order_items.cost_is_estimated boolean NOT NULL DEFAULT false` — el default describe el camino normal, que es congelar al vender
- [x] 1.3 Marcar como estimadas las líneas con costo cuyo pedido sea anterior al 2026-09-11: ninguna línea previa al despliegue del costo puede tener un costo real congelado (decisión D3). Son las 39 completadas a mano en la tienda que motivó este change
- [x] 1.4 Verificar tras aplicar que esas 39 quedaron marcadas y que ninguna línea de un pedido posterior lo quedó — pendiente de 6.4 (no se aplicó a producción por instrucción explícita)
- [x] 1.5 Anotar que el rollback es `DROP COLUMN`
- [x] 1.6 Regenerar `lib/supabase/types.ts` desde la base ya migrada — verificado que el tipo escrito a mano (`boolean` en Row, opcional en Insert/Update) es idéntico al que genera Supabase para una columna `NOT NULL DEFAULT`, igual que `coupon_counted`. No se regeneró para no arrastrar el reordenamiento cosmético del generador — pendiente de 6.4; mientras tanto se agregó `cost_is_estimated` a mano en `order_items` (Row/Insert/Update) para no romper `tsc`/`build` sin migración aplicada

## 2. Renumeración de los changes pendientes

- [x] 2.1 `add-manual-sales`: su migración pasa de `042` a `043` en proposal, design y tasks
- [x] 2.2 `add-order-action-undo`: su migración pasa de `043` a `044` en proposal, design y tasks

## 3. Contar y completar

- [x] 3.1 Server action que cuente las líneas sin costo de un producto, devolviendo cantidad de líneas y de pedidos distintos — el texto de confirmación habla de pedidos, no de líneas
- [x] 3.2 Server action que complete esas líneas, asignando a cada una el costo efectivo que le corresponde (`coalesce(variante.cost_override, producto.cost_cents)`, la misma regla de `resolveEffectiveCost`)
- [x] 3.3 Condición innegociable: solo líneas con `cost_at_purchase IS NULL`. Nunca pisar un costo existente (decisión D1)
- [x] 3.4 Marcar como estimadas las líneas completadas
- [x] 3.5 Excluir las líneas cuyo producto ya no exista en el catálogo
- [x] 3.6 Verificar pertenencia del producto a la tienda y gatear a Pro en el servidor
- [x] 3.7 Tests: completa solo las vacías; no toca una con costo aunque difiera; variante con override toma el suyo y sin override hereda; producto borrado queda afuera; completar dos veces no cambia nada; producto de otra tienda se rechaza; tienda no-Pro se rechaza

## 4. Interfaz

- [x] 4.1 Después de guardar un costo en `ProductModal.tsx`, si hay líneas sin costo, ofrecer completarlas indicando **cuántos pedidos** y que el resultado es estimado
- [x] 4.2 Lo mismo al guardar un `cost_override` en la grilla de variantes
- [x] 4.3 Que el guardado del costo quede firme aunque el completado se rechace o falle (decisión D2)
- [x] 4.4 Indicar en el detalle del pedido cuando su costo es estimado
- [x] 4.5 Indicar en la tarjeta de ganancia cuando parte del total proviene de líneas estimadas
- [x] 4.6 No ofrecer nada cuando el producto no tiene líneas sin costo

## 5. Métricas

- [x] 5.1 Exponer desde `lib/store/orders/margin.ts` si el período incluye líneas estimadas, **sin alterar** el cálculo de costo, ganancia, margen ni cobertura
- [x] 5.2 Tests: una línea estimada aporta igual que una real; el indicador aparece solo cuando corresponde

## 6. Verificación

- [x] 6.1 `npx tsc --noEmit`, `npx vitest run` y `npm run build` (con `--webpack`, no Turbopack)
- [ ] 6.2 Probar en el navegador: cargar el costo de un producto ya vendido, aceptar completar, y ver la ganancia aparecer con el aviso de estimado — no realizado en esta sesión
- [ ] 6.3 Probar que rechazar el ofrecimiento deja el costo guardado y los pedidos intactos — no realizado en esta sesión
- [x] 6.4 Aplicar la migración a producción — aplicada 2026-09-11 — deliberadamente NO hecho (instrucción explícita)
- [x] 6.5 Verificar en producción que las líneas ya completadas a mano figuran como estimadas — 39 marcadas, 0 con costo real marcado por error, 0 inconsistentes — pendiente de 6.4
