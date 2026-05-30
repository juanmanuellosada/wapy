# public-storefront

## MODIFIED Requirements

### Requirement: Maintenance and Availability States
The storefront SHALL communicate non-published states clearly to visitors, and SHALL treat a store blocked for non-payment as unavailable even when its `status = 'published'`.

#### Scenario: Paused store
- **WHEN** a store has `status = 'paused'`
- **THEN** the public page renders a maintenance message instead of the catalog

#### Scenario: Store not found
- **WHEN** a slug does not resolve to any store
- **THEN** a not-found state is shown

#### Scenario: Draft store not public
- **WHEN** a store has `status = 'draft'`
- **THEN** the public page is not publicly accessible

#### Scenario: Store blocked for non-payment
- **WHEN** a store's subscription state is `blocked` (its `blocked_at` is set and it is not exempt)
- **THEN** the public page renders a maintenance/unavailable message instead of the catalog, regardless of its `status`

#### Scenario: Store within trial or active is public
- **WHEN** a published store's subscription state is `trial`, `active` or `exempt`
- **THEN** the public catalog is shown normally
