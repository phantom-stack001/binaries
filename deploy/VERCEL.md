# Binaries.nl on Vercel (SPA + Hono API)

Deploy **Binaries.nl** as a separate Vercel project from any SendStack / CTN production project. Do not point this repo at original production credentials or domains.

## Architecture

- **Static SPA** from `dist/` (Vite build + prerender for public routes)
- **Hono API** via `api/index.ts` (Vercel Function, nested `/api/*` rewrites in `vercel.json`)
- **Better Auth** at `/api/auth/*` with HttpOnly cookies

## Vercel environment checklist

Use `.env.production` as the source for the Vercel project's **Production** environment variables. Add them in Vercel under **Project Settings → Environment Variables**; Vercel does not automatically load this local file.

- [ ] `APP_NAME`, `APP_COMPANY_NAME`
- [ ] `VITE_APP_URL` (Production + Preview; required at **build** time)
- [ ] `BETTER_AUTH_URL`, `FRONTEND_URL` (same origin as the public site)
- [ ] `BETTER_AUTH_SECRET` (unique production value, ≥ 32 characters)
- [ ] `DATABASE_URL` (Binaries.nl Neon — not SendStack)
- [ ] `REDIS_URL` (`rediss://…` Upstash TCP/TLS — not REST)
- [ ] `QUEUE_ENABLED`, `QUEUE_SIMULATION_ONLY=true`, `QUEUE_NAMESPACE`
- [ ] `AUTH_EMAIL_DELIVERY` and the matching provider credentials (`RESEND_API_KEY` + `RESEND_FROM_EMAIL` for Resend, or `SMTP_*` for SMTP)
- [ ] `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` only if Spacemail SMTP should be selectable in the runtime provider setting
- [ ] `SPACEMAIL_*` only for IMAP inbox access and sent-folder copies
- [ ] Optional: `MAIL_TEST_RECIPIENTS` allowlist for single-recipient test messages
- [ ] Optional: `VITE_CONTACT_EMAIL`, `BOOTSTRAP_*` (bootstrap is local-only)

Do **not** set secrets with a `VITE_` prefix. Do not add `PORT` (Vercel Functions do not bind the standalone server port) or `NODE_ENV` (Vercel manages it).

## Required environment variables

Set these in the Vercel project (Production and Preview as needed):

| Variable | Required | Example |
| --- | --- | --- |
| `DATABASE_URL` | Yes | New Neon PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Yes | New random secret (≥ 32 chars) |
| `BETTER_AUTH_URL` | Yes | `https://your-domain.example` |
| `FRONTEND_URL` | Yes | Same public origin as the SPA |
| `VITE_APP_URL` | Yes (build) | Same origin — used at build time for canonical URLs; auth requests use the current page origin |
| `QUEUE_SIMULATION_ONLY` | Yes | `true` for simulation; `false` for Phase 8 live campaign delivery |
| `QUEUE_DAILY_SEND_CAP` | Optional | Default `2000` (enforced on worker for live sends) |
| `QUEUE_ENABLED` | Optional | `false` until Redis is configured |
| `REDIS_URL` | If queues enabled | New Upstash / Redis instance |

Optional branding: `APP_NAME`, `APP_COMPANY_NAME`, `VITE_CONTACT_EMAIL`.

Mailbox variables (`SPACEMAIL_*`) are only required for IMAP inbox access and sent-folder copies.

The Mailbox settings page lets a super admin select the active provider for all outbound system mail. Resend is selected by default; Spacemail is selectable only when its `SMTP_*` credentials are configured. IMAP inbox access and sent-folder copies remain optional and require `SPACEMAIL_*` mailbox credentials.

Resend outbound messages use its HTTPS API, not SMTP, to avoid SMTP egress and long connection stalls in serverless functions. Spacemail remains an SMTP option.

Apply database migrations with `npm run db:migrate` before deploying a build that includes a new migration. Migration `0014_mail_delivery_settings` stores the active provider selection. Migration `0015_campaign_delivery_statuses` adds `delivered` / `send_failed` job statuses for live campaign delivery.

## Build settings

Use repository defaults from `vercel.json`:

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Install command:** `npm install --include=dev` (required so `typescript`, `vite`, and other build tools in `devDependencies` are installed when `NODE_ENV=production`)

## Post-deploy checks

The Vercel deployment commit is embedded in the client build. Open app sessions check
`/api/build-version` every minute and show a refresh prompt when a newer deployment
is live. SPA routes are served with `no-store` so a refresh loads the current app
shell; fingerprinted `/assets/` files remain cacheable as immutable.

Replace `https://your-domain.example` with your deployment URL:

```bash
curl -sS https://your-domain.example/api/ping | jq .
curl -sS https://your-domain.example/api/health | jq .
curl -sS -D - --max-time 20 https://your-domain.example/api/auth/get-session
```

Sign in at `https://your-domain.example/login/` with an account created on **your** database (bootstrap locally or invite after deploy).

## Domain changes

Update `BETTER_AUTH_URL`, `FRONTEND_URL`, and `VITE_APP_URL` together when changing the canonical domain. Better Auth trusted origins derive from `FRONTEND_URL` (apex ↔ www pairs for public hostnames). The browser auth client uses the current page origin so production auth requests cannot accidentally target a build machine's localhost.
