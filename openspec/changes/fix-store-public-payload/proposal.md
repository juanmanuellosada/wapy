## Why

La consulta pública de la tienda (`lib/storefront/resolve.ts`) trae la fila de `stores` con `select('*')`, y esa fila se pasa completa como prop a un componente cliente (`app/[slug]/page.tsx:157`). RLS filtra filas, no columnas, así que el HTML público de **toda tienda publicada** incluye hoy campos internos de negocio: el plan que paga, `order_seq` —el volumen acumulado de pedidos—, el estado y el identificador de su suscripción de Mercado Pago, las fechas de prueba y bloqueo, la exención de pago con su motivo, el `owner_id` y la configuración interna de WhatsApp.

No es una credencial ni habilita ninguna acción contra la cuenta, pero es información comercial de los clientes de Wapy visible para cualquiera que abra el inspector del navegador: un competidor puede leer el volumen de pedidos y el plan de cada tienda.

## What Changes

- **La tienda pública recibe solo lo que necesita para renderizarse**: nombre, slug, descripción, logo, tema, redes, número de WhatsApp, modo de checkout y preferencias de orden del catálogo.
- **Los campos de suscripción se siguen leyendo del lado del servidor** —hacen falta para decidir si la tienda se muestra o aparece en mantenimiento— pero **dejan de cruzar la frontera al cliente**.
- **La frontera queda expresada en el tipo**, no solo en el `select`: el objeto que viaja al componente cliente tiene un tipo propio que no incluye los campos internos, de modo que agregarle una columna sensible a `stores` en el futuro no la filtre sola.
- **BREAKING** interno: el prop `store` de los componentes de la tienda pública cambia de la fila completa a ese tipo acotado.

## Capabilities

### New Capabilities
- `storefront-payload-privacy`: qué datos de la tienda pueden cruzar al cliente en la tienda pública y cuáles no, y cómo se garantiza que siga siendo así cuando el esquema crezca.

### Modified Capabilities
<!-- `public-storefront` no cambia de requisito funcional: la tienda se ve y se comporta igual. Lo que cambia es qué viaja en el payload, que es una capacidad nueva y no una modificación de su comportamiento. -->

## Impact

- `lib/storefront/resolve.ts`: columnas explícitas en la consulta de `stores` y tipo acotado para lo que se expone.
- `app/[slug]/page.tsx`, `app/[slug]/StoreClient.tsx`, `app/[slug]/MaintenancePage.tsx` y lo que consuma el prop `store`.
- `lib/subscription/state.ts` sigue recibiendo los campos que necesita, del lado del servidor.
- **Sin migración y sin cambios de base**: es únicamente qué se selecciona y qué se pasa.
- **Orden**: va antes que `add-product-cost-tracking` y se despliega solo. Ambos tocan `lib/storefront/resolve.ts`, así que el change de costo deberá reconciliar sobre este.
- **Fuera de alcance**: la consulta de `sections`, que también usa `select('*')` pero no tiene columnas sensibles; auditar el resto del proyecto; y el `select('*')` de `products`, que corrige el change de costo.
