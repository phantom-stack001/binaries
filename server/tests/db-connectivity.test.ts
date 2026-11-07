import net from "node:net";

import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { fetchWithStartupRetry } from "../../src/lib/dev-session-fetch.js";
import { closeDb, createDb, createLiveDb, getDb, invalidateDbCache } from "../db/index.js";
import { loadEnv } from "../env.js";
import { validateDatabaseUrl } from "../lib/database-url.js";
import {
  classifyDatabaseError,
  DatabaseUnavailableError,
  isPostgresAuthenticationError,
  publicApiError,
} from "../lib/db-errors.js";
import { configureOutboundConnections } from "../lib/node-net.js";

describe("database error classification", () => {
  it("classifies timeouts, refusals, and DNS failures separately", () => {
    expect(classifyDatabaseError(Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" }))).toEqual({
      kind: "timeout",
      code: "ETIMEDOUT",
    });
    expect(classifyDatabaseError(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }))).toEqual({
      kind: "refused",
      code: "ECONNREFUSED",
    });
    expect(classifyDatabaseError(Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }))).toEqual({
      kind: "dns",
      code: "ENOTFOUND",
    });
    expect(classifyDatabaseError(Object.assign(new Error("connection ended"), { code: "CONNECTION_ENDED" }))).toEqual({
      kind: "reset",
      code: "CONNECTION_ENDED",
    });
  });

  it("classifies an aggregate timeout without treating SQL errors as an outage", () => {
    const aggregate = new AggregateError([
      Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }),
      Object.assign(new Error("unreachable"), { code: "EHOSTUNREACH" }),
    ]);
    expect(classifyDatabaseError(aggregate)?.kind).toBe("timeout");

    const unique = Object.assign(new Error("duplicate key"), { code: "23505" });
    expect(classifyDatabaseError(unique)).toBeNull();
    expect(publicApiError(unique)).toMatchObject({ status: 500, body: { error: "Internal server error" } });
    expect(publicApiError(unique).body.code).toBeUndefined();
    expect(publicApiError(unique).log).toContain("sqlstate=23505");
  });

  it("logs safe PostgreSQL schema diagnostics from a wrapped query error", () => {
    const postgresError = Object.assign(new Error("duplicate key value"), {
      code: "23505",
      severity: "ERROR",
      schema: "public",
      table: "contact_lists",
      constraint: "contact_lists_user_id_name_unique",
      detail: "Key values may contain private data",
    });
    const queryError = Object.assign(new Error("Failed query with secret query parameters"), {
      cause: postgresError,
    });
    const mapped = publicApiError(queryError);

    expect(mapped.log).toContain("sqlstate=23505");
    expect(mapped.log).toContain("table=contact_lists");
    expect(mapped.log).toContain("constraint=contact_lists_user_id_name_unique");
    expect(mapped.log).not.toContain("secret");
    expect(mapped.log).not.toContain("private data");
  });

  it("keeps PostgreSQL authentication failures out of the outage response", () => {
    const auth = Object.assign(new Error("password authentication failed for user secret"), { code: "28P01" });
    expect(isPostgresAuthenticationError(auth)).toBe(true);
    expect(classifyDatabaseError(auth)).toBeNull();
    const mapped = publicApiError(auth);
    expect(mapped.status).toBe(500);
    expect(mapped.body).toEqual({ error: "Internal server error" });
    expect(mapped.log).not.toContain("secret");
    expect(mapped.log).toContain("authentication rejected");
  });

  it("returns database_unavailable for infrastructure errors and session outages", () => {
    const mapped = publicApiError(new DatabaseUnavailableError("timeout"));
    expect(mapped.status).toBe(503);
    expect(mapped.body).toEqual({
      error: "Database is temporarily unavailable.",
      code: "database_unavailable",
    });
    expect(mapped.log).not.toContain("postgres://");
  });

  it("stops a mail handler before SMTP when the database is unavailable", async () => {
    const app = new Hono();
    let smtpAttempts = 0;
    app.get("/api/mail/status", (c) => {
      const mapped = publicApiError(Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" }));
      if (mapped.status === 503) return c.json(mapped.body, mapped.status);
      smtpAttempts += 1;
      return c.json({ ok: true });
    });

    const response = await app.request("http://localhost/api/mail/status");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Database is temporarily unavailable.",
      code: "database_unavailable",
    });
    expect(smtpAttempts).toBe(0);
  });
});

describe("database url validation", () => {
  it("accepts a pooled Neon URL and describes it without credentials", () => {
    const url = "postgresql://user:secret-pass@ep-example-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
    const result = validateDatabaseUrl(url);
    expect(result.status).toBe("VALID");
    expect(result.detail).toContain("pooled=yes");
    expect(result.detail).toContain("sslmode=require");
    expect(result.detail).not.toContain("secret-pass");
    expect(result.detail).not.toContain("user:");
  });

  it("rejects a Neon URL without sslmode and a non-postgres URL", () => {
    expect(validateDatabaseUrl("postgresql://user:secret@ep-example.neon.tech/neondb").status).toBe("INVALID");
    expect(validateDatabaseUrl("https://example.com/db").status).toBe("INVALID");
    expect(validateDatabaseUrl("").status).toBe("MISSING");
  });

  it("accepts local PostgreSQL without TLS", () => {
    const result = validateDatabaseUrl("postgresql://user:secret@127.0.0.1:5432/kivorenta?sslmode=disable");
    expect(result.status).toBe("VALID");
    expect(result.detail).toContain("kind=local");
    expect(result.detail).toContain("pooled=no");
    expect(result.detail).not.toContain("secret");
  });
});

describe("shared database pool", () => {
  it("returns the same client for repeated callers", async () => {
    const env = loadEnv();
    const first = createDb(env, { cache: true });
    const second = createDb(env, { cache: true });
    expect(second.client).toBe(first.client);
    expect(second.db).toBe(first.db);
    await closeDb();
  });

  it("opens a fresh client after invalidateDbCache and keeps createLiveDb forwarding", async () => {
    const env = loadEnv();
    const live = createLiveDb(env);
    const first = createDb(env, { cache: true });
    expect(getDb(env)).toBe(first.db);
    expect(live.select).toBeTypeOf("function");

    invalidateDbCache();
    const second = createDb(env, { cache: true });
    expect(second.client).not.toBe(first.client);
    expect(getDb(env)).toBe(second.db);
    expect(live.select).toBeTypeOf("function");
    expect(live.select).not.toBe(first.db.select);

    await closeDb();
  });
});

describe("development connection attempts", () => {
  it("leaves production defaults alone and raises the development attempt timeout", () => {
    if (typeof net.setDefaultAutoSelectFamilyAttemptTimeout !== "function") return;
    if (typeof net.getDefaultAutoSelectFamilyAttemptTimeout !== "function") return;
    net.setDefaultAutoSelectFamilyAttemptTimeout(250);
    configureOutboundConnections({ nodeEnv: "production", connectTimeoutMs: 10_000 });
    expect(net.getDefaultAutoSelectFamilyAttemptTimeout()).toBe(250);
    configureOutboundConnections({ nodeEnv: "development", connectTimeoutMs: 10_000 });
    expect(net.getDefaultAutoSelectFamilyAttemptTimeout()).toBeGreaterThanOrEqual(10_000);
  });
});

describe("development session fetch", () => {
  it("retries a session check that fails before the API is listening", async () => {
    let calls = 0;
    const response = await fetchWithStartupRetry("http://127.0.0.1:3001/api/auth/get-session", undefined, {
      dev: true,
      delayMs: 0,
      attempts: 3,
      fetchImpl: async () => {
        calls += 1;
        if (calls < 3) return new Response("down", { status: 503 });
        return new Response(JSON.stringify({ session: null }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    expect(calls).toBe(3);
    expect(response.status).toBe(200);
  });

  it("does not retry session checks outside development or other API calls", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response("down", { status: 503 });
    };
    const production = await fetchWithStartupRetry("http://127.0.0.1:3001/api/auth/get-session", undefined, {
      dev: false,
      delayMs: 0,
      fetchImpl,
    });
    expect(production.status).toBe(503);
    expect(calls).toBe(1);

    const other = await fetchWithStartupRetry("http://127.0.0.1:3001/api/mail/status", undefined, {
      dev: true,
      delayMs: 0,
      attempts: 4,
      fetchImpl,
    });
    expect(other.status).toBe(503);
    expect(calls).toBe(2);
  });
});
