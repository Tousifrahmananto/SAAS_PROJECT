# Hospital Billing SaaS — Feature Audit

Audit date: 20 August 2026

This audit compares the current MERN implementation with the submitted project description. `Complete` means the usable workflow exists in both the API and portal. `Partial` means the main data/API exists but one or more described user-facing workflows are missing.

## Verification

- Client type check: passed
- Server type check: passed
- Client tests: 9 passed
- Server tests: 14 passed
- Production build: passed

## Module status

| Area | Status | Current coverage | Remaining gap |
| --- | --- | --- | --- |
| Authentication and authorization | Partial | Registration, login, JWT sessions, logout, temporary passwords, password reset, roles and permissions | Optional MFA is not implemented |
| Organization and staff | Complete for the core workflow | Organization profile/status, staff creation, role/permission assignment, staff status, department assignment and reassignment | A dedicated permission editor for an existing staff account would improve administration |
| Departments | Complete | Department catalog, unique department code per hospital, active/inactive state, and staff-to-department reference | Existing legacy staff without departments should be assigned from the Staff page |
| Revenue dashboard | Partial | Current patient, encounter, staff, charge, invoice, payment, claim, appointment and notification summaries | Date-range filters, monthly expense summaries and financial charts are not implemented |
| Documents | Partial | Upload, category, ownership, access control, download, API rename and API delete | Rename and delete controls are not exposed on the portal page |
| Appointments | Partial | Booking, list, API reschedule/status update, admin approve/reject | Availability slots, calendar, staff/patient reschedule and cancel controls, and email reminders are not complete |
| Messaging and notifications | Mostly complete | Conversations, replies, history, notification list and mark-read | Mark-unread and conversation-closing controls are not exposed |
| Contracts | Partial | Admin agreement creation, provider review, accept/reject and signer record | Contract file upload, signature capture and downloadable signed-copy generation are not complete |
| Invoices and payments | Complete for the academic sandbox | Guided item selection, quantities/days, patient contact details, PDF, email delivery, payment status, public checkout, SSLCOMMERZ sandbox, reconciliation and refunds | Production merchant onboarding is intentionally outside the academic sandbox scope |
| Reports and claims | Partial | Report records, report-document API reference, claim workflow/status/rejection reasons and CSV export | Report upload/download selection and portal search/filter controls are incomplete |
| Super-admin tools | Partial | Organization review/status control plus module-level administrative actions | A single central console for every user/document/appointment/invoice/report/contract is not implemented |
| Audit logs | Partial | Stored audit events, API action/date filters and CSV export | Portal search/date filters and PDF export are not implemented |

## Staff and department workflow

1. An organization owner or permitted administrator first creates departments in **Patients & Charges**.
2. In **Staff**, the administrator enters the staff member's name, email, phone, employee number, role and permissions.
3. A provider-staff account must be assigned to an active department. An administrator account may remain organization-wide.
4. The portal sends `departmentId`, the MongoDB ObjectId of the selected department, to the staff API.
5. The API confirms that the department is active and belongs to the same hospital before storing the reference on the user.
6. The staff member's session includes that department ID, allowing later department-scoped workflows.
7. Authorized administrators can reassign a staff member to another active department or suspend/disable the account from the Staff page.

## Staff page readiness

The shared role-based portal is ready for the core staff workflow. Staff do not use a separate application: after login, the same portal displays only the pages allowed by their permissions. Provider staff can now be organized under departments, while owners and administrators retain organization-wide management access.

## Recommended completion order

1. Finish appointment availability, reschedule/cancel UI and reminders.
2. Add document rename/delete and report attachment/download UI.
3. Add dashboard charts and date filters.
4. Complete contract file/signature/signed-copy workflow.
5. Expand the super-admin console and audit-log filters/export formats.
6. Add optional MFA last, because it is described as optional.
