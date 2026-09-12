## 1. Acotar lo que cruza al cliente

- [x] 1.1 En `lib/storefront/resolve.ts`, definir un tipo explícito para los datos de tienda que pueden llegar al navegador: id, nombre, slug, descripción, logo, tema, redes, WhatsApp, modo de checkout y preferencias de orden del catálogo
- [x] 1.2 Seguir leyendo del servidor los campos que necesita `isPubliclyAvailable` (`lib/subscription/state.ts`), sin agregar una segunda consulta — el problema no es leerlos, es pasarlos
- [x] 1.3 Proyectar el resultado a ese tipo público antes de devolverlo, tanto en el camino de tienda publicada como en el de mantenimiento
- [x] 1.4 Que el tipo excluya por omisión: si mañana se agrega una columna a `stores`, no debe aparecer sola en el payload

## 2. Consumidores

- [x] 2.1 Actualizar `app/[slug]/page.tsx`, `StoreClient.tsx`, `MaintenancePage.tsx` y cualquier otro consumidor del prop `store` para que usen el tipo acotado
- [x] 2.2 Si algún consumidor necesita un campo que quedó afuera, agregarlo al tipo público de forma deliberada y dejar dicho por qué — no ensanchar el tipo por comodidad

## 3. Test de regresión

- [x] 3.1 Test sobre el objeto que se entrega al componente cliente —no sobre la forma de la consulta— que falle si aparece cualquiera de: plan, contador de pedidos, identificador o estado de suscripción, fechas de prueba/bloqueo/cambio de estado, exención de pago y su motivo, identificador del dueño, o configuración del ciclo de vida de pedidos
- [x] 3.2 Cubrir los dos caminos: tienda publicada y tienda en mantenimiento
- [x] 3.3 Verificar que el test no es tautológico: revertir el fix a propósito, ver el test fallar, restaurarlo

## 4. Verificación

- [x] 4.1 `npx tsc --noEmit`, `npx vitest run` y `npm run build` (con `--webpack`, no Turbopack)
- [ ] 4.2 Abrir una tienda publicada y confirmar que se ve igual que antes
- [ ] 4.3 Confirmar que una tienda bloqueada sigue mostrando mantenimiento
- [ ] 4.4 Verificar en producción, después de desplegar, que el HTML de una tienda publicada ya no contiene los campos internos

## 5. Notas de implementación

- La consulta de `stores` quedó con `select('*')` en lugar de columnas explícitas: la garantía se puso enteramente en la proyección al tipo público, que es lo que efectivamente cruza al cliente (decisión D1 — el problema no es leer los campos, es pasarlos). Equivalente en efecto; si se quiere además ahorrar bytes entre Postgres y el servidor, acotar el `select` es una mejora aparte.
- `default_product_sort` y `out_of_stock_last` entraron al tipo público aunque hoy ningún componente cliente los lee (el orden del catálogo se resuelve en el servidor). No son datos sensibles; si se quiere respetar al pie el criterio de "solo lo que se usa", se pueden sacar sin romper nada.
- Falta 4.2, 4.3 (verificación en navegador) y 4.4 (verificación en producción tras desplegar).
