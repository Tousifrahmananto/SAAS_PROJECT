import { FormEvent, useEffect, useState } from "react";
import "./auth.css";
import "./dashboard.css";

interface Session {
  token: string;
  user: { fullName: string; email: string; roles: string[] };
}

interface Organization {
  _id: string;
  code: string;
  name: string;
  organizationType: "HOSPITAL" | "CLINIC" | "BILLING_PROVIDER" | "OTHER";
  status: "PENDING" | "APPROVED" | "SUSPENDED" | "DEACTIVATED";
  address: string;
  district: string;
  phone: string;
  email: string;
  website: string;
  contactPersonName: string;
  registrationNumber: string;
  binTin: string;
}

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

type AuthMode = "login" | "register" | "forgot" | "reset";

async function readPayload(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The server returned an invalid response. Please try again.");
  }
}

export function App() {
  const initialResetToken = new URLSearchParams(window.location.search).get("resetToken") ?? "";
  const [mode, setMode] = useState<AuthMode>(initialResetToken ? "reset" : "login");
  const [hospitalName, setHospitalName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.error?.message ?? "Sign in failed");
      setSession(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  async function register(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (password !== confirmPassword) throw new Error("Passwords do not match");
      const response = await fetch(`${apiBaseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hospitalName, fullName, email, password })
      });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.error?.message ?? "Registration failed");
      setSession(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email })
      });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not send reset email");
      setSuccess(payload.message ?? "Check your email for a password reset link.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send reset email");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (password !== confirmPassword) throw new Error("Passwords do not match");
      const response = await fetch(`${apiBaseUrl}/api/auth/reset-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: initialResetToken, password })
      });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.error?.message ?? "Password reset failed");
      window.history.replaceState({}, "", window.location.pathname);
      setPassword("");
      setConfirmPassword("");
      setMode("login");
      setSuccess(payload.message ?? "Password reset successfully. You can now sign in.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Password reset failed");
    } finally {
      setBusy(false);
    }
  }

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setSuccess("");
    setPassword("");
    setConfirmPassword("");
  }

  const submitHandler = mode === "login" ? login : mode === "register" ? register : mode === "forgot" ? forgotPassword : resetPassword;
  const heading = mode === "login" ? "Welcome back" : mode === "register" ? "Create your workspace" : mode === "forgot" ? "Forgot your password?" : "Choose a new password";
  const description = mode === "login" ? "Sign in with your hospital account." : mode === "register" ? "Create a hospital and its first administrator." : mode === "forgot" ? "Enter your account email and we’ll send a secure reset link." : "Enter a new password of at least 12 characters.";

  if (session) return <Dashboard session={session} onLogout={() => setSession(null)} />;

  return <main className="login-page">
    <section className="login-card" aria-labelledby="login-heading">
      <div className="login-hero">
        <span className="eyebrow">Hospital Billing SaaS</span>
        <h1>One hospital.<br />One trusted bill.</h1>
        <p>Departments record services independently. Billing officers combine charges into one transparent invoice.</p>
      </div>
      <form className="login-form" onSubmit={submitHandler}>
        <span className="eyebrow">Secure workspace</span>
        <h2 id="login-heading">{heading}</h2>
        <p>{description}</p>
        {mode === "register" && <>
          <label>Hospital name<input type="text" value={hospitalName} onChange={(e) => setHospitalName(e.target.value)} autoComplete="organization" minLength={2} maxLength={120} required /></label>
          <label>Your full name<input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" minLength={2} maxLength={120} required /></label>
        </>}
        {mode !== "reset" && <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>}
        {(mode === "login" || mode === "register" || mode === "reset") &&
          <label>{mode === "login" ? "Password" : "Password (at least 12 characters)"}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? 8 : 12} maxLength={128} required /></label>}
        {(mode === "register" || mode === "reset") &&
          <label>Confirm password<input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required /></label>}
        {error && <div className="error" role="alert">{error}</div>}
        {success && <div className="success" role="status">{success}</div>}
        <button className="primary" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : mode === "forgot" ? "Send reset link" : "Reset password"}</button>
        {mode === "login" && <div className="auth-actions"><button type="button" onClick={() => changeMode("forgot")}>Forgot password?</button><button type="button" onClick={() => changeMode("register")}>Create account</button></div>}
        {mode !== "login" && <small className="auth-switch"><button type="button" onClick={() => changeMode("login")}>Back to sign in</button></small>}
      </form>
    </section>
  </main>;
}

function Dashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [view, setView] = useState<"dashboard" | "organization">("dashboard");
  return <div className="shell">
    <aside><div className="brand">Hospital<br /><strong>Billing</strong></div><nav aria-label="Main navigation"><a className={view === "dashboard" ? "active" : ""} href="#dashboard" onClick={() => setView("dashboard")}>Dashboard</a><a className={view === "organization" ? "active" : ""} href="#organization" onClick={() => setView("organization")}>Organization Profile</a><a href="#documents">Documents</a><a href="#appointments">Appointments</a><a href="#invoices">Billing & Invoices</a><a href="#payments">Payments</a><a href="#reports">Reports</a></nav></aside>
    <main className="workspace">
      <header><div><span className="eyebrow">Milestone 1</span><h1>{view === "dashboard" ? "Revenue & collection overview" : "Organization profile"}</h1></div><div className="user"><span>{session.user.fullName}</span><button onClick={onLogout}>Sign out</button></div></header>
      {view === "dashboard" ? <>
        <section className="metrics" aria-label="Billing metrics">
          <Metric label="Today’s billed" value="৳ 0.00" detail="Waiting for invoices" />
          <Metric label="Collected" value="৳ 0.00" detail="Payments arrive in Milestone 3" />
          <Metric label="Outstanding" value="৳ 0.00" detail="No released invoices" />
          <Metric label="Your role" value={session.user.roles[0]?.replaceAll("_", " ") ?? "USER"} detail="Access enforced by API" />
        </section>
        <section className="panel"><div><span className="eyebrow">Foundation</span><h2>Your provider workspace is connected</h2><p>Complete the organization profile before adding staff, documents, appointments, invoices, and payments.</p></div><button className="primary" onClick={() => setView("organization")}>Complete organization profile</button></section>
      </> : <OrganizationProfile session={session} />}
    </main>
  </div>;
}

function OrganizationProfile({ session }: { session: Session }) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [form, setForm] = useState<Partial<Organization>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(true);
  const editable = session.user.roles.some((role) => ["PROVIDER_OWNER", "ADMIN", "SUPER_ADMIN"].includes(role));

  useEffect(() => {
    let active = true;
    fetch(`${apiBaseUrl}/api/organizations/me`, { headers: { authorization: `Bearer ${session.token}` } })
      .then(async (response) => {
        const payload = await readPayload(response);
        if (!response.ok) throw new Error(payload.error?.message ?? "Could not load organization");
        if (active) {
          setOrganization(payload.data);
          setForm(payload.data);
        }
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "Could not load organization"))
      .finally(() => active && setBusy(false));
    return () => { active = false; };
  }, [session.token]);

  function setField<K extends keyof Organization>(field: K, value: Organization[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const allowedFields = ["name", "organizationType", "address", "district", "phone", "email", "website", "contactPersonName", "registrationNumber", "binTin"] as const;
      const body = Object.fromEntries(allowedFields.map((field) => [field, form[field] ?? ""]));
      const response = await fetch(`${apiBaseUrl}/api/organizations/me`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${session.token}`, "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not update organization");
      setOrganization(payload.data);
      setForm(payload.data);
      setSuccess("Organization profile updated successfully.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update organization");
    } finally {
      setBusy(false);
    }
  }

  if (busy && !organization) return <section className="profile-card"><p>Loading organization…</p></section>;
  if (!organization) return <section className="profile-card"><div className="error" role="alert">{error || "Organization unavailable"}</div></section>;

  return <section className="profile-card">
    <div className="profile-heading"><div><span className="status-badge">{organization.status ?? "PENDING"}</span><h2>{organization.name}</h2><p>Organization code: {organization.code}</p></div><span>{editable ? "Owner access" : "Read-only access"}</span></div>
    <form className="profile-form" onSubmit={save}>
      <label>Organization name<input value={form.name ?? ""} onChange={(event) => setField("name", event.target.value)} disabled={!editable} required /></label>
      <label>Organization type<select value={form.organizationType ?? "HOSPITAL"} onChange={(event) => setField("organizationType", event.target.value as Organization["organizationType"])} disabled={!editable}><option value="HOSPITAL">Hospital</option><option value="CLINIC">Clinic</option><option value="BILLING_PROVIDER">Billing provider</option><option value="OTHER">Other</option></select></label>
      <label>Contact person<input value={form.contactPersonName ?? ""} onChange={(event) => setField("contactPersonName", event.target.value)} disabled={!editable} /></label>
      <label>Phone<input value={form.phone ?? ""} onChange={(event) => setField("phone", event.target.value)} disabled={!editable} /></label>
      <label>Email<input type="email" value={form.email ?? ""} onChange={(event) => setField("email", event.target.value)} disabled={!editable} /></label>
      <label>Website<input type="url" value={form.website ?? ""} onChange={(event) => setField("website", event.target.value)} disabled={!editable} /></label>
      <label>District<input value={form.district ?? ""} onChange={(event) => setField("district", event.target.value)} disabled={!editable} /></label>
      <label>Registration number<input value={form.registrationNumber ?? ""} onChange={(event) => setField("registrationNumber", event.target.value)} disabled={!editable} /></label>
      <label>BIN/TIN<input value={form.binTin ?? ""} onChange={(event) => setField("binTin", event.target.value)} disabled={!editable} /></label>
      <label className="wide">Address<textarea value={form.address ?? ""} onChange={(event) => setField("address", event.target.value)} disabled={!editable} rows={3} /></label>
      {error && <div className="error wide" role="alert">{error}</div>}
      {success && <div className="success wide" role="status">{success}</div>}
      {editable && <div className="wide profile-submit"><button className="primary" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button></div>}
    </form>
  </section>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}
