# Database connectivity

Binaries.nl uses one shared PostgreSQL pool per Node process. The driver is [postgres.js](https://github.com/porsager/postgres) (`postgres`) through Drizzle ORM. Better Auth uses that same Drizzle client. There is no Neon serverless driver and no separate pool per request.

This document describes how to tell a database outage apart from an authentication failure, an API that has not started, and an SMTP failure.

## Architecture

| Runtime | Pool |
| --- | --- |
| Local API, Railway worker, Railway dispatcher | One shared pool. Default max **10**. |
| Vercel (`VERCEL` is set) | One shared pool. Max **1**, short idle lifetime. |
| Unit tests (`NODE_ENV=test`) | A new client per `createDb` call so tests can close their own client. |

`prepare: false` stays on. The Neon pooler runs in transaction mode, which rejects prepared statements.

Route modules, Better Auth, and the Hono app all call `createDb`. They receive the same pool. Creating one pool per module would open a separate connection set for sessions, campaigns, drafts, and mail.

Startup logs a redacted target, for example:

```text
[database] set host=ep-example-pooler.eu-central-1.aws.neon.tech port=5432 db=neondb sslmode=require pooled=yes max=10 connectTimeoutSec=10 idleTimeoutSec=20 serverless=no
```

The log includes the host, port, database name, SSL mode, and whether the host is a Neon pooler. It does not include the username, password, or `DATABASE_URL`.

## Neon

Use the **pooled** connection string for the running app, workers, and dispatcher. The host contains `-pooler`.

```text
postgresql://USER:PASSWORD@ep-example-pooler.<region>.aws.neon.tech/DATABASE?sslmode=require
```

Keep the query parameters Neon issues, including `sslmode=require` and `channel_binding` when it is present. Do not commit the real string.

`sslmode=require` is mandatory for Neon. `env:check` rejects a `*.neon.tech` URL that does not set `sslmode` to `require`, `verify-full`, or `verify-ca`.

The direct (non-pooler) host is for migrations when the pooler rejects a session-level statement. Point `DATABASE_URL` at the direct URL, run `npm run db:migrate`, then point the app back at the pooled URL.

Vercel keeps `max: 1` even if `DATABASE_POOL_MAX` is set. A serverless isolate must not hold a large Neon pool.

## Local PostgreSQL

Day-to-day development can use any local PostgreSQL 16+ server. The app does not require a particular installer.

1. Create an empty database named `kivorenta` (the name is your choice).
2. Set `DATABASE_URL` in `.env`:

   ```text
   postgresql://USER:PASSWORD@127.0.0.1:5432/kivorenta?sslmode=disable
   ```

3. Apply migrations: `npm run db:migrate`
4. Confirm the server can run `SELECT 1`: `npm run db:check`
5. Start the app: `npm run dev`

To use Neon again, replace `DATABASE_URL` with the pooled Neon URL (`sslmode=require`) and restart the API. Run `npm run db:check` after the switch.

`npm run db:reset` drops allowlisted application tables. Do not point it at a database you cannot afford to empty. It is not part of normal local setup.

## Timeouts and pool defaults

postgres.js takes `connect_timeout` in **seconds**. `DATABASE_CONNECT_TIMEOUT_MS` is converted with `ceil(ms / 1000)`, clamped to 2–30 seconds.

| Setting | Local development | Production long-running | Vercel |
| --- | --- | --- | --- |
| Pool max | 10, or `DATABASE_POOL_MAX` (1–20) | 10, or `DATABASE_POOL_MAX` | 1 |
| Connect timeout | 10s | 10s | 5s (capped) |
| Idle timeout | 20s | driver default (no idle close) | 5s |
| Max connection lifetime | 30 min | driver default | 5 min |
| TCP keepalive | 30s | off | off |
| `fetch_types` | default (`true`) | default (`true`) | `false` |
| `max_pipeline` | default (`100`) | default (`100`) | `1` |

Vercel also sets connection GUCs (`statement_timeout`, `lock_timeout`) on the request pool. Those GUCs are best-effort through Neon’s transaction pooler and are not a substitute for application deadlines.

Session, Better Auth, and API middleware DB work (account security + permission checks) use an **8 second rejecting deadline** via `withDatabaseDeadline`. On timeout the API returns **503** `database_unavailable` and calls `invalidateDbCache()` so the next `createDb()` / `getDb()` opens a fresh socket instead of reusing a wedged connection.

Better Auth and API route modules hold a **live** Drizzle handle (`createLiveDb`): method calls always forward to the current cached pool. After `invalidateDbCache()` ends a wedged client, the next query uses the new pool without waiting for a cold start.

`getSessionUser` retries **once** after a `reset` or `timeout` failure (invalidating the cache on `reset`; timeout already invalidates inside the deadline helper). SQL and authentication errors are not retried.

The health probe uses its own short-lived client (`fetch_types: false`, 4s statement timeout) and a 5–6 second overall deadline — it never shares the request pool.

### Development network timeout

Node 20 turns on Happy Eyeballs and aborts each address attempt after **250ms**. Neon hostnames resolve to both IPv4 and IPv6. On a network where IPv6 is unreachable (`EHOSTUNREACH`) and the IPv4 handshake takes longer than 250ms, Node cancels every attempt and postgres.js reports:

```text
AggregateError [ETIMEDOUT]
```

That error is a failed TCP handshake. It is not an authentication error, not `ECONNREFUSED`, and not a SQL error.

In development and when `NODE_ENV` is unset, the API:

- prefers IPv4 (`dns.setDefaultResultOrder("ipv4first")`)
- raises the address attempt timeout to at least 10 seconds, matching the driver connect timeout

Production processes keep Node's defaults. A successful fast connection is unchanged. The longer timeout only matters when the first address is slow or unreachable.

## Health checks

| Request | Meaning |
| --- | --- |
| `GET /api/ping` | The API process is answering. It does not touch PostgreSQL or Redis. |
| `GET /api/health` | The API can run `SELECT 1`. Redis is reported and does not by itself fail the check. |

Healthy database:

```json
{
  "ok": true,
  "status": "ok",
  "database": "connected",
  "checks": { "api": "ok", "database": "ok", "redis": "ok" }
}
```

Database unreachable:

```json
{
  "ok": false,
  "status": "degraded",
  "database": "unavailable",
  "checks": { "api": "ok", "database": "unavailable" }
}
```

The HTTP status is 503 when PostgreSQL is unavailable. The body does not include driver errors, hosts, or SQL. Server logs include a redacted `kind` (`timeout`, `refused`, `dns`, `reset`, `unreachable`, `unavailable`) and the error code.

## Authenticated API errors

A missing or rejected session stays **401** with `Unauthorized`. A permission failure stays **403**.

When PostgreSQL cannot be reached, session lookup and other database calls return **503**:

```json
{
  "error": "Database is temporarily unavailable.",
  "code": "database_unavailable"
}
```

That response is not a wrong password, an unknown account, or an expired session. Better Auth is unchanged. Its internal `INTERNAL_SERVER_ERROR` is logged, and if the underlying error is a connection failure the HTTP handler answers `database_unavailable` instead of looking like a login failure.

PostgreSQL password or role failures (`28P01`, `28000`) stay a generic **500**. The log line is `authentication rejected by server` and does not include the database username or password.

SQL constraint and query errors stay **500** `Internal server error`. They are not reported as `database_unavailable`.

## Mail path

`POST /api/mail/test-send` reaches SMTP only after all of the following succeed:

1. Session lookup
2. Permission check
3. Request validation
4. Database lock, rate-limit read, and pending-submission insert

`GET /api/mail/status` also requires a session and a database permission check before it reads mailbox configuration.

| What you observe | Where it failed |
| --- | --- |
| `GET /api/ping` fails, or the Vite proxy returns `api_unavailable` | API process is down or still starting |
| `GET /api/health` is `database: unavailable` | PostgreSQL, before auth and before SMTP |
| `GET /api/auth/get-session` is 503 `database_unavailable` | Session query, before mail routes and before SMTP |
| `GET /api/mail/status` is 401 | No session. The database answered. SMTP was not called. |
| `GET /api/mail/status` is 403 | Session is valid and the database answered. The account lacks permission. |
| `POST /api/mail/test-send` is 503 `Email account is not configured` | Auth and database access succeeded. SMTP settings are missing. This is a different 503 from `database_unavailable`. |
| Submission row is `failed` / HTTP 502 after a pending row exists | SMTP was attempted after the database insert |

Do not read a database timeout as an SMTP or rich-text failure. Those steps run later.

## Diagnostic commands

Static configuration only. This does not open a connection:

```bash
npm run env:check
npm run env:check:production
```

The JSON includes a `database` object with host, port, ssl mode, pooler flag, and `kind` (`neon`, `local`, or `custom`). It does not print `DATABASE_URL`.

Network check. Runs `SELECT 1` and exits non-zero on failure:

```bash
npm run db:check
```

Example success:

```json
{
  "ok": true,
  "target": "set host=127.0.0.1 port=5432 db=kivorenta sslmode=disable pooled=no",
  "elapsedMs": 12
}
```

Example failure:

```json
{
  "ok": false,
  "target": "set host=ep-example-pooler.eu-central-1.aws.neon.tech port=5432 db=neondb sslmode=require pooled=yes",
  "elapsedMs": 10000,
  "kind": "timeout",
  "code": "ETIMEDOUT"
}
```

`kind` values:

| kind | Meaning |
| --- | --- |
| `timeout` | TCP handshake or connect timeout (`ETIMEDOUT`, `CONNECT_TIMEOUT`) |
| `refused` | Nothing accepted the TCP connection (`ECONNREFUSED`) |
| `dns` | Name did not resolve (`ENOTFOUND`, `EAI_AGAIN`) |
| `unreachable` | Route or address family failed (`EHOSTUNREACH`) |
| `reset` | Connection closed (`ECONNRESET`, `CONNECTION_CLOSED`) |
| `unavailable` | PostgreSQL refused the session (too many connections, shutting down) |
| `authentication` | Database role or password rejected |
| `configuration` | `DATABASE_URL` missing or not a PostgreSQL URL |
| `query` | Connected, then a non-infrastructure query error |

`npm run db:inspect` is separate. It lists tables and is not required to prove connectivity.

## Development startup

`npm run dev` starts the API and Vite together. Vite used to proxy `/api` to `localhost:3001` immediately, so the browser's first `GET /api/auth/get-session` could fail with `ECONNREFUSED` before the log line `API listening on port 3001`.

That refusal is the API process, not PostgreSQL.

`npm run dev` now waits until `GET http://127.0.0.1:3001/api/ping` returns before starting Vite. The proxy target is `127.0.0.1` so an IPv6 `localhost` (`::1`) does not miss an IPv4 listen socket. If a request still arrives while the API is down, the proxy responds with HTTP 503 `api_unavailable`.

During Vite restarts of the API, the development session client retries only `GET /api/auth/get-session`. Sign-in and mail requests are not retried. Production does not retry.

`npm run dev:client` still starts Vite immediately for frontend-only work.

## VPN, firewall, and IPv6

If `db:check` reports `timeout` or `unreachable`:

- Confirm the machine can resolve the host and open TCP 5432 to Neon or to local PostgreSQL.
- A VPN or firewall that blackholes IPv6 produces `EHOSTUNREACH` on AAAA answers and `ETIMEDOUT` when Node aborts the IPv4 attempt too quickly. Development mode prefers IPv4 for this reason.
- `ECONNREFUSED` to `127.0.0.1:5432` means local PostgreSQL is not running. That is not a Neon outage.
- `ECONNREFUSED` to `127.0.0.1:3001` means the API is not listening yet.
- Neon compute can take a few seconds to wake. The connect timeout allows that. A 250ms address abort does not.

## Safe logging

Logs may include host, port, database name, error `code`, and `kind`.

Logs must not include:

- `DATABASE_URL`
- database username or password
- session tokens, cookies, or `Authorization` headers
- SMTP passwords

`safeErrorLabel` strips `postgres://` and `rediss://` URLs and drops messages that contain passwords, secrets, tokens, or email addresses.
