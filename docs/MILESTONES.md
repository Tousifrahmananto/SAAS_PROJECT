# Three-Milestone Execution Plan

## Working product definition

Build a role-based hospital billing system in which clinical departments add
charges to a patient encounter, billing staff consolidate those charges into a
single invoice, and cash or online payments are recorded with receipts and a
complete audit trail.

The editable ERD is the domain relationship reference and the 16 supplied
screens are the billing UI reference. MongoDB/Mongoose implements those
relationships using references, indexes, validation, and selected immutable
snapshots. When artifacts disagree, the discrepancy must be recorded in
`DECISIONS.md` before implementation continues.

## Delivery rules

Each milestone ends with a demonstrable vertical slice, automated checks, an
updated setup guide, and a short review against its acceptance criteria. Work
does not move to the next milestone until the current milestone is accepted.

No real patient data, payment credentials, or production secrets may be stored
in the repository. Development uses synthetic seed data and sandbox payment
flows only.

## Milestone 1 — Foundation and charge capture

**Goal:** a secure, runnable application where authorized hospital staff can
sign in, find or register a patient, open an encounter, and add department-owned
charges.

### Scope

- Monorepo/application scaffold, environment template, linting, formatting,
  test commands, and database migration/seed workflow.
- Core domain collections from ERD pages 1 and 5: hospitals, departments, users,
  roles, permissions, assignments, patients, encounters, admissions, payers,
  service catalog, charges, charge adjustments, and audit logs.
- Authentication, password hashing, session/JWT strategy, and role plus
  department authorization.
- Login, dashboard shell, patient search/registration, department work queue,
  and charge-entry screens based on wireframes 01–08 and 14.
- Server-side validation, consistent API errors, synthetic demo users, and an
  audit event for security-sensitive and financial mutations.

### Milestone 1 demo

1. Sign in as a department user.
2. Search for or create a synthetic patient.
3. Open an encounter and add a catalog service charge.
4. Verify that another department cannot edit the charge.
5. Sign in as an administrator and inspect the recorded audit event.

### Acceptance gate

- Fresh setup succeeds from the README without manual database edits.
- Protected endpoints reject unauthenticated and unauthorized requests.
- Money is stored as MongoDB `Decimal128` values, never binary floating point.
- The main Milestone 1 flow works on desktop and a narrow/mobile viewport.
- Unit/integration tests cover authentication, authorization, validation, and
  charge creation.

## Milestone 2 — Consolidated invoicing and payments

**Goal:** turn approved encounter charges into one immutable invoice snapshot
and collect or simulate payment with a receipt.

### Scope

- ERD pages 2 and 3: invoices, invoice items, deliveries, payment methods, cash
  sessions, payments, allocations, gateway transactions, and receipts.
- Cashier consolidated billing workbench, printed invoice, digital invoice
  delivery, sandbox online checkout, and payment result screens based on
  wireframes 09–13.
- Invoice totals calculated on the server inside a database transaction.
- Partial/multiple payments through payment allocations.
- Idempotent payment callback handling and printable/downloadable invoice and
  receipt output.
- Dashboard revenue, collection, outstanding balance, and department summaries
  derived from persisted records.

### Milestone 2 demo

1. Review charges from several departments.
2. Release a consolidated invoice with frozen line-item descriptions/prices.
3. Record a counter payment or complete a sandbox online payment.
4. Show the updated balance, receipt, and dashboard totals.

### Acceptance gate

- Invoice, allocation, and payment state changes are transactional.
- Duplicate gateway callbacks cannot create duplicate payments.
- Printed/digital invoices show the same server-calculated totals.
- Integration tests cover invoice release, partial/full payment, and callback
  idempotency.

## Milestone 3 — Controls, reconciliation, and release

**Goal:** complete the financial control loop and prepare a stable semester
demonstration release.

### Scope

- ERD pages 4 and 6: refunds, refund allocations, notifications,
  reconciliation batches, and reconciliation items.
- Refund/adjustment approval, role-permission administration, audit explorer,
  reports, and payment reconciliation based on wireframes 14–16.
- Search/filter/export for billing reports and audit records.
- Notification delivery abstraction with a safe development provider.
- Accessibility pass, responsive QA, error/empty/loading states, performance
  checks, backup/restore notes, deployment configuration, and demo script.

### Milestone 3 demo

1. Request and approve a linked partial refund.
2. Show the credit/refund trail without rewriting the original payment.
3. Reconcile payments against a synthetic settlement batch and resolve a
   variance.
4. Export a filtered report and locate the full action trail in audit logs.

### Acceptance gate

- Refunds never exceed the refundable amount and require proper authorization.
- Every privileged financial mutation is attributable in the audit log.
- Reconciliation clearly distinguishes matched, unmatched, and variance cases.
- End-to-end smoke tests pass against a clean seeded environment.
- Deployment and demonstration instructions are reproducible.

## Scope control

The submitted prose defines the wider hospital-billing SaaS portal, including
documents, appointments, messaging, contracts, and claims. The supplied ERD and
wireframes provide the detailed billing/payment core. The three milestones
deliver that core first; broader portal modules enter only after the billing
acceptance gates or through an explicitly approved milestone reallocation.
