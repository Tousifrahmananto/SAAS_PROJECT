# Hospital Billing Management System

This MERN repository is being implemented in three gated milestones. The
supplied ERD and UI wireframes define a hospital patient-billing workflow:
departments capture charges, a cashier consolidates them into one invoice, and
payments, refunds, audit events, and reconciliation are tracked centrally.

See [docs/MILESTONES.md](docs/MILESTONES.md) for scope, deliverables, and the
definition of done for each milestone.

## Source artifacts

- `Hospital_Billing_ERD.drawio` — editable six-page relational data model
- `Hospital_Billing_ERD.pdf` — exported ERD
- `Hospital_Billing_Wireframes.html` — 16-screen interactive UI reference
- `Hospital_Billing_Wireframes_Preview.png` — full wireframe overview

## Current status

Milestone 1 is in progress. The accepted stack is React, Express, MongoDB with
Mongoose, and Node.js, using TypeScript across the client and API.

## Run locally

Requirements: Node.js 22 or newer and Docker Desktop.

```powershell
npm.cmd install
Copy-Item server/.env.example server/.env
docker compose up -d
npm.cmd run seed --workspace server
```

Run the API and client in separate terminals:

```powershell
npm.cmd run dev:server
npm.cmd run dev:client
```

Open `http://localhost:5173`. Seeded development accounts use the password
`DemoPass123!`:

- `admin@shurokkha.test` — super administrator
- `opd@shurokkha.test` — department-scoped OPD staff

The demo credentials and synthetic records are for local development only.

## Quality checks

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

## Milestone 1 API surface

- `GET /api/health`
- `POST /api/auth/login`
- `GET|POST /api/patients`
- `POST /api/encounters`
- `POST /api/charges`
