## ADDED Requirements

### Requirement: Logo upload is single, replaceable, scoped to store_id

The system SHALL provide an `ImageUpload` component used in `/onboarding/look` that uploads exactly one logo per store to `store-logos/{store_id}/logo.{ext}`. Re-uploading replaces the existing file (same path overwritten). A delete button SHALL remove the file from the bucket and set `stores.logo_url=NULL`.

#### Scenario: First logo upload

- **WHEN** an owner drops a `.png` file (under 2MB) into the logo dropzone
- **THEN** the file is uploaded to `store-logos/{store_id}/logo.png`, `stores.logo_url` is set to the public URL, and a preview renders

#### Scenario: Replace existing logo

- **WHEN** an owner uploads a new logo while one already exists
- **THEN** the existing file at the same path is overwritten and `stores.logo_url` is updated to the new URL (same path, cache-busted via signed timestamp if necessary)

#### Scenario: Delete logo

- **WHEN** an owner clicks the delete button on a present logo
- **THEN** the file is removed from Storage and `stores.logo_url` is set to NULL

### Requirement: Product images allow up to 5 per product, ordered by upload time

The system SHALL allow a product to have up to 5 images stored at `product-images/{store_id}/{uuid}.{ext}`. The order in `products.image_urls[]` SHALL reflect upload order (newest at the end). A delete button on each thumbnail SHALL remove the file and the corresponding URL from the array.

#### Scenario: Owner uploads multiple images

- **WHEN** the owner selects 3 images in the product form
- **THEN** each is uploaded with a unique UUID filename, all URLs are appended to `products.image_urls` in order, and 3 thumbnails appear in the form

#### Scenario: Sixth image is rejected

- **WHEN** the owner attempts to upload a 6th image to a product that already has 5
- **THEN** the UI shows "Máximo 5 imágenes por producto" and the upload does not start

#### Scenario: Delete removes from bucket and array

- **WHEN** the owner clicks delete on the 2nd image of a product
- **THEN** the file is removed from `product-images/{store_id}/{filename}` and that URL is removed from `products.image_urls[]`

### Requirement: Uploads respect MIME type and size limits

The system SHALL enforce client-side limits on uploads: PNG/JPG/JPEG/WEBP/SVG for logos, same plus no SVG for product images, and max 2MB per file for both. The component SHALL reject invalid files immediately with a clear error.

#### Scenario: Oversized file rejected

- **WHEN** an owner attempts to upload a 3MB image
- **THEN** the UI shows "Imagen muy pesada. Máximo 2MB." and the upload does not start

#### Scenario: Wrong MIME type rejected

- **WHEN** an owner attempts to upload a .pdf file as a logo
- **THEN** the UI shows "Formato no permitido. Usá PNG, JPG, WEBP, o SVG." and the upload does not start

### Requirement: Storage writes are scoped to caller's store

The system SHALL rely on the existing Supabase Storage RLS policies from Fase 1, which scope write operations to `{store_id}/...` prefixes owned by the caller. The client-side upload helper SHALL construct paths starting with the store's `id` to satisfy these policies.

#### Scenario: Upload uses store_id prefix

- **WHEN** an owner uploads any image during the wizard
- **THEN** the destination path always starts with their `store_id` (e.g., `store-logos/abc-uuid/...`), satisfying the RLS policy `(storage.foldername(name))[1] IN (SELECT id::text FROM public.stores WHERE owner_id = auth.uid())`

#### Scenario: Storage policy rejects mismatch

- **WHEN** any caller attempts to upload to a path whose first segment is a store_id they do not own
- **THEN** Supabase Storage rejects the request based on the RLS policy and the UI surfaces the error
