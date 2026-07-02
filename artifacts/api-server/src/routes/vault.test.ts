import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  const { mockDb } = await import("../test/dbMock");
  return { ...actual, db: mockDb };
});

import app from "../app";
import { queueDbResults, resetDbMock } from "../test/dbMock";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  resetDbMock();
  process.env["SESSION_SECRET"] = "test-session-secret";
  process.env["OPERATOR_PASSWORD"] = "hunter2";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

/** Log in and return the session cookie string for authenticated requests. */
async function loginCookie(): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ username: "operator", password: "hunter2" });
  expect(res.status).toBe(200);
  const setCookie = res.headers["set-cookie"];
  return Array.isArray(setCookie) ? setCookie[0] : (setCookie as unknown as string);
}

// Login was removed per operator directive (2026-07-02) — vault routes are
// public. What must still hold: secret VALUES and encrypted material are never
// exposed, names are validated, and protected runtime vars cannot be set.
describe("vault routes (public — login removed per operator directive)", () => {
  const secretRow = {
    id: 1,
    name: "OPENAI_API_KEY",
    description: null,
    ciphertext: "x",
    iv: "y",
    authTag: "z",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  it("GET /api/vault returns metadata only — never ciphertext, iv, or authTag", async () => {
    queueDbResults([secretRow]);
    const res = await request(app).get("/api/vault");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("OPENAI_API_KEY");
    expect(res.body[0]).not.toHaveProperty("ciphertext");
    expect(res.body[0]).not.toHaveProperty("iv");
    expect(res.body[0]).not.toHaveProperty("authTag");
  });

  it("GET /api/vault still works with a session cookie", async () => {
    const cookie = await loginCookie();
    queueDbResults([secretRow]);
    const res = await request(app).get("/api/vault").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body[0]).not.toHaveProperty("ciphertext");
  });

  it("PUT /api/vault rejects a name that is not an env-var identifier", async () => {
    const res = await request(app).put("/api/vault").send({ name: "not-a-var", value: "y" });
    expect(res.status).toBe(400);
  });

  it("PUT /api/vault refuses to set protected runtime variables", async () => {
    for (const name of ["SESSION_SECRET", "OPERATOR_PASSWORD", "DATABASE_URL", "PATH"]) {
      const res = await request(app).put("/api/vault").send({ name, value: "y" });
      expect(res.status).toBe(400);
    }
  });

  it("PUT /api/vault upserts a secret and returns metadata without the value", async () => {
    queueDbResults([{ ...secretRow, name: "TEST_FAKE_KEY" }]);
    const res = await request(app).put("/api/vault").send({ name: "TEST_FAKE_KEY", value: "sekrit" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("TEST_FAKE_KEY");
    expect(JSON.stringify(res.body)).not.toContain("sekrit");
    // The secret is activated in the environment for live integrations.
    expect(process.env["TEST_FAKE_KEY"]).toBe("sekrit");
  });

  it("DELETE /api/vault/:name returns 404 for a missing secret", async () => {
    queueDbResults([]);
    const res = await request(app).delete("/api/vault/NOPE");
    expect(res.status).toBe(404);
  });
});

describe("operator auth routes", () => {
  it("rejects login with a wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "operator", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("reports authenticated=false for anonymous /api/auth/me", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(false);
  });

  it("reports authenticated=true after login", async () => {
    const cookie = await loginCookie();
    const res = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(res.body.authenticated).toBe(true);
  });

  it("fails closed when no users are configured", async () => {
    delete process.env["OPERATOR_PASSWORD"];
    delete process.env["AUTH_USERS"];
    const res = await request(app).post("/api/auth/login").send({ username: "operator", password: "anything" });
    expect(res.status).toBe(401);
  });
});
