import { FormEvent, useState } from "react";
import "./auth.css";

interface Session {
  token: string;
  user: { fullName: string; roles: string[] };
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
