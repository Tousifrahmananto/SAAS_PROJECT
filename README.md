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

All three semester milestones are implemented locally. The application includes
provider onboarding and staff RBAC, patient/encounter charge capture, documents,
appointments, support messaging, contracts, claims, reports, immutable invoice
snapshots, partial payments, SSLCOMMERZ/Bangla QR checkout, refunds,
reconciliation, notifications, PDF invoices/receipts, CSV exports, and audit
history. Production payment testing still requires SSLCOMMERZ sandbox credentials.

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

Before running the seed command, replace `DEMO_USER_PASSWORD` in the ignored
`server/.env` file. Open `http://localhost:5173` and use one of the seeded
development accounts:

- `admin@shurokkha.test` — super administrator
- `opd@shurokkha.test` — department-scoped OPD staff

The demo credentials and synthetic records are for local development only.

## Quality checks

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

## Production environment

Backend variables on Render:

```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://...
JWT_SECRET=at-least-32-random-characters
CLIENT_ORIGIN=https://your-vercel-project.vercel.app
SERVER_URL=https://your-render-service.onrender.com
RESEND_API_KEY=re_...
PASSWORD_RESET_FROM=Hospital Billing <noreply@your-verified-domain.com>
PASSWORD_RESET_TTL_MINUTES=20
SSLCOMMERZ_STORE_ID=
SSLCOMMERZ_STORE_PASSWORD=
SSLCOMMERZ_SANDBOX=true
```

Frontend variable on Vercel:

```env
VITE_API_URL=https://your-render-service.onrender.com
```

Never put MongoDB, Resend, JWT, or gateway credentials in Vercel frontend
variables. Configure SSLCOMMERZ's IPN listener to
`https://your-render-service.onrender.com/api/payments/sslcommerz/ipn`.

## API surface

- `GET /api/health`
- `POST /api/auth/register|login|forgot-password|reset-password`
- `GET|PATCH /api/organizations/me`
- `GET|POST|PATCH /api/staff`
- `GET|POST /api/patients`
- `GET|POST /api/encounters|charges`
- `GET|POST /api/catalog/departments|services`
- `GET|POST|PATCH|DELETE /api/documents`
- `GET|POST|PATCH /api/appointments`
- `GET|POST /api/messages`
- `GET|POST|PATCH /api/contracts|reports|claims`
- `GET|POST|PATCH /api/invoices|payments|refunds|reconciliation`
- `GET|PATCH /api/notifications`
- `GET /api/dashboard|audit`

Financial amounts use Decimal128, invoice items are immutable snapshots, payment
settlement is transactional and idempotent, and privileged mutations are
recorded in the audit log.
