import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import type { DbEnv } from "../env.js";
import { describeDatabaseTarget } from "../lib/database-url.js";
import {
  classifyDatabaseError,
  databaseErrorLogLabel,
  isPostgresAuthenticationError,
} from "../lib/db-errors.js";
import { configureOutboundConnections } from "../lib/node-net.js";
import * as schema from "./schema.js";

type DbBundle = {
  db: ReturnType<typeof drizzle<typeof schema>>;
  client: ReturnType<typeof postgres>;
};

const globalForDb = globalThis as typeof globalThis & {
  kivorentaDb?: DbBundle;
};

function connectTimeoutSeconds(env: DbEnv, serverless: boolean) {
  if (env.DATABASE_CONNECT_TIMEOUT_MS) {
    return Math.min(30, Math.max(2, Math.ceil(env.DATABASE_CONNECT_TIMEOUT_MS / 1000)));
  }
  return serverless ? 8 : 10;
}

/**
 * One shared postgres.js pool per process.
 * Route modules, Better Auth, and the Hono app all call this; a new pool per
 * caller would open a separate Neon connection set for every feature.
 */
export function createDb(env: DbEnv, options?: { cache?: boolean }) {
  const useCache = options?.cache ?? process.env.NODE_ENV !== "test";
  if (useCache && globalForDb.kivorentaDb) {
    return globalForDb.kivorentaDb;
  }

  const serverless = Boolean(process.env.VERCEL);
  const configuredConnectTimeoutSec = connectTimeoutSeconds(env, serverless);
  const connectTimeoutSec = serverless
    ? Math.min(configuredConnectTimeoutSec, 5)
    : configuredConnectTimeoutSec;
  configureOutboundConnections({
    nodeEnv: env.NODE_ENV,
    connectTimeoutMs: connectTimeoutSec * 1000,
  });

  // Advisory-lock transactions pin a connection while send workflows run.
  // Test-list sends can persist results from five concurrent workers, while
  // auth and other API requests still need connections in the same instance.
  const max = serverless ? 8 : (env.DATABASE_POOL_MAX ?? 10);
  const development = env.NODE_ENV === "development" && !serverless;
  // max_pipeline is a runtime postgres.js option (not in published typings).
  // Neon transaction pooler + default pipeline depth can hang indefinitely on Vercel.
  const serverlessPoolOptions = {
    idle_timeout: 5,
    max_lifetime: 60 * 5,
    fetch_types: false,
    max_pipeline: 1,
  };
  const client = postgres(env.DATABASE_URL, {
    max,
    prepare: false,
    connect_timeout: connectTimeoutSec,
    ...(serverless ? serverlessPoolOptions : {}),
    ...(development ? { idle_timeout: 20, max_lifetime: 60 * 30, keep_alive: 30 } : {}),
    connection: {
      application_name: serverless ? "kivorenta-vercel" : "kivorenta",
      ...(serverless
        ? {
            statement_timeout: 5_000,
            lock_timeout: 3_000,
            idle_in_transaction_session_timeout: 20_000,
          }
        : {}),
    },
  } as Parameters<typeof postgres>[1]);

  const originalEnd = client.end.bind(client);
  client.end = ((endOptions?: Parameters<typeof client.end>[0]) => {
    if (globalForDb.kivorentaDb?.client === client) {
      globalForDb.kivorentaDb = undefined;
    }
    return originalEnd(endOptions);
  }) as typeof client.end;

  const bundle = { db: drizzle(client, { schema }), client };
  if (useCache) globalForDb.kivorentaDb = bundle;

  const idleTimeoutSec = serverless ? 5 : development ? 20 : "none";
  console.info(
    `[database] ${describeDatabaseTarget(env.DATABASE_URL)} max=${max} connectTimeoutSec=${connectTimeoutSec} idleTimeoutSec=${idleTimeoutSec} serverless=${serverless ? "yes" : "no"}`,
  );
  return bundle;
}

export async function closeDb() {
  const bundle = globalForDb.kivorentaDb;
  globalForDb.kivorentaDb = undefined;
  if (!bundle) return;
  await bundle.client.end({ timeout: 5 });
}

/**
 * Drop the cached request pool after a stuck/timed-out query so the next
 * request opens a fresh socket instead of reusing a wedged Neon connection.
 */
export function invalidateDbCache() {
  const bundle = globalForDb.kivorentaDb;
  globalForDb.kivorentaDb = undefined;
  if (!bundle) return;
  void bundle.client.end({ timeout: 0 }).catch(() => undefined);
}

export type Database = ReturnType<typeof createDb>["db"];

/** Always resolve through the process cache so callers survive `invalidateDbCache()`. */
export function getDb(env: DbEnv): Database {
  return createDb(env, { cache: true }).db;
}

/**
 * Stable Drizzle handle for Better Auth. Method calls forward to the current
 * cached pool, so ending a wedged client does not leave auth on a dead socket.
 */
export function createLiveDb(env: DbEnv): Database {
  return new Proxy({} as Database, {
    get(_target, prop, _receiver) {
      const current = getDb(env);
      const value = Reflect.get(current, prop, current);
      return typeof value === "function" ? value.bind(current) : value;
    },
  });
}

const HEALTH_DATABASE_MS = 5_000;

/**
 * Dedicated short-lived connection for /api/health.
 * It does not use the request pool, so a stuck startup query cannot block it,
 * and ending the client stops postgres.js from retrying the socket forever.
 */
export async function probeDatabase(databaseUrl: string): Promise<"ok" | "unavailable"> {
  if (!databaseUrl.trim()) return "unavailable";
  configureOutboundConnections({ connectTimeoutMs: 10_000 });
  const client = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    fetch_types: false,
    idle_timeout: 1,
    connect_timeout: 4,
    max_lifetime: 15,
    connection: {
      application_name: "kivorenta-health",
      statement_timeout: 4000,
    },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const attempt = (async () => {
    await client`
      select 1
      from mail_delivery_settings
      limit 0
    `;
    await client`
      select 1
      from contact_lists
      limit 0
    `;
  })().then(
    () => "ok" as const,
    (error: unknown) => {
      const failure = classifyDatabaseError(error);
      const detail = failure
        ? `kind=${failure.kind} code=${failure.code ?? "none"}`
        : isPostgresAuthenticationError(error)
          ? "kind=authentication"
          : "kind=query";
      console.error("[health] database", detail, databaseErrorLogLabel(error));
      return "unavailable" as const;
    },
  );
  try {
    return await Promise.race([
      attempt,
      new Promise<"unavailable">((resolve) => {
        timer = setTimeout(() => {
          console.error("[health] database kind=timeout");
          resolve("unavailable");
        }, HEALTH_DATABASE_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    await new Promise<void>((resolve) => {
      const backup = setTimeout(resolve, 500);
      client.end({ timeout: 0 }).then(
        () => {
          clearTimeout(backup);
          resolve();
        },
        () => {
          clearTimeout(backup);
          resolve();
        },
      );
    });
  }
}

export async function checkDatabase(databaseUrl: string): Promise<{
  ok: boolean;
  target: string;
  elapsedMs: number;
  kind?: string;
  code?: string;
}> {
  const target = describeDatabaseTarget(databaseUrl);
  if (target === "invalid") {
    return { ok: false, target, elapsedMs: 0, kind: "invalid" };
  }
  configureOutboundConnections({ connectTimeoutMs: 10_000 });
  const started = Date.now();
  const client = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    fetch_types: false,
    idle_timeout: 1,
    connect_timeout: 10,
    max_lifetime: 15,
    connection: { application_name: "kivorenta-check" },
  });
  try {
    await client`
      select 1
      from mail_delivery_settings
      limit 0
    `;
    await client`
      select 1
      from contact_lists
      limit 0
    `;
    return { ok: true, target, elapsedMs: Date.now() - started };
  } catch (error) {
    const failure = classifyDatabaseError(error);
    const code =
      failure?.code ??
      (typeof error === "object" && error && "code" in error && typeof error.code === "string"
        ? error.code
        : undefined);
    return {
      ok: false,
      target,
      elapsedMs: Date.now() - started,
      kind: failure?.kind ?? (isPostgresAuthenticationError(error) ? "authentication" : "query"),
      ...(code ? { code } : {}),
    };
  } finally {
    await client.end({ timeout: 1 }).catch(() => undefined);
  }
}
