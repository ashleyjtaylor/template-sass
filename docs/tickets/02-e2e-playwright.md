# 02 — E2E tests with Playwright

Plan agreed before implementation. Captures intent so future readers can compare what shipped against what was decided.

## Scope

8 tests covering auth + paywall smoke. Required PR check (configured via GitHub branch protection on the new workflow's `e2e` job).

## Workspace layout

```
e2e/
  package.json              # @template/e2e workspace, deps: @playwright/test, @template/db
  tsconfig.json
  playwright.config.ts      # webServer + chromium + retries=2 in CI
  fixtures/
    db.ts                   # truncateAll() via prisma
    auth.ts                 # signUpProgrammatic() → storage state
    mailpit.ts              # waitForMessage({ to }), extractResetUrl()
    stripe.ts               # fillTestCardAndPay() page-object helper
  tests/
    auth.spec.ts            # signin, bad-password, signout, gate redirects (#2-#6)
    signup-paywall.spec.ts  # signup → checkout → webhook → dashboard (#1)
    password-reset.spec.ts  # forgot → mailpit → reset → signin, bad token (#7-#8)
```

## The 8 tests

1. `signup-paywall.spec.ts` — sign up via UI → click "Subscribe" → fill `4242 4242 4242 4242` on Stripe checkout → webhook fires → land on `/dashboard`.
2. `auth.spec.ts` — pre-seeded user signs in via UI → lands on `/dashboard`.
3. `auth.spec.ts` — pre-seeded user signs in with wrong password → "Email or password is incorrect" alert visible.
4. `auth.spec.ts` — unauthed visit to `/dashboard` → redirected to `/login`.
5. `auth.spec.ts` — authed visit to `/login` → redirected to `/dashboard`.
6. `auth.spec.ts` — open user menu → Sign out → redirected to `/login`, session cookie cleared.
7. `password-reset.spec.ts` — sign-up → forgot password → poll Mailpit for the email → click reset link → set new password → sign in with the new password lands on `/dashboard`.
8. `password-reset.spec.ts` — visit `/reset-password?token=garbage` → "Link is invalid or expired" view visible.

## Stripe handling

**Real Stripe test mode + Stripe CLI.**

- Test navigates to the hosted Stripe Checkout page and fills `4242 4242 4242 4242 / 12/34 / 123 / any name / any zip` via a page-object helper (`fixtures/stripe.ts`).
- Stripe CLI runs in a sidecar process forwarding `customer.subscription.*` and `checkout.session.completed` to `localhost:3000/api/webhooks/stripe`.
- After fill-card, the test polls for the `Subscription` row (or for the dashboard URL) with a 30 s timeout to absorb webhook latency.
- **Local**: dev runs `pnpm e2e:stripe-listen` (new script) in a second terminal; runbook docs the dependency.
- **CI**: the new e2e workflow installs Stripe CLI, starts `stripe listen --print-secret` in background, captures the dynamic webhook secret into `STRIPE_WEBHOOK_SECRET` before launching the api.

## Email assertions

- `fixtures/mailpit.ts#waitForMessage({ to })` polls `GET http://localhost:8025/api/v1/messages` until a message to the given address appears (10 s timeout).
- `extractResetUrl(body)` regex-parses the reset URL from the text body.
- After the password-reset tests, Mailpit messages are flushed via `DELETE http://localhost:8025/api/v1/messages` in `afterEach`.

## Auth fixtures

- **API setup**: `signUpProgrammatic({ email, password })` POSTs to `/api/auth/sign-up/email` with the right Origin, captures the response cookie, exposes it as Playwright storage state for tests that just need an authed user.
- **UI flow**: tests #2, #3, #6, #7 walk through `/signup`, `/login`, the user menu, etc. via the actual UI.
- Each test generates a unique email like `e2e-${randomUUID()}@example.com` so concurrent runs (and accidental DB-state leakage) don't collide.

## DB isolation

- `beforeEach` calls `truncateAll()` from `fixtures/db.ts`: `TRUNCATE user, session, account, verification, subscription, "StripeEvent" RESTART IDENTITY CASCADE`.
- Uses Prisma client from `@template/db`. Closed in `afterAll` to avoid pool exhaustion.
- Tests serialize within a worker (Playwright's default for tests sharing state); single worker for the smoke suite.

## Server lifecycle

- Playwright's `webServer: [{ command: 'pnpm dev:e2e', url: '...', reuseExistingServer: !CI }]`.
- New script `pnpm dev:e2e` = `pnpm dev` with `E2E_MODE=true` + the e2e DB env. (E2E_MODE currently does nothing — reserved for future test-only escape hatches.)
- Boots both api (`:3000/health`) and web (`:5174/`); waits for both before starting tests.

## Browsers

Chromium only. Headless in CI, headed via `pnpm test:e2e --headed` locally.

## Failure artifacts

- `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`, `video: 'retain-on-failure'`.
- HTML report at `e2e/playwright-report/`.
- The e2e workflow uploads the report dir as a workflow artifact, retained 14 days.

## CI integration

**Separate workflow file: `.github/workflows/e2e.yml`** (not bolted onto `ci.yml`).

```yaml
name: e2e

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}

permissions:
  contents: read

jobs:
  e2e:
    runs-on: ubuntu-latest
    services:
      postgres: { image: postgres:18-alpine, … }
      mailpit:  { image: axllent/mailpit:latest, ports: [1025, 8025], env: MP_SMTP_AUTH_ACCEPT_ANY=1, MP_SMTP_AUTH_ALLOW_INSECURE=1 }
    env:
      DB_*, APP_ENV=local, BETTER_AUTH_SECRET, BETTER_AUTH_URL, CORS_ORIGINS, WEB_BASE_URL,
      MAIL_FROM=noreply@localhost, MAIL_SMTP_HOST=localhost, MAIL_SMTP_PORT=1025,
      STRIPE_API_KEY=${{ secrets.STRIPE_TEST_API_KEY }}, STRIPE_PRICE_ID_PRO=${{ secrets.STRIPE_TEST_PRICE_ID_PRO }}
    steps:
      - checkout, pnpm, node setup
      - pnpm install --frozen-lockfile
      - cache ~/.cache/ms-playwright
      - pnpm exec playwright install chromium --with-deps   # cache miss only
      - prisma migrate deploy (template_test DB)
      - install Stripe CLI: curl -sL … | tar; sudo mv stripe /usr/local/bin
      - start `stripe listen --api-key $STRIPE_API_KEY --forward-to localhost:3000/api/webhooks/stripe --print-secret > /tmp/whsec` (background)
        export STRIPE_WEBHOOK_SECRET=$(head -n1 /tmp/whsec)
      - pnpm --filter @template/e2e test:e2e   # webServer config boots api+web
      - upload-artifact: e2e/playwright-report (always, retention 14d)
```

Why a separate workflow rather than another job in `ci.yml`:

- E2E has its own service-container set (mailpit) and external dependency (Stripe CLI) — keeps `ci.yml` focused on fast unit/typecheck signal.
- Independent re-runs from the GitHub Actions UI without re-running the whole `ci` workflow.
- Branch protection treats it as its own required check; failure messaging is clearer.

## New env vars / secrets

- **No new local env vars** — `apps/api/.env` already has everything the e2e suite needs (Stripe test keys, MAIL_FROM, etc).
- **CI**: two new GitHub secrets — `STRIPE_TEST_API_KEY`, `STRIPE_TEST_PRICE_ID_PRO`. The webhook secret is captured dynamically from Stripe CLI startup.

## Errors / failure modes

- **Stripe DOM drift**: card-fill helper uses Stripe's stable test selectors (`[data-testid=…]` where they exist; field names where they don't). Failure here is localized to one helper.
- **Mailpit polling timeout**: 10 s default with explicit error: "no message to <email> within 10s — check that mailpit is up and `sendResetPassword` actually fires".
- **Webhook race**: after fill-card, poll the `Subscription` table directly (or wait for `page.url() === '/dashboard'`) with a 30 s timeout.
- **DB connection pool exhaustion**: explicit `prisma.$disconnect()` in `afterAll`.

## Infrastructure / system design

- No AWS/CDK changes. CI-only addition (mailpit container service in the e2e workflow).
- Cost: zero (everything runs in GH Actions free runners).
- Local: developer needs Stripe CLI installed (already required for billing dev — see `docs/runbooks/local-dev.md`).

## Out of scope (deliberately)

- Multi-browser (chromium only).
- Mobile viewports.
- Customer Portal interactions (cancel, change plan, view invoices) — punt to a follow-up ticket.
- Per-worker DB parallelization.
- Visual regression tests.
