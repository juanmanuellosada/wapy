## ADDED Requirements

### Requirement: /[slug] resolves to a published store's storefront

The system SHALL serve the public storefront at `/[slug]` for any store with `status='published'`. The storefront SHALL render the store's name, logo, accent color, sections, products (each with images, price, description), a cart drawer, and a "Comprar por WhatsApp" button that opens `wa.me/{normalized}` with a pre-filled message containing the cart contents.

#### Scenario: Published store renders

- **WHEN** an anonymous visitor requests `/mi-tienda` where `stores.slug='mi-tienda'` and `status='published'`
- **THEN** the response renders the storefront with all active sections and active products

#### Scenario: Anon RLS filters draft stores

- **WHEN** a visitor requests `/mi-tienda` where the store exists but `status='draft'`
- **THEN** the resolver's anon query returns no row and routing falls through to the admin-client check, which returns "not_found" or "maintenance" as appropriate

### Requirement: /[slug] redirects 301 from historical slugs

The system SHALL detect when the requested slug exists only in `slug_history` (not in current `stores`) and respond with a permanent (301) redirect to the current slug of the matching store.

#### Scenario: Historical slug 301-redirects to current

- **WHEN** a visitor requests `/tienda-vieja` where `slug_history.old_slug='tienda-vieja'` points to a store whose current `slug='tienda-nueva'` and `status='published'`
- **THEN** the response is a 301 redirect to `/tienda-nueva`

#### Scenario: Historical slug to a deleted store is 404

- **WHEN** a visitor requests `/tienda-borrada` where `slug_history` row exists but the parent `stores.id` no longer exists (cascade delete from Fase 5 `deleteStore`)
- **THEN** the resolver falls through to "not_found" — the system returns the 404 page

### Requirement: Paused stores show a maintenance page

The system SHALL render a friendly "En mantenimiento" page when the requested slug points to a store whose `status='paused'`. The page SHALL include the store's name and logo (if any), a message indicating the store is temporarily unavailable, the store's accent color in the styling, and a link back to wapy.com.ar.

#### Scenario: Paused store maintenance page

- **WHEN** an owner pauses their store (via dashboard Settings) and a visitor requests `/su-slug`
- **THEN** the response renders the MaintenancePage with the store's name and logo, NOT the catalog of products

#### Scenario: Maintenance page is not indexed by search engines

- **WHEN** the MaintenancePage is rendered
- **THEN** the metadata includes `robots: { index: false }` so Google does not cache "en mantenimiento" as the store's primary content

### Requirement: Unknown slugs return a 404 with CTA to onboard a new store

The system SHALL render a custom 404 page at `/[slug]` when the slug is not found in either `stores` or `slug_history`. The page SHALL include the Wapy mascot/logo, the text "Esta tienda no existe (todavía)", and a CTA button linking to `/signup` ("Armá tu tienda gratis en Wapy").

#### Scenario: Truly unknown slug shows 404

- **WHEN** a visitor requests `/un-slug-que-no-existe-en-ningun-lado`
- **THEN** the response is the custom 404 page with the signup CTA

### Requirement: Wapy footer is present on every storefront page

The system SHALL render a discrete "Hecho con ✨ Wapy" footer at the bottom of every storefront page (rendered, maintenance, 404). The text "Wapy" SHALL be a hyperlink to `https://wapy.com.ar`.

#### Scenario: Footer appears on rendered store

- **WHEN** any storefront variant renders (published store, maintenance page, or 404)
- **THEN** the page includes the Wapy footer with the link to the marketing site

### Requirement: SEO metadata is generated per store

The system SHALL provide `generateMetadata` in `app/[slug]/page.tsx` that returns title, description, and Open Graph image based on the store's data. The metadata SHALL be generated only once per request (via React `cache()`) to avoid duplicate Supabase queries between the metadata and page render passes.

#### Scenario: Store with description sets meta tags

- **WHEN** a published store has `name='Mi Tienda'` and `description='La mejor tienda del barrio'`
- **THEN** the rendered HTML has `<title>Mi Tienda</title>` and `<meta name="description" content="La mejor tienda del barrio">` and `<meta property="og:title" content="Mi Tienda">`

#### Scenario: Store without description uses default

- **WHEN** a published store has no description
- **THEN** the description meta defaults to "Mi Tienda — tienda online en Wapy" or similar fallback

### Requirement: Demo and subdomain legacy code is removed

The system SHALL remove all legacy demo code from the codebase: `lib/stores.ts`, `app/store/[slug]/{page,layout,StoreClient}.tsx`, the subdomain routing in `proxy.ts`, and references to `NEXT_PUBLIC_DEMO_URL`. After this change, the only storefront route is `/[slug]`.

#### Scenario: Build passes after cleanup

- **WHEN** the demo files are removed and the codebase is built
- **THEN** `npm run build` exits 0 with no broken imports

#### Scenario: proxy.ts no longer handles subdomains

- **WHEN** a request arrives at `xxx.wapy.com.ar/path` (or `demo.localhost:3000` in dev)
- **THEN** the proxy does not rewrite to `/store/xxx/path` (that logic is removed); the request is handled as if it were the apex domain
