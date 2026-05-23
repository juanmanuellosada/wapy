## ADDED Requirements

### Requirement: /dashboard routes to the correct section based on store state

The system SHALL handle requests to `/dashboard` by checking the owner's store state. If no store exists or `status='draft'`, redirect to `/onboarding`. Otherwise (published or paused), redirect to `/dashboard/info`.

#### Scenario: Published owner lands on info section

- **WHEN** an owner with `status='published'` visits `/dashboard`
- **THEN** the response redirects to `/dashboard/info`

#### Scenario: Owner without store goes to onboarding

- **WHEN** an authenticated owner with no `stores` row visits `/dashboard`
- **THEN** the response redirects to `/onboarding`

#### Scenario: Draft store stays in wizard

- **WHEN** an owner with `status='draft'` visits `/dashboard`
- **THEN** the response redirects to `/onboarding` (which further routes to the appropriate wizard step)

### Requirement: Dashboard renders a sidebar with 6 sections and live store link

The system SHALL render a sidebar nav with 6 nav items (Info, Imagen, Secciones, Productos, WhatsApp, Configuración), the Wapy logo at top, a "Ver tienda ↗" external link to `{NEXT_PUBLIC_APP_URL}/{slug}` (target=_blank), and a logout form. The current section SHALL be highlighted.

#### Scenario: Sidebar shows all sections with current highlight

- **WHEN** the owner is on `/dashboard/products`
- **THEN** the sidebar renders all 6 nav items with "Productos" visually highlighted

#### Scenario: Ver tienda link points to live URL

- **WHEN** the owner clicks "Ver tienda" in the sidebar
- **THEN** a new tab opens to `{NEXT_PUBLIC_APP_URL}/{store.slug}` (the storefront route is delivered in Fase 6; until then the link may 404)

#### Scenario: Logout from sidebar works

- **WHEN** the owner submits the logout form in the sidebar
- **THEN** session cookies are cleared and the response redirects to `/`

### Requirement: InfoPanel edits name and description

The system SHALL allow editing `stores.name` and `stores.description` from `/dashboard/info`. Submit calls `saveStoreBasics({ name, description })` and persists; `onboarding_step` is NOT modified (the store is already past the wizard).

#### Scenario: Edit name and persist

- **WHEN** the owner changes the name to "Mi Tienda Nueva" and clicks Guardar
- **THEN** `stores.name` is updated, a toast confirms the save, and refresh shows the new name

### Requirement: ImagePanel edits logo and accent color

The system SHALL allow re-uploading the logo and changing the accent color from `/dashboard/image`, using the same `LogoUploader` + 6-swatch palette as the wizard. Saves call `saveStoreLook({ accent_color, logo_url? })`.

#### Scenario: Replace logo

- **WHEN** the owner uploads a new logo file
- **THEN** the file replaces the existing at `store-logos/{store_id}/logo.{ext}` and `stores.logo_url` is updated

#### Scenario: Change accent color

- **WHEN** the owner clicks a different swatch and clicks Guardar
- **THEN** `stores.theme.accent_color` is updated to the new hex

### Requirement: SectionsPanel and ProductsPanel allow CRUD and reorder

The system SHALL allow CRUD on sections and products from `/dashboard/sections` and `/dashboard/products`. Reorder via drag (using `SortableList`). Per-product `is_active` toggle from the card. Modal for product edit (reuse `ProductModal` from store components).

#### Scenario: Add a new product post-publication

- **WHEN** the owner clicks "+ Agregar producto" on `/dashboard/products` and submits the modal
- **THEN** a new `products` row is INSERTed for the current store and appears in the list

#### Scenario: Toggle product visibility without delete

- **WHEN** the owner clicks the active toggle on a product card to set `is_active = false`
- **THEN** the row is UPDATEd and (in Fase 6) the public storefront stops showing it, but the row stays for re-enable later

#### Scenario: Delete a section sets products' section_id to NULL

- **WHEN** the owner deletes a section that has products
- **THEN** the section row is DELETEd; matching products have their `section_id` set to NULL via the existing FK cascade rule

### Requirement: WhatsappPanel edits the WhatsApp number with E.164 validation

The system SHALL allow editing `stores.whatsapp_number` from `/dashboard/whatsapp` with the same E.164 validation as the wizard.

#### Scenario: Update WhatsApp number

- **WHEN** the owner edits the number to a valid E.164 value and clicks Guardar
- **THEN** `stores.whatsapp_number` is updated and the preview of the `wa.me/...` URL refreshes

### Requirement: SettingsPanel includes slug rename with confirmation

The system SHALL allow renaming the slug from `/dashboard/settings` with a confirmation modal that previews "wapy.com.ar/{old} → wapy.com.ar/{new}". The action SHALL succeed only if the new slug passes `checkSlugAvailable`. The DB trigger `archive_old_slug` (from Fase 1 migration 009) automatically writes the previous slug to `slug_history`.

#### Scenario: Slug rename triggers history insert

- **WHEN** the owner confirms a rename from `tienda-vieja` to `tienda-nueva`
- **THEN** `stores.slug` is updated, a row appears in `slug_history` with `old_slug='tienda-vieja'`, and a toast confirms

#### Scenario: Rename to a taken slug is blocked

- **WHEN** the owner attempts to rename to a slug already in use by another store
- **THEN** the action returns an error and no mutation occurs

#### Scenario: Rename to a reserved slug is blocked

- **WHEN** the owner attempts to rename to `admin` or another reserved word
- **THEN** the action returns an error citing the reserved list

### Requirement: SettingsPanel includes pause/unpause toggle

The system SHALL provide a switch in `/dashboard/settings` that toggles `stores.status` between `'published'` and `'paused'` (never to `'draft'`). The toggle SHALL require confirmation before mutating.

#### Scenario: Pause an active store

- **WHEN** the owner toggles "Tienda activa" off on a published store
- **THEN** a confirmation modal appears; on confirm, `stores.status` is set to `'paused'`

#### Scenario: Unpause a paused store

- **WHEN** the owner toggles the switch on for a paused store
- **THEN** `stores.status` is set back to `'published'` (no second `published_at` set — the original timestamp is preserved)

### Requirement: SettingsPanel includes a permanent delete with strict confirmation

The system SHALL provide a "Eliminar tienda" action in `/dashboard/settings`. The action SHALL require the owner to type their exact current slug to enable the delete button. The action SHALL remove all storage files (product images + logo) for that store and DELETE the store row (cascading to sections, products, and slug_history via FKs).

#### Scenario: Delete with correct slug typed

- **WHEN** the owner types their exact slug into the confirmation input and clicks "Eliminar"
- **THEN** all files under `product-images/{store_id}/` and `store-logos/{store_id}/` are removed from Storage, the store row is DELETEd (cascade), and the response redirects to `/onboarding`

#### Scenario: Delete blocked without correct slug

- **WHEN** the owner clicks the delete button with the slug field empty or mismatched
- **THEN** the action does not fire (button is disabled) and no mutation occurs

#### Scenario: Storage cleanup failures are logged but do not block delete

- **WHEN** the storage `.remove()` call fails (e.g., timeout) for some files but the DB DELETE succeeds
- **THEN** the action logs the orphaned file paths and still returns success (orphan files acceptable; future cleanup job)

### Requirement: Refactor — shared store components live in `app/components/store/`

The system SHALL move `ProductModal`, `ImageUpload`, `LogoUploader`, and `SortableList` from `app/onboarding/components/` to `app/components/store/`. Both `/onboarding` and `/dashboard` SHALL import from the new location. The wizard-specific `Step*` components stay in `app/onboarding/components/`.

#### Scenario: Wizard still works after refactor

- **WHEN** the components are moved and imports updated
- **THEN** the wizard at `/onboarding/*` continues to function identically, with no regressions in build or runtime

### Requirement: Refactor — shared store actions live in `lib/store/actions.ts`

The system SHALL extract the pure edit actions (`saveBasics`, `saveLook`, `saveSection`, `saveProduct`, `saveWhatsapp`) from `lib/onboarding/actions.ts` to `lib/store/actions.ts`. The wizard-specific actions (`checkSlugAvailable`, `publishStore`, `advanceProductsStep`, and any `onboarding_step` increments) stay in `lib/onboarding/actions.ts`. The wizard SHALL continue to import edit actions from the new location and orchestrate step increments separately.

#### Scenario: Wizard still saves correctly after action refactor

- **WHEN** an owner uses the wizard to save basics
- **THEN** the basics persist AND `onboarding_step` is advanced — the latter handled by the wizard's own orchestration calling both the store action and a separate step-increment

#### Scenario: Dashboard saves without touching onboarding_step

- **WHEN** an owner edits info from the dashboard and clicks Guardar
- **THEN** the store row is updated and `onboarding_step` remains unchanged
