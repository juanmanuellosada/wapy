## ADDED Requirements

### Requirement: Owner enters the wizard at the correct step

The system SHALL route `/onboarding` to the correct step based on the owner's current state. If no `stores` row exists for the owner, redirect to `/onboarding/basics`. If a `stores` row exists with `status='draft'`, redirect to `/onboarding/{step}` matching `onboarding_step`. If `status='published'` or `'paused'`, redirect to `/dashboard`.

#### Scenario: New owner with no store

- **WHEN** an authenticated owner with no `stores` row visits `/onboarding`
- **THEN** the response redirects to `/onboarding/basics`

#### Scenario: Owner mid-wizard returning later

- **WHEN** an authenticated owner with `stores.status='draft'` and `onboarding_step=3` visits `/onboarding`
- **THEN** the response redirects to `/onboarding/products` (the step matching index 3)

#### Scenario: Owner with published store

- **WHEN** an authenticated owner with `stores.status='published'` visits `/onboarding`
- **THEN** the response redirects to `/dashboard`

### Requirement: Steps cannot be skipped forward

The system SHALL enforce that an owner cannot navigate directly to a step beyond their current `onboarding_step`. Attempting to do so redirects them to the correct current step.

#### Scenario: Skip-forward is blocked

- **WHEN** an owner with `onboarding_step=2` (look completed) navigates directly to `/onboarding/whatsapp`
- **THEN** the system redirects them to `/onboarding/sections` (their actual current step)

#### Scenario: Going back is allowed

- **WHEN** an owner with `onboarding_step=5` navigates to `/onboarding/basics`
- **THEN** the page renders normally allowing the owner to edit prior data

### Requirement: Each step autosaves on "Siguiente"

The system SHALL persist the current step's data to the database only when the owner clicks "Siguiente". On successful save, `stores.onboarding_step` is updated to the next step's index.

#### Scenario: Successful step save advances onboarding_step

- **WHEN** an owner on `/onboarding/basics` clicks "Siguiente" with valid data
- **THEN** the data is INSERTed/UPDATEd in `stores`, `onboarding_step` is set to 1, and the response redirects to `/onboarding/look`

#### Scenario: Failed validation does not advance

- **WHEN** an owner submits a step with invalid data (e.g., slug already taken)
- **THEN** the form remains on the current step with a specific error message and no DB mutation occurs

### Requirement: Stepper component shows progress and allows back-navigation

The system SHALL render a stepper UI (sidebar on desktop, top bar on mobile) showing all 7 steps with the current one highlighted, completed ones checkmarked, and future ones grayed out. Completed steps SHALL be clickable to navigate back.

#### Scenario: Stepper renders current state

- **WHEN** the owner is on `/onboarding/sections` (step 3) and has completed basics and look
- **THEN** the stepper shows checkmarks on basics + look, highlights sections, and grays out products + whatsapp + review

#### Scenario: Stepper allows back-navigation to completed steps

- **WHEN** the owner clicks "Look" in the stepper while on `/onboarding/products`
- **THEN** the response navigates to `/onboarding/look` without losing the data from the steps in between

#### Scenario: Stepper does not allow forward jumps

- **WHEN** the owner on `/onboarding/basics` clicks "WhatsApp" in the stepper
- **THEN** the stepper item is non-interactive (visually disabled) and no navigation occurs

### Requirement: Slug uniqueness check runs in real time during basics

The system SHALL check slug availability via a server action while the owner types in the slug field on `/onboarding/basics`. The check SHALL be debounced (~300ms) and return one of: `available`, `invalid` (regex), `reserved` (in reserved_slugs table), `taken` (in stores). The UI SHALL display the result inline with a colored indicator.

#### Scenario: Available slug shows green

- **WHEN** the owner types `mi-tienda-nueva` in the slug field
- **THEN** after ~300ms the indicator turns green and shows "Slug disponible"

#### Scenario: Reserved slug shows red

- **WHEN** the owner types `admin` in the slug field
- **THEN** the indicator turns red and shows "Reservado por el sistema"

#### Scenario: Taken slug shows red

- **WHEN** the owner types a slug already used by another store
- **THEN** the indicator turns red and shows "Ya está en uso por otra tienda"

#### Scenario: Owner can re-use their own slug

- **WHEN** an owner editing their existing store (already has `slug='mi-tienda'`) types `mi-tienda` in the basics form
- **THEN** the indicator turns green (the check excludes the owner's own row)

### Requirement: Look step accepts logo upload and accent color

The system SHALL provide a logo upload component on `/onboarding/look` that uploads to Supabase Storage at `store-logos/{store_id}/logo.{ext}` and a color picker constrained to a curated 6-color palette. The accent color is persisted as `stores.theme.accent_color`.

#### Scenario: Logo upload persists URL

- **WHEN** the owner drops a PNG file (under 2MB) into the logo upload area
- **THEN** the file is uploaded to `store-logos/{store_id}/logo.png`, `stores.logo_url` is updated to the public URL, and a preview appears

#### Scenario: Color selection persists

- **WHEN** the owner clicks one of the 6 palette swatches and clicks "Siguiente"
- **THEN** `stores.theme` is updated to `{ accent_color: '#hex' }` for the selected swatch

#### Scenario: Custom color is not available

- **WHEN** the look step renders
- **THEN** only the 6 curated swatches are visible and no free-form color picker is present

### Requirement: Sections step requires at least one section

The system SHALL allow CRUD on `sections` rows tied to the current store. The step CANNOT be advanced unless at least one section exists.

#### Scenario: Owner adds and reorders sections

- **WHEN** the owner adds sections "Camisas" and "Pantalones" then drags "Pantalones" above "Camisas"
- **THEN** `sections.position` is updated accordingly and the order persists on refresh

#### Scenario: Cannot advance without sections

- **WHEN** the owner clicks "Siguiente" on `/onboarding/sections` with 0 sections in the list
- **THEN** the action is blocked with an error "Agregá al menos una sección para continuar"

### Requirement: Products step requires at least one product

The system SHALL allow CRUD on `products` rows tied to the current store, including multi-image upload (up to 5 per product). The step CANNOT be advanced unless at least one product exists with `is_active = true`.

#### Scenario: Owner creates a product with images

- **WHEN** the owner opens the new-product modal, fills name + price + section + uploads 2 images, and clicks "Guardar"
- **THEN** the product is INSERTed into `products` with `image_urls` containing both uploaded URLs

#### Scenario: Cannot advance without an active product

- **WHEN** the owner clicks "Siguiente" on `/onboarding/products` with 0 products
- **THEN** the action is blocked with "Agregá al menos un producto para continuar"

#### Scenario: Image count is capped at 5

- **WHEN** the owner attempts to upload a 6th image to a product
- **THEN** the UI prevents the upload with "Máximo 5 imágenes por producto"

### Requirement: WhatsApp step validates E.164 format

The system SHALL validate the `whatsapp_number` input against the E.164 regex `^\+[1-9]\d{6,14}$` and store it normalized (no spaces). The UI SHALL pre-fill `+54 9 ` for Argentine owners and show a preview of the resulting `wa.me/...` URL.

#### Scenario: Valid Argentine number accepted

- **WHEN** the owner enters `+54 9 11 1234 5678` and clicks "Siguiente"
- **THEN** `stores.whatsapp_number` is set to `+5491112345678` and the response redirects to `/onboarding/review`

#### Scenario: Invalid format rejected

- **WHEN** the owner enters `11 1234 5678` (missing country code)
- **THEN** the form shows "Número inválido. Debe empezar con + y código de país."

### Requirement: Review step displays a read-only summary with edit shortcuts

The system SHALL render at `/onboarding/review` a summary of all collected data (basics, look, sections, products, whatsapp) with an "Editar" button per section that navigates back to the corresponding step.

#### Scenario: Review summary is complete

- **WHEN** the owner reaches `/onboarding/review` after completing all prior steps
- **THEN** the page shows cards for each section with the saved data and an "Editar" button on each

#### Scenario: Edit shortcut returns to correct step

- **WHEN** the owner clicks "Editar" on the products card in review
- **THEN** the response navigates to `/onboarding/products` with the existing products list intact
