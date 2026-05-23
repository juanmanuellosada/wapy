## ADDED Requirements

### Requirement: Landing has visible login link in header

The system SHALL render a "Ingresar" link in the landing header, visible on both desktop (inline with nav items) and mobile (inside the drawer). The link SHALL navigate to `/login`.

#### Scenario: Desktop header includes Ingresar

- **WHEN** an anonymous visitor loads `/` on a desktop viewport
- **THEN** the header shows "Ingresar" as a link element among the nav items, with href="/login"

#### Scenario: Mobile drawer includes Ingresar

- **WHEN** the mobile drawer is opened from the hamburger button
- **THEN** "Ingresar" appears in the list of drawer items, with href="/login"

### Requirement: Pricing section shows two cards with plan, price, trial, features, CTA

The system SHALL render two pricing cards in the Pricing section: Inicial ($12.000 ARS/mes) and Pro ($20.000 ARS/mes). Both cards SHALL include a "14 días gratis · sin tarjeta" badge under the price, a feature list with checkmarks, and a CTA button. The Pro card SHALL have a "Más popular" badge and visually distinct accent treatment.

#### Scenario: Inicial card shows 15 productos, 3 secciones

- **WHEN** the visitor reaches the Pricing section
- **THEN** the Inicial card shows "$12.000 / mes" with "14 días gratis · sin tarjeta" and feature list including "Hasta 15 productos", "Hasta 3 secciones", and other shared features

#### Scenario: Pro card shows unlimited and Más popular badge

- **WHEN** the visitor reaches the Pricing section
- **THEN** the Pro card shows "$20.000 / mes" with the same trial badge, a "Más popular" badge or visual treatment, and features including "Productos ilimitados" and "Secciones ilimitadas"

#### Scenario: CTA opens lead modal with plan pre-selected

- **WHEN** the visitor clicks "Quiero el Inicial"
- **THEN** the `<LeadFormModal>` opens with `plan` pre-set to 'inicial' and the modal title reflecting the chosen plan

### Requirement: Landing has FAQ section

The system SHALL render a FAQ section below Pricing with at least 6 questions covering: how billing works, cancellation, no-code requirement, how orders arrive, what happens after trial, store limits, custom domain availability, commission per sale. The section SHALL use an accessible accordion (only one open at a time).

#### Scenario: Accordion expand/collapse

- **WHEN** the visitor clicks a question
- **THEN** that question's answer expands; previously-open answers collapse; ARIA attributes update accordingly

#### Scenario: FAQ section has anchor for nav linking

- **WHEN** any nav link with href="#faq" is clicked
- **THEN** the page smooth-scrolls to the FAQ section

### Requirement: All landing CTAs route to real flows (no dead anchors)

The system SHALL ensure every landing CTA (Header CTA, Hero primary CTA, Footer CTA) routes to a meaningful destination: either an in-page section, the lead modal, `/login`, or another real route. No CTA SHALL link to `#` or other dead placeholders.

#### Scenario: Hero CTA scrolls to pricing

- **WHEN** the visitor clicks the Hero primary CTA
- **THEN** the page scrolls to `#precios` (the Pricing section)

#### Scenario: Footer Ingresar routes to login

- **WHEN** the visitor clicks "Ingresar" in the Footer
- **THEN** the response navigates to `/login`

#### Scenario: No dead anchors

- **WHEN** the landing is inspected
- **THEN** zero anchor tags have `href="#"` for nav/CTA purposes (legal links to Terms/Privacy can keep `#` placeholders until those pages exist, but functional CTAs cannot)
