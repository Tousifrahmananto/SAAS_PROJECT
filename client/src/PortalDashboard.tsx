import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiBaseUrl, type Session } from "./App";

type Row = Record<string, any>;
type Api = (path: string, options?: RequestInit) => Promise<any>;

const navigation = [
  ["dashboard", "Dashboard"], ["organization", "Organization"], ["clinical", "Patients & Charges"], ["staff", "Staff"],
  ["documents", "Documents"], ["appointments", "Appointments"], ["messages", "Messages"],
  ["contracts", "Contracts"], ["invoices", "Invoices"], ["payments", "Payments"],
  ["reports", "Reports"], ["claims", "Claims"], ["notifications", "Notifications"], ["audit", "Audit logs"], ["admin", "Administration"]
] as const;

function formValues(event: FormEvent<HTMLFormElement>) {
  return Object.fromEntries(new FormData(event.currentTarget).entries());
}

function decimal(value: any) {
  if (value && typeof value === "object" && "$numberDecimal" in value) return value.$numberDecimal;
  return String(value ?? "0.00");
}

function dateTime(value: any) {
  return value ? new Date(value).toLocaleString() : "-";
}

async function downloadAuthenticated(path: string, name: string, token: string) {
  const response = await fetch(`${apiBaseUrl}/api${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("Download failed");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}

function useResource(api: Api, path: string, enabled = true) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(enabled);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!enabled) { setBusy(false); return; }
    setBusy(true); setError("");
    try { setRows((await api(path)).data ?? []); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Request failed"); }
    finally { setBusy(false); }
  }, [api, enabled, path]);
  useEffect(() => { void load(); }, [load]);
  return { rows, busy, error, load };
}

export function PortalDashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const roles = session.user.roles;
  const permissions = session.user.permissions ?? [];
  const isAdmin = roles.some((role) => ["ADMIN", "SUPER_ADMIN"].includes(role));
  const isOwner = roles.includes("PROVIDER_OWNER");
  const privileged = isOwner || isAdmin;
  const hasPermission = (permission: string) => privileged || permissions.includes(permission);
  const canAccessView = (id: (typeof navigation)[number][0]) => {
    const required: Partial<Record<(typeof navigation)[number][0], string>> = {
      staff: "staff:read", documents: "documents:read", appointments: "appointments:read", messages: "messages:read",
      contracts: "contracts:read", invoices: "invoices:read", payments: "payments:read", reports: "reports:read", claims: "claims:read"
    };
    if (id === "admin") return isAdmin;
    if (id === "audit") return privileged;
    if (id === "clinical") return ["catalog:read", "patients:read", "encounters:read"].every(hasPermission);
    return !required[id] || hasPermission(required[id]!);
  };
  const [view, setView] = useState<(typeof navigation)[number][0]>(() => {
    const candidate = location.hash.slice(1);
    const valid = navigation.some(([id]) => id === candidate && canAccessView(id));
    if (!valid) return "dashboard";
    return candidate as (typeof navigation)[number][0];
  });
  useEffect(() => {
    if (location.hash !== `#${view}`) history.replaceState({}, "", `${location.pathname}${location.search}#${view}`);
  }, [view]);
  const [flash, setFlash] = useState(() => new URLSearchParams(location.search).get("payment") ? `Payment ${new URLSearchParams(location.search).get("payment")}.` : "");
  const api = useMemo<Api>(() => async (path, options = {}) => {
    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/api${path}`, {
        ...options,
        headers: { authorization: `Bearer ${session.token}`, ...(options.body ? { "content-type": "application/json" } : {}), ...options.headers }
      });
    } catch { throw new Error("Cannot reach the server. Check the backend URL and CORS settings."); }
    const type = response.headers.get("content-type") ?? "";
    const payload = type.includes("json") ? await response.json() : await response.text();
    if (!response.ok) throw new Error(payload?.error?.message ?? `Request failed (${response.status})`);
    return payload;
  }, [session.token]);
  function navigate(next: typeof view) { setView(next); location.hash = next; }
  const visibleNavigation = navigation.filter(([id]) => canAccessView(id));
  const page = {
    dashboard: <DashboardPage api={api} role={roles[0]} navigate={navigate} />,
    organization: <OrganizationPage api={api} editable={isOwner || isAdmin} />,
    clinical: <ClinicalPage api={api} canManageCatalog={privileged} canCreatePatient={hasPermission("patients:create")} canCreateEncounter={hasPermission("encounters:create")} />,
    staff: <StaffPage api={api} editable={isOwner || isAdmin} canCreateAdmin={isAdmin} />,
    documents: <DocumentsPage api={api} token={session.token} canCreate={hasPermission("documents:create")} />,
    appointments: <AppointmentsPage api={api} isAdmin={isAdmin} canCreate={hasPermission("appointments:create")} />,
    messages: <MessagesPage api={api} canCreate={hasPermission("messages:create")} />,
    contracts: <ContractsPage api={api} isAdmin={isAdmin} canSign={hasPermission("contracts:sign")} />,
    invoices: <InvoicesPage api={api} token={session.token} canCreate={privileged || roles.includes("BILLING_ADMIN")} canPay={hasPermission("payments:create")} canUseCatalog={hasPermission("catalog:read")} />,
    payments: <PaymentsPage api={api} token={session.token} isAdmin={isAdmin} canRefund={hasPermission("payments:refund")} />,
    reports: <ReportsPage api={api} isAdmin={isAdmin} />,
    claims: <ClaimsPage api={api} token={session.token} isAdmin={isAdmin} canCreate={hasPermission("claims:create")} />,
    notifications: <NotificationsPage api={api} />,
    audit: <AuditPage api={api} token={session.token} />,
    admin: <AdminPage api={api} />
  }[view];
  return <div className="shell portal-shell">
    <aside><div className="brand">Hospital<br /><strong>Billing</strong><small>Provider portal</small></div><nav aria-label="Main navigation">{visibleNavigation.map(([id, label]) => <a key={id} className={view === id ? "active" : ""} href={`#${id}`} onClick={() => setView(id)}>{label}</a>)}</nav></aside>
    <main className="workspace">
      <header><div><span className="eyebrow">Healthcare finance workspace</span><h1>{navigation.find(([id]) => id === view)?.[1]}</h1></div><select className="mobile-navigation" aria-label="Portal section" value={view} onChange={(event) => navigate(event.target.value as typeof view)}>{visibleNavigation.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><div className="user"><span><strong>{session.user.fullName}</strong><small>{roles[0]?.replaceAll("_", " ")}</small></span><button onClick={onLogout}>Sign out</button></div></header>
      {flash && <div className="success portal-flash" role="status">{flash}<button onClick={() => { setFlash(""); history.replaceState({}, "", location.pathname + location.hash); }}>Dismiss</button></div>}
      {page}
    </main>
  </div>;
}

function PageState({ busy, error }: { busy: boolean; error: string }) {
  if (busy) return <div className="empty-state">Loading...</div>;
  if (error) return <div className="error">{error}</div>;
  return null;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function DashboardPage({ api, role, navigate }: { api: Api; role?: string; navigate: (view: any) => void }) {
  const [data, setData] = useState<Row | null>(null); const [error, setError] = useState("");
  useEffect(() => { api("/dashboard").then((value) => setData(value.data)).catch((reason) => setError(reason.message)); }, [api]);
  if (error) return <div className="error">{error}</div>;
  if (!data) return <div className="empty-state">Loading dashboard...</div>;
  return <>
    <section className="metrics"><Metric label="Billed" value={`BDT ${decimal(data.billed)}`} detail={`${data.invoices} invoices`} /><Metric label="Collected" value={`BDT ${decimal(data.collected)}`} detail="Validated payments" /><Metric label="Outstanding" value={`BDT ${decimal(data.outstanding)}`} detail="Open balance" /><Metric label="Your role" value={role?.replaceAll("_", " ") ?? "USER"} detail="API-enforced access" /></section>
    <section className="summary-grid"><article className="panel-card"><h3>Operations</h3><dl><div><dt>Patients</dt><dd>{data.patients}</dd></div><div><dt>Open encounters</dt><dd>{data.openEncounters}</dd></div><div><dt>Active staff</dt><dd>{data.activeStaff}</dd></div><div><dt>Upcoming appointments</dt><dd>{data.upcomingAppointments}</dd></div></dl></article><article className="panel-card"><h3>Claims</h3><dl>{Object.entries(data.claims ?? {}).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl></article></section>
    <section className="panel"><div><span className="eyebrow">Next action</span><h2>Keep your provider workspace current</h2><p>Review invoices, claim outcomes, scheduled meetings, and outstanding documents.</p></div><button className="primary" onClick={() => navigate("invoices")}>Open invoices</button></section>
  </>;
}

function OrganizationPage({ api, editable }: { api: Api; editable: boolean }) {
  const [record, setRecord] = useState<Row | null>(null); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  useEffect(() => { api("/organizations/me").then((value) => setRecord(value.data)).catch((reason) => setError(reason.message)); }, [api]);
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(""); try { const result = await api("/organizations/me", { method: "PATCH", body: JSON.stringify(formValues(event)) }); setRecord(result.data); setMessage("Organization profile saved."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Save failed"); } }
  if (!record) return <PageState busy={!error} error={error} />;
  return <section className="profile-card"><div className="profile-heading"><div><span className="status-badge">{record.status ?? "PENDING"}</span><h2>{record.name}</h2><p>{record.code}</p></div><span>{editable ? "Editable" : "Read only"}</span></div><form className="profile-form" onSubmit={save}>
    <label>Organization name<input name="name" defaultValue={record.name} disabled={!editable} required /></label><label>Type<select name="organizationType" defaultValue={record.organizationType ?? "HOSPITAL"} disabled={!editable}><option>HOSPITAL</option><option>CLINIC</option><option>BILLING_PROVIDER</option><option>OTHER</option></select></label><label>Contact person<input name="contactPersonName" defaultValue={record.contactPersonName} disabled={!editable} /></label><label>Phone<input name="phone" defaultValue={record.phone} disabled={!editable} /></label><label>Email<input name="email" type="email" defaultValue={record.email} disabled={!editable} /></label><label>Website<input name="website" type="url" defaultValue={record.website} disabled={!editable} /></label><label>District<input name="district" defaultValue={record.district} disabled={!editable} /></label><label>Registration number<input name="registrationNumber" defaultValue={record.registrationNumber} disabled={!editable} /></label><label>BIN/TIN<input name="binTin" defaultValue={record.binTin} disabled={!editable} /></label><label className="wide">Address<textarea name="address" defaultValue={record.address} disabled={!editable} rows={3} /></label>{error && <div className="error wide">{error}</div>}{message && <div className="success wide">{message}</div>}{editable && <div className="wide profile-submit"><button className="primary">Save profile</button></div>}
  </form></section>;
}

function ClinicalPage({ api, canManageCatalog, canCreatePatient, canCreateEncounter }: { api: Api; canManageCatalog: boolean; canCreatePatient: boolean; canCreateEncounter: boolean }) {
  const patients = useResource(api, "/patients");
  const departments = useResource(api, "/catalog/departments");
  const services = useResource(api, "/catalog/services");
  const encounters = useResource(api, "/encounters");
  const [error, setError] = useState("");
  async function submit(path: string, body: Row, form: HTMLFormElement, reload: () => Promise<void>) { try { await api(path, { method: "POST", body: JSON.stringify(body) }); form.reset(); setError(""); await reload(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Operation failed"); } }
  async function createPatient(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const values = formValues(event); await submit("/patients", values, event.currentTarget, patients.load); }
  async function createDepartment(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const values = formValues(event); await submit("/catalog/departments", { ...values, isChargeSource: true, isCashCounter: false }, event.currentTarget, departments.load); }
  async function createService(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await submit("/catalog/services", formValues(event), event.currentTarget, services.load); }
  async function openEncounter(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await submit("/encounters", formValues(event), event.currentTarget, encounters.load); }
  return <>{error && <div className="error">{error}</div>}
    {canCreatePatient && <section className="panel-card">
      <h2 style={{ marginBottom: "16px" }}>Register patient</h2>
      <form className="profile-form" style={{ marginTop: 0 }} onSubmit={createPatient}>
        <label>Full name<input name="fullName" placeholder="e.g. John Doe" required /></label>
        <label>Phone number<input name="phone" type="tel" placeholder="e.g. 01700000000" required /></label>
        <label>Date of birth<input name="dateOfBirth" type="date" required /></label>
        <label>Sex<select name="sex"><option>MALE</option><option>FEMALE</option><option>OTHER</option><option>UNKNOWN</option></select></label>
        <label>Email <span style={{fontWeight: "normal", color: "#667085"}}>(Optional)</span><input name="email" type="email" placeholder="patient@example.com" /></label>
        <label>NID / Passport <span style={{fontWeight: "normal", color: "#667085"}}>(Optional)</span><input name="nidOrPassport" placeholder="ID number" /></label>
        <div className="wide profile-submit" style={{ marginTop: "8px" }}>
          <button className="primary">Register patient</button>
        </div>
      </form>
    </section>}
    {canManageCatalog && <section className="summary-grid">
      <article className="panel-card">
        <h2 style={{ marginBottom: "16px" }}>Add department</h2>
        <form className="profile-form" style={{ marginTop: 0 }} onSubmit={createDepartment}>
          <label className="wide">Code<input name="code" placeholder="e.g. CARD" required /></label>
          <label className="wide">Name<input name="name" placeholder="e.g. Cardiology" required /></label>
          <label className="wide">Type<input name="type" placeholder="Type" defaultValue="CLINICAL" required /></label>
          <div className="wide profile-submit" style={{ marginTop: "8px" }}>
            <button className="primary">Add department</button>
          </div>
        </form>
      </article>
    </section>}
    {canCreateEncounter && <section className="summary-grid">
      <article className="panel-card">
        <h2 style={{ marginBottom: "16px" }}>Open encounter</h2>
        <form className="profile-form" style={{ marginTop: 0 }} onSubmit={openEncounter}>
          <label className="wide">Patient
            <select name="patientId" required>
              <option value="">Select Patient</option>{patients.rows.map((row) => <option key={row._id} value={row._id}>{row.patientNo} - {row.fullName}</option>)}
            </select>
          </label>
          <label className="wide">Department
            <select name="primaryDepartmentId" required>
              <option value="">Select Department</option>{departments.rows.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}
            </select>
          </label>
          <label className="wide">Type
            <select name="type">
              <option>OPD</option><option>EMERGENCY</option><option>INPATIENT</option>
            </select>
          </label>
          <label className="wide">Attending doctor <span style={{fontWeight: "normal", color: "#667085"}}>(Optional)</span><input name="attendingDoctorName" placeholder="Dr. Name" /></label>
          <div className="wide profile-submit" style={{ marginTop: "8px" }}>
            <button className="primary">Open encounter</button>
          </div>
        </form>
      </article>
    </section>}
    <h2>Recent patients</h2><DataTable columns={["patientNo", "fullName", "phone", "dateOfBirth", "sex"]} rows={patients.rows} /><h2>Encounter queue</h2><DataTable columns={["encounterNo", "patient", "primaryDepartment", "type", "status", "openedAt"]} rows={encounters.rows} />
  </>;
}

const PERMISSIONS = [
  "patients:read", "patients:create",
  "encounters:read", "encounters:create",
  "invoices:read", "invoices:write",
  "payments:read", "payments:create", "payments:refund",
  "catalog:read",
  "documents:read", "documents:create", "documents:update", "documents:delete",
  "appointments:read", "appointments:create", "appointments:update",
  "messages:read", "messages:create",
  "contracts:read", "contracts:sign",
  "reports:read",
  "claims:read", "claims:create",
  "staff:read"
];

function StaffPage({ api, editable, canCreateAdmin }: { api: Api; editable: boolean; canCreateAdmin: boolean }) {
  const resource = useResource(api, "/staff"); const [error, setError] = useState("");
  async function create(event: FormEvent<HTMLFormElement>) { 
    event.preventDefault(); 
    const form = event.currentTarget; 
    setError(""); 
    try { 
      const values = formValues(event); 
      const permissions = new FormData(form).getAll("permissions");
      await api("/staff", { method: "POST", body: JSON.stringify({ ...values, permissions }) }); 
      form.reset(); 
      await resource.load(); 
    } catch (reason) { 
      setError(reason instanceof Error ? reason.message : "Create failed"); 
    } 
  }
  return <><PageState busy={resource.busy} error={resource.error} />{editable && <section className="panel-card">
    <h2 style={{ marginBottom: "16px" }}>Add staff member</h2>
    <form className="profile-form" style={{ marginTop: 0 }} onSubmit={create}>
      <label>Full name<input name="fullName" placeholder="Full name" required /></label>
      <label>Email<input name="email" type="email" placeholder="Email" required /></label>
      <label>Employee no.<input name="employeeNo" placeholder="Employee no." required /></label>
      <label>Temporary password (12+)<input name="password" type="password" placeholder="Temporary password (12+)" minLength={12} required /></label>
      <label>Role
        <select name="role">
          <option value="PROVIDER_STAFF">Provider staff</option>
          {canCreateAdmin && <option value="ADMIN">Administrator</option>}
        </select>
      </label>
      <div className="wide">
        <label style={{ marginBottom: "8px" }}>Permissions</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "10px", padding: "16px", border: "1px solid #cbd5e1", borderRadius: "8px", background: "#f8fafc" }}>
          {PERMISSIONS.map(p => (
            <label key={p} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", fontWeight: "normal", color: "#334155" }}>
              <input type="checkbox" name="permissions" value={p} style={{ width: "auto" }} /> {p}
            </label>
          ))}
        </div>
      </div>
      <div className="wide profile-submit" style={{ marginTop: "8px" }}>
        <button className="primary">Create staff</button>
      </div>
    </form>
    {error && <div className="error">{error}</div>}
  </section>}<DataTable columns={["fullName", "email", "employeeNo", "roles", "status", "lastLoginAt"]} rows={resource.rows} /></>;
}

function DocumentsPage({ api, token, canCreate }: { api: Api; token: string; canCreate: boolean }) {
  const resource = useResource(api, "/documents"); const [error, setError] = useState("");
  async function upload(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; const values = formValues(event); const file = values.file as File; if (!file?.size) return; setError(""); try { const contentBase64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Could not read file")); reader.readAsDataURL(file); }); await api("/documents", { method: "POST", body: JSON.stringify({ name: file.name, category: values.category, mimeType: file.type, contentBase64 }) }); form.reset(); await resource.load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Upload failed"); } }
  async function download(row: Row) { const response = await fetch(`${apiBaseUrl}/api/documents/${row._id}/download`, { headers: { authorization: `Bearer ${token}` } }); if (!response.ok) { setError("Download failed"); return; } const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = row.name; link.click(); URL.revokeObjectURL(url); }
  return <>{canCreate && <section className="panel-card">
    <h2 style={{ marginBottom: "16px" }}>Upload document</h2>
    <form className="profile-form" style={{ marginTop: 0 }} onSubmit={upload}>
      <label>File<input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx" required /></label>
      <label>Category
        <select name="category">
          <option>IDENTIFICATION</option><option>CONTRACT</option><option>INVOICE</option><option>REPORT</option><option>OTHER</option>
        </select>
      </label>
      <div className="wide profile-submit" style={{ marginTop: "8px" }}>
        <button className="primary">Upload document</button>
      </div>
    </form>
    {error && <div className="error" style={{ marginTop: "16px" }}>{error}</div>}
  </section>}<PageState busy={resource.busy} error={resource.error} /><DataTable columns={["name", "category", "mimeType", "size", "createdAt"]} rows={resource.rows} action={(row) => <button onClick={() => void download(row)}>Download</button>} /></>;
}

function AppointmentsPage({ api, isAdmin, canCreate }: { api: Api; isAdmin: boolean; canCreate: boolean }) {
  const resource = useResource(api, "/appointments"); const [error, setError] = useState("");
  async function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; try { const values = formValues(event); await api("/appointments", { method: "POST", body: JSON.stringify({ ...values, startsAt: new Date(String(values.startsAt)).toISOString(), durationMinutes: Number(values.durationMinutes) }) }); form.reset(); await resource.load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Booking failed"); } }
  async function decide(id: string, status: string) { try { await api(`/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); await resource.load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Update failed"); } }
  return <>{canCreate && <section className="panel-card">
    <h2 style={{ marginBottom: "16px" }}>Book appointment</h2>
    <form className="profile-form" style={{ marginTop: 0 }} onSubmit={create}>
      <label>Subject<input name="subject" placeholder="e.g. Initial Consultation" required /></label>
      <label>Date & Time<input name="startsAt" type="datetime-local" required /></label>
      <label>Duration (minutes)<input name="durationMinutes" type="number" min="15" defaultValue="30" /></label>
      <label>Notes <span style={{fontWeight: "normal", color: "#667085"}}>(Optional)</span><input name="description" placeholder="Any special requests" /></label>
      <div className="wide profile-submit" style={{ marginTop: "8px" }}>
        <button className="primary">Request appointment</button>
      </div>
    </form>
    {error && <div className="error" style={{ marginTop: "16px" }}>{error}</div>}
  </section>}<PageState busy={resource.busy} error={resource.error} /><DataTable columns={["subject", "startsAt", "durationMinutes", "status", "decisionNote"]} rows={resource.rows} action={isAdmin ? (row) => <span className="row-actions"><button onClick={() => void decide(row._id, "APPROVED")}>Approve</button><button onClick={() => void decide(row._id, "REJECTED")}>Reject</button></span> : undefined} /></>;
}

function MessagesPage({ api, canCreate }: { api: Api; canCreate: boolean }) {
  const resource = useResource(api, "/messages"); const [error, setError] = useState("");
  async function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; try { await api("/messages", { method: "POST", body: JSON.stringify(formValues(event)) }); form.reset(); await resource.load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Message failed"); } }
  async function reply(row: Row) { const body = window.prompt("Reply"); if (!body) return; await api(`/messages/${row._id}/replies`, { method: "POST", body: JSON.stringify({ body }) }); await resource.load(); }
  return <>{canCreate && <section className="panel-card">
    <h2 style={{ marginBottom: "16px" }}>Contact billing support</h2>
    <form className="profile-form" style={{ marginTop: 0 }} onSubmit={create}>
      <label className="wide">Subject<input name="subject" placeholder="What do you need help with?" required /></label>
      <label className="wide">Message<textarea name="body" placeholder="Describe your issue in detail..." rows={4} required /></label>
      <div className="wide profile-submit" style={{ marginTop: "8px" }}>
        <button className="primary">Start conversation</button>
      </div>
    </form>
    {error && <div className="error" style={{ marginTop: "16px" }}>{error}</div>}
  </section>}<PageState busy={resource.busy} error={resource.error} /><div className="card-list">{resource.rows.map((row) => <article className="resource-card" key={row._id}><span className="status-badge">{row.status}</span><h3>{row.subject}</h3><div className="message-history">{row.messages?.map((message: Row) => <p key={message._id}><strong>{message.sender?.fullName ?? "User"}:</strong> {message.body}</p>)}</div>{canCreate && <button onClick={() => void reply(row)}>Reply</button>}</article>)}</div></>;
}

function ContractsPage({ api, isAdmin, canSign }: { api: Api; isAdmin: boolean; canSign: boolean }) {
  const resource = useResource(api, "/contracts"); const [error, setError] = useState("");
  async function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; try { await api("/contracts", { method: "POST", body: JSON.stringify(formValues(event)) }); form.reset(); await resource.load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Create failed"); } }
  async function decide(id: string, decision: string) { const signerName = decision === "ACCEPTED" ? window.prompt("Type the signer's full name") : undefined; const rejectionReason = decision === "REJECTED" ? window.prompt("Reason for rejection") : undefined; if (decision === "ACCEPTED" && !signerName || decision === "REJECTED" && !rejectionReason) return; await api(`/contracts/${id}/decision`, { method: "PATCH", body: JSON.stringify(decision === "ACCEPTED" ? { decision, signerName, signatureDataUrl: "" } : { decision, rejectionReason }) }); await resource.load(); }
  return <>{isAdmin && <section className="panel-card">
    <h2 style={{ marginBottom: "16px" }}>Create agreement</h2>
    <form className="profile-form" style={{ marginTop: 0 }} onSubmit={create}>
      <label className="wide">Contract title<input name="title" placeholder="e.g. Master Service Agreement 2026" required /></label>
      <label className="wide">Agreement terms<textarea name="body" placeholder="Enter the full legal terms of the agreement here..." minLength={20} rows={8} required /></label>
      <div className="wide profile-submit" style={{ marginTop: "8px" }}>
        <button className="primary">Publish for signature</button>
      </div>
    </form>
  </section>}{error && <div className="error" style={{ marginTop: "16px" }}>{error}</div>}<PageState busy={resource.busy} error={resource.error} />{!resource.busy && !resource.error && !resource.rows.length ? <div className="empty-state">No agreements yet.</div> : <div className="card-list">{resource.rows.map((row) => <article className="resource-card" key={row._id}><span className="status-badge">{row.status}</span><h3>{row.title}</h3><p>{row.body}</p>{row.status === "PENDING" && canSign && !isAdmin && <div className="row-actions"><button className="primary" onClick={() => void decide(row._id, "ACCEPTED")}>Accept & sign</button><button onClick={() => void decide(row._id, "REJECTED")}>Reject</button></div>}</article>)}</div>}</>;
}

type InvoiceBuilderLine = {
  id: string;
  description: string;
  unitLabel: string;
  quantity: string;
  unitPrice: string;
  vatPercent: string;
  selected: boolean;
  source: "template" | "catalog";
};

const demoInvoiceLines: InvoiceBuilderLine[] = [
  { id: "consultation", description: "Doctor consultation", unitLabel: "visit", quantity: "1", unitPrice: "1000", vatPercent: "0", selected: false, source: "template" },
  { id: "ward", description: "General ward bed", unitLabel: "day", quantity: "1", unitPrice: "1500", vatPercent: "0", selected: false, source: "template" },
  { id: "cabin", description: "Private cabin", unitLabel: "day", quantity: "1", unitPrice: "3500", vatPercent: "0", selected: false, source: "template" },
  { id: "nursing", description: "Nursing care", unitLabel: "day", quantity: "1", unitPrice: "500", vatPercent: "0", selected: false, source: "template" },
  { id: "diagnostics", description: "Diagnostic and laboratory tests", unitLabel: "test", quantity: "1", unitPrice: "1200", vatPercent: "0", selected: false, source: "template" },
  { id: "medicine", description: "Medicines and medical supplies", unitLabel: "unit", quantity: "1", unitPrice: "500", vatPercent: "0", selected: false, source: "template" },
  { id: "procedure", description: "Procedure / operation theatre charge", unitLabel: "procedure", quantity: "1", unitPrice: "5000", vatPercent: "0", selected: false, source: "template" },
  { id: "ambulance", description: "Ambulance service", unitLabel: "trip", quantity: "1", unitPrice: "2000", vatPercent: "0", selected: false, source: "template" },
  { id: "other", description: "Other hospital charge", unitLabel: "unit", quantity: "1", unitPrice: "100", vatPercent: "0", selected: false, source: "template" }
];

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function GuidedInvoiceBuilder({ api, canUseCatalog, onCreated, onError }: { api: Api; canUseCatalog: boolean; onCreated: (result: any) => void; onError: (message: string) => void }) {
  const catalog = useResource(api, "/catalog/services", canUseCatalog);
  const departments = useResource(api, "/catalog/departments", canUseCatalog);
  const [lines, setLines] = useState<InvoiceBuilderLine[]>(() => demoInvoiceLines.map((line) => ({ ...line })));
  const [discountAmount, setDiscountAmount] = useState("0");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!catalog.rows.length) return;
    setLines((current) => {
      const existing = new Set(current.map((line) => line.id));
      const additions = catalog.rows.filter((service) => !existing.has(`catalog-${service._id}`)).map((service) => ({
        id: `catalog-${service._id}`,
        description: String(service.name),
        unitLabel: "unit",
        quantity: "1",
        unitPrice: decimal(service.standardPrice),
        vatPercent: decimal(service.vatRatePercent),
        selected: false,
        source: "catalog" as const
      }));
      return additions.length ? [...current, ...additions] : current;
    });
  }, [catalog.rows]);

  function updateLine(id: string, changes: Partial<InvoiceBuilderLine>) {
    setLines((current) => current.map((line) => line.id === id ? { ...line, ...changes } : line));
  }

  const selectedLines = lines.filter((line) => line.selected);
  const subtotal = selectedLines.reduce((sum, line) => sum + numberValue(line.quantity) * numberValue(line.unitPrice), 0);
  const vat = selectedLines.reduce((sum, line) => {
    const base = numberValue(line.quantity) * numberValue(line.unitPrice);
    return sum + base * numberValue(line.vatPercent) / 100;
  }, 0);
  const total = Math.max(0, subtotal + vat - numberValue(discountAmount));

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLines.length) { onError("Select at least one charge to include in the invoice."); return; }
    if (selectedLines.some((line) => !line.description.trim() || numberValue(line.quantity) <= 0 || numberValue(line.unitPrice) <= 0 || numberValue(line.vatPercent) < 0)) {
      onError("Every selected charge needs a description, positive quantity/days, and positive unit price."); return;
    }
    if (numberValue(discountAmount) > subtotal + vat) { onError("Discount cannot be greater than the invoice total."); return; }
    const form = event.currentTarget;
    const values = formValues(event);
    setSubmitting(true);
    try {
      const result = await api("/invoices", {
        method: "POST",
        body: JSON.stringify({
          patientName: values.patientName,
          patientEmail: values.patientEmail,
          patientPhone: values.patientPhone,
          title: values.title,
          dueAt: values.dueAt,
          status: "UNPAID",
          discountAmount: discountAmount || "0",
          items: selectedLines.map((line) => ({ description: `${line.description.trim()} (per ${line.unitLabel})`, quantity: line.quantity, unitPrice: line.unitPrice, vatPercent: line.vatPercent || "0" }))
        })
      });
      form.reset();
      setDiscountAmount("0");
      setLines((current) => current.map((line) => ({ ...line, selected: false, quantity: "1" })));
      onCreated(result);
    } catch (reason) { onError(reason instanceof Error ? reason.message : "Invoice creation failed"); }
    finally { setSubmitting(false); }
  }

  async function createService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api("/catalog/services", { method: "POST", body: JSON.stringify(formValues(event)) });
      event.currentTarget.reset();
      await catalog.load();
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Service creation failed");
    }
  }

  return <>
    {canUseCatalog && <section className="panel-card">
      <h2 style={{ marginBottom: "16px" }}>Add new service to catalog</h2>
      <p style={{ marginBottom: "16px" }}>Add a service to the catalog to make it available in the invoice builder below.</p>
      <form className="profile-form" style={{ marginTop: 0 }} onSubmit={createService}>
        <label className="wide">Department
          <select name="departmentId" required>
            <option value="">Select Department</option>{departments.rows.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}
          </select>
        </label>
        <label>Code<input name="code" placeholder="Service code" required /></label>
        <label>Name<input name="name" placeholder="Service name" required /></label>
        <label className="wide">Category<input name="category" placeholder="Category" required /></label>
        <label>Price (BDT)<input name="standardPrice" type="number" step="0.01" placeholder="Price" required /></label>
        <label>VAT %<input name="vatRatePercent" type="number" step="0.01" placeholder="VAT %" /></label>
        <div className="wide profile-submit" style={{ marginTop: "8px" }}>
          <button className="primary">Add service</button>
        </div>
      </form>
    </section>}
    <section className="panel-card invoice-builder">
      <div className="invoice-builder-heading"><div><span className="eyebrow">Guided invoice builder</span><h2>Create manual invoice</h2><p>Complete the patient details, tick the charges that apply, adjust days or quantities, then review the total before issuing.</p></div><div className="invoice-builder-total"><small>Invoice total</small><strong>BDT {total.toFixed(2)}</strong><span>{selectedLines.length} charge{selectedLines.length === 1 ? "" : "s"} selected</span></div></div>
      <form className="invoice-builder-form" onSubmit={createInvoice}>
        <fieldset><legend>1. Patient and invoice details</legend><div className="invoice-details-grid"><label>Patient name<input name="patientName" placeholder="Example: Rahim Ahmed" required /></label><label>Patient email<input name="patientEmail" type="email" placeholder="patient@example.com" required /></label><label>Patient phone<input name="patientPhone" type="tel" placeholder="01XXXXXXXXX" required /></label><label>Invoice title<input name="title" placeholder="Example: Admission and treatment bill" required /></label><label>Payment due date<input name="dueAt" type="date" required /></label></div></fieldset>
        <fieldset><legend>2. Select charges and adjust prices</legend><p className="field-help">Demo prices are examples in BDT. Tick only the services the patient received. For hospital stays, enter the number of days as the quantity.</p>{catalog.error && <div className="error">Service catalog could not be loaded: {catalog.error}</div>}<div className="invoice-lines"><div className="invoice-line invoice-line-header"><span>Include</span><span>Charge description</span><span>Unit</span><span>Quantity / days</span><span>Price per unit</span><span>VAT %</span><span>Line total</span></div>{lines.map((line) => { const base = numberValue(line.quantity) * numberValue(line.unitPrice); const lineTotal = base + base * numberValue(line.vatPercent) / 100; return <div className={`invoice-line ${line.selected ? "is-selected" : ""}`} key={line.id}><label className="invoice-check"><input type="checkbox" checked={line.selected} onChange={(event) => updateLine(line.id, { selected: event.target.checked })} aria-label={`Include ${line.description}`} /><span>{line.source === "catalog" ? "Catalog" : "Add"}</span></label><input value={line.description} onChange={(event) => updateLine(line.id, { description: event.target.value })} aria-label={`${line.id} description`} /><select value={line.unitLabel} onChange={(event) => updateLine(line.id, { unitLabel: event.target.value })} aria-label={`${line.id} unit`}><option value="unit">Unit</option><option value="day">Day</option><option value="visit">Visit</option><option value="test">Test</option><option value="procedure">Procedure</option><option value="trip">Trip</option></select><input type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: event.target.value })} aria-label={`${line.id} quantity or days`} disabled={!line.selected} /><input type="number" min="0.01" step="0.01" value={line.unitPrice} onChange={(event) => updateLine(line.id, { unitPrice: event.target.value })} aria-label={`${line.id} unit price`} disabled={!line.selected} /><input type="number" min="0" step="0.01" value={line.vatPercent} onChange={(event) => updateLine(line.id, { vatPercent: event.target.value })} aria-label={`${line.id} VAT percent`} disabled={!line.selected} /><strong>BDT {line.selected ? lineTotal.toFixed(2) : "0.00"}</strong></div>; })}</div></fieldset>
        <fieldset><legend>3. Review and issue</legend><div className="invoice-review"><label>Discount (BDT)<input type="number" min="0" step="0.01" value={discountAmount} onChange={(event) => setDiscountAmount(event.target.value)} /></label><dl><div><dt>Subtotal</dt><dd>BDT {subtotal.toFixed(2)}</dd></div><div><dt>VAT</dt><dd>BDT {vat.toFixed(2)}</dd></div><div><dt>Discount</dt><dd>BDT {numberValue(discountAmount).toFixed(2)}</dd></div><div className="invoice-grand-total"><dt>Total due</dt><dd>BDT {total.toFixed(2)}</dd></div></dl><button className="primary" disabled={submitting || !selectedLines.length}>{submitting ? "Creating invoice..." : "Issue and email invoice"}</button></div></fieldset>
      </form>
    </section>
  </>;
}

function InvoicesPage({ api, token, canCreate, canPay, canUseCatalog }: { api: Api; token: string; canCreate: boolean; canPay: boolean; canUseCatalog: boolean }) {
  const resource = useResource(api, "/invoices"); const encounters = useResource(api, "/encounters", canCreate); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("SSLCOMMERZ"); const [gateway, setGateway] = useState<Row | null>(null);
  const [encounterRecipient, setEncounterRecipient] = useState({ patientName: "", patientEmail: "", patientPhone: "" });
  useEffect(() => { if (canPay) void api("/payments/config").then((result) => setGateway(result.data)).catch((reason) => setError(reason instanceof Error ? reason.message : "Payment configuration failed")); }, [api, canPay]);
  function deliveryMessage(result: any) { if (result.emailDelivery?.status === "SENT") { setError(""); setNotice(`Invoice emailed to ${result.data.patientEmail}.`); } else if (result.emailDelivery?.status === "FAILED") { setNotice(""); setError(`Invoice created, but email was not sent: ${result.emailDelivery.error}`); } }
  async function pay(row: Row) { try { if (!gateway?.ready) throw new Error("SSLCOMMERZ sandbox is not configured on the backend."); const result = await api(`/payments/checkout/${row._id}`, { method: "POST", body: JSON.stringify({ method: paymentMethod }) }); if (!result.redirectUrl) throw new Error("The payment provider did not return a checkout link"); location.href = result.redirectUrl; } catch (reason) { setNotice(""); setError(reason instanceof Error ? reason.message : "Checkout failed"); } }
  async function updateRecipient(row: Row) { const patientName = window.prompt("Patient name", row.patientName ?? ""); const patientEmail = window.prompt("Patient email", row.patientEmail ?? ""); const patientPhone = window.prompt("Patient phone", row.patientPhone ?? ""); if (!patientName || !patientEmail || !patientPhone) return; try { const result = await api(`/invoices/${row._id}/recipient`, { method: "PATCH", body: JSON.stringify({ patientName, patientEmail, patientPhone }) }); deliveryMessage(result); await resource.load(); } catch (reason) { setNotice(""); setError(reason instanceof Error ? reason.message : "Recipient update failed"); } }
  async function consolidate(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; try { const result = await api("/invoices/from-encounter", { method: "POST", body: JSON.stringify(formValues(event)) }); form.reset(); setEncounterRecipient({ patientName: "", patientEmail: "", patientPhone: "" }); deliveryMessage(result); await resource.load(); } catch (reason) { setNotice(""); setError(reason instanceof Error ? reason.message : "Consolidation failed"); } }
  function chooseEncounter(id: string) { const patient = encounters.rows.find((row) => row._id === id)?.patient; setEncounterRecipient({ patientName: patient?.fullName ?? "", patientEmail: patient?.email ?? "", patientPhone: patient?.phone ?? "" }); }
  return <>
    {canCreate && <>
      <section className="panel-card">
        <h2 style={{ marginBottom: "16px" }}>Consolidate encounter charges</h2>
        <p style={{ marginBottom: "16px" }}>Selecting an encounter fills the recipient from the patient record. Verify the details before issuing.</p>
        <form className="profile-form" style={{ marginTop: 0 }} onSubmit={consolidate}>
          <label>Encounter
            <select name="encounterId" onChange={(event) => chooseEncounter(event.target.value)} required>
              <option value="">Select Encounter</option>{encounters.rows.map((row) => <option key={row._id} value={row._id}>{row.encounterNo} - {row.patient?.fullName}</option>)}
            </select>
          </label>
          <label>Patient name<input name="patientName" placeholder="Patient name" value={encounterRecipient.patientName} onChange={(event) => setEncounterRecipient((current) => ({ ...current, patientName: event.target.value }))} required /></label>
          <label>Patient email<input name="patientEmail" type="email" placeholder="Patient email" value={encounterRecipient.patientEmail} onChange={(event) => setEncounterRecipient((current) => ({ ...current, patientEmail: event.target.value }))} required /></label>
          <label>Patient phone<input name="patientPhone" type="tel" placeholder="Patient phone" value={encounterRecipient.patientPhone} onChange={(event) => setEncounterRecipient((current) => ({ ...current, patientPhone: event.target.value }))} required /></label>
          <label>Invoice title<input name="title" placeholder="e.g. Admission and treatment bill" required /></label>
          <label>Payment due date<input name="dueAt" type="date" required /></label>
          <div className="wide profile-submit" style={{ marginTop: "8px" }}>
            <button className="primary">Create and email invoice</button>
          </div>
        </form>
      </section>
      <GuidedInvoiceBuilder api={api} canUseCatalog={canUseCatalog} onCreated={(result) => { deliveryMessage(result); void resource.load(); }} onError={(message) => { setNotice(""); setError(message); }} />
    </>}
    {canPay && <section className="panel-card"><h2>Online payment method</h2><form className="inline-form"><label>Method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="SSLCOMMERZ">SSLCOMMERZ hosted checkout</option><option value="BANGLA_QR">Bangla QR</option></select></label><p>{gateway?.ready ? `Gateway ready (${gateway.mode.toLowerCase()} mode).` : gateway ? "Gateway is not configured." : "Checking gateway…"}</p></form></section>}
    {notice && <div className="success" role="status">{notice}</div>}{error && <div className="error">{error}</div>}<PageState busy={resource.busy} error={resource.error} />
    <DataTable columns={["invoiceNo", "patientName", "patientEmail", "patientPhone", "emailDeliveryStatus", "status", "totalAmount", "dueAmount", "dueAt"]} rows={resource.rows} action={(row) => <span className="row-actions"><button onClick={() => void downloadAuthenticated(`/invoices/${row._id}/pdf`, `${row.invoiceNo}.pdf`, token)}>PDF</button>{canCreate && <button onClick={() => void updateRecipient(row)}>Recipient</button>}{canPay && ["UNPAID", "OVERDUE"].includes(row.status) && <button className="primary" onClick={() => void pay(row)}>Pay now</button>}</span>} />
  </>;
}

function PaymentsPage({ api, token, isAdmin, canRefund }: { api: Api; token: string; isAdmin: boolean; canRefund: boolean }) {
  const payments = useResource(api, "/payments"); const refunds = useResource(api, "/refunds"); const reconciliation = useResource(api, "/reconciliation", isAdmin); const [error, setError] = useState("");
  async function requestRefund(row: Row) { const amount = window.prompt("Refund amount", decimal(row.amount)); const reason = window.prompt("Refund reason"); if (!amount || !reason) return; try { await api("/refunds", { method: "POST", body: JSON.stringify({ paymentId: row._id, amount, reason }) }); await refunds.load(); } catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : "Refund failed"); } }
  async function approveRefund(row: Row) { if (!window.confirm(`Approve refund of BDT ${decimal(row.amount)}?`)) return; try { await api(`/refunds/${row._id}/approve`, { method: "PATCH", body: "{}" }); await Promise.all([refunds.load(), payments.load()]); } catch (reason) { setError(reason instanceof Error ? reason.message : "Refund approval failed"); } }
  async function reconcile(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; try { await api("/reconciliation", { method: "POST", body: JSON.stringify(formValues(event)) }); form.reset(); await reconciliation.load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Reconciliation failed"); } }
  return <>{error && <div className="error" style={{ marginBottom: "16px" }}>{error}</div>}<h2>Payment history</h2><PageState busy={payments.busy} error={payments.error} /><DataTable columns={["transactionId", "amount", "method", "status", "paidAt"]} rows={payments.rows} action={(row) => <span className="row-actions">{["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(row.status) && <button onClick={() => void downloadAuthenticated(`/payments/${row._id}/receipt.pdf`, `receipt-${row.transactionId}.pdf`, token)}>Receipt</button>}{canRefund && row.status === "PAID" && <button onClick={() => void requestRefund(row)}>Request refund</button>}</span>} /><h2>Refunds</h2><DataTable columns={["amount", "reason", "status", "createdAt"]} rows={refunds.rows} action={isAdmin ? (row) => row.status === "REQUESTED" ? <button className="primary" onClick={() => void approveRefund(row)}>Approve refund</button> : null : undefined} />{isAdmin && <><section className="panel-card">
    <h2 style={{ marginBottom: "16px" }}>Reconcile settlement</h2>
    <form className="profile-form" style={{ marginTop: 0 }} onSubmit={reconcile}>
      <label>Business date<input name="businessDate" type="date" required /></label>
      <label>External reference<input name="externalReference" placeholder="Settlement reference" required /></label>
      <label>Expected amount<input name="expectedAmount" type="number" step="0.01" placeholder="Expected amount" required /></label>
      <label>Settled amount<input name="settledAmount" type="number" step="0.01" placeholder="Settled amount" required /></label>
      <label className="wide">Note<input name="note" placeholder="Any additional notes" /></label>
      <div className="wide profile-submit" style={{ marginTop: "8px" }}>
        <button className="primary">Reconcile</button>
      </div>
    </form>
  </section><DataTable columns={["businessDate", "externalReference", "expectedAmount", "settledAmount", "varianceAmount", "status"]} rows={reconciliation.rows} /></>}</>;
}

function ReportsPage({ api, isAdmin }: { api: Api; isAdmin: boolean }) {
  const resource = useResource(api, "/reports"); const [error, setError] = useState("");
  async function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; try { await api("/reports", { method: "POST", body: JSON.stringify(formValues(event)) }); form.reset(); await resource.load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Report failed"); } }
  return <>{isAdmin && <section className="panel-card">
    <h2 style={{ marginBottom: "16px" }}>Publish report</h2>
    <form className="profile-form" style={{ marginTop: 0 }} onSubmit={create}>
      <label>Report title<input name="title" placeholder="e.g. Q3 Financial Summary" required /></label>
      <label>Report type
        <select name="reportType">
          <option>MONTHLY_BILLING</option><option>FINANCIAL</option><option>CLAIMS</option><option>CUSTOM</option>
        </select>
      </label>
      <label>Period start<input name="periodStart" type="date" required /></label>
      <label>Period end<input name="periodEnd" type="date" required /></label>
      <label className="wide">Summary<input name="summary" placeholder="Brief summary of the report contents" /></label>
      <div className="wide profile-submit" style={{ marginTop: "8px" }}>
        <button className="primary">Publish report</button>
      </div>
    </form>
  </section>}{error && <div className="error" style={{ marginTop: "16px" }}>{error}</div>}<PageState busy={resource.busy} error={resource.error} /><DataTable columns={["title", "reportType", "periodStart", "periodEnd", "summary", "createdAt"]} rows={resource.rows} /></>;
}

function ClaimsPage({ api, token, isAdmin, canCreate }: { api: Api; token: string; isAdmin: boolean; canCreate: boolean }) {
  const resource = useResource(api, "/claims"); const [error, setError] = useState("");
  async function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; try { await api("/claims", { method: "POST", body: JSON.stringify(formValues(event)) }); form.reset(); await resource.load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Claim failed"); } }
  async function update(row: Row, status: string) { const rejectionReason = status === "REJECTED" ? window.prompt("Rejection reason") : ""; if (status === "REJECTED" && !rejectionReason) return; await api(`/claims/${row._id}`, { method: "PATCH", body: JSON.stringify({ status, rejectionReason }) }); await resource.load(); }
  return <>{canCreate && <section className="panel-card">
    <h2 style={{ marginBottom: "16px" }}>Submit claim</h2>
    <form className="profile-form" style={{ marginTop: 0 }} onSubmit={create}>
      <label>Claim no.<input name="claimNo" placeholder="Unique claim reference" required /></label>
      <label>Patient name<input name="patientName" placeholder="Patient's full name" required /></label>
      <label>Payer<input name="payerName" placeholder="Insurance or payer name" required /></label>
      <label>Amount (BDT)<input name="amount" type="number" step="0.01" placeholder="Claim amount" required /></label>
      <div className="wide profile-submit" style={{ marginTop: "8px" }}>
        <button className="primary">Submit claim</button>
      </div>
    </form>
  </section>}<div className="toolbar"><button onClick={() => void downloadAuthenticated("/claims/export.csv", "claims.csv", token)}>Export CSV</button></div>{error && <div className="error" style={{ marginBottom: "16px" }}>{error}</div>}<PageState busy={resource.busy} error={resource.error} /><DataTable columns={["claimNo", "patientName", "payerName", "amount", "status", "rejectionReason", "submittedAt"]} rows={resource.rows} action={isAdmin ? (row) => <select value={row.status} onChange={(event) => void update(row, event.target.value)}><option>SUBMITTED</option><option>PROCESSING</option><option>APPROVED</option><option>REJECTED</option><option>PAID</option></select> : undefined} /></>;
}

function NotificationsPage({ api }: { api: Api }) {
  const resource = useResource(api, "/notifications");
  async function markRead(row: Row) { await api(`/notifications/${row._id}/read`, { method: "PATCH", body: "{}" }); await resource.load(); }
  return <><PageState busy={resource.busy} error={resource.error} /><div className="card-list">{resource.rows.map((row) => <article className={`resource-card ${row.isRead ? "is-read" : ""}`} key={row._id}><span className="status-badge">{row.type}</span><h3>{row.title}</h3><p>{row.message}</p><small>{dateTime(row.createdAt)}</small>{!row.isRead && <button onClick={() => void markRead(row)}>Mark as read</button>}</article>)}</div></>;
}

function AuditPage({ api, token }: { api: Api; token: string }) {
  const resource = useResource(api, "/audit?limit=100");
  async function exportCsv() { const response = await fetch(`${apiBaseUrl}/api/audit?format=csv&limit=100`, { headers: { authorization: `Bearer ${token}` } }); if (!response.ok) return; const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = "audit-logs.csv"; link.click(); URL.revokeObjectURL(url); }
  return <><div className="toolbar"><button onClick={() => void resource.load()}>Refresh</button><button className="button-link" onClick={() => void exportCsv()}>Export CSV</button></div><PageState busy={resource.busy} error={resource.error} /><DataTable columns={["occurredAt", "action", "entityType", "entityId", "correlationId"]} rows={resource.rows} /></>;
}

function AdminPage({ api }: { api: Api }) {
  const resource = useResource(api, "/organizations"); const [error, setError] = useState("");
  async function update(row: Row, status: string) { try { await api(`/organizations/${row._id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); await resource.load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Update failed"); } }
  return <>{error && <div className="error">{error}</div>}<PageState busy={resource.busy} error={resource.error} /><DataTable columns={["code", "name", "organizationType", "district", "status", "createdAt"]} rows={resource.rows} action={(row) => <select value={row.status ?? "PENDING"} onChange={(event) => void update(row, event.target.value)}><option>PENDING</option><option>APPROVED</option><option>SUSPENDED</option><option>DEACTIVATED</option></select>} /></>;
}

function displayValue(key: string, value: any) {
  if (key.toLowerCase().includes("amount") || ["totalAmount", "paidAmount", "dueAmount"].includes(key)) return decimal(value);
  if (key.endsWith("At") || key.toLowerCase().includes("date")) return dateTime(value);
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object" && "$numberDecimal" in value) return decimal(value);
  if (value && typeof value === "object") return value.fullName ?? value.invoiceNo ?? value.encounterNo ?? value.patientNo ?? value.name ?? "-";
  return String(value ?? "-");
}

function DataTable({ columns, rows, action }: { columns: string[]; rows: Row[]; action?: (row: Row) => ReactNode }) {
  if (!rows.length) return <div className="empty-state">No records yet.</div>;
  return <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase())}</th>)}{action && <th>Actions</th>}</tr></thead><tbody>{rows.map((row) => <tr key={row._id}>{columns.map((column) => <td key={column}>{displayValue(column, row[column])}</td>)}{action && <td>{action(row)}</td>}</tr>)}</tbody></table></div>;
}
