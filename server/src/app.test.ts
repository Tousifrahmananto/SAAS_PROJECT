import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import request from "supertest";
import { app } from "./app.js";
import { env } from "./config/env.js";

describe("health endpoint", () => {
  it("reports that the API is available", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(response.headers["x-correlation-id"]).toBeTruthy();
  });
});

describe("registration endpoint", () => {
  it("rejects an invalid registration payload before database access", async () => {
    const response = await request(app).post("/api/auth/register").send({});
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("password reset endpoint", () => {
  it("rejects a malformed reset token before database access", async () => {
    const response = await request(app).post("/api/auth/reset-password").send({
      token: "not-a-token",
      password: "a-secure-new-password"
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("organization endpoints", () => {
  it("requires authentication", async () => {
    const response = await request(app).get("/api/organizations/me");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects provider staff before database access", async () => {
    const token = jwt.sign({
      hospitalId: new Types.ObjectId().toString(),
      roles: ["PROVIDER_STAFF"],
      permissions: []
    }, env.JWT_SECRET, { subject: new Types.ObjectId().toString() });
    const response = await request(app)
      .patch("/api/organizations/me")
      .set("authorization", `Bearer ${token}`)
      .send({ name: "Blocked update" });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });
});

describe("portal authorization", () => {
  function token(roles: string[], permissions: string[] = []) {
    return jwt.sign({
      hospitalId: new Types.ObjectId().toString(),
      roles,
      permissions
    }, env.JWT_SECRET, { subject: new Types.ObjectId().toString() });
  }

  it("protects document data", async () => {
    const response = await request(app).get("/api/documents");
    expect(response.status).toBe(401);
  });

  it("does not expose staff lists without permission", async () => {
    const response = await request(app).get("/api/staff").set("authorization", `Bearer ${token(["PROVIDER_STAFF"])}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects invoice creation by ordinary provider staff", async () => {
    const response = await request(app)
      .post("/api/invoices")
      .set("authorization", `Bearer ${token(["PROVIDER_STAFF"], ["invoices:read"])}`)
      .send({});
    expect(response.status).toBe(403);
  });

  it("requires invoice recipient details before database access", async () => {
    const response = await request(app)
      .post("/api/invoices")
      .set("authorization", `Bearer ${token(["BILLING_ADMIN"])}`)
      .send({ title: "Missing patient", dueAt: "2026-08-31", status: "UNPAID", items: [] });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("reports gateway mode without exposing credentials", async () => {
    const response = await request(app)
      .get("/api/payments/config")
      .set("authorization", `Bearer ${token(["PROVIDER_STAFF"], ["payments:create"])}`);
    expect(response.status).toBe(200);
    expect(response.body.data.mode).toMatch(/^(SANDBOX|LIVE)$/);
    expect(JSON.stringify(response.body)).not.toContain("store_passwd");
    expect(JSON.stringify(response.body)).not.toContain("STORE_PASSWORD");
  });

  it("rejects reconciliation by non-administrators", async () => {
    const response = await request(app)
      .post("/api/reconciliation")
      .set("authorization", `Bearer ${token(["PROVIDER_OWNER"])}`)
      .send({});
    expect(response.status).toBe(403);
  });

  it("prevents provider owners from escalating staff to platform administrator", async () => {
    const response = await request(app)
      .post("/api/staff")
      .set("authorization", `Bearer ${token(["PROVIDER_OWNER"])}`)
      .send({
        fullName: "Blocked Administrator",
        email: "blocked-admin@example.test",
        employeeNo: "BLOCK-001",
        password: "secure-password-123",
        role: "ADMIN",
        permissions: []
      });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("requires a department when creating provider staff", async () => {
    const response = await request(app)
      .post("/api/staff")
      .set("authorization", `Bearer ${token(["PROVIDER_OWNER"])}`)
      .send({
        fullName: "Department Staff",
        email: "department-staff@example.test",
        employeeNo: "DEPT-001",
        password: "secure-password-123",
        role: "PROVIDER_STAFF",
        permissions: ["documents:read"]
      });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("DEPARTMENT_REQUIRED");
  });

  it("rejects malformed payment notifications", async () => {
    const response = await request(app).post("/api/payments/sslcommerz/ipn").type("form").send({});
    expect(response.status).toBe(400);
    expect(response.text).toBe("INVALID");
  });

  it("rejects an inverted dashboard date range before aggregation", async () => {
    const response = await request(app)
      .get("/api/dashboard?from=2026-08-20&to=2026-08-01")
      .set("authorization", `Bearer ${token(["PROVIDER_OWNER"])}`);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_DATE_RANGE");
  });

  it("validates appointment availability dates before database access", async () => {
    const response = await request(app)
      .get("/api/appointments/availability?date=tomorrow")
      .set("authorization", `Bearer ${token(["PROVIDER_STAFF"], ["appointments:read"])}`);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("requires a drawn signature when accepting a contract", async () => {
    const response = await request(app)
      .patch(`/api/contracts/${new Types.ObjectId()}/decision`)
      .set("authorization", `Bearer ${token(["PROVIDER_STAFF"], ["contracts:sign"])}`)
      .send({ decision: "ACCEPTED", signerName: "Test Signer", signatureDataUrl: "" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects future patient birth dates before database access", async () => {
    const response = await request(app)
      .post("/api/patients")
      .set("authorization", `Bearer ${token(["PROVIDER_STAFF"], ["patients:create"])}`)
      .send({ fullName: "Future Patient", phone: "01700000000", dateOfBirth: "2999-01-01", sex: "UNKNOWN" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects service VAT rates above 100 percent", async () => {
    const response = await request(app)
      .post("/api/catalog/services")
      .set("authorization", `Bearer ${token(["PROVIDER_OWNER"])}`)
      .send({ departmentId: new Types.ObjectId().toString(), code: "TEST", name: "Test service", category: "TEST", standardPrice: "100", vatRatePercent: "101" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects manual invoice VAT rates above 100 percent", async () => {
    const response = await request(app)
      .post("/api/invoices")
      .set("authorization", `Bearer ${token(["PROVIDER_OWNER"])}`)
      .send({ title: "Invalid VAT", patientName: "Sample Patient", patientEmail: "patient@example.test", patientPhone: "01700000000", dueAt: "2026-12-31", items: [{ description: "Service", quantity: "1", unitPrice: "100", vatPercent: "101" }] });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});
