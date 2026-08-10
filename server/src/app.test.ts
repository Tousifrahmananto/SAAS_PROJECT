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
