---
name: project_overview
description: Stripped-down single-product SaaS template — pricing → signup → Stripe Checkout → paywalled dashboard
type: project
---

# Project Overview

A minimal SaaS template. **One product, one app, one subscription per user.** The flow:

1. `/` — pricing page (public)
2. User picks a plan → `/signup?plan=<key>`
3. Sign up via better-auth (email + password)
4. POST `/api/billing/checkout-session` → Stripe Checkout URL → user pays
5. Stripe webhook updates the `Subscription` mirror row
6. User lands on `/dashboard` — gated by `getUserAccessState(userId)` returning `paid` / `past_due` / `paywalled`

That's the whole product surface. No orgs, no team invites, no admin app, no async work.

---

## Stack

- **TypeScript** + **pnpm** workspaces + **Turborepo** + **Biome**
- **API**: Hono on Node 24, ECS Fargate, behind an ALB
- **Auth**: self-hosted **better-auth** (email + password). Sessions in Postgres.
- **DB**: Postgres via Prisma
- **Billing**: Stripe Checkout + Customer Portal. One Pro plan in the template; new plans added to `PLAN_PRICE_IDS` in `packages/billing/src/env.ts`
- **Frontend**: Vite + TanStack Router + Tailwind 4 + shadcn/ui (single SPA at `apps/web`)
- **Infra**: AWS CDK, 3 stacks (network / data / app), 2 envs (staging / production)
- **CI/CD**: GitHub Actions with OIDC, promote-by-image

---

## Repo layout

```
apps/
  api/        Hono server — better-auth, billing routes, Stripe webhook
  web/        Vite SPA — pricing / signup / login / dashboard

packages/
  billing/    Stripe wrapper + getUserAccessState + checkout + portal + plan→priceId map
  db/         Prisma client + schema (re-exports @prisma/client)
  errors/     Typed HttpError subclasses (ValidationError, NotFoundError, etc.)

infra/cdk/
  bin/app.ts
  lib/{config,network-stack,data-stack,app-stack}.ts
```

---

## Data model

Seven models in `packages/db/prisma/schema.prisma`:

- `User` — better-auth user with our `entityId` (`usr_<uuid>`), `firstname`, `lastname`, optional `stripeCustomerId @unique`
- `Session`, `Account`, `Verification` — better-auth vendor tables, all carrying an `entityId` + `requestId`
- `Subscription` — Stripe mirror, **one row per user** (`userId @unique`). UPSERTed by the webhook. Carries `stripeSubscriptionId`, `stripePriceId`, `planKey`, `status`, period bounds, cancel flags
- `StripeEvent` — idempotency anchor (`id` is the Stripe event id; uniqueness short-circuits replays)
- `RateLimit` — counters for better-auth's per-IP limiter (`storage: 'database'`) and our per-email sign-in lockout. Key prefix `signin:fail:` for the lockout; better-auth manages the rest. See [`.claude/skills/auth/SKILL.md`](../skills/auth/SKILL.md) for limits + upgrade path

Entity IDs use Stripe-style truncated prefixes: `usr_`, `sess_`, `acct_`, `veri_`, `sub_`. The full id is `<prefix>_<uuid>`. Better-auth tables also carry their own internal `id` column for vendor compatibility.

Dates: `timestamp with time zone`, transmitted as ISO 8601, manipulated with `date-fns`.

Money: not stored locally — Stripe is the source of truth. The `Subscription` mirror carries `planKey` + period bounds, never amounts.

---

## API

`apps/api/src/app.ts` mounts:

- `GET /health` — liveness (no DB dependency, used by the ALB)
- `GET /health/ready` — readiness (probes DB)
- `POST/GET /api/auth/*` — better-auth handler
- `POST /api/billing/checkout-session` — requires session, body `{ plan }`, returns `{ url }`
- `POST /api/billing/portal-session` — requires session, returns `{ url }`
- `GET /api/billing/access-state` — requires session, returns `{ state, subscription? }`
- `POST /api/webhooks/stripe` — raw-body signature verification + inline processing (no queue). Verifies → inserts `StripeEvent` (idempotency) → upserts `Subscription` → 200

Errors use typed classes from `packages/errors` (`UnauthorizedError`, `NotFoundError`, etc.) and serialize through `errorHandler` middleware as `{ code, message, details? }`.

Validation: Zod everywhere (request bodies, env, webhook payloads).

CORS: explicit allowlist of frontend origins via `CORS_ORIGINS` env var.

---

## Auth (`packages/auth` exists inline in `apps/api/src/lib/auth.ts`)

- Email + password only
- `additionalFields` injects `entityId` (with `usr_` / `sess_` / `acct_` / `veri_` prefix) and `requestId` (from the request-scoped AsyncLocalStorage) on every better-auth-managed row
- `databaseHooks.user.create.before` composes `name` from `firstname + lastname` if missing
- `requireSession` middleware: throws 401 if no session, otherwise puts `{ userId, userEntityId, email }` on `c.var.authSession`
- Sessions are DB-backed (better-auth default). Cookies are `SameSite=Lax`, `Secure`, `HttpOnly`
- **Rate limiting** — better-auth's per-IP limiter backed by the `RateLimit` Prisma table (`storage: 'database'`), plus a per-email sign-in lockout in `hooks.before` / `hooks.after` (5 fails / 15 min). Gated to `APP_ENV in {staging, production}` so local + e2e don't 429 against themselves. Full per-route table and the upgrade path to Redis live in the auth skill

---

## Billing

- **Stripe Checkout** for new subscriptions. `packages/billing/src/checkout.ts` maps `plan` → price id via `PLAN_PRICE_IDS` in `env.ts`, then creates a Checkout Session with `metadata.userEntityId` so the webhook can resolve the user
- **Stripe Customer Portal** for self-service (change card, cancel, view invoices)
- **`getUserAccessState(userId)`** is the single resolver: returns `paid` for active/trialing, `past_due` while Stripe Smart-Retries, `paywalled` otherwise
- **Webhook**: handles `checkout.session.completed` (sets `User.stripeCustomerId`), `customer.subscription.created/updated` (upserts the mirror), `customer.subscription.deleted` (marks canceled). Everything inline — no worker, no queue
- **`isBillingConfigured()`**: returns false until `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PRO`, and `STRIPE_PRICE_ID_MAX` are all set. Until then `/api/billing/*` 503s with a clear `BillingNotConfigured` reason

---

## Frontend (`apps/web`)

- Routes: `/`, `/login`, `/signup`, `/dashboard` (paywalled). The pricing page (`/`) is public; sidebar + dashboard are authenticated.
- `__root.tsx` runs the auth gate via `useSession()` (which wraps `GET /api/auth/get-session`)
- TanStack Query is the only data fetching primitive. `lib/api.ts` is the typed fetch wrapper (parses with Zod, throws `ApiError`)
- shadcn components live in `apps/web/src/components/ui/` (copy-pasted, not a dep)
- Forms use plain React state — no react-hook-form (simple enough; the auth pages have 2-4 fields each)

---

## Infrastructure (AWS, CDK)

3 stacks per env, 2 envs:

```
{product}-{env}-network   VPC, 2 AZ, single NAT, ALB SG / ECS SG / RDS SG
{product}-{env}-data      RDS Postgres, ECR (api), ECS cluster, migrator one-off task, Secrets
{product}-{env}-app       ECS API service, ALB, CloudFront + S3 (web SPA)
```

- **Secrets**: AWS Secrets Manager. `app-secrets` (better-auth signing key), `stripe-secrets` (api key + webhook secret, populated out-of-band)
- **Migrations**: ECS one-off task `prisma migrate deploy`, runs before every API rolling deploy
- **CloudFront**: single distribution serving the web SPA from S3 with `/api/*` proxied to the ALB — same-origin so no CORS, the session cookie travels naturally
- **No Redis, no ElastiCache, no SES, no worker service**

---

## CI/CD

Two workflows in `.github/workflows/`:

- `ci.yml` — PR + push-to-main validation. Postgres service, Biome, typecheck, tests, CDK synth, commitlint, image + SPA build sanity checks
- `deploy-staging.yml` — `workflow_dispatch` only. DAG: `deploy-network-data` → `build-api-image` + `build-web-app` (parallel) → `migrate-db` → `deploy-app-stack` → `deploy-web-spa` → `smoke`

Production deploy workflow is deferred — when needed, mirror staging with an `environment: production` gate and re-tag the staging-passed image (no rebuild). That's promote-by-image.

OIDC federation, no long-lived AWS keys in GitHub.

---

## Testing

Unit tests live alongside source. Currently:

- `apps/api/test/unit/` — app middleware (health, error handler, request id, CORS, body limit, request logger), logger, shutdown
- `packages/billing/test/unit/` — entitlements

Integration tests (DB-backed) were removed during the strip-down — re-add when product features arrive that need them.

---

## Local dev

```
docker compose up postgres   # local Postgres on :5432
pnpm install
pnpm --filter @template-sass/db exec prisma migrate dev   # first time only
pnpm dev   # turbo: api on :3000, web on :5174
```

For Stripe webhooks locally: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` (Stripe CLI, separate process).

---

## Explicitly not in template

These were in the previous incarnation and got removed deliberately. Re-introduce only when a concrete product need shows up:

- Organisations / memberships / invitations (team product surface)
- Staff/admin app (`apps/internal`), `staffRole`, impersonation
- BullMQ worker, transactional outbox, scheduled jobs
- Audit log table
- Email sender + templates + Mailpit/SES wiring
- Bull Board admin
- Comp grants
- Multi-plan UI on the pricing page (the template ships one Pro plan)
- E2E tests (Playwright), per-test transactional rollback fixtures
- Sentry, CloudWatch dashboards / alarms
- File uploads (S3 + presigned URLs)
