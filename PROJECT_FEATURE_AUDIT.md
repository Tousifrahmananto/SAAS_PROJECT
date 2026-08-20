# Hospital Billing SaaS — Feature Audit

Audit date: 20 August 2026

This audit compares the current MERN implementation with the submitted project description. `Complete` means the usable workflow exists in both the API and portal. `Partial` means the main data/API exists but one or more described user-facing workflows are missing.

## Verification

- Client type check: passed
- Server type check: passed
- Client tests: 10 passed
- Server tests: 20 passed
- Production build: passed

## Module status

| Area | Status | Current coverage | Remaining gap |
| --- | --- | --- | --- |
| Authentication and authorization | Partial | Registration, login, JWT sessions, logout, temporary passwords, password reset, roles and permissions | Optional MFA is not implemented |
| Organization and staff | Complete for the core workflow | Organization profile/status, staff creation, role/permission assignment, staff status, department assignment and reassignment | A dedicated permission editor for an existing staff account would improve administration |
| Departments | Complete | Department catalog, unique department code per hospital, active/inactive state, and staff-to-department reference | Existing legacy staff without departments should be assigned from the Staff page |
| Revenue dashboard | Complete | Date-filtered billing, collection and outstanding summaries, monthly tables/charts, invoice-status totals and operational statistics | The schema does not currently model hospital operating expenses |
| Documents | Complete | Upload, category, ownership, access control, download, rename and confirmed deletion in the portal | None for the submitted workflow |
| Appointments | Complete for the core workflow | Conflict-aware availability slots, booking, calendar, reschedule/cancel, admin decisions, confirmation email and reminder delivery | Automatic background reminders depend on an always-running scheduler; the portal provides an explicit send-reminder action |
| Messaging and notifications | Mostly complete | Conversations, replies, history, notification list and mark-read | Mark-unread and conversation-closing controls are not exposed |
| Contracts | Complete | Agreement creation, optional contract PDF upload/download, provider review, drawn electronic signature, accept/reject and generated signed PDF | None for the submitted workflow |
| Invoices and payments | Complete for the academic sandbox | Guided item selection, quantities/days, patient contact details, PDF, email delivery, payment status, public checkout, SSLCOMMERZ sandbox, reconciliation and refunds | Production merchant onboarding is intentionally outside the academic sandbox scope |
| Reports and claims | Complete | Report upload/download, search/type/date filters, claim workflow/status/rejection reasons and CSV export | None for the submitted workflow |
| Super-admin tools | Complete for centralized oversight | Platform statistics, organization review/status, cross-organization staff/documents/appointments/invoices/reports/contracts and staff status control | Destructive modification of financial records remains intentionally restricted |
| Audit logs | Partial | Stored audit events, API action/date filters and CSV export | Portal search/date filters and PDF export are not implemented |

## Staff and department workflow

1. An organization owner or permitted administrator first creates departments in **Patients & Departments**.
2. In **Staff**, the administrator enters the staff member's name, email, phone, employee number, role and permissions.
3. A provider-staff account must be assigned to an active department. An administrator account may remain organization-wide.
4. The portal sends `departmentId`, the MongoDB ObjectId of the selected department, to the staff API.
5. The API confirms that the department is active and belongs to the same hospital before storing the reference on the user.
6. The staff member's session includes that department ID, allowing later department-scoped workflows.
7. Authorized administrators can reassign a staff member to another active department or suspend/disable the account from the Staff page.

## Staff page readiness

The shared role-based portal is ready for the core staff workflow. Staff do not use a separate application: after login, the same portal displays only the pages allowed by their permissions. Provider staff can now be organized under departments, while owners and administrators retain organization-wide management access.

## Recommended completion order

1. Add audit-log portal filters and PDF export.
2. Add notification mark-unread and conversation-closing controls.
3. Add optional MFA last, because it is described as optional.
