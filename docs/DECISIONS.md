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

**Status:** Proposed

Use BDT as shown in the ERD and wireframes. Store amounts as fixed-precision
database decimals and send minor units or exact decimal strings across payment
boundaries. Develop against an adapter with a fake provider first, then connect
the SSLCommerz sandbox in Milestone 2 without embedding credentials in code.
