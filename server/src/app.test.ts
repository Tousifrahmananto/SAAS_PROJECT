import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "./app.js";

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
