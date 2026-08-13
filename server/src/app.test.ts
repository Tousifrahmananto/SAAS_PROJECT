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

  it("rejects malformed payment notifications", async () => {
    const response = await request(app).post("/api/payments/sslcommerz/ipn").type("form").send({});
    expect(response.status).toBe(400);
    expect(response.text).toBe("INVALID");
  });
});
