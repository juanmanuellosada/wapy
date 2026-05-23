## ADDED Requirements

### Requirement: Landing visitors can submit a lead with name, email, WhatsApp, plan

The system SHALL provide a lead form modal accessible from the pricing section of the landing. The form SHALL collect email, name, WhatsApp number, and the selected plan (pre-filled based on which CTA opened the modal). On submit the data SHALL be persisted to `leads` table and a notification mail SHALL be sent to the superadmin's mailbox.

#### Scenario: Successful lead submission

- **WHEN** a visitor clicks "Quiero el Inicial" in the Pricing section, fills email/name/WhatsApp in the modal, and submits
- **THEN** a row is INSERTed in `leads` with status='new' and plan='inicial', a mail is sent to `juanmalosada01@gmail.com` with the lead details, and the modal shows "Te contactamos en menos de 24hs"

#### Scenario: Plan auto-selection from CTA

- **WHEN** the lead modal is opened from the "Quiero el Pro" button
- **THEN** the `plan` field is pre-set to 'pro' and the modal title reflects "Plan Pro"

#### Scenario: Invalid email is rejected client and server

- **WHEN** the visitor submits a malformed email (e.g., "no-arroba")
- **THEN** the form shows an inline validation error and no request is sent. If a malicious client bypasses client validation and POSTs the same, the server action rejects with a clear error and no DB mutation occurs

#### Scenario: WhatsApp accepts loose formats and normalizes

- **WHEN** the visitor enters "11 1234 5678"
- **THEN** the server normalizes to E.164 ("+5491112345678") before INSERT, or returns a clear validation error if normalization fails

### Requirement: leads table is owned by superadmin via RLS

The system SHALL maintain a `leads` table with columns `id`, `email`, `name`, `whatsapp`, `plan` (CHECK in 'inicial'|'pro'), `status` (CHECK in 'new'|'approved'|'declined', default 'new'), `approved_at`, `approved_by` (FK users), `notes`, `created_at`. RLS SHALL allow read/write only to users with `role='superadmin'`. Anonymous and authenticated owners SHALL not be able to read or write to `leads` directly.

#### Scenario: Anonymous SELECT on leads is blocked

- **WHEN** an anonymous client attempts to SELECT from `leads`
- **THEN** RLS returns zero rows

#### Scenario: Owner SELECT on leads is blocked

- **WHEN** an authenticated owner queries `leads`
- **THEN** RLS returns zero rows (only superadmins can read)

#### Scenario: Superadmin sees all leads

- **WHEN** a user with `role='superadmin'` queries `leads`
- **THEN** all rows are returned regardless of status

### Requirement: Server actions for lead lifecycle require superadmin

The system SHALL provide `createLead` (callable by anonymous via Pricing modal), `approveLead`, and `deleteLead` server actions. `createLead` SHALL NOT require auth (it's a public lead capture). `approveLead` and `deleteLead` SHALL require `role='superadmin'` server-side (defense in depth in addition to middleware).

#### Scenario: createLead callable from anonymous

- **WHEN** an anonymous visitor submits the lead modal
- **THEN** the server action `createLead` succeeds without requiring a session

#### Scenario: approveLead from owner is forbidden

- **WHEN** an authenticated owner directly invokes `approveLead({ id })` (e.g., via curl)
- **THEN** the action throws a forbidden error before any DB mutation

### Requirement: Approving a lead creates a whitelist entry with plan and trial

The system SHALL provide an "Aprobar" action in `/admin/leads` that, when invoked by a superadmin: (1) inserts a row into `whitelist` with `email` lowercased, `grant_role='owner'`, `plan` matching the lead's plan, and `trial_ends_at = NOW() + 14 days`; (2) updates the lead row with `status='approved'`, `approved_at=NOW()`, `approved_by=<superadmin id>`; (3) triggers `sendInviteEmail` via Resend.

#### Scenario: Approve creates whitelist + invite

- **WHEN** the superadmin clicks Aprobar on a lead with email 'jane@example.com' and plan 'pro'
- **THEN** a whitelist row exists with `email='jane@example.com'`, `grant_role='owner'`, `plan='pro'`, `trial_ends_at` exactly 14 days from now, the lead row is marked approved with the superadmin's user_id, and a Resend mail is sent to jane@example.com with a `/signup?token=...` link

#### Scenario: Approve on already-whitelisted email returns error

- **WHEN** the superadmin tries to approve a lead whose email already exists in `whitelist`
- **THEN** the action returns `{ error: 'already_whitelisted' }` and no mutation occurs; the lead stays at status='new'

#### Scenario: Mail failure leaves whitelist row created but flagged

- **WHEN** the whitelist INSERT succeeds but `sendInviteEmail` throws (e.g., Resend error)
- **THEN** the action returns `{ ok: true, mail_sent: false, mail_error: '...' }` and the UI surfaces a warning so the superadmin can manually re-invite from `/admin/whitelist`

### Requirement: Deleting a lead removes it permanently

The system SHALL provide a "Borrar" action that DELETEs the lead row entirely. The action SHALL require typing-confirmation NOT needed (single click + native `window.confirm` is sufficient — leads are low-stakes vs store delete).

#### Scenario: Delete on a 'new' lead

- **WHEN** the superadmin clicks Borrar on a lead with status='new', confirms the native dialog
- **THEN** the lead row is DELETEd and disappears from the table

#### Scenario: Delete on an 'approved' lead does not revoke whitelist

- **WHEN** the superadmin deletes a lead whose status='approved'
- **THEN** the lead row is removed but the corresponding `whitelist` row is NOT touched (the user already got their invite; removing them from whitelist is a separate action in `/admin/whitelist`)
