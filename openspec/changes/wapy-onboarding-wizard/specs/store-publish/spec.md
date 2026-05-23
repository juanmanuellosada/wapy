## ADDED Requirements

### Requirement: Publish action transitions store from draft to published

The system SHALL provide a `publishStore()` server action callable from `/onboarding/review`. The action SHALL re-validate all publish prerequisites (slug valid, ≥1 section, ≥1 active product, valid whatsapp_number) before mutating. On success, set `status='published'`, `published_at=NOW()`, `onboarding_step=7`, and redirect to `/dashboard`.

#### Scenario: Valid store is published

- **WHEN** an owner with all prerequisites met clicks "Publicar mi tienda" on `/onboarding/review`
- **THEN** the action updates `stores` to set `status='published'`, `published_at` to current timestamp, `onboarding_step=7`, and the response redirects to `/dashboard`

#### Scenario: Missing prerequisite blocks publish

- **WHEN** the publish action is invoked but the store has 0 products (e.g., owner deleted them from another tab between steps)
- **THEN** the action returns an error "Agregá al menos un producto antes de publicar" and no mutation occurs

### Requirement: Server action enforces owner identity

The system SHALL ensure the `publishStore()` action can only publish the caller's own store. The action SHALL verify `auth.uid()` matches `stores.owner_id` of the store being published.

#### Scenario: Owner publishes own store

- **WHEN** owner A is logged in and triggers `publishStore()` for their own store
- **THEN** the action succeeds

#### Scenario: Cross-owner publish is impossible

- **WHEN** any caller attempts to publish a store whose `owner_id` does not match `auth.uid()`
- **THEN** the action throws a forbidden error and no mutation occurs (RLS also blocks this at the DB level as second-layer defense)

### Requirement: Republishing an already-published store is a no-op

The system SHALL handle the edge case where `publishStore()` is called on a store already in `status='published'` gracefully — return success with the existing `published_at` timestamp, no DB mutation.

#### Scenario: Already-published store stays unchanged

- **WHEN** an owner triggers publish on a store with `status='published'`
- **THEN** the action returns success without updating `published_at` and the response still redirects to `/dashboard`

### Requirement: Publish notifies the owner about next steps

The system SHALL redirect the owner to `/dashboard` after successful publish. The `/dashboard` placeholder page SHALL display the live URL of the store (`https://wapy.com.ar/{slug}`) and a message celebrating the publish, even though the public storefront route itself is delivered in Fase 6.

#### Scenario: Dashboard placeholder shows the live URL post-publish

- **WHEN** a freshly-published owner arrives at `/dashboard`
- **THEN** the page renders a card with their store slug as a hyperlink to `https://wapy.com.ar/{slug}` and a copy-to-clipboard button
