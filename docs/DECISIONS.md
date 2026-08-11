# Decision Log

## D-001 — Authoritative product scope

**Status:** Accepted — 07 Aug 2026

**Observed conflict:** The submitted prose describes a healthcare-provider SaaS
portal for organizations, documents, appointments, messaging, contracts,
invoices, and claims. The ERD and all 16 wireframes instead describe a hospital
patient-billing system with departments, encounters, charges, consolidated
invoices, patient payments, refunds, audit, and reconciliation.

**Decision:** Build a payment SaaS portal for hospital billing. The prose defines
the broader SaaS product and the ERD/wireframes define its detailed hospital
billing core. They are complementary; billing is the first implementation path.

## D-002 — Database

**Status:** Superseded — 07 Aug 2026

**Decision:** MongoDB is final. ERD relationships are represented with Mongoose
references, compound unique indexes, validation, and transactions where a
financial operation spans multiple documents. Immutable invoice-item snapshots
will preserve descriptions and prices after catalog data changes.

## D-003 — Application stack

**Status:** Accepted — 07 Aug 2026

**Decision:** MERN with TypeScript: React with Vite, Node.js with Express,
MongoDB with Mongoose, and Vitest plus Supertest/Playwright for automated checks.

## D-004 — Currency and payment integration

**Status:** Accepted — 12 Aug 2026

Use BDT as shown in the ERD and wireframes. Store amounts as MongoDB Decimal128
and send exact decimal strings across payment boundaries. SSLCOMMERZ hosted
checkout is the primary gateway. The session response's `BQRPaymentURL` exposes
Bangla QR when the merchant account enables it. Every IPN/success notification
is checked with the validation API before a payment is settled; a local sandbox
fallback remains available when gateway credentials are absent.

## D-005 — Semester document storage

**Status:** Accepted — 12 Aug 2026

For a self-contained semester deployment, permitted PDF/image/spreadsheet files
up to 5 MB are stored as protected MongoDB buffers and never returned by list
queries. Downloads require an authenticated tenant-scoped endpoint. A future
production migration can replace the buffer with private object storage without
changing document metadata or authorization behavior.
