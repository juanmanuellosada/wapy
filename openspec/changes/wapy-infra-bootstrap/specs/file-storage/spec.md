## ADDED Requirements

### Requirement: Two storage buckets exist with public read

The system SHALL provision two Supabase Storage buckets: `product-images` and `store-logos`. Both buckets SHALL allow public read access (no authentication required to GET an object). Storefronts are public, so all product images and logos are public assets by design.

#### Scenario: Anonymous client can GET a product image

- **WHEN** an unauthenticated browser requests an object URL from `product-images`
- **THEN** the object is served with HTTP 200

#### Scenario: Anonymous client can GET a store logo

- **WHEN** an unauthenticated browser requests an object URL from `store-logos`
- **THEN** the object is served with HTTP 200

### Requirement: Writes are scoped to the owning store_id prefix

The system SHALL allow an authenticated user to write objects only under a path whose first segment matches a `store_id` whose `owner_id = auth.uid()`. Path layout: `{store_id}/{filename}`. This applies to both buckets.

#### Scenario: Owner uploads to own store path

- **WHEN** owner A (`auth.uid() = A`, owns store with `id = S`) uploads to `product-images/S/abc.jpg`
- **THEN** the upload succeeds

#### Scenario: Owner cannot upload to another store's path

- **WHEN** owner A attempts to upload to `product-images/X/abc.jpg` where `X` is another owner's store
- **THEN** the storage policy rejects the upload

#### Scenario: Anonymous client cannot upload

- **WHEN** an unauthenticated client attempts to upload to either bucket
- **THEN** the storage policy rejects the upload

### Requirement: Store logo path is conventional

The system SHALL adopt the convention that each store's logo is stored at `store-logos/{store_id}/logo.{ext}` (where `ext` is one of `png`, `jpg`, `jpeg`, `webp`, `svg`). Re-uploading a logo overwrites the previous file.

#### Scenario: Logo re-upload overwrites

- **WHEN** a store uploads `store-logos/S/logo.png` and later uploads a new file with the same name
- **THEN** the latter overwrites the former and `stores.logo_url` continues to resolve to the latest content

### Requirement: Superadmin has unrestricted storage access

The system SHALL allow superadmins to read, write, and delete any object in either bucket (for moderation and support purposes).

#### Scenario: Superadmin deletes a product image from any store

- **WHEN** a superadmin issues a delete against `product-images/X/abc.jpg`
- **THEN** the operation succeeds regardless of which owner owns store `X`
