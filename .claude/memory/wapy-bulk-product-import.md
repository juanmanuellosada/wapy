---
name: wapy-bulk-product-import
description: Alta masiva de productos por ZIP de fotos + grilla de edición masiva, exclusivo del plan Pro, shippeado a prod 2026-08-14
metadata:
  type: project
---

Alta masiva de productos (plan Pro) shippeada a producción el 2026-08-14, commit `173ff6a`. OpenSpec change `add-bulk-product-import` (dos capabilities: `bulk-product-import` y `bulk-product-editing`), sin migración de esquema.

Decisión no obvia: **el ZIP se descomprime en el navegador con `fflate` (import dinámico), no en el servidor**. `next.config.ts` fija `serverActions.bodySizeLimit: '10mb'`; subir el ZIP entero obligaría a levantar ese límite para *todas* las actions y a concentrar N `sharp` en una sola invocación (timeout). Las fotos suben de a 3 en paralelo reusando `uploadProductImageAction` sin modificarla.

Otras decisiones que conviene no revertir sin pensarlo: los productos nacen en **borrador** (`is_active = false`) aunque se cargue un precio común, porque los nombres salen del nombre del archivo y suelen necesitar corrección antes de publicar; la grilla opera sobre **todo el catálogo** con filtro de borradores, no sobre "el último import" (eso habría requerido un `import_batch_id` y una migración); y un único flag `allowBulkProducts` gatea import y grilla porque se venden como una sola capacidad Pro.

Límites: ZIP ≤ 60 MB, ≤ 100 fotos (rechaza el lote entero, no trunca), concurrencia 3.

**PENDIENTE**: las pruebas manuales en navegador (tareas 6.3 y 6.4 de `tasks.md`) nunca se corrieron — se deployó a prod sin verificación de runtime. El change tampoco está archivado con `/opsx:archive`.

Relacionado: [[wapy-promo-price]], [[wapy-project-state]], [[wapy-storage-jwt-gotcha]].
