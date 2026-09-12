## Context

`_resolveStoreSlug` (`lib/storefront/resolve.ts:75`) resuelve el slug contra `stores` con `select('*')` y usa la fila para dos cosas distintas: decidir disponibilidad (`isPubliclyAvailable`, que lee `payment_exempt`, `blocked_at`, `mp_subscription_status`, `subscription_status_changed_at`, `mp_preapproval_id` y `trial_ends_at`) y alimentar el render. El problema es que la **misma** fila se pasa como prop a componentes cliente, así que todo lo que se leyó para decidir termina serializado en el HTML.

Los consumidores reales son acotados: `StoreClient` usa `name`, `slug`, `id`, `logo_url`, `theme`, `description`, `social_links` y `whatsapp_number`; `MaintenancePage` usa `name`, `logo_url` y `theme`.

## Goals / Non-Goals

**Goals:**
- Que ningún campo interno de negocio salga en el payload público.
- Que la protección sobreviva al crecimiento del esquema, sin depender de que alguien recuerde actualizar un `select`.
- Cero cambio visible en la tienda.

**Non-Goals:**
- Auditar todo el proyecto. Este fix es la fila de `stores` en la ruta pública.
- Cambiar RLS. El problema no es de permisos de fila: la tienda publicada **debe** ser legible por anónimos. Es qué columnas se piden y qué se pasa al cliente.

## Decisions

### D1 — Separar "lo que el servidor lee" de "lo que el cliente recibe"

Son dos conjuntos distintos y hoy están colapsados en uno. La consulta sigue trayendo los campos de suscripción porque la decisión de mantenimiento los necesita; lo que cambia es que el resultado se proyecta a un objeto público antes de cruzar al cliente.

**Alternativa descartada**: solo acotar el `select` a las columnas públicas y hacer una segunda consulta para el chequeo de suscripción. Duplica un viaje a la base en la ruta más caliente del producto a cambio de nada: el problema no es leer los campos, es pasarlos.

### D2 — La frontera se expresa en el tipo, no en una lista de columnas

Si la garantía fuera solo un `select` con nombres, agregar mañana una columna sensible a `stores` no rompería nada visible y la filtración volvería en silencio. Definiendo un tipo público explícito para lo que cruza al cliente, cualquier campo nuevo queda afuera por omisión: hay que agregarlo a propósito para exponerlo.

Es el mismo criterio que el change de costo aplicó a `products` estrechando su tipo, y conviene que ambos se lean igual.

### D3 — Test sobre el objeto serializado, no sobre la consulta

Un test que afirme la forma del `select` pasa aunque después alguien pase la fila entera por otro camino. El test tiene que tomar el objeto que se entrega al componente cliente y verificar que no contenga ninguna de las claves internas, nombrándolas explícitamente. Es la misma técnica que se usó para el payload de productos.

## Risks / Trade-offs

- **Algún consumidor usaba un campo que ahora no viaja** → `tsc` lo detecta en compilación: al estrechar el tipo, cualquier lectura de un campo excluido deja de compilar. Si aparece uno legítimo, se agrega al tipo público de forma deliberada.
- **Conflicto con el change de costo** → Ambos tocan `resolve.ts`. Este va primero y el de costo reconcilia encima; los dos cambios son en consultas distintas del mismo archivo, así que el conflicto es de contexto, no de lógica.
- **Queda expuesto que la tienda existe, su nombre y su WhatsApp** → Es el propósito de una tienda pública. No hay nada que ocultar ahí.

## Migration Plan

1. Desplegar. No hay migración, no hay cambio de datos, y la tienda se ve exactamente igual.
2. Verificar en producción que el HTML de una tienda publicada ya no contiene los campos internos.
3. **Rollback**: revertir el despliegue. Nada persistente cambia.
