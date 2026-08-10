import { FormEvent, useState } from "react";
import "./auth.css";

interface Session {
  token: string;
  user: { fullName: string; roles: string[] };
}

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export function App() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [hospitalName, setHospitalName] = useState("");
  const [hospitalCode, setHospitalCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const payload = await response.json();
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
    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hospitalName, hospitalCode, fullName, email, password })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Registration failed");
      setSession(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  function changeMode(nextMode: "login" | "register") {
    setMode(nextMode);
    setError("");
    setPassword("");
  }

  if (session) return <Dashboard session={session} onLogout={() => setSession(null)} />;

  return <main className="login-page">
    <section className="login-card" aria-labelledby="login-heading">
      <div className="login-hero">
        <span className="eyebrow">Hospital Billing SaaS</span>
        <h1>One hospital.<br />One trusted bill.</h1>
        <p>Departments record services independently. Billing officers combine charges into one transparent invoice.</p>
      </div>
      <form className="login-form" onSubmit={mode === "login" ? login : register}>
        <span className="eyebrow">Secure workspace</span>
        <h2 id="login-heading">{mode === "login" ? "Welcome back" : "Create your workspace"}</h2>
        <p>{mode === "login" ? "Sign in with your assigned hospital account." : "Register a hospital and its first administrator."}</p>
        {mode === "register" && <>
          <label>Hospital name<input type="text" value={hospitalName} onChange={(e) => setHospitalName(e.target.value)} autoComplete="organization" minLength={2} maxLength={120} required /></label>
          <label>Hospital code<input type="text" value={hospitalCode} onChange={(e) => setHospitalCode(e.target.value.toUpperCase())} pattern="[A-Z0-9][A-Z0-9_-]{1,19}" placeholder="e.g. SHUROKKHA" minLength={2} maxLength={20} required /></label>
          <label>Administrator name<input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" minLength={2} maxLength={120} required /></label>
        </>}
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? 8 : 12} maxLength={128} required /></label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="primary" disabled={busy}>{busy ? (mode === "login" ? "Signing in…" : "Creating workspace…") : (mode === "login" ? "Continue securely" : "Create hospital workspace")}</button>
        {mode === "login" ?
          <small className="auth-switch">Setting up a new hospital? <button type="button" onClick={() => changeMode("register")}>Register</button></small> :
          <small className="auth-switch">Already have an account? <button type="button" onClick={() => changeMode("login")}>Sign in</button></small>}
      </form>
    </section>
  </main>;
}

function Dashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  return <div className="shell">
    <aside><div className="brand">Hospital<br /><strong>Billing</strong></div><nav aria-label="Main navigation"><a className="active" href="#dashboard">Dashboard</a><a href="#patients">Patients</a><a href="#queue">Department Queue</a><a href="#invoices">Billing & Invoices</a><a href="#payments">Payments</a><a href="#reports">Reports</a></nav></aside>
    <main className="workspace">
      <header><div><span className="eyebrow">Milestone 1</span><h1>Revenue & collection overview</h1></div><div className="user"><span>{session.user.fullName}</span><button onClick={onLogout}>Sign out</button></div></header>
      <section className="metrics" aria-label="Billing metrics">
        <Metric label="Today’s billed" value="৳ 0.00" detail="Waiting for charges" />
        <Metric label="Collected" value="৳ 0.00" detail="Milestone 2" />
        <Metric label="Outstanding" value="৳ 0.00" detail="No released invoices" />
        <Metric label="Your role" value={session.user.roles[0]?.replaceAll("_", " ") ?? "USER"} detail="Access enforced by API" />
      </section>
      <section className="panel"><div><span className="eyebrow">First vertical slice</span><h2>Foundation is connected</h2><p>Authentication is live. Patient registration, encounters, service catalog, department-scoped charge capture, and audit endpoints are scaffolded in the API.</p></div><button className="primary">Open patient search</button></section>
    </main>
  </div>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}
