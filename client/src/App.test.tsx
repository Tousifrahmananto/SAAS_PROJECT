import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("App", () => {
  it("renders the secure login", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forgot password?" })).toBeInTheDocument();
  });

  it("opens hospital registration", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("heading", { name: "Create your workspace" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
    expect(screen.getByLabelText("Hospital name")).toBeInTheDocument();
    expect(screen.queryByLabelText("Hospital code")).not.toBeInTheDocument();
  });

  it("opens password recovery", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.getByRole("heading", { name: "Forgot your password?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeInTheDocument();
  });

  it("opens a reset link", () => {
    window.history.replaceState({}, "", "/?resetToken=" + "a".repeat(64));
    render(<App />);
    expect(screen.getByRole("heading", { name: "Choose a new password" })).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
  });

  it("opens the complete provider portal after login", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/login")) return new Response(JSON.stringify({ token: "test-token", user: { fullName: "Provider Owner", email: "owner@example.com", roles: ["PROVIDER_OWNER"] } }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("/api/dashboard")) return new Response(JSON.stringify({ data: { billed: "0.00", collected: "0.00", outstanding: "0.00", invoices: 0, patients: 0, openEncounters: 0, activeStaff: 1, upcomingAppointments: 0, claims: {} } }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    render(<App />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("link", { name: "Patients & Charges" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Invoices" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contracts" })).toBeInTheDocument();
  });
});
