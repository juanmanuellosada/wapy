---
name: wapy-storage-jwt-gotcha
description: "Supabase Storage worker en este proyecto no verifica JWTs ES256 → toda policy RLS basada en auth.uid() falla con 403. Workaround obligatorio: subir vía Server Action con admin client."
metadata: 
  node_type: memory
  type: project
  originSessionId: 9367fb09-3813-4586-ab7c-c818d86748d6
---

El proyecto Supabase de Wapy (`gtiujuarwoatjekmljhn`) usa firma asimétrica ES256 para los user JWTs (sub-claim correcto, `role: authenticated`). PostgREST verifica ES256 OK; el **storage worker no**. Resultado: cuando un browser client hace `supabase.storage.from('...').upload(...)`, el `Authorization: Bearer <user-jwt>` llega pero el worker no lo verifica → `auth.uid()` queda NULL → ninguna policy RLS con subquery a `stores.owner_id` o similar matchea → 403 `new row violates row-level security policy`.

**Síntomas históricos:**
- 503 `DatabaseInvalidObjectDefinition` cuando además había recursion bug (resuelto migration 017).
- 403 RLS denial aún después de: legacy anon key, policies role-agnostic, hidratar sesión con `getSession()`. Todos esos arreglos fueron necesarios pero NINGUNO suficiente.

**Why:** Supabase migró user JWTs a ES256 asimétrico; el worker de storage del proyecto está en versión que no lo soporta. No es config del usuario, es un mismatch de versión del worker manage por Supabase platform.

**How to apply:**
- Para CUALQUIER subida/borrado/update de storage que necesite RLS basada en `auth.uid()`, NO usar el browser client. Crear un Server Action que:
  1. Use server-side SSR client para verificar auth.
  2. Verifique ownership a mano (query a la tabla relevante con el user.id).
  3. Use el admin client (service role) para hacer la operación de storage.
- Ver `lib/onboarding/upload-actions.ts` para el patrón canónico (PR #25).
- `next.config.ts` tiene `experimental.serverActions.bodySizeLimit: '6mb'` para archivos de 5MB + overhead.

**Limitación residual:** `deleteImage` en `lib/onboarding/storage.ts` sigue siendo browser-side. Va a fallar 403 cuando se use seriamente. Aplicar mismo patrón cuando toque.

Relacionado: [[wapy-infra-decisions]]
