import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    window.history.replaceState({}, "", "/#admin");
    render(<App />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("link", { name: "Patients & Charges" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Invoices" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contracts" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Administration" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("shows the Administration menu only to administrator roles", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/login")) return new Response(JSON.stringify({ token: "admin-token", user: { fullName: "Platform Admin", email: "admin@example.com", roles: ["ADMIN"] } }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("/api/dashboard")) return new Response(JSON.stringify({ data: { billed: "0.00", collected: "0.00", outstanding: "0.00", invoices: 0, patients: 0, openEncounters: 0, activeStaff: 1, upcomingAppointments: 0, claims: {} } }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    render(<App />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "admin@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("link", { name: "Administration" })).toBeInTheDocument();
  });

  it("shows limited staff only the modules allowed by their permissions", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/login")) return new Response(JSON.stringify({ token: "staff-token", user: { fullName: "Document Reviewer", email: "reviewer@example.com", roles: ["PROVIDER_STAFF"], permissions: ["documents:read", "reports:read"] } }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("/api/dashboard")) return new Response(JSON.stringify({ data: { billed: "0.00", collected: "0.00", outstanding: "0.00", invoices: 0, patients: 0, openEncounters: 0, activeStaff: 1, upcomingAppointments: 0, claims: {} } }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    render(<App />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "reviewer@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("link", { name: "Documents" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reports" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Invoices" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Patients & Charges" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Administration" })).not.toBeInTheDocument();
  });

  it("creates a manual invoice without losing the submitted form reference", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/login")) return new Response(JSON.stringify({ token: "test-token", user: { fullName: "Provider Owner", email: "owner@example.com", roles: ["PROVIDER_OWNER"] } }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("/api/dashboard")) return new Response(JSON.stringify({ data: { billed: "0.00", collected: "0.00", outstanding: "0.00", invoices: 0, patients: 0, openEncounters: 0, activeStaff: 1, upcomingAppointments: 0, claims: {} } }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.endsWith("/api/invoices") && options?.method === "POST") return new Response(JSON.stringify({ data: { invoiceNo: "INV-TEST" } }), { status: 201, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    fireEvent.click(await screen.findByRole("link", { name: "Invoices" }));

    const section = screen.getByRole("heading", { name: "Create manual invoice" }).closest("section")!;
    const form = section.querySelector("form")!;
    const fields = within(section);
    const title = fields.getByPlaceholderText("Invoice title") as HTMLInputElement;
    fireEvent.change(fields.getByPlaceholderText("Patient name"), { target: { value: "Sample Patient" } });
    fireEvent.change(fields.getByPlaceholderText("Patient email"), { target: { value: "patient@example.test" } });
    fireEvent.change(fields.getByPlaceholderText("Patient phone"), { target: { value: "01700000000" } });
    fireEvent.change(title, { target: { value: "Ward charges" } });
    fireEvent.change(form.querySelector('input[name="dueAt"]')!, { target: { value: "2026-08-30" } });
    fireEvent.change(fields.getByPlaceholderText("Line description"), { target: { value: "Consultation" } });
    fireEvent.change(form.querySelector('input[name="quantity"]')!, { target: { value: "2" } });
    fireEvent.change(fields.getByPlaceholderText("Unit price"), { target: { value: "500" } });
    fireEvent.submit(form);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/invoices"), expect.objectContaining({ method: "POST" })));
    const invoiceRequest = fetchMock.mock.calls.find(([input, options]) => String(input).endsWith("/api/invoices") && options?.method === "POST")?.[1];
    expect(JSON.parse(String(invoiceRequest?.body))).toEqual(expect.objectContaining({ patientName: "Sample Patient", patientEmail: "patient@example.test", patientPhone: "01700000000" }));
    await waitFor(() => expect(title.value).toBe(""));
    expect(screen.queryByText(/Cannot read properties of null/)).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "SSLCOMMERZ hosted checkout" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Bangla QR" })).toBeInTheDocument();
  });
});
